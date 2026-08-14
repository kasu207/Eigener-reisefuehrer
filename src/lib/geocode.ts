/**
 * Geocoding von Freitext-Ortsangaben (z. B. "Torno") über Nominatim/OSM.
 *
 * Zweck: Gibt eine Reisende:r nur einen Ortsnamen als Unterkunft an, brauchen
 * wir Koordinaten, damit die Auswahl-Engine Orte/Wanderungen im Umkreis
 * bevorzugt und ein "Rund um eure Unterkunft"-Kapitel entstehen kann.
 *
 * Kein API-Key nötig. Ergebnisse werden im Prozess zwischengespeichert, um die
 * Nominatim-Nutzungsregeln (max. 1 Anfrage/Sekunde) einzuhalten.
 */

const cache = new Map<string, { lat: number; lng: number } | null>();

/**
 * Nominatim erlaubt höchstens eine Anfrage pro Sekunde. Beim Nachtragen
 * hunderter Koordinaten würde ein Schwall Anfragen die IP sperren – deshalb
 * laufen alle Abfragen durch diese Warteschlange, nie parallel.
 */
const MIN_REQUEST_GAP_MS = 1100;
let lastRequest = 0;
let queue: Promise<unknown> = Promise.resolve();

function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = MIN_REQUEST_GAP_MS - (Date.now() - lastRequest);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequest = Date.now();
    return fn();
  });
  // Fehler dürfen die Warteschlange nicht abreißen lassen
  queue = run.catch(() => undefined);
  return run;
}

export async function geocodePlace(params: {
  label: string;
  regionName?: string;
  country?: string;
  centerLat?: number;
  centerLng?: number;
}): Promise<{ lat: number; lng: number } | null> {
  const label = params.label.trim();
  if (!label) return null;

  const cacheKey = `${label}|${params.regionName ?? ""}|${params.country ?? ""}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey)!;

  const query = [label, params.regionName, params.country].filter(Boolean).join(", ");
  const search = new URLSearchParams({
    q: query,
    format: "json",
    limit: "1",
    addressdetails: "0",
  });

  // Suche auf einen Kasten um die Regions-Mitte begrenzen, damit gleichnamige
  // Orte anderswo nicht fälschlich getroffen werden.
  if (params.centerLat != null && params.centerLng != null) {
    const d = 0.6; // ca. 60 km
    const left = params.centerLng - d;
    const right = params.centerLng + d;
    const top = params.centerLat + d;
    const bottom = params.centerLat - d;
    search.set("viewbox", `${left},${top},${right},${bottom}`);
    search.set("bounded", "1");
  }

  try {
    const res = await throttled(() =>
      fetch(`https://nominatim.openstreetmap.org/search?${search.toString()}`, {
        headers: {
          "User-Agent": "Reisefuehrer-Geocode/1.0 (kuratierter Reiseführer)",
          "Accept-Language": "de",
        },
        signal: AbortSignal.timeout(10_000),
      })
    );
    if (!res.ok) throw new Error(`Nominatim ${res.status}`);
    const data = (await res.json()) as { lat: string; lon: string }[];
    const hit = data[0];
    const result = hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null;
    cache.set(cacheKey, result);
    return result;
  } catch (e) {
    console.error("[geocode] fehlgeschlagen:", e);
    cache.set(cacheKey, null);
    return null;
  }
}
