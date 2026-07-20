import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { adjustmentsSchema, ADJUSTMENT_PRESETS } from "@/lib/adjustments";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  presets: z.array(z.enum(ADJUSTMENT_PRESETS)).default([]),
  text: z.string().max(1000).default(""),
});

/**
 * Nachträgliche Anpassung durch den Nutzer (z. B. "mehr Wandern").
 * Nur über den Besitzer-Link (publicToken) möglich, nicht über den
 * geteilten Lese-Link. Stößt eine Neu-Generierung über die Queue an.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  if (!rateLimit(`adjust:${token}`, 5, 60 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Zu viele Anpassungen. Bitte wartet, bis die aktuelle Version fertig ist." },
      { status: 429 }
    );
  }

  const guide = await prisma.guide.findUnique({
    where: { publicToken: token },
    include: { guideRequest: true },
  });
  if (!guide) {
    return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success || (parsed.data.presets.length === 0 && !parsed.data.text.trim())) {
    return NextResponse.json(
      { error: "Bitte mindestens einen Wunsch auswählen oder eingeben." },
      { status: 400 }
    );
  }

  if (guide.guideRequest.status === "pending" || guide.guideRequest.status === "generating") {
    return NextResponse.json(
      { error: "Eine Anpassung läuft bereits. Bitte kurz warten." },
      { status: 409 }
    );
  }

  const existing = adjustmentsSchema.parse(guide.guideRequest.adjustments ?? []);
  const updated = [
    ...existing,
    {
      presets: parsed.data.presets,
      text: parsed.data.text.trim(),
      createdAt: new Date().toISOString(),
    },
  ];

  await prisma.guideRequest.update({
    where: { id: guide.guideRequestId },
    data: { adjustments: updated, status: "pending", error: null },
  });

  return NextResponse.json({ ok: true });
}
