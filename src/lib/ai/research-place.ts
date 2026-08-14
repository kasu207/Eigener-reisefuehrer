import { isMock } from "./mock";
import { runWebResearch } from "./web-research";

/**
 * "+"-Recherche: findet echte, existierende Orte für einen bestimmten Ort +
 * Bereich per Websuche (Anthropic web_search-Tool, mit Zitat/Quelle).
 *
 * Kostenbewusst:
 * - Ein Aufruf holt MEHRERE Kandidaten auf einmal (statt pro Klick neu zu
 *   suchen); der Aufrufer cacht sie und bedient Folge-Klicks daraus.
 * - Websuche gedeckelt, pause_turn-Schleife kurz (siehe web-research.ts).
 * Ergebnisse sind VORSCHLÄGE mit Quelle + Maps-Link zum Verifizieren – sie
 * werden erst nach Bestätigung durch die Nutzer:in als Ort gespeichert.
 */

// Wie viele Suchen/Runden pro Recherche maximal – bewusst niedrig (Kosten).
const MAX_WEB_SEARCHES = 2;
const MAX_PAUSE_TURNS = 2;
// Wie viele Kandidaten ein einziger Aufruf liefern soll (Cache-Vorrat).
const CANDIDATES_PER_CALL = 4;

export interface PlaceCandidate {
  name: string;
  note: string;
  priceLevel: number | null;
  address: string | null;
  sourceUrl: string;
  sourceTitle: string;
  confidence: "hoch" | "mittel" | "niedrig";
  mapsUrl: string;
  /** Exakte Koordinaten, falls die Quelle sie kennt (OpenStreetMap).
   *  Fehlen sie (KI-Websuche), wird beim Übernehmen geocodiert. */
  lat?: number | null;
  lng?: number | null;
}

export interface ResearchInput {
  regionName: string;
  locality: string;
  areaLabel: string; // z. B. "Restaurant (günstig/Café)"
  interests: string[];
  priceLevelMax: number;
  diets: string[];
  excludeNames: string[];
  /**
   * Gesuchte Preisklasse bei Gastro-Bereichen. Genau hier ist die Websuche der
   * OSM-Suche überlegen: OpenStreetMap kennt kaum Preisangaben, Blogs und
   * Restaurantseiten schon. Ohne diese Vorgabe liefern günstig/mittel/gehoben
   * dieselben Lokale.
   */
  priceTier?: PriceTier;
}

export type PriceTier = "fancy" | "mid" | "budget";

const TIER_INSTRUCTION: Record<PriceTier, string> = {
  fancy:
    "GEHOBEN (Preisniveau 4/4): gehobene Küche, Fine Dining, Auszeichnungen oder ein bekannt hochpreisiges Haus. Keine Trattorien mit Alltagspreisen, keine Cafés.",
  mid: "MITTELKLASSE (Preisniveau 3/4): solide Restaurants/Trattorien mit normalem Abendessen-Preis. Weder Fine Dining noch Imbiss/Café.",
  budget:
    "GÜNSTIG (Preisniveau 1-2/4): Cafés, Bäckereien, Imbisse, einfache Osterien, Eisdielen. Keine gehobenen Restaurants.",
};

function mapsUrl(name: string, locality: string): string {
  const q = encodeURIComponent(`${name} ${locality}`.trim());
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

/** Stabiler Instruktions-Teil – als System-Prompt gecacht (spart Input-Tokens). */
const SYSTEM_PROMPT = `Du bist Rechercheredakteur:in für einen kuratierten Reiseführer.

AUFGABE: Finde per Websuche echte, aktuell existierende Orte, die zur Anfrage passen. Das sind VORSCHLÄGE zum Verifizieren, keine fertigen Guide-Inhalte.

HARTE REGELN:
- Nutze die Websuche sparsam und schlage nur Orte vor, die es WIRKLICH gibt (mit belegbarer Quelle).
- Jeder Ort muss in oder sehr nah beim genannten Ort liegen.
- Schlage KEINE bereits enthaltenen Orte erneut vor.
- Erfinde keine Fakten. Preise/Öffnungszeiten nur, wenn belegt.

Antworte am Ende mit GENAU einem JSON-Objekt in einem \`\`\`json-Block:
{
  "candidates": [
    {
      "name": string,
      "note": string (1-2 Sätze auf Deutsch, was den Ort ausmacht),
      "priceLevel": number (1-4) oder null,
      "address": string oder null,
      "sourceUrl": string (Beleg-URL),
      "sourceTitle": string,
      "confidence": "hoch" | "mittel" | "niedrig"
    }
  ]
}`;

function normalizeCandidate(raw: unknown, locality: string): PlaceCandidate | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  if (typeof c.name !== "string" || !c.name.trim()) return null;
  const name = c.name.trim();
  const pl = Number(c.priceLevel);
  return {
    name,
    note: typeof c.note === "string" ? c.note.trim() : "",
    priceLevel: Number.isInteger(pl) && pl >= 1 && pl <= 4 ? pl : null,
    address: typeof c.address === "string" && c.address.trim() ? c.address.trim() : null,
    sourceUrl: typeof c.sourceUrl === "string" ? c.sourceUrl.trim() : "",
    sourceTitle: typeof c.sourceTitle === "string" ? c.sourceTitle.trim() : "",
    confidence:
      c.confidence === "hoch" || c.confidence === "mittel" ? c.confidence : "niedrig",
    mapsUrl: mapsUrl(name, locality),
  };
}

/**
 * Recherchiert MEHRERE Kandidaten in einem einzigen Aufruf (Cache-Vorrat).
 * Gibt eine (ggf. leere) Liste zurück.
 */
export async function researchPlaceCandidates(input: ResearchInput): Promise<PlaceCandidate[]> {
  if (isMock()) {
    return Array.from({ length: 3 }, (_, i) => {
      const name = `Neuer Tipp ${i + 1} in ${input.locality} (Mock)`;
      return {
        name,
        note: "Mock-Vorschlag ohne Websuche. Im Live-Modus recherchiert die KI hier echte Orte mit Quelle.",
        priceLevel: 2,
        address: null,
        sourceUrl: "https://example.com",
        sourceTitle: "Beispielquelle (Mock)",
        confidence: "niedrig" as const,
        mapsUrl: mapsUrl(name, input.locality),
      };
    });
  }

  const tierLine = input.priceTier
    ? `\n- GESUCHTE PREISKLASSE: ${TIER_INSTRUCTION[input.priceTier]}\n  Belege das Preisniveau (Speisekarte, Bericht) und setze "priceLevel" entsprechend.`
    : "";

  const prompt = `Finde bis zu ${CANDIDATES_PER_CALL} echte ${input.areaLabel} in ${input.locality} am ${input.regionName}, die zu diesen Reisenden passen.

Reise-Kontext:
- Interessen: ${input.interests.join(", ") || "offen"}
- Preisniveau bis: ${input.priceLevelMax}/4
- Ernährung: ${input.diets.join(", ") || "keine Einschränkung"}${tierLine}

Bereits enthalten (NICHT erneut vorschlagen): ${input.excludeNames.join("; ") || "(keine)"}.

Liefere so viele passende, reale Orte wie du sicher belegen kannst (bis zu ${CANDIDATES_PER_CALL}), sonst weniger.`;

  const parsed = await runWebResearch({
    system: SYSTEM_PROMPT,
    prompt,
    maxTokens: 3000,
    maxSearches: MAX_WEB_SEARCHES,
    maxPauseTurns: MAX_PAUSE_TURNS,
  });
  if (!parsed) return [];

  const rawList = Array.isArray(parsed.candidates)
    ? parsed.candidates
    : parsed.name // Fallback: Modell gab ein einzelnes Objekt zurück
      ? [parsed]
      : [];
  const exclude = new Set(input.excludeNames.map((n) => n.toLowerCase()));
  const seen = new Set<string>();
  const out: PlaceCandidate[] = [];
  for (const raw of rawList) {
    const c = normalizeCandidate(raw, input.locality);
    if (!c) continue;
    const key = c.name.toLowerCase();
    if (exclude.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return filterByPriceTier(out, input.priceTier);
}

/** Passt ein belegtes Preisniveau zur gesuchten Klasse? */
export function priceLevelMatchesTier(level: number | null, tier: PriceTier): boolean {
  if (level == null) return true; // unbelegt: nicht ausschließen, nur nachrangig
  if (tier === "fancy") return level >= 4;
  if (tier === "mid") return level === 3;
  return level <= 2;
}

/**
 * Kandidaten mit klar abweichender Preisklasse verwerfen und belegte Treffer
 * nach vorn ziehen. Das Modell kennt die gesuchte Klasse aus dem Prompt – ein
 * Vorschlag, der ihr widerspricht, ist genau die Verwechslung, wegen der
 * günstig/mittel/gehoben vorher dasselbe lieferten.
 */
export function filterByPriceTier(
  candidates: PlaceCandidate[],
  tier?: PriceTier
): PlaceCandidate[] {
  if (!tier) return candidates;
  return candidates
    .filter((c) => priceLevelMatchesTier(c.priceLevel, tier))
    .sort((a, b) => Number(a.priceLevel == null) - Number(b.priceLevel == null));
}
