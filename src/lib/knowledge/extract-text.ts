import { PDFParse } from "pdf-parse";
import JSZip from "jszip";

/**
 * Text-Extraktion aus Buch-Dateien für die Wissensbibliothek.
 *
 * Warum: Reiseführer sind oft große PDFs/EPUBs mit vielen Bildern (bis 100 MB).
 * Claudes PDF-Schnittstelle ist auf 32 MB / 100 Seiten begrenzt. Wir lesen den
 * Text daher lokal aus (Bilder werden ignoriert) und geben nur den Text an die
 * KI weiter – das umgeht alle Größenlimits und senkt die Kosten deutlich.
 */

export interface ExtractResult {
  text: string;
  kind: "pdf" | "epub" | "text";
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractPdf(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return (result.text ?? "").trim();
  } finally {
    await parser.destroy();
  }
}

async function extractEpub(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  // Alle (X)HTML-Kapitel einlesen, nach Dateinamen sortiert (grobe Lesereihenfolge)
  const entries = Object.values(zip.files)
    .filter((f) => !f.dir && /\.x?html?$/i.test(f.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  const parts: string[] = [];
  for (const entry of entries) {
    const html = await entry.async("string");
    const text = stripHtml(html);
    if (text.length > 40) parts.push(text);
  }
  return parts.join("\n\n").trim();
}

/**
 * Extrahiert reinen Text aus einer hochgeladenen Datei (PDF, EPUB, TXT, MD).
 * Wirft einen Fehler mit klarer Meldung, wenn das Format nicht unterstützt wird
 * oder kein Text gefunden wurde (z. B. reines Scan-PDF ohne Textebene).
 */
export async function extractTextFromFile(file: File): Promise<ExtractResult> {
  const name = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  const isPdf = file.type === "application/pdf" || name.endsWith(".pdf");
  const isEpub = file.type === "application/epub+zip" || name.endsWith(".epub");
  const isText =
    file.type === "text/plain" ||
    file.type === "text/markdown" ||
    name.endsWith(".txt") ||
    name.endsWith(".md");

  let text = "";
  let kind: ExtractResult["kind"] = "text";
  if (isPdf) {
    kind = "pdf";
    text = await extractPdf(buffer);
  } else if (isEpub) {
    kind = "epub";
    text = await extractEpub(buffer);
  } else if (isText) {
    kind = "text";
    text = buffer.toString("utf8").trim();
  } else {
    throw new Error("Nicht unterstütztes Format. Erlaubt: PDF, EPUB, TXT, MD.");
  }

  if (text.length < 100) {
    throw new Error(
      "Kaum Text gefunden. Bei reinen Scan-PDFs (nur Bilder) fehlt die Textebene – bitte eine Version mit Text verwenden."
    );
  }
  return { text, kind };
}
