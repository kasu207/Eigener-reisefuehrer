import Anthropic from "@anthropic-ai/sdk";
import { aiClient } from "./common";
import { AI_MODEL } from "./model";

/**
 * Gemeinsamer Unterbau für Websuche-Recherchen (research-place,
 * research-locality): führt einen Prompt mit dem web_search-Server-Tool aus,
 * setzt die pause_turn-Schleife kurz fort und extrahiert das JSON-Objekt aus
 * der Antwort. Kostenbewusst: max_uses und Runden werden vom Aufrufer eng
 * gedeckelt, der stabile System-Prompt läuft als Cache.
 */

export interface WebResearchParams {
  system: string;
  prompt: string;
  maxTokens: number;
  /** Obergrenze Websuchen pro Aufruf (Kosten!). */
  maxSearches: number;
  /** Obergrenze pause_turn-Fortsetzungen. */
  maxPauseTurns: number;
}

/** JSON-Objekt aus dem Antworttext extrahieren (```json-Block oder letztes {...}). */
export function extractJson(text: string): Record<string, unknown> | null {
  const fence = text.match(/```json\s*([\s\S]*?)```/i);
  const raw = fence ? fence[1] : text.slice(text.lastIndexOf("{"));
  try {
    return JSON.parse(raw.trim());
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/** Websuche-Recherche ausführen und das JSON-Ergebnis (oder null) liefern. */
export async function runWebResearch(
  params: WebResearchParams
): Promise<Record<string, unknown> | null> {
  const tools: Anthropic.Messages.ToolUnion[] = [
    { type: "web_search_20260209", name: "web_search", max_uses: params.maxSearches },
  ];
  const messages: Anthropic.Messages.MessageParam[] = [
    { role: "user", content: params.prompt },
  ];
  const request = {
    model: AI_MODEL,
    max_tokens: params.maxTokens,
    system: [
      {
        type: "text" as const,
        text: params.system,
        cache_control: { type: "ephemeral" as const },
      },
    ],
    tools,
    messages,
  };

  let response = await aiClient.messages.create(request);
  let guard = 0;
  while (response.stop_reason === "pause_turn" && guard < params.maxPauseTurns) {
    messages.push({ role: "assistant", content: response.content });
    response = await aiClient.messages.create(request);
    guard += 1;
  }

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  return extractJson(text);
}
