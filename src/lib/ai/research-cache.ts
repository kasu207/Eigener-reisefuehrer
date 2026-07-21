import type { PlaceCandidate } from "./research-place";

/**
 * Vorrats-Cache für "+"-Recherche-Kandidaten (Kostensparer).
 *
 * Eine Recherche liefert mehrere Kandidaten auf einmal; die legen wir hier je
 * (Region, Ort, Bereich) ab. Folge-Klicks („+" / „🔄 Anderer") bedienen sich
 * aus diesem Vorrat, ohne erneut die (kostenpflichtige) Websuche auszulösen.
 * Erst wenn der Vorrat leer ist, wird neu recherchiert.
 *
 * Bewusst In-Memory (Single-Container-Deployment): Kandidaten sind kurzlebige
 * Vorschläge; ein Neustart leert den Cache verlustfrei. TTL begrenzt Aktualität.
 */

interface CacheEntry {
  candidates: PlaceCandidate[];
  storedAt: number;
}

const TTL_MS = 24 * 60 * 60 * 1000; // 24 h
const store = new Map<string, CacheEntry>();

export function researchCacheKey(regionId: string, locality: string, area: string): string {
  return `${regionId}|${locality.trim().toLowerCase()}|${area}`;
}

function isFresh(entry: CacheEntry): boolean {
  return Date.now() - entry.storedAt < TTL_MS;
}

/**
 * Nimmt EINEN noch nicht ausgeschlossenen Kandidaten aus dem Vorrat (und
 * entfernt ihn). Liefert null, wenn nichts (Passendes) im Cache ist.
 */
export function takeCachedCandidate(key: string, excludeNames: string[]): PlaceCandidate | null {
  const entry = store.get(key);
  if (!entry || !isFresh(entry)) {
    store.delete(key);
    return null;
  }
  const exclude = new Set(excludeNames.map((n) => n.toLowerCase()));
  const idx = entry.candidates.findIndex((c) => !exclude.has(c.name.toLowerCase()));
  if (idx === -1) return null;
  const [candidate] = entry.candidates.splice(idx, 1);
  if (entry.candidates.length === 0) store.delete(key);
  return candidate;
}

/** Legt frisch recherchierte Kandidaten in den Vorrat (überschreibt Altes). */
export function putCachedCandidates(key: string, candidates: PlaceCandidate[]): void {
  if (candidates.length === 0) return;
  store.set(key, { candidates: [...candidates], storedAt: Date.now() });
}
