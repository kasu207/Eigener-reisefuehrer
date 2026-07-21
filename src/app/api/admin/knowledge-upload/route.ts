import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Chunk-Upload für große Bücher (PDF/EPUB bis ~120 MB).
// Die Datei kommt in kleinen Stücken (<10 MB) an, damit KEIN Body-Limit greift
// (weder Reverse-Proxy noch Framework). Der Server sammelt die Stücke und setzt
// sie beim letzten Chunk zusammen. Durch die Middleware per Basic Auth geschützt.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_UPLOAD_BYTES = 120 * 1024 * 1024;
const UPLOAD_TTL_MS = 15 * 60 * 1000;

// Zwischenspeicher der Chunks je Upload (einzelner Server-Prozess).
const uploads = new Map<
  string,
  { chunks: (Buffer | undefined)[]; total: number; createdAt: number }
>();

function cleanupStale() {
  const now = Date.now();
  for (const [id, u] of uploads) {
    if (now - u.createdAt > UPLOAD_TTL_MS) uploads.delete(id);
  }
}

export async function POST(req: NextRequest) {
  try {
    cleanupStale();
    const sp = req.nextUrl.searchParams;
    const uploadId = (sp.get("uploadId") ?? "").trim();
    const chunkIndex = Number(sp.get("chunkIndex"));
    const totalChunks = Number(sp.get("totalChunks"));

    if (
      !uploadId ||
      !Number.isInteger(chunkIndex) ||
      !Number.isInteger(totalChunks) ||
      totalChunks < 1 ||
      chunkIndex < 0 ||
      chunkIndex >= totalChunks
    ) {
      return NextResponse.json({ error: "Ungültige Chunk-Parameter." }, { status: 400 });
    }

    const chunk = Buffer.from(await req.arrayBuffer());
    let entry = uploads.get(uploadId);
    if (!entry) {
      entry = { chunks: new Array(totalChunks), total: totalChunks, createdAt: Date.now() };
      uploads.set(uploadId, entry);
    }
    entry.chunks[chunkIndex] = chunk;

    const receivedCount = entry.chunks.filter(Boolean).length;
    const assembledSize = entry.chunks.reduce((s, c) => s + (c?.length ?? 0), 0);
    if (assembledSize > MAX_UPLOAD_BYTES) {
      uploads.delete(uploadId);
      return NextResponse.json({ error: "Datei zu groß (max. 120 MB)." }, { status: 413 });
    }

    // Noch nicht alle Stücke da -> bestätigen und auf den Rest warten
    if (receivedCount < totalChunks) {
      return NextResponse.json({ ok: true, partial: true, received: receivedCount, total: totalChunks });
    }

    // Vollständig -> zusammensetzen und verarbeiten
    uploads.delete(uploadId);
    const buffer = Buffer.concat(entry.chunks as Buffer[]);

    const regionId = (sp.get("regionId") ?? "").trim();
    const filename = (sp.get("filename") ?? "upload").trim();
    const mimeType = (sp.get("type") ?? "").trim();
    const kindParam = sp.get("kind") ?? "";
    const title = (sp.get("title") ?? "").trim() || filename;

    const head = buffer.subarray(0, 4).toString("hex");
    console.log(
      `[upload-route] Zusammengesetzt: name=${filename} size=${(buffer.length / 1_048_576).toFixed(1)}MB chunks=${totalChunks} head=${head}`
    );

    if (!regionId) {
      return NextResponse.json({ error: "Keine Region gewählt." }, { status: 400 });
    }
    if (buffer.length === 0) {
      return NextResponse.json({ error: "Leere Datei empfangen." }, { status: 400 });
    }

    const { extractText } = await import("@/lib/knowledge/extract-text");
    let text: string;
    let kind: string;
    try {
      ({ text, kind } = await extractText(buffer, filename, mimeType));
    } catch (ex) {
      const base = ex instanceof Error ? ex.message : "Datei konnte nicht gelesen werden.";
      return NextResponse.json({ error: base }, { status: 422 });
    }
    console.log(`[upload-route] Extrahiert: kind=${kind} textLen=${text.length}`);

    await prisma.knowledgeDocument.create({
      data: {
        regionId,
        kind: kindParam === "guidebook" ? "guidebook" : "book",
        title,
        fileName: filename,
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
