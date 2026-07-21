import type { Questionnaire, Interest } from "./questionnaire";
import { tripDays } from "./questionnaire";
import { emptyModifiers, type SelectionModifiers } from "./adjustments";
import type { AreaKey, AreaCounts } from "./areas";

export type AreaTargets = Record<AreaKey, number>;

/**
 * Deterministische Auswahl-Engine (Anforderung 4.2).
 * Arbeitet auf schlanken, Prisma-unabhängigen Typen, damit sie ohne
 * Datenbank testbar bleibt. Nur `verified`-Einträge dürfen übergeben werden.
 */

export interface SelectablePlace {
  id: string;
  type: "village" | "sight" | "viewpoint" | "beach" | "restaurant" | "bar" | "hotel" | "event" | "practical";
  name: string;
  lat: number;
  lng: number;
  tags: string[];
  priceLevel: number | null;
  childFriendly: boolean;
  access: "car" | "public" | "foot";
  dietaryOptions: string[];
  qualityScore: number;
  /** Pflicht-Highlight: wird immer aufgenommen, unabhängig von Zielmengen. */
  mustSee?: boolean;
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
  targets: AreaTargets;
  debug: Record<string, unknown>;
}

/** Preisklasse eines Gastro-Eintrags (für die Bereiche gehoben/mittel/günstig). */
export function foodTier(priceLevel: number | null): "fancy" | "mid" | "budget" {
  if (priceLevel != null && priceLevel >= 4) return "fancy";
  if (priceLevel === 3) return "mid";
  return "budget"; // 1, 2 oder unbekannt -> günstig/Cafés
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
  // Verkehrsmittel sind bewusst nicht restriktiv: Nur wer ausschließlich zu
  // Fuß/Rad unterwegs ist, bekommt keine reinen Auto-Ziele. Sonst wird die
  // Erreichbarkeit nur im Text erwähnt, nicht als Ausschlusskriterium.
  const onlyFoot = q.mobility.length === 1 && q.mobility[0] === "foot";
  if (onlyFoot && p.access === "car") return false;
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

  const distP = nearestAnchorKm(q, p.lat, p.lng);
  if (distP != null) {
    if (distP < 10) score += 2;
    else if (distP < 25) score += 1;
  }

  return score;
}

/**
 * Kürzeste Distanz zu einem der Anker-Orte (Unterkunft + weitere Anker).
 * Gibt null zurück, wenn keine Koordinaten vorliegen.
 */
export function nearestAnchorKm(q: Questionnaire, lat: number, lng: number): number | null {
  const anchors = [q.accommodation, ...(q.anchors ?? [])];
  let best: number | null = null;
  for (const a of anchors) {
    if (a.lat == null || a.lng == null) continue;
    const d = haversineKm(a.lat, a.lng, lat, lng);
    if (best == null || d < best) best = d;
  }
  return best;
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
  const distH = nearestAnchorKm(q, h.startLat, h.startLng);
  if (distH != null) {
    if (distH < 15) score += 2;
    else if (distH < 30) score += 1;
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

/**
 * Zielmengen je Bereich, abhängig von Reisedauer, Tempo, globalen
 * Anpassungswünschen (Presets) UND dem Pro-Bereich-Feintuning (mehr/weniger).
 * Standard bei Essen: 1-2 "gehoben", mehrere "mittel" und "günstig".
 */
export function computeTargets(
  q: Questionnaire,
  mods: SelectionModifiers = emptyModifiers(),
  areaCounts: AreaCounts = {}
): AreaTargets {
  const days = tripDays(q);
  const paceFactor = q.pace === "entspannt" ? 0.8 : q.pace === "vollgepackt" ? 1.3 : 1;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(v)));
  const d = (k: AreaKey) => areaCounts[k] ?? 0;

  return {
    sights: Math.max(0, clamp(days * 4 * paceFactor, 8, 40) + d("sights")),
    hikes: Math.max(0, clamp(days * 1.2 * paceFactor, 4, 12) + mods.extraHikes + d("hikes")),
    // Gehoben bewusst knapp (1-2), damit es besondere Empfehlungen bleiben
    foodFancy: Math.max(0, 2 + d("foodFancy")),
    foodMid: Math.max(0, clamp(days * 1.2 * paceFactor, 3, 14) + mods.extraRestaurants + d("foodMid")),
    foodBudget: Math.max(
      0,
      clamp(days * 1.4 * paceFactor, 4, 16) +
        mods.extraRestaurants +
        (mods.budgetFoodBoost ? 3 : 0) +
        d("foodBudget")
    ),
    bars: Math.max(0, clamp(days * 0.8 * paceFactor, 2, 8) + d("bars")),
    hotels: Math.max(0, clamp(days * 0.6 * paceFactor, 2, 8) + d("hotels")),
  };
}

export function selectContent(
  places: SelectablePlace[],
  hikes: SelectableHike[],
  q: Questionnaire,
  mods: SelectionModifiers = emptyModifiers(),
  areaCounts: AreaCounts = {}
): Selection {
  const targets = computeTargets(q, mods, areaCounts);

  const scored = (list: SelectablePlace[]) =>
    list.map((p) => ({ item: p, score: scorePlace(p, q, mods) }));

  // Sehenswürdigkeiten & Ausblicke (inkl. Dörfer, Aussichten, Strände)
  const sightCandidates = scored(
    places.filter(
      (p) =>
        ["village", "sight", "viewpoint", "beach"].includes(p.type) &&
        placePassesHardFilters(p, q)
    )
  );

  // Gastronomie nach Preisklasse getrennt
  const restaurants = places.filter((p) => p.type === "restaurant" && restaurantPassesHardFilters(p, q));
  const fancy = scored(restaurants.filter((p) => foodTier(p.priceLevel) === "fancy"));
  const mid = scored(restaurants.filter((p) => foodTier(p.priceLevel) === "mid"));
  const budget = scored(restaurants.filter((p) => foodTier(p.priceLevel) === "budget"));

  const bars = scored(places.filter((p) => p.type === "bar" && restaurantPassesHardFilters(p, q)));
  const hotels = scored(places.filter((p) => p.type === "hotel" && placePassesHardFilters(p, q)));
  // Veranstaltungen: alle passenden (meist wenige) übernehmen
  const eventIds = places
    .filter((p) => p.type === "event" && placePassesHardFilters(p, q))
    .map((p) => p.id);

  const hikeCandidates = hikes
    .filter((h) => hikePassesHardFilters(h, q))
    .map((h) => ({ item: { ...h, lat: h.startLat, lng: h.startLng }, score: scoreHike(h, q, mods) }));

  const wantsHiking =
    q.interests.some((i) => i.key === "wandern") || (mods.interestBoosts["wandern"] ?? 0) > 0;
  const hikeTarget = wantsHiking ? targets.hikes : Math.min(2, targets.hikes);

  const pickedSights = pickWithSpread(sightCandidates, targets.sights);
  const pickedFancy = pickWithSpread(fancy, targets.foodFancy);
  const pickedMid = pickWithSpread(mid, targets.foodMid);
  const pickedBudget = pickWithSpread(budget, targets.foodBudget);
  const pickedBars = pickWithSpread(bars, targets.bars);
  const pickedHotels = pickWithSpread(hotels, targets.hotels);
  const pickedHikes = pickWithSpread(hikeCandidates, hikeTarget);

  const practicalIds = places.filter((p) => p.type === "practical").map((p) => p.id);

  // Pflicht-Highlights (must-see) erscheinen IMMER, unabhängig von den
  // Zielmengen – aber weiterhin nur, wenn sie die harten Filter bestehen
  // (Kindertauglichkeit, Ernährung, Preis). So bleibt der Guide stimmig.
  const mustSeePlaceIds = places
    .filter(
      (p) =>
        p.mustSee &&
        ["village", "sight", "viewpoint", "beach", "hotel", "event"].includes(p.type) &&
        placePassesHardFilters(p, q)
    )
    .map((p) => p.id);
  const mustSeeRestaurantIds = places
    .filter(
      (p) =>
        p.mustSee &&
        (p.type === "restaurant" || p.type === "bar") &&
        restaurantPassesHardFilters(p, q)
    )
    .map((p) => p.id);

  const uniq = (ids: string[]) => [...new Set(ids)];

  return {
    // placeIds = alles "Ort-gebundene" außer Gastro (Sehenswertes, Hotels, Events)
    placeIds: uniq([
      ...pickedSights.map((p) => p.id),
      ...pickedHotels.map((p) => p.id),
      ...eventIds,
      ...mustSeePlaceIds,
    ]),
    hikeIds: pickedHikes.map((h) => h.id),
    // restaurantIds = Gastro (Restaurants aller Preisklassen + Bars)
    restaurantIds: uniq([
      ...pickedFancy.map((p) => p.id),
      ...pickedMid.map((p) => p.id),
      ...pickedBudget.map((p) => p.id),
      ...pickedBars.map((p) => p.id),
      ...mustSeeRestaurantIds,
    ]),
    practicalIds,
    targets,
    debug: {
      sights: pickedSights.length,
      food: { fancy: pickedFancy.length, mid: pickedMid.length, budget: pickedBudget.length },
      bars: pickedBars.length,
      hotels: pickedHotels.length,
      hikes: pickedHikes.length,
      days: tripDays(q),
    },
  };
}
