import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Route Handler für große Buch-Uploads (PDF/EPUB bis ~120 MB).
// Die Datei wird als ROHER Body gesendet (kein Multipart), die Metadaten kommen
// als Query-Parameter. Das umgeht sowohl das Server-Action-Body-Limit als auch
// die Grenzen von req.formData() bei großen Uploads. Durch die Middleware per
// Basic Auth geschützt (Matcher deckt /api/admin ab).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_UPLOAD_BYTES = 120 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const regionId = (sp.get("regionId") ?? "").trim();
    const filename = (sp.get("filename") ?? "upload").trim();
    const mimeType = (sp.get("type") ?? "").trim();
    const kindParam = sp.get("kind") ?? "";
    const title = (sp.get("title") ?? "").trim() || filename;

    if (!regionId) {
      return NextResponse.json({ error: "Keine Region gewählt." }, { status: 400 });
    }

    const buffer = Buffer.from(await req.arrayBuffer());
    const receivedMb = (buffer.length / 1_048_576).toFixed(1);
    const declaredLen = req.headers.get("content-length");
    console.log(
      `[upload-route] Start: name=${filename} received=${receivedMb}MB content-length=${declaredLen ?? "?"} type=${mimeType || "?"}`
    );
    if (buffer.length === 0) {
      return NextResponse.json({ error: "Leere Datei empfangen." }, { status: 400 });
    }
    if (buffer.length > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "Datei zu groß (max. 120 MB)." }, { status: 413 });
    }
    // Kam weniger an als angekündigt? Dann wurde der Upload abgeschnitten
    // (z. B. durch einen Reverse-Proxy) – klare Meldung statt kryptischem Zip-Fehler.
    if (declaredLen && Number(declaredLen) > buffer.length + 1024) {
      return NextResponse.json(
        {
          error: `Upload wurde abgeschnitten: angekündigt ${(Number(declaredLen) / 1_048_576).toFixed(1)} MB, empfangen ${receivedMb} MB. Vermutlich begrenzt ein Reverse-Proxy (z. B. Caddy/nginx) die Body-Größe.`,
        },
        { status: 413 }
      );
    }

    const { extractText } = await import("@/lib/knowledge/extract-text");
    let text: string;
    let kind: string;
    try {
      ({ text, kind } = await extractText(buffer, filename, mimeType));
    } catch (ex) {
      const base = ex instanceof Error ? ex.message : "Datei konnte nicht gelesen werden.";
      return NextResponse.json(
        { error: `${base} (empfangen: ${receivedMb} MB)` },
        { status: 422 }
      );
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
