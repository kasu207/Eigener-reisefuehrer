import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod/v4";
import { isMock } from "./mock";
import { AI_MODEL } from "./model";

/**
 * KI-gestützte Ort-VORSCHLÄGE für die Redaktion (Kuratierungs-Hilfe).
 *
 * Wichtig zur Einordnung: Diese Funktion befüllt die DB NICHT automatisch mit
 * geprüften Fakten. Sie erzeugt ausschließlich ENTWÜRFE (status = draft), die
 * ein Mensch prüft, mit Koordinaten/Preisen/Öffnungszeiten ergänzt und erst
 * dann auf "verified" stellt. So bleibt das Kern-Prinzip gewahrt: nur geprüfte
 * Einträge gelangen in den Guide, die KI erfindet keine Fakten im Buch.
 */

const MODEL = AI_MODEL;
const client = new Anthropic({ maxRetries: 3 });

// Muss zu prisma enum PlaceType passen
const PLACE_TYPES = [
  "village",
  "sight",
  "viewpoint",
  "beach",
  "restaurant",
  "bar",
  "hotel",
  "event",
  "practical",
] as const;
export type SuggestPlaceType = (typeof PLACE_TYPES)[number];

const suggestionSchema = z.object({
  // Sicherheitsprüfung wie bei der Wissensanalyse
  safety: z.object({
    acceptable: z.boolean(),
    reason: z.string(),
  }),
  suggestions: z.array(
    z.object({
      name: z.string(),
      type: z.enum(PLACE_TYPES),
      locality: z.string(),
      tags: z.array(z.string()),
      // grobe Preisklasse (nur Gastro) – ausdrücklich als Schätzung zu prüfen
      priceLevel: z.number().int().min(1).max(4).nullable(),
      // Kontext für die Redaktion; landet in editorNotes
      editorNote: z.string(),
      // Selbsteinschätzung, wie sicher der Ort real existiert
      confidence: z.enum(["hoch", "mittel", "niedrig"]),
    })
  ),
});

export interface PlaceSuggestion {
  name: string;
  type: SuggestPlaceType;
  locality: string;
  tags: string[];
  priceLevel: number | null;
  editorNote: string;
  confidence: "hoch" | "mittel" | "niedrig";
}

/** Wird geworfen, wenn die Sicherheitsprüfung anschlägt. */
export class UnsafeSuggestionError extends Error {
  constructor(public reason: string) {
    super(`Vorschlag abgelehnt: ${reason}`);
    this.name = "UnsafeSuggestionError";
  }
}

const SYSTEM = `Du bist Rechercheredakteur:in für eine kuratierte Reiseführer-Datenbank.

AUFGABE: Schlage reale, besuchenswerte Orte für die genannte Region/den Ort und den gewünschten Typ vor. Das sind ENTWÜRFE für die menschliche Redaktion, KEINE fertigen Guide-Inhalte.

HARTE REGELN:
- Schlage nur Orte vor, von denen du überzeugt bist, dass sie WIRKLICH EXISTIEREN. Erfinde keine Namen. Bist du unsicher, setze confidence auf "mittel" oder "niedrig" und weise im editorNote darauf hin.
- Erfinde KEINE präzisen Fakten: keine genauen Adressen, Öffnungszeiten, Telefonnummern oder Preise. Die prüft und ergänzt die Redaktion selbst. priceLevel ist nur eine grobe Schätzung (1 günstig … 4 gehoben) oder null.
- editorNote (2-4 Sätze): interner Kontext für die Redaktion – was den Ort ausmacht, wofür er bekannt ist, worauf bei der Prüfung zu achten ist. Sachlich, kein Werbetext.
- tags: kurze, kleingeschriebene Schlagwörter (z. B. "villa, garten, foto").
- locality: die Stadt/der Ort, zu dem der Eintrag gehört (z. B. "Varenna").
- Für Gastro (restaurant/bar) eine gute Mischung vorschlagen, nicht nur teure Adressen.

SICHERHEITSPRÜFUNG (Feld "safety", zuerst prüfen):
Setze safety.acceptable auf false und liefere KEINE suggestions, wenn die Anfrage auf unzulässige Inhalte zielt (pornografisch/jugendgefährdend, extremistisch/volksverhetzend, strafrechtlich relevant). Sonst acceptable=true, reason="unbedenklich".`;

/**
 * Erzeugt Ort-Entwürfe. Gibt bei AI_MODE=mock deterministische Platzhalter
 * zurück (keine API-Kosten).
 */
export async function suggestPlaces(params: {
  regionName: string;
  locality: string;
  type: SuggestPlaceType;
  count: number;
  extraHint?: string;
}): Promise<{ suggestions: PlaceSuggestion[]; inputTokens: number; outputTokens: number }> {
  const count = Math.max(1, Math.min(15, params.count));

  if (isMock()) {
    return {
      suggestions: Array.from({ length: Math.min(count, 3) }, (_, i) => ({
        name: `Beispiel-${params.type} ${i + 1} (Mock)`,
        type: params.type,
        locality: params.locality,
        tags: ["mock", params.type],
        priceLevel: params.type === "restaurant" || params.type === "bar" ? 2 : null,
        editorNote:
          "Mock-Entwurf ohne API-Kosten. Im Live-Modus schlägt die KI hier reale Orte samt Redaktionskontext vor – bitte Koordinaten und Fakten prüfen.",
        confidence: "niedrig" as const,
      })),
      inputTokens: 0,
      outputTokens: 0,
    };
  }

  const userPrompt = [
    `Region: ${params.regionName}`,
    params.locality ? `Ort/Stadt: ${params.locality}` : "Ort/Stadt: (ganze Region)",
    `Gewünschter Typ: ${params.type}`,
    `Anzahl Vorschläge: ${count}`,
    params.extraHint ? `Zusatzhinweis: ${params.extraHint}` : "",
    "Liefere genau diese Anzahl Vorschläge (oder weniger, falls du nicht genug reale Orte kennst).",
  ]
    .filter(Boolean)
    .join("\n");

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM,
    messages: [{ role: "user", content: userPrompt }],
    output_config: { format: zodOutputFormat(suggestionSchema) },
  });

  if (!response.parsed_output) {
    throw new Error("Vorschlags-Generierung lieferte kein valides JSON");
  }
  if (!response.parsed_output.safety.acceptable) {
    throw new UnsafeSuggestionError(response.parsed_output.safety.reason);
  }

  return {
    suggestions: response.parsed_output.suggestions.slice(0, count),
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}
