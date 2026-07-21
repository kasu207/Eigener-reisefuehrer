import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { AREA_KEYS, parseAreaCounts, type AreaKey } from "@/lib/areas";
import { selectContent, type SelectablePlace, type SelectableHike } from "@/lib/selection";
import { questionnaireSchema } from "@/lib/questionnaire";
import { adjustmentsSchema, modifiersFromAdjustments } from "@/lib/adjustments";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  area: z.enum(AREA_KEYS),
  delta: z.number().int().min(-5).max(5),
});

/** Anzahl tatsächlich ausgewählter Einträge eines Bereichs (aus dem Debug-Objekt). */
function areaCount(sel: ReturnType<typeof selectContent>, area: AreaKey): number {
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
 * Pro-Bereich-Feintuning (mehr/weniger). Prüft ERST, ob die Änderung überhaupt
 * einen weiteren Eintrag ein-/ausblendet (sonst ist der Bereich im Bestand
 * ausgeschöpft) und stößt nur dann eine inkrementelle Neu-Generierung an.
 * Nur über den Besitzer-Link.
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

  const q = questionnaireSchema.parse(guide.guideRequest.questionnaire);
  const mods = modifiersFromAdjustments(
    adjustmentsSchema.parse(guide.guideRequest.adjustments ?? [])
  );
  const region = await prisma.region.findUnique({ where: { slug: q.regionSlug } });
  if (!region) return NextResponse.json({ error: "Region fehlt." }, { status: 400 });

  const dbPlaces = await prisma.place.findMany({
    where: { regionId: region.id, status: "verified" },
  });
  const dbHikes = await prisma.hike.findMany({
    where: { regionId: region.id, status: "verified" },
  });
  const selPlaces: SelectablePlace[] = dbPlaces.map((p) => ({
    id: p.id,
    type: p.type,
    name: p.name,
    lat: p.lat,
    lng: p.lng,
    tags: p.tags,
    priceLevel: p.priceLevel,
    childFriendly: p.childFriendly,
    access: p.access,
    dietaryOptions: p.dietaryOptions,
    qualityScore: p.qualityScore,
    mustSee: p.mustSee,
  }));
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

  const before = areaCount(selectContent(selPlaces, selHikes, q, mods, oldCounts), area);
  const after = areaCount(selectContent(selPlaces, selHikes, q, mods, newCounts), area);

  // Keine tatsächliche Änderung -> ehrliche Rückmeldung, keine Neu-Generierung
  if (after === before) {
    return NextResponse.json({
      ok: true,
      changed: false,
      count: before,
      message:
        delta > 0
          ? `Kein weiterer Eintrag im Bestand für diesen Bereich (aktuell ${before}). Lege im Admin mehr passende Orte an.`
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
    count: after,
    message: delta > 0 ? `Ein Eintrag mehr (${after}).` : `Ein Eintrag weniger (${after}).`,
  });
}
