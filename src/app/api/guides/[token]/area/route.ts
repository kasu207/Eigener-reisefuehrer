import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { AREA_KEYS, parseAreaCounts } from "@/lib/areas";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  area: z.enum(AREA_KEYS),
  delta: z.number().int().min(-5).max(5),
});

/**
 * Pro-Bereich-Feintuning (mehr/weniger). Passt den Delta-Zähler eines
 * Bereichs an und stößt eine (inkrementelle) Neu-Generierung an. Nur über
 * den Besitzer-Link.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  if (!rateLimit(`area:${token}`, 30, 60 * 60 * 1000)) {
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

  const counts = parseAreaCounts(guide.guideRequest.areaCounts);
  const next = (counts[parsed.data.area] ?? 0) + parsed.data.delta;
  counts[parsed.data.area] = Math.max(-20, Math.min(40, next));

  await prisma.guideRequest.update({
    where: { id: guide.guideRequestId },
    data: { areaCounts: counts, status: "pending", error: null },
  });

  return NextResponse.json({ ok: true, areaCounts: counts });
}
