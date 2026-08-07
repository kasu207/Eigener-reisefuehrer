import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { placeScopeFilter } from "@/lib/place-scope";
import {
  AREA_KEYS,
  parseAreaCounts,
  parseLocalityCounts,
  placeMatchesArea,
  REGION_WIDE_KEY,
  localityMatchesLabel,
  type AreaKey,
} from "@/lib/areas";
import {
  selectContent,
  placePassesHardFilters,
  restaurantPassesHardFilters,
  type SelectablePlace,
  type SelectableHike,
} from "@/lib/selection";
import { guideContentSchema } from "@/lib/guide-content";
import { questionnaireSchema } from "@/lib/questionnaire";
import { adjustmentsSchema, modifiersFromAdjustments } from "@/lib/adjustments";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  area: z.enum(AREA_KEYS),
  delta: z.number().int().min(-5).max(5),
  locality: z.string().max(200).optional(),
});

function toSelectablePlace(p: {
  id: string;
  type: string;
  name: string;
  lat: number;
  lng: number;
  tags: string[];
  priceLevel: number | null;
  childFriendly: boolean;
  access: string;
  dietaryOptions: string[];
  qualityScore: number;
  mustSee: boolean;
}): SelectablePlace {
  return {
    id: p.id,
    type: p.type as SelectablePlace["type"],
    name: p.name,
    lat: p.lat,
    lng: p.lng,
    tags: p.tags,
    priceLevel: p.priceLevel,
    childFriendly: p.childFriendly,
    access: p.access as SelectablePlace["access"],
    dietaryOptions: p.dietaryOptions,
    qualityScore: p.qualityScore,
    mustSee: p.mustSee,
  };
}

function areaCountFromDebug(sel: ReturnType<typeof selectContent>, area: AreaKey): number {
  const d = sel.debug as {
    sights?: number;
    bars?: number;
    hotels?: number;
    hikes?: number;
    food?: { fancy?: number; mid?: number; budget?: number };
  };
  switch (area) {
    case "sights": return d.sights ?? 0;
    case "hikes": return d.hikes ?? 0;
    case "bars": return d.bars ?? 0;
    case "hotels": return d.hotels ?? 0;
    case "foodFancy": return d.food?.fancy ?? 0;
    case "foodMid": return d.food?.mid ?? 0;
    case "foodBudget": return d.food?.budget ?? 0;
    default: return 0;
  }
}

/**
 * Feintuning mehr/weniger – global (z. B. Wanderungen) ODER je Ort (wenn
 * `locality` mitgegeben wird, z. B. "noch ein Café in Bellagio"). Es wird nur
 * dann neu generiert, wenn tatsächlich ein Eintrag ein-/ausgeblendet werden
 * kann; sonst gibt es eine klare Rückmeldung. Nur über den Besitzer-Link.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  if (!rateLimit(`area:${token}`, 60, 60 * 60 * 1000)) {
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
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültiger Bereich." }, { status: 400 });
  }
  const { area, delta } = parsed.data;
  const locality = parsed.data.locality?.trim() || "";

  const q = questionnaireSchema.parse(guide.guideRequest.questionnaire);
  const mods = modifiersFromAdjustments(
    adjustmentsSchema.parse(guide.guideRequest.adjustments ?? [])
  );
  const region = await prisma.region.findUnique({ where: { slug: q.regionSlug } });
  if (!region) return NextResponse.json({ error: "Region fehlt." }, { status: 400 });

  const dbPlaces = await prisma.place.findMany({
    where: {
      regionId: region.id,
      status: "verified",
      ...placeScopeFilter(guide.guideRequestId),
    },
  });
  const dbHikes = await prisma.hike.findMany({
    where: { regionId: region.id, status: "verified" },
  });

  // ---------- Pro-Ort-Feintuning ----------
  if (locality && area !== "hikes") {
    const content = guideContentSchema.safeParse(guide.content);
    const removedIds = new Set(content.success ? content.data.removedIds ?? [] : []);
    const shownIds = new Set(
      content.success
        ? content.data.chapters.flatMap((c) => c.entries.map((e) => e.id))
        : []
    );
    const localityKey = (p: (typeof dbPlaces)[number]) =>
      p.locality?.trim() ? p.locality.trim() : REGION_WIDE_KEY;

    // Alle geprüften Einträge dieses Orts + Bereichs, die die harten Filter bestehen
    const pool = dbPlaces.filter((p) => {
      if (removedIds.has(p.id)) return false;
      if (!localityMatchesLabel(localityKey(p), locality)) return false;
      if (!placeMatchesArea(p.type, p.priceLevel, area)) return false;
      const sp = toSelectablePlace(p);
      return p.type === "restaurant" || p.type === "bar"
        ? restaurantPassesHardFilters(sp, q)
        : placePassesHardFilters(sp, q);
    });
    const shownInArea = pool.filter((p) => shownIds.has(p.id)).length;
    const addable = pool.length - shownInArea;

    if (delta > 0 && addable <= 0) {
      return NextResponse.json({
        ok: true,
        changed: false,
        // Diese Meldung liest der KUNDE, nicht die Redaktion – ein Verweis
        // auf den Admin-Bereich, den er gar nicht öffnen kann, ist eine
        // Sackgasse. Stattdessen auf die beiden Wege zeigen, die er hat.
        message: `Für „${locality}" haben wir hier alles gezeigt, was wir geprüft haben (aktuell ${shownInArea}). Ergänzt einen eigenen Tipp oder lasst uns einen neuen Ort recherchieren.`,
      });
    }
    if (delta < 0 && shownInArea <= 0) {
      return NextResponse.json({
        ok: true,
        changed: false,
        message: `In „${locality}" gibt es hier nichts zu entfernen.`,
      });
    }

    const localityCounts = parseLocalityCounts(guide.guideRequest.localityCounts);
    const current = localityCounts[locality] ?? {};
    const nextVal = Math.max(-20, Math.min(40, (current[area] ?? 0) + delta));
    localityCounts[locality] = { ...current, [area]: nextVal };

    await prisma.guideRequest.update({
      where: { id: guide.guideRequestId },
      data: { localityCounts, status: "pending", error: null },
    });
    return NextResponse.json({
      ok: true,
      changed: true,
      message:
        delta > 0
          ? `Ein Eintrag mehr für „${locality}".`
          : `Ein Eintrag weniger für „${locality}".`,
    });
  }

  // ---------- Globales Feintuning (z. B. Wanderungen) ----------
  const selPlaces: SelectablePlace[] = dbPlaces.map(toSelectablePlace);
  const selHikes: SelectableHike[] = dbHikes.map((h) => ({
    id: h.id,
    name: h.name,
    startLat: h.startLat,
    startLng: h.startLng,
    distanceKm: h.distanceKm,
    durationMin: h.durationMin,
    elevationGainM: h.elevationGainM,
    difficulty: h.difficulty,
    childFriendly: h.childFriendly,
    tags: h.tags,
  }));

  const oldCounts = parseAreaCounts(guide.guideRequest.areaCounts);
  const newCounts = { ...oldCounts };
  newCounts[area] = Math.max(-20, Math.min(40, (oldCounts[area] ?? 0) + delta));

  const before = areaCountFromDebug(selectContent(selPlaces, selHikes, q, mods, oldCounts), area);
  const after = areaCountFromDebug(selectContent(selPlaces, selHikes, q, mods, newCounts), area);

  if (after === before) {
    return NextResponse.json({
      ok: true,
      changed: false,
      message:
        delta > 0
          ? `Kein weiterer Eintrag im Bestand für diesen Bereich (aktuell ${before}).`
          : `Weniger geht hier nicht mehr (aktuell ${before}).`,
    });
  }

  await prisma.guideRequest.update({
    where: { id: guide.guideRequestId },
    data: { areaCounts: newCounts, status: "pending", error: null },
  });
  return NextResponse.json({
    ok: true,
    changed: true,
    message: delta > 0 ? `Ein Eintrag mehr (${after}).` : `Ein Eintrag weniger (${after}).`,
  });
}
