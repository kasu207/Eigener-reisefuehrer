import { z } from "zod";

/**
 * Nachträgliche Anpassungswünsche des Nutzers ("mehr Wandern", "mehr Essen",
 * "mehr günstige Tipps", Freitext). Presets wirken deterministisch auf die
 * Auswahl-Engine; der Freitext geht zusätzlich als Kontext an die KI.
 */

export const ADJUSTMENT_PRESETS = [
  "mehr_wandern",
  "mehr_essen",
  "mehr_guenstig",
  "mehr_kultur",
  "mehr_entspannung",
] as const;

export type AdjustmentPreset = (typeof ADJUSTMENT_PRESETS)[number];

export const ADJUSTMENT_LABELS: Record<AdjustmentPreset, string> = {
  mehr_wandern: "Mehr Wandern",
  mehr_essen: "Mehr Essen & Trinken",
  mehr_guenstig: "Mehr günstige Essens-/Trink-Tipps",
  mehr_kultur: "Mehr Kultur & Geschichte",
  mehr_entspannung: "Mehr Entspannung",
};

export const adjustmentSchema = z.object({
  presets: z.array(z.enum(ADJUSTMENT_PRESETS)).default([]),
  text: z.string().max(1000).default(""),
  createdAt: z.string(),
});

export const adjustmentsSchema = z.array(adjustmentSchema).default([]);

export type Adjustment = z.infer<typeof adjustmentSchema>;

/** Deterministische Modifikatoren für die Auswahl-Engine. */
export interface SelectionModifiers {
  extraHikes: number;
  extraRestaurants: number;
  /** Bevorzugung günstiger Restaurants/Bars (Preisniveau 1–2) im Scoring. */
  budgetFoodBoost: boolean;
  /** Zusätzliche Interessen-Gewichtung (Interest-Key -> Bonusgewicht). */
  interestBoosts: Record<string, number>;
}

export function emptyModifiers(): SelectionModifiers {
  return { extraHikes: 0, extraRestaurants: 0, budgetFoodBoost: false, interestBoosts: {} };
}

/** Alle bisherigen Anpassungen kumulieren (jeder Preset zählt einmal). */
export function modifiersFromAdjustments(adjustments: Adjustment[]): SelectionModifiers {
  const mods = emptyModifiers();
  const presets = new Set(adjustments.flatMap((a) => a.presets));
  if (presets.has("mehr_wandern")) {
    mods.extraHikes += 3;
    mods.interestBoosts["wandern"] = (mods.interestBoosts["wandern"] ?? 0) + 2;
  }
  if (presets.has("mehr_essen")) {
    mods.extraRestaurants += 5;
    mods.interestBoosts["kulinarik"] = (mods.interestBoosts["kulinarik"] ?? 0) + 2;
  }
  if (presets.has("mehr_guenstig")) {
    mods.extraRestaurants += 3;
    mods.budgetFoodBoost = true;
  }
  if (presets.has("mehr_kultur")) {
    mods.interestBoosts["kultur_geschichte"] = (mods.interestBoosts["kultur_geschichte"] ?? 0) + 2;
  }
  if (presets.has("mehr_entspannung")) {
    mods.interestBoosts["entspannung"] = (mods.interestBoosts["entspannung"] ?? 0) + 2;
  }
  return mods;
}

/** Menschlich lesbare Zusammenfassung für den KI-Prompt. */
export function describeAdjustments(adjustments: Adjustment[]): string {
  if (adjustments.length === 0) return "";
  const lines = adjustments.map((a) => {
    const parts = [
      ...a.presets.map((p) => ADJUSTMENT_LABELS[p]),
      ...(a.text ? [a.text] : []),
    ];
    return `- ${parts.join("; ")}`;
  });
  return `NACHTRÄGLICHE WÜNSCHE DER REISENDEN (unbedingt berücksichtigen):\n${lines.join("\n")}`;
}
