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
