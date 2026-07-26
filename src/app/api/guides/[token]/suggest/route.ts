import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import {
  AREA_KEYS,
  areaDefaults,
  placeMatchesArea,
  REGION_WIDE_KEY,
  localityMatchesLabel,
} from "@/lib/areas";
import { questionnaireSchema, INTEREST_LABELS, type Questionnaire } from "@/lib/questionnaire";
import { guideContentSchema } from "@/lib/guide-content";
import { researchPlaceCandidates } from "@/lib/ai/research-place";
import { describeAiError } from "@/lib/ai/common";
import { searchOsmPlaceCandidates } from "@/lib/osm-places";
import { geocodePlace } from "@/lib/geocode";
import {
  researchCacheKey,
  takeCachedCandidate,
  putCachedCandidates,
} from "@/lib/ai/research-cache";
import type { Region } from "@prisma/client";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const bodySchema = z.object({
  area: z.enum(AREA_KEYS),
  locality: z.string().min(1).max(200),
});

/**
 * Koordinaten-Mittelpunkt für einen Ort ermitteln – für die kostenlose
 * OSM-Suche. Reihenfolge: bekannte Unterkunft/Anker mit passendem Label ->
 * Durchschnitt bereits vorhandener Orte mit passender Locality -> Geocoding
 * des Freitexts (letzter Ausweg, ebenfalls kostenlos, Nominatim).
 */
async function resolveLocalityCenter(
  q: Questionnaire,
  region: Region,
  locality: string,
  regionPlaces: { lat: number; lng: number; locality: string }[]
): Promise<{ lat: number; lng: number } | null> {
  for (const anchor of [q.accommodation, ...(q.anchors ?? [])]) {
    if (anchor.label && localityMatchesLabel(anchor.label, locality) && anchor.lat != null && anchor.lng != null) {
      return { lat: anchor.lat, lng: anchor.lng };
    }
  }
  const matching = regionPlaces.filter((p) => localityMatchesLabel(p.locality, locality));
  if (matching.length > 0) {
    return {
      lat: matching.reduce((s, p) => s + p.lat, 0) / matching.length,
      lng: matching.reduce((s, p) => s + p.lng, 0) / matching.length,
    };
  }
  return geocodePlace({
    label: locality,
    regionName: region.name,
    country: region.country,
    centerLat: region.centerLat,
    centerLng: region.centerLng,
  });
}

/**
 * "+"-Recherche: sucht per Websuche einen echten neuen Ort für Ort+Bereich und
 * gibt ihn als VORSCHLAG zurück (mit Quelle + Maps-Link). Speichert nichts –
 * erst /suggest/accept legt den Ort an. Nur Besitzer-Link.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  if (!rateLimit(`suggest:${token}`, 20, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Zu viele Recherchen. Kurz warten." }, { status: 429 });
  }

  const guide = await prisma.guide.findUnique({
    where: { publicToken: token },
    include: { guideRequest: true },
  });
  if (!guide) return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success || parsed.data.area === "hikes") {
    return NextResponse.json({ error: "Für diesen Bereich nicht verfügbar." }, { status: 400 });
  }
  const { area, locality } = parsed.data;

  const q = questionnaireSchema.parse(guide.guideRequest.questionnaire);
  const region = await prisma.region.findUnique({ where: { slug: q.regionSlug } });
  if (!region) return NextResponse.json({ error: "Region fehlt." }, { status: 400 });

  // Namen, die im Ort+Bereich bereits im Guide (oder im Bestand) sind – nicht doppelt vorschlagen
  const exclude = new Set<string>();
  const content = guideContentSchema.safeParse(guide.content);
  const shownIds = content.success
    ? content.data.chapters.flatMap((c) => c.entries.map((e) => e.id))
    : [];
  const verified = await prisma.place.findMany({
    where: { regionId: region.id },
    select: { id: true, name: true, type: true, priceLevel: true, locality: true, lat: true, lng: true },
  });
  for (const p of verified) {
    const key = p.locality?.trim() || REGION_WIDE_KEY;
    if (localityMatchesLabel(key, locality) && placeMatchesArea(p.type, p.priceLevel, area)) {
      exclude.add(p.name);
    }
  }
  // zusätzlich die im Guide gezeigten Namen dieses Bereichs
  const byId = new Map(verified.map((p) => [p.id, p]));
  for (const id of shownIds) {
    const p = byId.get(id);
    if (p && localityMatchesLabel(p.locality?.trim() || REGION_WIDE_KEY, locality)) {
      exclude.add(p.name);
    }
  }

  const def = areaDefaults(area);
  const excludeNames = [...exclude];

  // 1) Zuerst aus dem Vorrats-Cache bedienen (keine Kosten): frühere Recherche
  //    hat mehrere Kandidaten geliefert – Folge-Klicks nutzen die auf.
  const cacheKey = researchCacheKey(region.id, locality, area);
  const cached = takeCachedCandidate(cacheKey, excludeNames);
  if (cached) {
    return NextResponse.json({ ok: true, candidate: cached, area, locality, cached: true });
  }

  // 2) Cache leer -> zuerst KOSTENLOS über OpenStreetMap suchen (kein KI-
  //    Aufruf). Nur wenn OSM nichts Passendes findet, greift die
  //    kostenpflichtige KI-Websuche als Fallback.
  const center = await resolveLocalityCenter(q, region, locality, verified);
  if (center) {
    try {
      const osmCandidates = await searchOsmPlaceCandidates({
        area,
        locality,
        lat: center.lat,
        lng: center.lng,
        excludeNames,
      });
      if (osmCandidates.length > 0) {
        const [first, ...rest] = osmCandidates;
        putCachedCandidates(cacheKey, rest);
        return NextResponse.json({ ok: true, candidate: first, area, locality, source: "osm" });
      }
    } catch (e) {
      console.error("[suggest] OSM-Suche fehlgeschlagen, weiter mit KI-Fallback:", e);
    }
  }

  // 3) OSM leer/fehlgeschlagen -> EINE KI-Recherche, die gleich mehrere
  //    Kandidaten holt; einen zurückgeben, den Rest für spätere Klicks cachen.
  try {
    const candidates = await researchPlaceCandidates({
      regionName: region.name,
      locality,
      areaLabel: def.label,
      interests: q.interests.map((i) => INTEREST_LABELS[i.key]),
      priceLevelMax: q.priceLevel,
      diets: q.diets,
      excludeNames,
    });
    if (candidates.length === 0) {
      return NextResponse.json(
        { error: "Kein passender neuer Ort gefunden. Bitte erneut versuchen." },
        { status: 404 }
      );
    }
    const [first, ...rest] = candidates;
    putCachedCandidates(cacheKey, rest);
    return NextResponse.json({ ok: true, candidate: first, area, locality, source: "ai" });
  } catch (e) {
    const reason = describeAiError(e);
    console.error("[suggest] Recherche fehlgeschlagen:", reason, e);
    // Besitzer-only-Endpoint: die knappe Ursache (z. B. Budget-/Ratenlimit)
    // darf hier ruhig mit ausgegeben werden, statt in den Server-Logs zu verschwinden.
    return NextResponse.json({ error: `Recherche fehlgeschlagen: ${reason}` }, { status: 502 });
  }
}
