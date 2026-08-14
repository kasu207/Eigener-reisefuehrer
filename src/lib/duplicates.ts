/**
 * Dubletten-Erkennung für die Orte-Kuration.
 *
 * Dubletten entstehen im Betrieb unvermeidlich: Seeds, KI-Entwürfe und die
 * „+"-Recherche im Guide legen unabhängig voneinander an, und derselbe Ort
 * heißt mal „Ristorante Vapore", mal „Vapore Torno". Rein exakter Namens-
 * vergleich findet davon nichts.
 *
 * Bewusst rein und ohne Prisma-Typen, damit die Heuristik testbar bleibt.
 */

/** Wörter, die nichts über die Identität aussagen (Gattungsbegriffe). */
const GENERIC_WORDS = new Set([
  "ristorante",
  "restaurant",
  "trattoria",
  "osteria",
  "pizzeria",
  "albergo",
  "hotel",
  "bar",
  "cafe",
  "caffe",
  "gelateria",
  "agriturismo",
  "il",
  "la",
  "lo",
  "le",
  "les",
  "los",
  "der",
  "die",
  "das",
  "the",
  "al",
  "alla",
  "allo",
  "ai",
  "da",
  "de",
  "del",
  "della",
  "dei",
  "di",
  "el",
  "und",
  "and",
  "e",
]);

/** Kleinschreibung, Akzente weg, nur Buchstaben/Ziffern, einfache Leerzeichen. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Bedeutungstragende Wörter eines Namens (ohne Gattungsbegriffe). */
export function significantTokens(name: string): string[] {
  const tokens = normalizeName(name).split(" ").filter(Boolean);
  const significant = tokens.filter((t) => t.length > 1 && !GENERIC_WORDS.has(t));
  // Besteht der Name NUR aus Gattungsbegriffen ("Bar Centrale" -> "centrale"
  // bliebe übrig, "Il Bar" nicht), fallen wir auf alle Tokens zurück.
  return significant.length > 0 ? significant : tokens;
}

function bigrams(s: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
}

/** Dice-Koeffizient auf Buchstabenpaaren – robust gegen Tippfehler. */
export function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const aGrams = bigrams(a);
  const bGrams = bigrams(b);
  const pool = new Map<string, number>();
  for (const g of bGrams) pool.set(g, (pool.get(g) ?? 0) + 1);
  let hits = 0;
  for (const g of aGrams) {
    const left = pool.get(g) ?? 0;
    if (left > 0) {
      pool.set(g, left - 1);
      hits++;
    }
  }
  return (2 * hits) / (aGrams.length + bGrams.length);
}

/**
 * Namensähnlichkeit auf Basis der bedeutungstragenden Wörter. Enthält ein
 * Name alle Kernwörter des anderen ("Vapore" in "Ristorante Vapore"), gilt
 * das als sehr ähnlich – genau so entstehen Dubletten in der Praxis.
 */
export function nameSimilarity(a: string, b: string): number {
  const aTokens = significantTokens(a);
  const bTokens = significantTokens(b);
  if (aTokens.length === 0 || bTokens.length === 0) return 0;

  const aSet = new Set(aTokens);
  const bSet = new Set(bTokens);
  const smaller = aSet.size <= bSet.size ? aSet : bSet;
  const larger = aSet.size <= bSet.size ? bSet : aSet;
  const contained = [...smaller].every((t) => larger.has(t));
  if (contained) return 1;

  return stringSimilarity(aTokens.join(" "), bTokens.join(" "));
}

/** Entfernung in Kilometern (gleiche Formel wie in der Auswahl-Engine). */
export function distanceKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

export interface DuplicateCandidate {
  id: string;
  regionId: string;
  name: string;
  locality: string;
  lat: number;
  lng: number;
  /**
   * Sichtbarkeits-Topf: `null` = redaktioneller Bestand, sonst die Request-ID
   * des Guides, dem der Ort privat gehört (`Place.addedByRequestId`).
   * Töpfe werden nie vermischt – ein privater Tipp darf nicht durch ein
   * Zusammenführen im allgemeinen Bestand landen (und umgekehrt).
   */
  addedByRequestId?: string | null;
}

export type DuplicateConfidence = "sicher" | "wahrscheinlich" | "möglich";

export interface DuplicatePair {
  a: string;
  b: string;
  confidence: DuplicateConfidence;
  similarity: number;
  distanceKm: number;
  reason: string;
}

/**
 * Bewertet EIN Paar. Namensähnlichkeit allein reicht nicht („Bar Centrale"
 * gibt es in jedem Dorf), deshalb zählt die Entfernung mit. Orte an der
 * Regionsmitte (Koordinaten-Fallback beim Anlegen) liegen künstlich dicht
 * beieinander – der Name muss trotzdem passen, also ist das unkritisch.
 */
export function ratePair(a: DuplicateCandidate, b: DuplicateCandidate): DuplicatePair | null {
  if (a.regionId !== b.regionId) return null;
  // Redaktioneller Bestand und private Nutzer-Ergänzungen bleiben getrennt
  if ((a.addedByRequestId ?? null) !== (b.addedByRequestId ?? null)) return null;

  const similarity = nameSimilarity(a.name, b.name);
  if (similarity < 0.65) return null;

  const km = distanceKm(a.lat, a.lng, b.lat, b.lng);
  const sameLocality =
    normalizeName(a.locality) !== "" && normalizeName(a.locality) === normalizeName(b.locality);
  const identicalName = normalizeName(a.name) === normalizeName(b.name);

  if (identicalName && (km <= 1 || sameLocality)) {
    return {
      a: a.id,
      b: b.id,
      confidence: "sicher",
      similarity,
      distanceKm: km,
      reason: sameLocality
        ? `Gleicher Name im selben Ort (${a.locality})`
        : `Gleicher Name, ${formatKm(km)} auseinander`,
    };
  }
  if (similarity >= 0.85 && (km <= 2 || sameLocality)) {
    return {
      a: a.id,
      b: b.id,
      confidence: "wahrscheinlich",
      similarity,
      distanceKm: km,
      reason: `Sehr ähnlicher Name, ${formatKm(km)} auseinander`,
    };
  }
  if (km <= 1) {
    return {
      a: a.id,
      b: b.id,
      confidence: "möglich",
      similarity,
      distanceKm: km,
      reason: `Ähnlicher Name, nur ${formatKm(km)} auseinander`,
    };
  }
  return null;
}

export function formatKm(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

export interface DuplicateGroup {
  ids: string[];
  confidence: DuplicateConfidence;
  pairs: DuplicatePair[];
}

const CONFIDENCE_RANK: Record<DuplicateConfidence, number> = {
  sicher: 0,
  wahrscheinlich: 1,
  möglich: 2,
};

/**
 * Findet Dubletten-Gruppen. Verbundene Paare landen in einer Gruppe (A~B, B~C
 * ⇒ {A,B,C}), damit dreifach angelegte Orte nicht dreimal einzeln auftauchen.
 *
 * `dismissed` enthält Paare, die die Redaktion ausdrücklich als „kein
 * Duplikat" markiert hat – Schlüssel via `pairKey`.
 */
export function findDuplicateGroups(
  places: DuplicateCandidate[],
  dismissed: Set<string> = new Set()
): DuplicateGroup[] {
  const pairs: DuplicatePair[] = [];
  for (let i = 0; i < places.length; i++) {
    for (let j = i + 1; j < places.length; j++) {
      if (dismissed.has(pairKey(places[i].id, places[j].id))) continue;
      const rated = ratePair(places[i], places[j]);
      if (rated) pairs.push(rated);
    }
  }

  // Union-Find über die Paare
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    const p = parent.get(x);
    if (!p || p === x) return x;
    const root = find(p);
    parent.set(x, root);
    return root;
  };
  const union = (x: string, y: string) => {
    parent.set(find(x), find(y));
  };
  for (const p of pairs) {
    if (!parent.has(p.a)) parent.set(p.a, p.a);
    if (!parent.has(p.b)) parent.set(p.b, p.b);
    union(p.a, p.b);
  }

  const groups = new Map<string, DuplicateGroup>();
  for (const p of pairs) {
    const root = find(p.a);
    const group = groups.get(root) ?? { ids: [], confidence: "möglich", pairs: [] };
    for (const id of [p.a, p.b]) if (!group.ids.includes(id)) group.ids.push(id);
    group.pairs.push(p);
    if (CONFIDENCE_RANK[p.confidence] < CONFIDENCE_RANK[group.confidence]) {
      group.confidence = p.confidence;
    }
    groups.set(root, group);
  }

  return [...groups.values()].sort(
    (x, y) =>
      CONFIDENCE_RANK[x.confidence] - CONFIDENCE_RANK[y.confidence] || y.ids.length - x.ids.length
  );
}

/** Richtungsunabhängiger Schlüssel für ein Paar. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}
