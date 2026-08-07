import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { AREA_KEYS, areaDefaults, parseLocalityCounts, resolveCanonicalLocality } from "@/lib/areas";
import { questionnaireSchema } from "@/lib/questionnaire";
import { geocodePlace } from "@/lib/geocode";
import type { PlaceType } from "@prisma/client";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  area: z.enum(AREA_KEYS),
  locality: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  note: z.string().max(1000).default(""),
  priceLevel: z.number().int().min(1).max(4).nullable().optional(),
  address: z.string().max(300).nullable().optional(),
  sourceUrl: z.string().max(2000).default(""),
  sourceTitle: z.string().max(300).default(""),
  /** "research" = übernommener KI-Vorschlag, "own" = eigener Tipp des Nutzers. */
  origin: z.enum(["research", "own"]).default("research"),
});

/**
 * Übernimmt einen recherchierten Vorschlag als geprüften Ort ("❤️ in den Guide"),
 * legt die Quelle an, erhöht den Pro-Ort-Zähler und stößt die Neu-Generierung an.
 * Nur Besitzer-Link.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  if (!rateLimit(`suggest-accept:${token}`, 40, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Zu viele Änderungen. Kurz warten." }, { status: 429 });
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
    return NextResponse.json({ error: "Ungültige Daten." }, { status: 400 });
  }
  const d = parsed.data;
  const localityKey = d.locality.trim();

  const q = questionnaireSchema.parse(guide.guideRequest.questionnaire);
  const region = await prisma.region.findUnique({ where: { slug: q.regionSlug } });
  if (!region) return NextResponse.json({ error: "Region fehlt." }, { status: 400 });

  const def = areaDefaults(d.area);
  // "Rund um den See" = regionsweit => leere Stadt
  const REGION_WIDE = "Rund um den See";
  let placeLocality = "";
  if (localityKey !== REGION_WIDE) {
    // Kanonischen Ortsnamen wiederverwenden, falls der Ort schon existiert
    // (z. B. "Torno" statt der frei getippten Adresse aus dem Fragebogen) –
    // sonst würden neue Orte unter einem anderen Namen abgelegt und nie mit
    // den bestehenden zusammengeführt (Karte, "+"-Bestand, Kapitel-Zuordnung).
    const existing = await prisma.place.findMany({
      where: { regionId: region.id },
      select: { locality: true },
      distinct: ["locality"],
    });
    placeLocality = resolveCanonicalLocality(
      existing.map((p) => p.locality).filter(Boolean),
      localityKey
    );
  }

  // Koordinaten ermitteln (Fallback: Regions-Mitte)
  let lat = region.centerLat;
  let lng = region.centerLng;
  if (placeLocality) {
    const coords = await geocodePlace({
      label: `${d.name}, ${placeLocality}`,
      regionName: region.name,
      country: region.country,
      centerLat: region.centerLat,
      centerLng: region.centerLng,
    });
    if (coords) {
      lat = coords.lat;
      lng = coords.lng;
    }
  }

  const place = await prisma.place.create({
    data: {
      regionId: region.id,
      type: def.type as PlaceType,
      name: d.name,
      locality: placeLocality,
      lat,
      lng,
      address: d.address ?? "",
      tags: [],
      priceLevel: d.priceLevel ?? def.priceLevel ?? undefined,
      // Herkunft ehrlich benennen – die Redaktion muss im Admin auf einen
      // Blick sehen, ob hier recherchiert oder frei getippt wurde.
      editorNotes: `${
        d.origin === "own"
          ? "[Eigener Tipp der Nutzer:innen, nicht redaktionell geprüft]"
          : '[Per „+"-Recherche im Guide hinzugefügt]'
      } ${d.note}${d.sourceUrl ? ` (Quelle: ${d.sourceTitle || d.sourceUrl})` : ""}`,
      status: "verified",
      lastVerifiedAt: new Date(),
      // Bindet den Ort an genau diesen Guide (siehe lib/place-scope.ts).
      addedByRequestId: guide.guideRequestId,
    },
  });

  if (d.sourceUrl) {
    await prisma.source.create({
      data: {
        placeId: place.id,
        url: d.sourceUrl,
        sourceType: "blog",
        excerpt: d.sourceTitle || "Recherche-Quelle",
      },
    });
  }

  // Pro-Ort-Zähler erhöhen, damit der neue Ort sicher aufgenommen wird
  const localityCounts = parseLocalityCounts(guide.guideRequest.localityCounts);
  const current = localityCounts[localityKey] ?? {};
  localityCounts[localityKey] = { ...current, [d.area]: (current[d.area] ?? 0) + 1 };

  await prisma.guideRequest.update({
    where: { id: guide.guideRequestId },
    data: { localityCounts, status: "pending", error: null },
  });

  return NextResponse.json({ ok: true, name: place.name });
}
