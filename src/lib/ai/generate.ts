import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
// Der SDK-Helper erwartet Zod-v4-Schemata (zod >= 3.25 liefert das Subpath-Export mit)
import * as z from "zod/v4";
import type { Questionnaire } from "../questionnaire";
import { INTEREST_LABELS, tripDays } from "../questionnaire";
import type { GuideContent, Chapter } from "../guide-content";
import { isMock, mockPersonalText, mockReason } from "./mock";
import { AI_MODEL } from "./model";

/**
 * KI-Textgenerierung (Anforderung 4.3).
 * - Modell konfigurierbar per Umgebungsvariable ANTHROPIC_MODEL
 * - Generierung kapitelweise, Ausgabe als strukturiertes JSON (Zod-validiert)
 * - Harte Regel im Systemprompt: keine erfundenen Fakten
 * - Retries übernimmt das SDK (Standard: 2, hier 3)
 */

const MODEL = AI_MODEL;

const client = new Anthropic({ maxRetries: 3 });

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

const SYSTEM_PROMPT = `Du bist Redakteur:in eines hochwertigen, persönlichen Reiseführers auf Deutsch.

HARTE REGELN:
- Fakten (Öffnungszeiten, Preise, Distanzen, Höhenmeter, Adressen, Fahrzeiten) dürfen AUSSCHLIESSLICH aus den mitgelieferten Datenbank-Daten übernommen werden.
- Fehlende Fakten lässt du weg. Du erfindest NIEMALS Zahlen, Namen oder Details.
- Fakten-Boxen werden separat aus der Datenbank gerendert – wiederhole keine Adressen oder Zahlenkolonnen im Fließtext.
- Sprich die Reisenden direkt mit "ihr" an und beziehe dich auf ihre Angaben aus dem Fragebogen ("Weil ihr gern ... seid").
- Stil: ruhig, warmherzig, redaktionell hochwertig wie ein modernes Reisemagazin. Keine Superlative-Kaskaden, keine Emojis.
- KEINE generischen Regionstipps in einzelnen Einträgen wiederholen: Dinge wie das "Coperto" (Gedeck), Trinkgeld-Gepflogenheiten, dass Leitungswasser trinkbar ist, die Aperitivo-Zeit oder allgemeine Fähren-/Parkhinweise stehen bereits einmal zentral im Kapitel "Gut zu wissen". Schreibe stattdessen konkret über DIESEN Ort (was ihn besonders macht), nicht über allgemeine Landeskunde. Jeder Text soll eigenständig sein und sich nicht mit anderen überschneiden.`;

/** Fragebogen-Zusammenfassung als Kontext für jedes Kapitel. */
export function summarizeQuestionnaire(q: Questionnaire): string {
  const interests = q.interests
    .map((i) => `${INTEREST_LABELS[i.key]} (${i.weight})`)
    .join(", ");
  const children =
    q.children.length > 0
      ? `${q.children.length} Kind(er), Altersgruppen: ${q.children.map((c) => c.ageGroup).join(", ")}`
      : "keine Kinder";
  return [
    `Reisende: ${q.firstNames} – ${q.adults} Erwachsene, ${children}`,
    `Zeitraum: ${q.dateFrom} bis ${q.dateTo} (${tripDays(q)} Tage), Tempo: ${q.pace}`,
    `Unterkunft: ${q.accommodation.label}`,
    `Mobilität vor Ort: ${q.mobility
      .map((m) => (m === "car" ? "Auto" : m === "public" ? "ÖPNV/Fähre" : "zu Fuß/Rad"))
      .join(", ")}`,
    `Interessen: ${interests}`,
    `Fitness: ${q.fitnessLevel}, max. Wanderdauer ${q.maxHikeDurationMin} min, max. ${q.maxElevationGainM} Höhenmeter`,
    `Kulinarik: Preisniveau bis ${q.priceLevel}/4, Ernährung: ${q.diets.join(", ") || "keine Einschränkungen"}, Vorlieben: ${q.foodPreferences.join(", ") || "offen"}`,
    q.occasion ? `Besonderer Anlass: ${q.occasion}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Ein DB-Eintrag mit geprüften Fakten und Quellen-Exzerpten als KI-Kontext. */
export interface EntryContext {
  id: string;
  name: string;
  facts: string; // geprüfte Fakten aus der DB, formatiert
  sourceExcerpts: string[]; // Quellen-Notizen der Redaktion
}

const chapterOutputSchema = z.object({
  title: z.string(),
  introText: z.string(),
  entries: z.array(
    z.object({
      id: z.string(),
      personalText: z.string(),
      reason: z.string(),
    })
  ),
});

const introOutputSchema = z.object({
  introTitle: z.string(),
  introText: z.string(),
  daySuggestions: z.array(
    z.object({ day: z.number().int(), title: z.string(), text: z.string() })
  ),
});

async function callClaude<S extends z.ZodType>(
  schema: S,
  schemaName: string,
  userPrompt: string,
  usage: TokenUsage
): Promise<z.infer<S>> {
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    // Prompt-Caching: Der stabile Systemprompt wird pro Guide über viele
    // Kapitel-Aufrufe wiederverwendet – als Cache markiert spart das die
    // Eingabe-Tokens (Cache-Reads kosten ~1/10). Senkt die API-Kosten pro Buch.
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userPrompt }],
    output_config: { format: zodOutputFormat(schema) },
  });
  usage.inputTokens += response.usage.input_tokens;
  usage.outputTokens += response.usage.output_tokens;
  if (!response.parsed_output) {
    throw new Error(`Kapitel-Generierung lieferte kein valides JSON (${schemaName})`);
  }
  return response.parsed_output;
}

export interface ChapterJob {
  key: string;
  kind: Chapter["kind"];
  workingTitle: string;
  instruction: string;
  entries: EntryContext[];
}

function formatEntries(entries: EntryContext[]): string {
  return entries
    .map((e) => {
      const sources =
        e.sourceExcerpts.length > 0
          ? `\n  Quellen-Notizen: ${e.sourceExcerpts.join(" | ")}`
          : "";
      return `- id: ${e.id}\n  Name: ${e.name}\n  Geprüfte Fakten: ${e.facts}${sources}`;
    })
    .join("\n");
}

export async function generateChapter(
  q: Questionnaire,
  job: ChapterJob,
  usage: TokenUsage,
  extraContext = ""
): Promise<Chapter> {
  // Mock-Modus: deterministische Texte ohne API-Aufruf (keine Token-Kosten)
  if (isMock()) {
    return {
      key: job.key,
      kind: job.kind,
      title: job.workingTitle,
      introText: `Eine handverlesene Auswahl für euch. (Mock-Kapiteleinleitung)`,
      entries: job.entries.map((e) => ({
        id: e.id,
        personalText: mockPersonalText(e.name),
        reason: mockReason(),
      })),
    };
  }
  const prompt = `FRAGEBOGEN-ZUSAMMENFASSUNG:
${summarizeQuestionnaire(q)}
${extraContext ? `\n${extraContext}\n` : ""}
KAPITEL: ${job.workingTitle}
AUFGABE: ${job.instruction}

Schreibe für jeden der folgenden Einträge einen ausführlichen, erzählerischen Empfehlungstext (5-8 Sätze, Feld "personalText"): Beschreibe die Atmosphäre und das Erlebnis vor Ort, was die Reisenden dort konkret erwartet, praktische Hinweise zum Besuch (ohne erfundene Zahlen), und stelle einen persönlichen Bezug zu ihren Angaben her. Der Text soll sich wie eine Seite in einem gedruckten Reiseführer lesen – warm, konkret und mit Tiefe, nicht werblich. Dazu eine individuelle Begründung, warum dieser Ort zu genau diesen Reisenden passt (1-2 Sätze, Feld "reason", beginnend mit "Weil ihr ..."). Verwende exakt die angegebenen ids. Ergänze einen einladenden Kapitel-Einleitungstext ("introText", 3-5 Sätze), der den Ort/das Thema stimmungsvoll einführt, sowie einen passenden Kapiteltitel ("title").

EINTRÄGE (einzige zulässige Faktenquelle):
${formatEntries(job.entries)}`;

  const out = await callClaude(chapterOutputSchema, `chapter_${job.kind}`, prompt, usage);

  // Nur Einträge übernehmen, deren id wir tatsächlich geliefert haben
  const validIds = new Set(job.entries.map((e) => e.id));
  return {
    key: job.key,
    kind: job.kind,
    title: out.title,
    introText: out.introText,
    entries: out.entries.filter((e) => validIds.has(e.id)),
  };
}

export async function generateIntro(
  q: Questionnaire,
  chapterSummaries: string[],
  usage: TokenUsage,
  extraContext = ""
): Promise<Pick<GuideContent, "intro" | "daySuggestions">> {
  if (isMock()) {
    const days = tripDays(q);
    return {
      intro: {
        title: `Euer ${q.regionSlug === "comer-see" ? "Comer See" : "Reiseziel"}`,
        text: `Hallo ${q.firstNames}! Dies ist eine Mock-Einleitung ohne API-Kosten – im Live-Modus steht hier eure persönliche Einleitung mit Bezug auf Zeitraum, Anlass und Interessen.`,
      },
      daySuggestions: Array.from({ length: days }, (_, i) => ({
        day: i + 1,
        title: `Tag ${i + 1} (Mock)`,
        text: "Ein Tagesvorschlag aus den Kapiteln dieses Guides. (Mock)",
      })),
    };
  }
  const prompt = `FRAGEBOGEN-ZUSAMMENFASSUNG:
${summarizeQuestionnaire(q)}
${extraContext ? `\n${extraContext}\n` : ""}
Der Reiseführer enthält folgende Kapitel:
${chapterSummaries.map((s) => `- ${s}`).join("\n")}

AUFGABE:
1. Schreibe eine persönliche, einladende Einleitung für den Reiseführer (Feld "introText", 6-9 Sätze), die die Reisenden mit Namen anspricht, auf Zeitraum, Anlass und Interessen eingeht und Lust auf die Reise macht. Dazu einen Titel ("introTitle").
2. Erstelle für jeden Reisetag (${tripDays(q)} Tage) einen ausformulierten Tagesvorschlag ("daySuggestions": day, title, text mit 4-6 Sätzen), der einen stimmigen Tagesablauf erzählt. Kombiniere dafür nur Orte/Aktivitäten, die in den Kapiteln vorkommen, und berücksichtige das Reisetempo "${q.pace}". Nenne keine konkreten Uhrzeiten oder Preise.`;

  const out = await callClaude(introOutputSchema, "guide_intro", prompt, usage);
  return {
    intro: { title: out.introTitle, text: out.introText },
    daySuggestions: out.daySuggestions,
  };
}

export function modelUsed(): string {
  return isMock() ? "mock" : MODEL;
}
