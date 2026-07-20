/**
 * Einfaches In-Memory-Rate-Limiting für den Fragebogen-Endpoint
 * (Anforderung 8). Für Multi-Instanz-Deployments später durch
 * Redis/Upstash ersetzen.
 */
const hits = new Map<string, number[]>();

export function rateLimit(key: string, limit = 5, windowMs = 60 * 60 * 1000): boolean {
  const now = Date.now();
  const windowStart = now - windowMs;
  const entries = (hits.get(key) ?? []).filter((t) => t > windowStart);
  if (entries.length >= limit) {
    hits.set(key, entries);
    return false;
  }
  entries.push(now);
  hits.set(key, entries);
  return true;
}
