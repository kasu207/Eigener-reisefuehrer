import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { questionnaireSchema } from "@/lib/questionnaire";
import { sendGuideReadyEmail } from "@/lib/email";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: z.string().email().max(320),
});

/**
 * Hinterlegt NACH der Erstellung eine E-Mail-Adresse zum Guide (Besitzer-Link).
 * Ist der Guide schon fertig, wird der Link sofort gemailt; läuft er noch,
 * verschickt der Worker die Mail beim Fertigstellen. Kein Pflichtfeld vorab.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  if (!rateLimit(`guide-email:${token}`, 10, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Zu viele Versuche. Kurz warten." }, { status: 429 });
  }

  // Nur der Besitzer-Link (publicToken) darf die E-Mail setzen
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
    return NextResponse.json({ error: "Bitte eine gültige E-Mail-Adresse angeben." }, { status: 400 });
  }
  const email = parsed.data.email.trim();

  await prisma.guideRequest.update({
    where: { id: guide.guideRequestId },
    data: { email },
  });

  // Ist der Guide bereits fertig, sofort den Link mailen; sonst übernimmt das
  // der Worker beim Fertigstellen (liest guideRequest.email).
  let sent = false;
  if (guide.guideRequest.status === "ready") {
    try {
      const q = questionnaireSchema.parse(guide.guideRequest.questionnaire);
      const appUrl = process.env.APP_URL ?? "http://localhost:3000";
      await sendGuideReadyEmail(email, `${appUrl}/guide/${guide.publicToken}`, q.firstNames, false);
      sent = true;
    } catch (e) {
      console.error("[guide-email] Sofort-Versand fehlgeschlagen:", e);
    }
  }

  return NextResponse.json({ ok: true, sent });
}
