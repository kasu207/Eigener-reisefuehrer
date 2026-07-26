import { isMock } from "./mock";
import { runWebResearch } from "./web-research";
import {
  RESEARCHABLE_PLACE_TYPES,
  type ResearchablePlaceType,
} from "../place-types";

/**
 * Einmalige Ort-Recherche für einen Unterkunfts-/Wunsch-Ort (z. B. Torno).
 *
 * Holt in EINEM Aufruf mehrere echte, existierende Orte IM angegebenen Ort
 * (nicht nur im Umkreis) – gemischte Typen (Sehenswürdigkeit, Aussicht,
 * Anleger, 1–2 Lokale) – mit Quelle. Ergebnis wird vom Aufrufer geprüft in die
 * DB übernommen und dann für alle künftigen Guides wiederverwendet.
 *
 * Kostenbewusst: kleiner max_uses, kurze pause_turn-Schleife (web-research.ts),
 * ein Aufruf pro neuem Ort (der Aufrufer ruft nur bei leerem Bestand auf).
 */

const MAX_WEB_SEARCHES = 3;
const MAX_PAUSE_TURNS = 2;
const MAX_PLACES = 5;

export type LocalityPlaceType = ResearchablePlaceType;

export interface LocalityCandidate {
  name: string;
  type: LocalityPlaceType;
  note: string;
  priceLevel: number | null;
  address: string | null;
  sourceUrl: string;
  sourceTitle: string;
  confidence: "hoch" | "mittel" | "niedrig";
}

export interface LocalityResearchInput {
  regionName: string;
  locality: string;
  interests: string[];
  priceLevelMax: number;
  diets: string[];
  excludeNames: string[];
}

const SYSTEM_PROMPT = `Du bist Rechercheredakteur:in für einen kuratierten Reiseführer.

AUFGABE: Finde per Websuche echte, aktuell existierende Orte DIREKT IM genannten Ort (nicht in Nachbardörfern). Eine sinnvolle Mischung: das, wofür der Ort bekannt ist (Sehenswürdigkeit/Kirche/Uferpromenade), ein Aussichts- oder Fotopunkt, der Fähr-/Bootsanleger falls vorhanden, und 1–2 empfehlenswerte Lokale (Restaurant/Bar/Café).

HARTE REGELN:
- Nur Orte, die es WIRKLICH gibt und die IM genannten Ort liegen (mit belegbarer Quelle).
- Erfinde keine Fakten. Preise/Öffnungszeiten nur, wenn belegt; sonst weglassen.
- Schlage keine bereits genannten Orte erneut vor.
- type: einer von ${RESEARCHABLE_PLACE_TYPES.join(", ")}.

Antworte am Ende mit GENAU einem JSON-Objekt in einem \`\`\`json-Block:
{
  "places": [
    {
      "name": string,
      "type": "${RESEARCHABLE_PLACE_TYPES.join('"|"')}",
      "note": string (1-2 Sätze auf Deutsch, was den Ort ausmacht),
      "priceLevel": number (1-4) oder null,
      "address": string oder null,
      "sourceUrl": string (Beleg-URL),
      "sourceTitle": string,
      "confidence": "hoch"|"mittel"|"niedrig"
    }
  ]
}`;

function normalize(raw: unknown): LocalityCandidate | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  if (typeof c.name !== "string" || !c.name.trim()) return null;
  const type = (RESEARCHABLE_PLACE_TYPES as readonly string[]).includes(c.type as string)
    ? (c.type as LocalityPlaceType)
    : "sight";
  const pl = Number(c.priceLevel);
  return {
    name: c.name.trim(),
    type,
    note: typeof c.note === "string" ? c.note.trim() : "",
    priceLevel: Number.isInteger(pl) && pl >= 1 && pl <= 4 ? pl : null,
    address: typeof c.address === "string" && c.address.trim() ? c.address.trim() : null,
    sourceUrl: typeof c.sourceUrl === "string" ? c.sourceUrl.trim() : "",
    sourceTitle: typeof c.sourceTitle === "string" ? c.sourceTitle.trim() : "",
    confidence: c.confidence === "hoch" || c.confidence === "mittel" ? c.confidence : "niedrig",
  };
}

export async function researchLocalityPlaces(
  input: LocalityResearchInput
): Promise<LocalityCandidate[]> {
  if (isMock()) {
    return [
      {
        name: `${input.locality} – Uferpromenade (Mock)`,
        type: "sight",
        note: "Mock-Ort ohne Websuche. Im Live-Modus recherchiert die KI hier echte Orte mit Quelle.",
        priceLevel: null,
        address: null,
        sourceUrl: "https://example.com",
        sourceTitle: "Beispielquelle (Mock)",
        confidence: "niedrig",
      },
      {
        name: `Trattoria ${input.locality} (Mock)`,
        type: "restaurant",
        note: "Mock-Lokal ohne Websuche.",
        priceLevel: 2,
        address: null,
        sourceUrl: "https://example.com",
        sourceTitle: "Beispielquelle (Mock)",
        confidence: "niedrig",
      },
    ];
  }

  const prompt = `Finde bis zu ${MAX_PLACES} echte, sehenswerte Orte IM Ort ${input.locality} am ${input.regionName}.

Reise-Kontext (zur Auswahl, nicht erfinden):
- Interessen: ${input.interests.join(", ") || "offen"}
- Preisniveau bis: ${input.priceLevelMax}/4
- Ernährung: ${input.diets.join(", ") || "keine Einschränkung"}

Bereits enthalten (NICHT erneut vorschlagen): ${input.excludeNames.join("; ") || "(keine)"}.`;

  const parsed = await runWebResearch({
    system: SYSTEM_PROMPT,
    prompt,
    maxTokens: 3500,
    maxSearches: MAX_WEB_SEARCHES,
    maxPauseTurns: MAX_PAUSE_TURNS,
  });
  if (!parsed) return [];

  const rawList = Array.isArray(parsed.places) ? parsed.places : [];
  const exclude = new Set(input.excludeNames.map((n) => n.toLowerCase()));
  const seen = new Set<string>();
  const out: LocalityCandidate[] = [];
  for (const raw of rawList) {
    const c = normalize(raw);
    if (!c) continue;
    const key = c.name.toLowerCase();
    if (exclude.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out.slice(0, MAX_PLACES);
}
