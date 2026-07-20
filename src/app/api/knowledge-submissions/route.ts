import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  regionSlug: z.string().min(1),
  url: z.string().url().max(2000),
  title: z.string().min(1).max(200),
  submitterName: z.string().max(100).default(""),
  note: z.string().max(500).default(""),
});

/**
 * Community-Einreichung für die Wissensdatenbank: Nutzer schlagen Blogs/
 * Artikel vor. Einreichungen starten als `pending` und werden erst nach
 * redaktioneller Moderation (plus automatischer KI-Sicherheitsprüfung)
 * analysiert – so bleibt die Datenbank kuratiert.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!rateLimit(`knowledge-submit:${ip}`, 5, 24 * 60 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Zu viele Einreichungen. Bitte versucht es morgen wieder." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Bitte alle Pflichtfelder korrekt ausfüllen." }, { status: 400 });
  }

  const region = await prisma.region.findUnique({ where: { slug: parsed.data.regionSlug } });
  if (!region) {
    return NextResponse.json({ error: "Unbekannte Region." }, { status: 400 });
  }

  await prisma.knowledgeDocument.create({
    data: {
      regionId: region.id,
      kind: "blog",
      title: parsed.data.title,
      url: parsed.data.url,
      status: "uploaded",
      moderationStatus: "pending", // Moderation zwingend vor Analyse
      moderationNote: parsed.data.note ? `Hinweis des Einreichers: ${parsed.data.note}` : "",
      submitterName: parsed.data.submitterName,
      submittedByUser: true,
    },
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
