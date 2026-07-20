import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { questionnaireSchema } from "@/lib/questionnaire";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * Nimmt den Fragebogen entgegen, validiert serverseitig (Anforderung 4.1)
 * und erzeugt einen GuideRequest. Die Generierung läuft asynchron im Worker.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`guide-request:${ip}`)) {
    return NextResponse.json(
      { error: "Zu viele Anfragen. Bitte versucht es später erneut." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const parsed = questionnaireSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validierung fehlgeschlagen.", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const region = await prisma.region.findUnique({ where: { slug: parsed.data.regionSlug } });
  if (!region) {
    return NextResponse.json({ error: "Unbekannte Region." }, { status: 400 });
  }

  const request = await prisma.guideRequest.create({
    data: {
      email: parsed.data.email,
      questionnaire: parsed.data,
      status: "pending",
    },
  });

  return NextResponse.json({ id: request.id }, { status: 201 });
}
