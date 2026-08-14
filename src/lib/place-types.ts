/**
 * Kanonische Ort-Typen – MUSS zum Prisma-Enum `PlaceType` passen.
 * Einzige Quelle für die KI-Module (Vorschläge, Extraktion, Recherche),
 * damit die Listen nicht auseinanderlaufen.
 */
export const PLACE_TYPES = [
  "village",
  "sight",
  "viewpoint",
  "beach",
  "restaurant",
  "bar",
  "hotel",
  "event",
  "practical",
  "daytrip",
] as const;

export type PlaceTypeValue = (typeof PLACE_TYPES)[number];

/**
 * Teilmenge für die automatische Ort-Recherche (keine Events/Praktisches –
 * die entstehen redaktionell, nicht per Websuche).
 */
export const RESEARCHABLE_PLACE_TYPES = [
  "village",
  "sight",
  "viewpoint",
  "beach",
  "restaurant",
  "bar",
  "hotel",
  // Tagesausflüge lassen sich gut recherchieren: Nachbarorte, Bergbahnen,
  // Talwanderungen sind öffentlich beschrieben.
  "daytrip",
] as const;

export type ResearchablePlaceType = (typeof RESEARCHABLE_PLACE_TYPES)[number];
