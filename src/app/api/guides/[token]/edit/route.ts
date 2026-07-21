import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { guideContentSchema, type GuideContent } from "@/lib/guide-content";

export const dynamic = "force-dynamic";

/**
 * Inline-Bearbeitung des Guides im Browser (nur Besitzer-Link):
 * - Texte an jeder Stelle ändern (Einleitung, Kapitel, Einträge, Tage)
 * - Einträge entfernen (bleiben auch bei Neugenerierung entfernt)
 * Manuelle Änderungen werden mit `edited` markiert und überleben
 * KI-Neugenerierungen.
 */

const bodySchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("set-text"),
    target: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("intro"), field: z.enum(["title", "text"]) }),
      z.object({
        kind: z.literal("chapter"),
        chapterKey: z.string(),
        field: z.enum(["title", "introText"]),
      }),
      z.object({
        kind: z.literal("entry"),
        entryId: z.string(),
        field: z.enum(["personalText", "reason"]),
      }),
      z.object({
        kind: z.literal("day"),
        day: z.number().int(),
        field: z.enum(["title", "text"]),
      }),
    ]),
    value: z.string().max(4000),
  }),
  z.object({ op: z.literal("remove-entry"), entryId: z.string() }),
]);

function applyEdit(content: GuideContent, body: z.infer<typeof bodySchema>): GuideContent {
  if (body.op === "remove-entry") {
    return {
      ...content,
      chapters: content.chapters.map((c) => ({
        ...c,
        entries: c.entries.filter((e) => e.id !== body.entryId),
      })),
      removedIds: [...new Set([...(content.removedIds ?? []), body.entryId])],
    };
  }

  const value = body.value.trim();
  const t = body.target;
  switch (t.kind) {
    case "intro":
      return { ...content, intro: { ...content.intro, [t.field]: value, edited: true } };
    case "chapter":
      return {
        ...content,
        chapters: content.chapters.map((c) =>
          c.key === t.chapterKey ? { ...c, [t.field]: value, edited: true } : c
        ),
      };
    case "entry":
      return {
        ...content,
        chapters: content.chapters.map((c) => ({
          ...c,
          entries: c.entries.map((e) =>
            e.id === t.entryId ? { ...e, [t.field]: value, edited: true } : e
          ),
        })),
      };
    case "day":
      return {
        ...content,
        daySuggestions: content.daySuggestions.map((d) =>
          d.day === t.day ? { ...d, [t.field]: value, edited: true } : d
        ),
      };
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  // Bearbeiten nur über den Besitzer-Link, nicht über den Lese-Link
  const guide = await prisma.guide.findUnique({ where: { publicToken: token } });
  if (!guide) return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Bearbeitung." }, { status: 400 });
  }

  const content = guideContentSchema.parse(guide.content);
  const updated = applyEdit(content, parsed.data);

  await prisma.guide.update({
    where: { id: guide.id },
    data: { content: JSON.parse(JSON.stringify(updated)) },
  });

  return NextResponse.json({ ok: true });
}
