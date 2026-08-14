/**
 * Kuratierungs-Lücken eines Ortes: Was fehlt, damit der Eintrag im Guide
 * wirklich funktioniert? Die Redaktion soll das auf einen Blick sehen, statt
 * jeden Ort einzeln zu öffnen.
 *
 * Die Lücken sind nicht kosmetisch – jede hat eine konkrete Auswirkung, die
 * im Label steht (falsche Kartenposition, Eintrag wird ausgefiltert, …).
 */

export const GAP_KEYS = [
  "coords",
  "diet",
  "image",
  "locality",
  "price",
  "source",
  "notes",
  "stale",
] as const;

export type GapKey = (typeof GAP_KEYS)[number];

export const GAP_LABELS: Record<GapKey, string> = {
  coords: "Koordinaten",
  diet: "Ernährung",
  image: "Bild",
  locality: "Ort",
  price: "Preis",
  source: "Quelle",
  notes: "Notiz",
  stale: "Prüfung fällig",
};

/** Was die Lücke praktisch bedeutet – als Tooltip in der Liste. */
export const GAP_HINTS: Record<GapKey, string> = {
  coords:
    "Koordinaten liegen auf der Regionsmitte – der Pin steht auf der Karte falsch und die Umkreis-Suche findet den Ort nicht.",
  diet: "Keine Ernährungsangaben: Bei Gästen mit Ernährungsweise fällt der Eintrag durch den harten Filter und erscheint nie.",
  image: "Kein Bild hinterlegt.",
  locality:
    "Kein Ort/Stadt gesetzt – der Eintrag landet im Sammelkapitel statt im Ort-Kapitel.",
  price: "Kein Preisniveau: Gastro-Einträge gelten sonst pauschal als günstig.",
  source: "Keine Quelle hinterlegt – die KI hat wenig Material für den Text.",
  notes: "Keine Redaktionsnotiz – die KI hat wenig Material für den Text.",
  stale: "Seit über einem Jahr nicht geprüft.",
};

/** Nach dieser Frist gilt ein geprüfter Eintrag als prüfbedürftig. */
export const STALE_AFTER_MONTHS = 12;

export interface PlaceQualityInput {
  type: string;
  lat: number;
  lng: number;
  locality: string;
  priceLevel: number | null;
  dietaryOptions: string[];
  editorNotes: string;
  status: string;
  lastVerifiedAt: Date | null;
  imageCount: number;
  sourceCount: number;
}

export interface RegionCenter {
  lat: number;
  lng: number;
}

/** Liegt der Ort (fast) exakt auf der Regionsmitte? Dann ist er ungesetzt. */
export function isRegionCenterFallback(
  lat: number,
  lng: number,
  center: RegionCenter | undefined
): boolean {
  if (!center) return false;
  return Math.abs(lat - center.lat) < 0.0005 && Math.abs(lng - center.lng) < 0.0005;
}

function isGastro(type: string): boolean {
  return type === "restaurant" || type === "bar";
}

export function curationGaps(
  place: PlaceQualityInput,
  center?: RegionCenter,
  now: Date = new Date()
): GapKey[] {
  const gaps: GapKey[] = [];

  if (isRegionCenterFallback(place.lat, place.lng, center)) gaps.push("coords");
  if (isGastro(place.type) && place.dietaryOptions.length === 0) gaps.push("diet");
  if (place.imageCount === 0) gaps.push("image");
  if (!place.locality.trim() && place.type !== "practical") gaps.push("locality");
  if (isGastro(place.type) && place.priceLevel == null) gaps.push("price");
  if (place.sourceCount === 0) gaps.push("source");
  if (!place.editorNotes.trim()) gaps.push("notes");

  if (place.status === "verified") {
    const cutoff = new Date(now);
    cutoff.setMonth(cutoff.getMonth() - STALE_AFTER_MONTHS);
    if (!place.lastVerifiedAt || place.lastVerifiedAt < cutoff) gaps.push("stale");
  }

  return gaps;
}

/**
 * Wie dringend ist der Eintrag? Höher = mehr Handlungsbedarf. Damit lässt
 * sich die Liste "unvollständig zuerst" sortieren.
 */
export function gapWeight(gaps: GapKey[]): number {
  const weights: Record<GapKey, number> = {
    coords: 5,
    diet: 4,
    locality: 4,
    price: 3,
    image: 2,
    source: 2,
    stale: 2,
    notes: 1,
  };
  return gaps.reduce((sum, g) => sum + weights[g], 0);
}
