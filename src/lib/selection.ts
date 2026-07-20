import type { Questionnaire, Interest } from "./questionnaire";
import { tripDays } from "./questionnaire";
import { emptyModifiers, type SelectionModifiers } from "./adjustments";

/**
 * Deterministische Auswahl-Engine (Anforderung 4.2).
 * Arbeitet auf schlanken, Prisma-unabhängigen Typen, damit sie ohne
 * Datenbank testbar bleibt. Nur `verified`-Einträge dürfen übergeben werden.
 */

export interface SelectablePlace {
  id: string;
  type: "village" | "sight" | "viewpoint" | "beach" | "restaurant" | "bar" | "practical";
  name: string;
  lat: number;
  lng: number;
  tags: string[];
  priceLevel: number | null;
  childFriendly: boolean;
  access: "car" | "public" | "foot";
  dietaryOptions: string[];
  qualityScore: number;
}

export interface SelectableHike {
  id: string;
  name: string;
  startLat: number;
  startLng: number;
  distanceKm: number;
  durationMin: number;
  elevationGainM: number;
  difficulty: "easy" | "medium" | "hard";
  childFriendly: boolean;
  tags: string[];
}

export interface Selection {
  placeIds: string[];
  hikeIds: string[];
  restaurantIds: string[];
  practicalIds: string[];
  targets: { places: number; hikes: number; restaurants: number };
  debug: Record<string, unknown>;
}

/** Zuordnung Interesse -> Ort-Tags/Typen für das Scoring. */
const INTEREST_TAGS: Record<Interest, string[]> = {
  wandern: ["wandern", "natur", "berge"],
  kulinarik: ["kulinarik", "restaurant", "markt"],
  kultur_geschichte: ["kultur", "geschichte", "kirche", "villa", "museum"],
  doerfer_maerkte: ["dorf", "markt", "altstadt"],
  seen_baden: ["baden", "strand", "lido", "see"],
  aussichtspunkte_fotografie: ["aussicht", "foto", "panorama"],
  sport_aktivitaet: ["sport", "aktiv", "wassersport", "rad"],
  entspannung: ["entspannung", "ruhig", "garten", "spa"],
};

const INTEREST_TYPES: Partial<Record<Interest, SelectablePlace["type"][]>> = {
  doerfer_maerkte: ["village"],
  seen_baden: ["beach"],
  aussichtspunkte_fotografie: ["viewpoint"],
  kultur_geschichte: ["sight"],
};

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

function interestWeight(q: Questionnaire, key: Interest): number {
  const entry = q.interests.find((i) => i.key === key);
  if (!entry) return 0;
  return entry.weight === "wichtig" ? 2 : 1;
}

function hasChildren(q: Questionnaire): boolean {
  return q.children.length > 0;
}

function smallChildren(q: Questionnaire): boolean {
  return q.children.some((c) => c.ageGroup === "0-3" || c.ageGroup === "4-9");
}

/** Harte Filter für Orte (Nicht-Restaurants). */
export function placePassesHardFilters(p: SelectablePlace, q: Questionnaire): boolean {
  if (smallChildren(q) && !p.childFriendly) return false;
  // Erreichbarkeit: ohne Auto keine Auto-only-Ziele
  if (q.mobility !== "car" && p.access === "car") return false;
  return true;
}

/** Harte Filter für Restaurants/Bars. */
export function restaurantPassesHardFilters(p: SelectablePlace, q: Questionnaire): boolean {
  if (!placePassesHardFilters(p, q)) return false;
  if (p.priceLevel != null && p.priceLevel > q.priceLevel) return false;
  // Ernährungsweisen: jede gewählte Ernährungsweise muss abgedeckt sein
  for (const diet of q.diets) {
    if (!p.dietaryOptions.includes(diet)) return false;
  }
  return true;
}

/** Harte Filter für Wanderungen. */
export function hikePassesHardFilters(h: SelectableHike, q: Questionnaire): boolean {
  if (h.durationMin > q.maxHikeDurationMin) return false;
  if (h.elevationGainM > q.maxElevationGainM) return false;
  if (smallChildren(q) && !h.childFriendly) return false;
  if (q.fitnessLevel === "niedrig" && h.difficulty === "hard") return false;
  return true;
}

/** Weiches Scoring: Interessen-Übereinstimmung, Qualität, Nähe zur Unterkunft. */
export function scorePlace(
  p: SelectablePlace,
  q: Questionnaire,
  mods: SelectionModifiers = emptyModifiers()
): number {
  let score = p.qualityScore; // 1-5

  for (const interest of q.interests) {
    const w = interestWeight(q, interest.key) + (mods.interestBoosts[interest.key] ?? 0);
    const tags = INTEREST_TAGS[interest.key];
    const tagMatches = p.tags.filter((t) => tags.includes(t.toLowerCase())).length;
    score += Math.min(tagMatches, 2) * w;
    const types = INTEREST_TYPES[interest.key];
    if (types?.includes(p.type)) score += w;
  }

  // Boost aus Anpassungswünschen auch für Interessen, die im Fragebogen
  // nicht gewählt wurden (z. B. "mehr Kultur" nachträglich)
  for (const [key, boost] of Object.entries(mods.interestBoosts)) {
    if (q.interests.some((i) => i.key === key)) continue;
    const tags = INTEREST_TAGS[key as Interest] ?? [];
    const tagMatches = p.tags.filter((t) => tags.includes(t.toLowerCase())).length;
    score += Math.min(tagMatches, 2) * boost;
    const types = INTEREST_TYPES[key as Interest];
    if (types?.includes(p.type)) score += boost;
  }

  // "Mehr günstige Tipps": günstige Restaurants/Bars bevorzugen
  if (
    mods.budgetFoodBoost &&
    (p.type === "restaurant" || p.type === "bar") &&
    p.priceLevel != null &&
    p.priceLevel <= 2
  ) {
    score += 3;
  }

  if (q.accommodation.lat != null && q.accommodation.lng != null) {
    const dist = haversineKm(q.accommodation.lat, q.accommodation.lng, p.lat, p.lng);
    if (dist < 10) score += 2;
    else if (dist < 25) score += 1;
  }

  return score;
}

export function scoreHike(
  h: SelectableHike,
  q: Questionnaire,
  mods: SelectionModifiers = emptyModifiers()
): number {
  let score = 3;
  score += (interestWeight(q, "wandern") + (mods.interestBoosts["wandern"] ?? 0)) * 2;
  const fitnessMatch: Record<string, string> = { niedrig: "easy", mittel: "medium", hoch: "hard" };
  if (fitnessMatch[q.fitnessLevel] === h.difficulty) score += 2;
  if (q.accommodation.lat != null && q.accommodation.lng != null) {
    const dist = haversineKm(q.accommodation.lat, q.accommodation.lng, h.startLat, h.startLng);
    if (dist < 15) score += 2;
    else if (dist < 30) score += 1;
  }
  return score;
}

/**
 * Geografische Streuung: greedy Auswahl, die bereits gewählte Orte
 * leicht bestraft, wenn ein Kandidat sehr nah an ihnen liegt.
 */
function pickWithSpread<T extends { lat: number; lng: number }>(
  candidates: Array<{ item: T; score: number }>,
  count: number
): T[] {
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const picked: T[] = [];
  const pool = [...sorted];
  while (picked.length < count && pool.length > 0) {
    let bestIdx = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const c = pool[i];
      const nearPenalty = picked.filter(
        (p) => haversineKm(p.lat, p.lng, c.item.lat, c.item.lng) < 2
      ).length;
      const eff = c.score - nearPenalty * 1.5;
      if (eff > bestScore) {
        bestScore = eff;
        bestIdx = i;
      }
    }
    picked.push(pool[bestIdx].item);
    pool.splice(bestIdx, 1);
  }
  return picked;
}

/** Zielmengen abhängig von Reisedauer, Tempo (4.2) und Anpassungswünschen. */
export function computeTargets(
  q: Questionnaire,
  mods: SelectionModifiers = emptyModifiers()
): Selection["targets"] {
  const days = tripDays(q);
  const paceFactor = q.pace === "entspannt" ? 0.75 : q.pace === "vollgepackt" ? 1.3 : 1;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));
  return {
    places: clamp(days * 4 * paceFactor, 25, 40),
    hikes: clamp(days * 0.8 * paceFactor, 4, 8) + mods.extraHikes,
    restaurants: clamp(days * 1.5 * paceFactor, 8, 15) + mods.extraRestaurants,
  };
}

export function selectContent(
  places: SelectablePlace[],
  hikes: SelectableHike[],
  q: Questionnaire,
  mods: SelectionModifiers = emptyModifiers()
): Selection {
  const targets = computeTargets(q, mods);

  const isRestaurant = (p: SelectablePlace) => p.type === "restaurant" || p.type === "bar";
  const isPractical = (p: SelectablePlace) => p.type === "practical";

  const poiCandidates = places
    .filter((p) => !isRestaurant(p) && !isPractical(p))
    .filter((p) => placePassesHardFilters(p, q))
    .map((p) => ({ item: p, score: scorePlace(p, q, mods) }));

  const restaurantCandidates = places
    .filter(isRestaurant)
    .filter((p) => restaurantPassesHardFilters(p, q))
    .map((p) => ({ item: p, score: scorePlace(p, q, mods) }));

  const hikeCandidates = hikes
    .filter((h) => hikePassesHardFilters(h, q))
    .map((h) => ({
      item: { ...h, lat: h.startLat, lng: h.startLng },
      score: scoreHike(h, q, mods),
    }));

  // Wanderungen nur, wenn Interesse vorhanden oder Fitness es nahelegt
  const wantsHiking =
    q.interests.some((i) => i.key === "wandern") || (mods.interestBoosts["wandern"] ?? 0) > 0;
  const hikeTarget = wantsHiking ? targets.hikes : Math.min(2, targets.hikes);

  const pickedPlaces = pickWithSpread(poiCandidates, targets.places);
  const pickedRestaurants = pickWithSpread(restaurantCandidates, targets.restaurants);
  const pickedHikes = pickWithSpread(hikeCandidates, hikeTarget);

  const practicalIds = places.filter(isPractical).map((p) => p.id);

  return {
    placeIds: pickedPlaces.map((p) => p.id),
    hikeIds: pickedHikes.map((h) => h.id),
    restaurantIds: pickedRestaurants.map((p) => p.id),
    practicalIds,
    targets,
    debug: {
      poiCandidates: poiCandidates.length,
      restaurantCandidates: restaurantCandidates.length,
      hikeCandidates: hikeCandidates.length,
      days: tripDays(q),
      pace: q.pace,
    },
  };
}
