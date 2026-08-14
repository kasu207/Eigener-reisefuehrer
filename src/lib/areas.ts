import { z } from "zod";

/**
 * "Bereiche" des Guides mit Pro-Bereich-Feintuning (mehr/weniger).
 * Essen & Trinken ist nach Preisklassen aufgeteilt (gehoben/mittel/günstig),
 * je Klasse getrennt regelbar (z. B. "mehr kleine Cafés" = günstig +).
 */
export const AREA_KEYS = [
  "sights",
  "hikes",
  "foodFancy",
  "foodMid",
  "foodBudget",
  "bars",
  "hotels",
  "daytrips",
] as const;

export type AreaKey = (typeof AREA_KEYS)[number];

export const AREA_LABELS: Record<AreaKey, string> = {
  sights: "Sehenswürdigkeiten & Ausblicke",
  hikes: "Wanderungen",
  foodFancy: "Essen: Gehoben",
  foodMid: "Essen: Mittelklasse",
  foodBudget: "Essen: Günstig & Cafés",
  bars: "Ausgehen & Aperitivo",
  hotels: "Unterkunft",
  daytrips: "Tagesausflüge",
};

export const areaCountsSchema = z
  .record(z.enum(AREA_KEYS), z.number().int().min(-20).max(40))
  .default({});

export type AreaCounts = Partial<Record<AreaKey, number>>;

export function parseAreaCounts(raw: unknown): AreaCounts {
  const parsed = areaCountsSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : {};
}

/** Pro-Ort-Feintuning: je Ort ein eigener Satz Bereichs-Deltas. */
export const localityCountsSchema = z
  .record(z.string(), areaCountsSchema)
  .default({});

export type LocalityCounts = Record<string, AreaCounts>;

export function parseLocalityCounts(raw: unknown): LocalityCounts {
  const parsed = localityCountsSchema.safeParse(raw ?? {});
  return parsed.success ? (parsed.data as LocalityCounts) : {};
}

/** Sammelbegriff für Orte ohne eigene Stadt (regionsweite Highlights). */
export const REGION_WIDE_KEY = "Rund um den See";

/**
 * Locality-Abgleich, tolerant gegenüber Freitext-Eingaben.
 *
 * Das Unterkunfts-/Wunsch-Ort-Feld im Fragebogen ist Freitext ("Ort ODER
 * Adresse", z. B. "Via Plinio 20, Torno" oder "Torno, Comer See"), während
 * `Place.locality` ein kurzer, kanonischer Ortsname ist (z. B. "Torno"). Ein
 * exakter String-Vergleich lässt beide fast nie zusammenfinden – dann findet
 * die Ort-Zuordnung (Torno-Kapitel, "+"-Bestand) STILL nichts, obwohl Daten
 * vorhanden sind. Deshalb: Treffer, wenn der kanonische Ortsname als eigenes
 * Wort im Freitext vorkommt (oder beide nach Normalisierung gleich sind).
 */
export function normalizeLocalityText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // Akzente entfernen
    .trim();
}

export function localityMatchesLabel(placeLocality: string, freeTextLabel: string): boolean {
  const loc = normalizeLocalityText(placeLocality);
  const label = normalizeLocalityText(freeTextLabel);
  if (!loc || !label) return false;
  if (loc === label) return true;
  // Wortgrenzen-Suche, damit "Torno" nicht fälschlich in "Tornoletta" matched
  const escaped = loc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, "iu");
  return re.test(label);
}

/**
 * Findet unter bereits bekannten Ortsnamen den kanonischen Namen, der zu
 * einem Freitext-Label passt (z. B. "Torno" für "Via Plinio 20, Torno").
 * Neue, noch unbekannte Orte fallen auf das (getrimmte) Label zurück.
 */
export function resolveCanonicalLocality(
  existingLocalities: string[],
  label: string
): string {
  const trimmed = label.trim();
  const hit = existingLocalities.find((loc) => loc.trim() && localityMatchesLabel(loc, trimmed));
  return hit ?? trimmed;
}

/** Vorgaben zum Anlegen eines neuen Ortes für einen Bereich (Typ + Preisklasse). */
export function areaDefaults(area: AreaKey): { type: string; priceLevel: number | null; label: string } {
  switch (area) {
    case "sights":
      return { type: "sight", priceLevel: null, label: "Sehenswürdigkeit/Ausblick" };
    case "bars":
      return { type: "bar", priceLevel: 2, label: "Bar/Aperitivo-Ort" };
    case "hotels":
      return { type: "hotel", priceLevel: 3, label: "Unterkunft/Hotel" };
    case "daytrips":
      return {
        type: "daytrip",
        priceLevel: null,
        label: "Tagesausflug (Nachbarort, Ausflugsziel oder Tour in der Umgebung)",
      };
    case "foodFancy":
      return { type: "restaurant", priceLevel: 4, label: "gehobenes Restaurant" };
    case "foodMid":
      return { type: "restaurant", priceLevel: 3, label: "Restaurant (Mittelklasse)" };
    case "foodBudget":
      return { type: "restaurant", priceLevel: 2, label: "günstiges Restaurant oder Café" };
    default:
      return { type: "sight", priceLevel: null, label: "Ort" };
  }
}

/**
 * Prüft, ob ein Ort-Eintrag (Typ + Preisniveau) zu einem Bereich gehört.
 * Bildet die Unterabschnitte des Guides ab (Essen nach Preisklasse getrennt).
 */
export function placeMatchesArea(
  type: string,
  priceLevel: number | null,
  area: AreaKey
): boolean {
  switch (area) {
    case "sights":
      return ["village", "sight", "viewpoint", "beach"].includes(type);
    case "bars":
      return type === "bar";
    case "hotels":
      return type === "hotel";
    case "daytrips":
      return type === "daytrip";
    case "foodFancy":
      return type === "restaurant" && priceLevel != null && priceLevel >= 4;
    case "foodMid":
      return type === "restaurant" && priceLevel === 3;
    case "foodBudget":
      return type === "restaurant" && (priceLevel == null || priceLevel <= 2);
    case "hikes":
      return false; // Wanderungen sind regionsweit, nicht je Ort
    default:
      return false;
  }
}
