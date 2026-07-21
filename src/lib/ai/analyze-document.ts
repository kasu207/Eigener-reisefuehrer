import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod/v4";
import { INTERESTS } from "../questionnaire";
import { isMock } from "./mock";
import { AI_MODEL } from "./model";

/**
 * Einlesen und Aufbereiten von Wissensquellen (Bücher, Reiseführer, Blogs)
 * durch die KI. Ergebnis sind paraphrasierte, getaggte Notizen
 * (KnowledgeChunks) – niemals wörtliche Übernahmen (Urheberrecht,
 * vgl. Anforderungsdokument 5.1/10).
 */

const MODEL = AI_MODEL;
const client = new Anthropic({ maxRetries: 3 });

const chunkSchema = z.object({
  /**
   * Inhalts-Sicherheitsprüfung für die community-gespeiste Wissensdatenbank:
   * Quellen mit unzulässigen Inhalten werden automatisch abgelehnt und
   * gelangen nie in die Datenbank.
   */
  safety: z.object({
    acceptable: z.boolean(),
    reason: z.string(),
  }),
  chunks: z.array(
    z.object({
      title: z.string(),
      content: z.string(),
      interests: z.array(z.enum(INTERESTS)),
      placeNames: z.array(z.string()),
    })
  ),
});

export interface AnalyzedChunk {
  title: string;
  content: string;
  interests: string[];
  placeNames: string[];
}

/** Wird geworfen, wenn die Sicherheitsprüfung eine Quelle ablehnt. */
export class UnsafeSourceError extends Error {
  constructor(public reason: string) {
    super(`Quelle abgelehnt: ${reason}`);
    this.name = "UnsafeSourceError";
  }
}

const ANALYSIS_SYSTEM = `Du bist Rechercheredakteur:in für eine kuratierte Reiseführer-Datenbank (Region wird genannt).

AUFGABE: Extrahiere aus der vorliegenden Quelle nützliche Reise-Erkenntnisse als einzelne Notizen ("chunks").

HARTE REGELN:
- Formuliere ausschließlich EIGENE Zusammenfassungen. Übernimm NIE wörtliche Sätze oder Passagen aus der Quelle (Urheberrecht).
- Jede Notiz: prägnanter Titel, 2-5 Sätze Inhalt in eigener Formulierung, sachlich.
- Tagge jede Notiz mit passenden Interessen aus dieser Liste: ${INTERESTS.join(", ")}.
- Nenne im Feld placeNames die konkreten Orte/Wanderungen, auf die sich die Notiz bezieht (leer lassen, wenn allgemein).
- Keine erfundenen Fakten: Nur was in der Quelle steht. Preise/Öffnungszeiten mit Vorsicht ("laut Quelle, Stand unklar").
- Maximal 25 Notizen, nur wirklich Nützliches (Geheimtipps, Einordnungen, praktische Hinweise, Hintergründe).

SICHERHEITSPRÜFUNG (Feld "safety", zuerst prüfen):
Diese Wissensdatenbank wird auch von Nutzer:innen gespeist und muss streng kuratiert bleiben. Setze safety.acceptable auf false und liefere KEINE chunks, wenn die Quelle enthält:
- pornografische oder jugendgefährdende Inhalte (FSK 18)
- extremistische, volksverhetzende, rassistische oder verfassungsfeindliche Inhalte
- Anleitungen zu Straftaten oder sonst strafrechtlich relevante Inhalte
- offensichtlichen Spam/Werbung ohne Reisebezug
Begründe die Entscheidung knapp in safety.reason. Bei unbedenklichen Reise-Quellen: acceptable=true, reason="unbedenklich".`;

async function runAnalysis(
  regionName: string,
  content: Anthropic.Messages.ContentBlockParam[]
): Promise<{ chunks: AnalyzedChunk[]; inputTokens: number; outputTokens: number }> {
  const response = await client.messages.parse({
    model: MODEL,
    // 16000 statt 32000: hält die Nicht-Streaming-Anfrage unter der
    // 10-Minuten-Grenze des SDK (sonst "Streaming is required"-Fehler).
    // Für max. 25 kurze, paraphrasierte Notizen ist das reichlich.
    max_tokens: 16000,
    system: ANALYSIS_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: `Region: ${regionName}. Analysiere die folgende Quelle:` },
          ...content,
        ],
      },
    ],
    output_config: { format: zodOutputFormat(chunkSchema) },
  });
  if (!response.parsed_output) {
    throw new Error("Dokument-Analyse lieferte kein valides JSON");
  }
  if (!response.parsed_output.safety.acceptable) {
    throw new UnsafeSourceError(response.parsed_output.safety.reason);
  }
  return {
    chunks: response.parsed_output.chunks,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

/** Mock-Analyse ohne API-Kosten (AI_MODE=mock). */
function mockAnalysis(sourceLabel: string) {
  return {
    chunks: [
      {
        title: `Notiz aus ${sourceLabel} (Mock)`,
        content:
          "Dies ist eine Mock-Notiz ohne API-Kosten. Im Live-Modus extrahiert die KI hier paraphrasierte, getaggte Erkenntnisse aus der Quelle.",
        interests: ["kulinarik", "doerfer_maerkte"],
        placeNames: [],
      },
    ] as AnalyzedChunk[],
    inputTokens: 0,
    outputTokens: 0,
  };
}

/** PDF (Buch/Reiseführer) analysieren – Claude liest das PDF direkt. */
export async function analyzePdf(regionName: string, pdfData: Buffer) {
  if (isMock()) return mockAnalysis("PDF-Upload");
  return runAnalysis(regionName, [
    {
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: pdfData.toString("base64"),
      },
    },
  ]);
}

/** Reinen Text (txt/md-Upload) analysieren. */
export async function analyzeText(regionName: string, text: string) {
  if (isMock()) return mockAnalysis("Text-Upload");
  return runAnalysis(regionName, [{ type: "text", text: text.slice(0, 400_000) }]);
}

/** Blog/Artikel-URL: HTML holen, grob entschlacken, analysieren. */
export async function analyzeUrl(regionName: string, url: string) {
  if (isMock()) return mockAnalysis(url);
  const res = await fetch(url, {
    headers: {
      // Realistischer Browser-Header: viele Blogs blocken sonst (403/500)
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "de,en;q=0.8",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Abruf fehlgeschlagen (${res.status})`);
  const html = await res.text();
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length < 200) throw new Error("Seite enthält zu wenig Text");
  return runAnalysis(regionName, [
    { type: "text", text: `Quelle-URL: ${url}\n\n${text.slice(0, 300_000)}` },
  ]);
}
