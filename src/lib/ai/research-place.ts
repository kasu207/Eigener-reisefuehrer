import Anthropic from "@anthropic-ai/sdk";
import { isMock } from "./mock";
import { AI_MODEL } from "./model";

/**
 * "+"-Recherche: findet EINEN echten, existierenden Ort für einen bestimmten
 * Ort + Bereich per Websuche (Anthropic web_search-Tool, mit Zitat/Quelle).
 * Ergebnis ist ein VORSCHLAG mit Quelle + Maps-Link zum Verifizieren – er wird
 * erst nach Bestätigung durch die Nutzer:in als Ort gespeichert.
 */

const client = new Anthropic({ maxRetries: 2 });

export interface PlaceCandidate {
  name: string;
  note: string;
  priceLevel: number | null;
  address: string | null;
  sourceUrl: string;
  sourceTitle: string;
  confidence: "hoch" | "mittel" | "niedrig";
  mapsUrl: string;
}

export interface ResearchInput {
  regionName: string;
  locality: string;
  areaLabel: string; // z. B. "Restaurant (günstig/Café)"
  interests: string[];
  priceLevelMax: number;
  diets: string[];
  excludeNames: string[];
}

function mapsUrl(name: string, locality: string): string {
  const q = encodeURIComponent(`${name} ${locality}`.trim());
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

/** JSON-Objekt aus dem Antworttext extrahieren (letztes {...}). */
function extractJson(text: string): Record<string, unknown> | null {
  const fence = text.match(/```json\s*([\s\S]*?)```/i);
  const raw = fence ? fence[1] : text.slice(text.lastIndexOf("{"));
  try {
    return JSON.parse(raw.trim());
  } catch {
    // Fallback: erstes bis letztes geschweiftes Klammernpaar
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

export async function researchPlace(input: ResearchInput): Promise<PlaceCandidate | null> {
  if (isMock()) {
    const name = `Neuer Tipp in ${input.locality} (Mock)`;
    return {
      name,
      note: "Mock-Vorschlag ohne Websuche. Im Live-Modus recherchiert die KI hier einen echten Ort mit Quelle.",
      priceLevel: 2,
      address: null,
      sourceUrl: "https://example.com",
      sourceTitle: "Beispielquelle (Mock)",
      confidence: "niedrig",
      mapsUrl: mapsUrl(name, input.locality),
    };
  }

  const prompt = `Finde EINEN echten, aktuell existierenden ${input.areaLabel} in ${input.locality} am ${input.regionName}, der zu diesen Reisenden passt.

Reise-Kontext:
- Interessen: ${input.interests.join(", ") || "offen"}
- Preisniveau bis: ${input.priceLevelMax}/4
- Ernährung: ${input.diets.join(", ") || "keine Einschränkung"}

WICHTIG:
- Nutze die Websuche und schlage nur einen Ort vor, den es WIRKLICH gibt (mit belegbarer Quelle).
- Der Ort muss in oder sehr nah bei ${input.locality} liegen.
- Schlage KEINEN dieser bereits enthaltenen Orte vor: ${input.excludeNames.join("; ") || "(keine)"}.
- Erfinde keine Fakten. Preise/Öffnungszeiten nur, wenn belegt.

Antworte am Ende mit GENAU einem JSON-Objekt in einem \`\`\`json-Block mit den Feldern:
{
  "name": string,
  "note": string (1-2 Sätze auf Deutsch, was den Ort ausmacht),
  "priceLevel": number (1-4) oder null,
  "address": string oder null,
  "sourceUrl": string (Beleg-URL),
  "sourceTitle": string,
  "confidence": "hoch" | "mittel" | "niedrig"
}`;

  const tools: Anthropic.Messages.ToolUnion[] = [
    { type: "web_search_20260209", name: "web_search", max_uses: 5 },
  ];
  const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: prompt }];

  let response = await client.messages.create({
    model: AI_MODEL,
    max_tokens: 2500,
    tools,
    messages,
  });
  // Server-Tool-Schleife (pause_turn) fortsetzen
  let guard = 0;
  while (response.stop_reason === "pause_turn" && guard < 4) {
    messages.push({ role: "assistant", content: response.content });
    response = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 2500,
      tools,
      messages,
    });
    guard += 1;
  }

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  const parsed = extractJson(text);
  if (!parsed || typeof parsed.name !== "string" || !parsed.name.trim()) return null;

  const name = String(parsed.name).trim();
  const pl = Number(parsed.priceLevel);
  return {
    name,
    note: typeof parsed.note === "string" ? parsed.note.trim() : "",
    priceLevel: Number.isInteger(pl) && pl >= 1 && pl <= 4 ? pl : null,
    address: typeof parsed.address === "string" && parsed.address.trim() ? parsed.address.trim() : null,
    sourceUrl: typeof parsed.sourceUrl === "string" ? parsed.sourceUrl.trim() : "",
    sourceTitle: typeof parsed.sourceTitle === "string" ? parsed.sourceTitle.trim() : "",
    confidence:
      parsed.confidence === "hoch" || parsed.confidence === "mittel" ? parsed.confidence : "niedrig",
    mapsUrl: mapsUrl(name, input.locality),
  };
}
