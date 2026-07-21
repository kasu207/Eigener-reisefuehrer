import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod/v4";
import { isMock } from "./mock";
import { AI_MODEL } from "./model";

/**
 * Liest aus einem Fließtext (z. B. einem YouTube-Transkript) die erwähnten,
 * real existierenden Orte einer Region heraus – als ENTWÜRFE für die Redaktion.
 *
 * Prinzip wie bei suggestPlaces: Die KI erfindet KEINE Guide-Fakten. Sie
 * benennt nur, welche Orte im Text vorkommen, mit kurzem Kontext aus dem Video,
 * und markiert sie zur menschlichen Prüfung/Recherche (status = draft).
 */

const MODEL = AI_MODEL;
const client = new Anthropic({ maxRetries: 3 });

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
export type ExtractPlaceType = (typeof PLACE_TYPES)[number];

const schema = z.object({
  safety: z.object({
    acceptable: z.boolean(),
    reason: z.string(),
  }),
  places: z.array(
    z.object({
      name: z.string(),
      type: z.enum(PLACE_TYPES),
      locality: z.string(),
      tags: z.array(z.string()),
      priceLevel: z.number().int().min(1).max(4).nullable(),
      // Wörtlich/paraphrasiert, was das Video über den Ort sagt
      quote: z.string(),
      confidence: z.enum(["hoch", "mittel", "niedrig"]),
    })
  ),
});

export interface ExtractedPlace {
  name: string;
  type: ExtractPlaceType;
  locality: string;
  tags: string[];
  priceLevel: number | null;
  quote: string;
  confidence: "hoch" | "mittel" | "niedrig";
}

export class UnsafeExtractionError extends Error {
  constructor(public reason: string) {
    super(`Analyse abgelehnt: ${reason}`);
    this.name = "UnsafeExtractionError";
  }
}

const SYSTEM = `Du bist Rechercheredakteur:in für eine kuratierte Reiseführer-Datenbank.

AUFGABE: Aus dem gelieferten Transkript (gesprochener Text eines Reise-Videos) die konkret genannten, real existierenden ORTE der Zielregion herausziehen – als ENTWÜRFE für die menschliche Redaktion.

HARTE REGELN:
- Nimm nur Orte auf, die im Text NAMENTLICH genannt werden (Restaurants, Sehenswürdigkeiten, Aussichtspunkte, Bars, Hotels, Dörfer, Strände). Erfinde nichts dazu.
- Gehört ein genannter Ort klar NICHT zur Zielregion, lass ihn weg.
- Erfinde KEINE präzisen Fakten (keine Adressen/Öffnungszeiten/Telefon/genaue Preise). priceLevel ist nur eine grobe Schätzung (1 günstig … 4 gehoben) oder null.
- quote: 1-2 Sätze, was das Video über den Ort sagt (paraphrasiert, kein langes wörtliches Zitat). Das ist Redaktions-Kontext.
- locality: die Stadt/der Ort am See, zu dem der Eintrag gehört (z. B. "Varenna"). Wenn unklar, beste Schätzung.
- tags: kurze, kleingeschriebene Schlagwörter.
- confidence: wie sicher der Ort real existiert und korrekt zugeordnet ist.
- Keine Dubletten: jeden Ort nur einmal.

SICHERHEITSPRÜFUNG (Feld "safety", zuerst prüfen):
Setze safety.acceptable=false und liefere KEINE places, wenn der Text auf unzulässige Inhalte zielt (pornografisch/jugendgefährdend, extremistisch/volksverhetzend, strafrechtlich relevant). Sonst acceptable=true, reason="unbedenklich".`;

export async function extractPlacesFromText(params: {
  regionName: string;
  text: string;
  sourceLabel: string;
}): Promise<{ places: ExtractedPlace[]; inputTokens: number; outputTokens: number }> {
  // Sehr lange Transkripte kürzen (Kostendeckel; deckt typische Reise-Videos ab)
  const text = params.text.slice(0, 40_000);

  if (isMock()) {
    return {
      places: [
        {
          name: "Beispiel-Ort aus Video (Mock)",
          type: "sight",
          locality: params.regionName,
          tags: ["mock", "video"],
          priceLevel: null,
          quote:
            "Mock-Ergebnis ohne API-Kosten. Im Live-Modus liest die KI hier die im Video genannten Orte aus.",
          confidence: "niedrig",
        },
      ],
      inputTokens: 0,
      outputTokens: 0,
    };
  }

  const userPrompt = [
    `Zielregion: ${params.regionName}`,
    `Quelle: ${params.sourceLabel}`,
    "",
    "TRANSKRIPT:",
    text,
  ].join("\n");

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM,
    messages: [{ role: "user", content: userPrompt }],
    output_config: { format: zodOutputFormat(schema) },
  });

  if (!response.parsed_output) {
    throw new Error("Ort-Extraktion lieferte kein valides JSON");
  }
  if (!response.parsed_output.safety.acceptable) {
    throw new UnsafeExtractionError(response.parsed_output.safety.reason);
  }

  return {
    places: response.parsed_output.places,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}
