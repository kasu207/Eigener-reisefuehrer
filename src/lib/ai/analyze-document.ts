import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod/v4";
import { INTERESTS } from "../questionnaire";
import { BROWSER_HEADERS } from "../http";
import { isMock } from "./mock";
import { AI_MODEL } from "./model";
import { aiClient, safetySchema, UnsafeContentError } from "./common";

/**
 * Einlesen und Aufbereiten von Wissensquellen (Bücher, Reiseführer, Blogs)
 * durch die KI. Ergebnis sind paraphrasierte, getaggte Notizen
 * (KnowledgeChunks) – niemals wörtliche Übernahmen (Urheberrecht,
 * vgl. Anforderungsdokument 5.1/10).
 */

const MODEL = AI_MODEL;

const chunkSchema = z.object({
  /**
   * Inhalts-Sicherheitsprüfung für die community-gespeiste Wissensdatenbank:
   * Quellen mit unzulässigen Inhalten werden automatisch abgelehnt und
   * gelangen nie in die Datenbank. (Gemeinsames Schema in common.ts.)
   */
  safety: safetySchema,
  chunks: z.array(
    z.object({
      title: z.string(),
      content: z.string(),
      interests: z.array(z.enum(INTERESTS)),
      /** IDs aus der mitgegebenen Liste bekannter Orte (exakte Zuordnung). */
      placeIds: z.array(z.string()),
      /** Ortsnamen, die NICHT in der Liste stehen (Kandidaten für neue Orte). */
      placeNames: z.array(z.string()),
    })
  ),
});

export interface AnalyzedChunk {
  title: string;
  content: string;
  interests: string[];
  placeIds: string[];
  placeNames: string[];
}

/** Bekannter Ort der Region, den die KI per ID referenzieren kann. */
export interface KnownPlace {
  id: string;
  name: string;
  locality: string;
}

// Obergrenze für die Ortsliste im Prompt (hält den Kontext klein; bei mehr
// Orten greift die code-seitige Namensauflösung in knowledge.ts).
const MAX_KNOWN_PLACES_IN_PROMPT = 400;

function knownPlacesBlock(knownPlaces: KnownPlace[]): string {
  if (knownPlaces.length === 0) return "";
  const lines = knownPlaces
    .slice(0, MAX_KNOWN_PLACES_IN_PROMPT)
    .map((p) => `- ${p.id} · ${p.name}${p.locality ? ` (${p.locality})` : ""}`);
  return `\n\nBEKANNTE ORTE DER REGION (id · Name):\n${lines.join("\n")}`;
}

/** Gemeinsame Ablehnungs-Fehlerklasse (Sicherheitsprüfung). */
export { UnsafeContentError as UnsafeSourceError };

const ANALYSIS_SYSTEM = `Du bist Rechercheredakteur:in für eine kuratierte Reiseführer-Datenbank (Region wird genannt).

AUFGABE: Extrahiere aus der vorliegenden Quelle nützliche Reise-Erkenntnisse als einzelne Notizen ("chunks").

HARTE REGELN:
- Formuliere ausschließlich EIGENE Zusammenfassungen. Übernimm NIE wörtliche Sätze oder Passagen aus der Quelle (Urheberrecht).
- Jede Notiz: prägnanter Titel, 2-5 Sätze Inhalt in eigener Formulierung, sachlich.
- Tagge jede Notiz mit passenden Interessen aus dieser Liste: ${INTERESTS.join(", ")}.
- Ortszuordnung: Bezieht sich die Notiz auf einen Ort aus der Liste BEKANNTE ORTE, trage dessen id in placeIds ein (nur ids aus der Liste, nie erfinden). Orte, die NICHT in der Liste stehen, nenne stattdessen namentlich in placeNames – sie werden der Redaktion als Kandidaten für neue Einträge vorgeschlagen. Beides leer lassen, wenn die Notiz allgemein ist.
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
  knownPlaces: KnownPlace[],
  content: Anthropic.Messages.ContentBlockParam[]
): Promise<{ chunks: AnalyzedChunk[]; inputTokens: number; outputTokens: number }> {
  const response = await aiClient.messages.parse({
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
          {
            type: "text",
            text: `Region: ${regionName}.${knownPlacesBlock(knownPlaces)}\n\nAnalysiere die folgende Quelle:`,
          },
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
    throw new UnsafeContentError(response.parsed_output.safety.reason);
  }
  // Nur ids akzeptieren, die tatsächlich existieren (Schutz vor Halluzination)
  const knownIds = new Set(knownPlaces.map((p) => p.id));
  const chunks = response.parsed_output.chunks.map((c) => ({
    ...c,
    placeIds: [...new Set(c.placeIds.filter((id) => knownIds.has(id)))],
  }));
  return {
    chunks,
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
        placeIds: [],
        placeNames: [],
      },
    ] as AnalyzedChunk[],
    inputTokens: 0,
    outputTokens: 0,
  };
}

/** PDF (Buch/Reiseführer) analysieren – Claude liest das PDF direkt. */
export async function analyzePdf(regionName: string, knownPlaces: KnownPlace[], pdfData: Buffer) {
  if (isMock()) return mockAnalysis("PDF-Upload");
  return runAnalysis(regionName, knownPlaces, [
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
export async function analyzeText(regionName: string, knownPlaces: KnownPlace[], text: string) {
  if (isMock()) return mockAnalysis("Text-Upload");
  return runAnalysis(regionName, knownPlaces, [
    { type: "text", text: text.slice(0, 400_000) },
  ]);
}

/** Blog/Artikel-URL: HTML holen, grob entschlacken, analysieren. */
export async function analyzeUrl(regionName: string, knownPlaces: KnownPlace[], url: string) {
  if (isMock()) return mockAnalysis(url);
  // Realistischer Browser-Header: viele Blogs blocken sonst (403/500)
  const res = await fetch(url, {
    headers: BROWSER_HEADERS,
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
  return runAnalysis(regionName, knownPlaces, [
    { type: "text", text: `Quelle-URL: ${url}\n\n${text.slice(0, 300_000)}` },
  ]);
}
