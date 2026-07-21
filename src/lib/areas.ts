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

/** Vorgaben zum Anlegen eines neuen Ortes für einen Bereich (Typ + Preisklasse). */
export function areaDefaults(area: AreaKey): { type: string; priceLevel: number | null; label: string } {
  switch (area) {
    case "sights":
      return { type: "sight", priceLevel: null, label: "Sehenswürdigkeit/Ausblick" };
    case "bars":
      return { type: "bar", priceLevel: 2, label: "Bar/Aperitivo-Ort" };
    case "hotels":
      return { type: "hotel", priceLevel: 3, label: "Unterkunft/Hotel" };
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
