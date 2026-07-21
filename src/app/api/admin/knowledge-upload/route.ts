import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Route Handler statt Server-Action: verarbeitet große Uploads (PDF/EPUB bis
// ~120 MB) zuverlässig, ohne das Body-Limit der Server-Actions. Durch die
// Middleware per Basic Auth geschützt (Matcher deckt /api/admin ab).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_UPLOAD_BYTES = 120 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Keine Datei ausgewählt." }, { status: 400 });
    }
    console.log(
      `[upload-route] Start: name=${file.name} size=${(file.size / 1_048_576).toFixed(1)}MB type=${file.type || "?"}`
    );
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "Datei zu groß (max. 120 MB)." }, { status: 413 });
    }
    const regionId = String(form.get("regionId") ?? "").trim();
    if (!regionId) {
      return NextResponse.json({ error: "Keine Region gewählt." }, { status: 400 });
    }

    const { extractTextFromFile } = await import("@/lib/knowledge/extract-text");
    const { text, kind } = await extractTextFromFile(file);
    console.log(`[upload-route] Extrahiert: kind=${kind} textLen=${text.length}`);

    const title = String(form.get("title") ?? "").trim() || file.name;
    await prisma.knowledgeDocument.create({
      data: {
        regionId,
        kind: String(form.get("kind") ?? "") === "guidebook" ? "guidebook" : "book",
        title,
        fileName: file.name,
        mimeType: "text/plain",
        fileData: Buffer.from(text, "utf8"),
        status: "uploaded",
        moderationStatus: "approved",
      },
    });
    console.log(`[upload-route] Gespeichert: "${title}"`);

    return NextResponse.json({ ok: true, title, kind, textLen: text.length });
  } catch (e) {
    console.error("[upload-route] Fehlgeschlagen:", e);
    const msg = e instanceof Error ? e.message : "Upload konnte nicht verarbeitet werden.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
