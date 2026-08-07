/**
 * Einfaches In-Memory-Rate-Limiting für öffentliche Endpoints
 * (Anforderung 8). Für Multi-Instanz-Deployments später durch
 * Redis/Upstash ersetzen.
 *
 * Wichtig für den Dauerbetrieb: Die Map wird regelmäßig aufgeräumt.
 * Ohne das wächst sie mit jeder je gesehenen IP unbegrenzt weiter –
 * ein langlaufender Server verliert so kontinuierlich Speicher.
 */

interface Bucket {
  /** Zeitstempel der Treffer im aktuellen Fenster (aufsteigend). */
  times: number[];
  /** Fensterlänge dieses Buckets, damit der Sweep korrekt aufräumen kann. */
  windowMs: number;
}

const buckets = new Map<string, Bucket>();

/** Obergrenze als Notbremse, falls extrem viele Schlüssel auflaufen. */
const MAX_KEYS = 10_000;
/** Wie oft (frühestens) über alle Schlüssel aufgeräumt wird. */
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
let lastSweep = 0;

function sweep(now: number): void {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    const windowStart = now - bucket.windowMs;
    // Der letzte Treffer ist der jüngste – ist der abgelaufen, sind es alle.
    if ((bucket.times[bucket.times.length - 1] ?? 0) <= windowStart) {
      buckets.delete(key);
    }
  }
}

export interface RateLimitResult {
  /** Anfrage erlaubt? */
  ok: boolean;
  /** Verbleibende Anfragen im aktuellen Fenster. */
  remaining: number;
  /** Millisekunden bis wieder eine Anfrage möglich ist (0, wenn erlaubt). */
  retryAfterMs: number;
}

/**
 * Zählt einen Treffer und meldet, ob das Limit eingehalten wurde.
 * Liefert zusätzlich die Wartezeit, damit der Aufrufer einen
 * `Retry-After`-Header setzen kann statt nur "später nochmal".
 */
export function checkRateLimit(
  key: string,
  limit = 5,
  windowMs = 60 * 60 * 1000
): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const windowStart = now - windowMs;
  const previous = buckets.get(key)?.times ?? [];
  const times = previous.filter((t) => t > windowStart);

  if (times.length >= limit) {
    buckets.set(key, { times, windowMs });
    // times[0] ist der älteste Treffer; sobald der aus dem Fenster fällt,
    // ist wieder ein Slot frei.
    const retryAfterMs = Math.max(0, times[0] + windowMs - now);
    return { ok: false, remaining: 0, retryAfterMs };
  }

  // Notbremse: nur beim Anlegen NEUER Schlüssel greifen, damit bestehende
  // Limits nicht mitten im Fenster verloren gehen.
  if (times.length === 0 && buckets.size >= MAX_KEYS) {
    buckets.clear();
  }

  times.push(now);
  buckets.set(key, { times, windowMs });
  return { ok: true, remaining: limit - times.length, retryAfterMs: 0 };
}

/** Kurzform für Aufrufer, die nur "erlaubt ja/nein" brauchen. */
export function rateLimit(key: string, limit = 5, windowMs = 60 * 60 * 1000): boolean {
  return checkRateLimit(key, limit, windowMs).ok;
}

/** Nur für Tests: setzt den Zustand zurück. */
export function resetRateLimits(): void {
  buckets.clear();
  lastSweep = 0;
}

/** Nur für Tests/Diagnose: Anzahl der aktuell gehaltenen Schlüssel. */
export function rateLimitKeyCount(): number {
  return buckets.size;
}
