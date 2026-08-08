import type { AreaKey } from "./areas";
import { mapsHref } from "./names";
import type { PlaceCandidate } from "./ai/research-place";

/**
 * Kostenlose Ort-Recherche über OpenStreetMap (Overpass API) – dieselbe
 * Datenquelle wie beim Geocoding (geocode.ts), nur für echte POIs statt
 * Koordinaten. Kein API-Key, keine KI-Kosten. Ergänzt/ersetzt die KI-Websuche
 * (research-place.ts): wird IMMER zuerst versucht; nur wenn OSM nichts
 * Passendes findet, greift die (kostenpflichtige) KI-Websuche als Fallback.
 *
 * Trade-off: OSM-Abdeckung ist in kleinen Orten meist ordentlich, aber nicht
 * lückenlos, und Daten können veraltet sein – daher weiterhin klar als
 * "Vorschlag zum Verifizieren" markiert (confidence, Quelle), genau wie bei
 * der KI-Recherche.
 */

const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";
const RADIUS_M = 1500;
const MAX_RESULTS = 8;

/** OSM-Tag-Filter je Bereich (Key + optionaler Wert). */
const OVERPASS_FILTERS: Partial<Record<AreaKey, [string, string | null][]>> = {
  sights: [
    ["tourism", "viewpoint"],
    ["tourism", "attraction"],
    ["tourism", "museum"],
    ["historic", null],
    ["natural", "beach"],
  ],
  foodFancy: [["amenity", "restaurant"]],
  foodMid: [["amenity", "restaurant"]],
  foodBudget: [
    ["amenity", "cafe"],
    ["amenity", "restaurant"],
    ["amenity", "fast_food"],
  ],
  bars: [
    ["amenity", "bar"],
    ["amenity", "pub"],
    ["amenity", "cafe"],
  ],
  hotels: [
    ["tourism", "hotel"],
    ["tourism", "guest_house"],
  ],
};

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export function buildQuery(filters: [string, string | null][], lat: number, lng: number): string {
  const clauses = filters.flatMap(([key, value]) => {
    const sel = value ? `["${key}"="${value}"]` : `["${key}"]`;
    return [
      `node${sel}(around:${RADIUS_M},${lat},${lng});`,
      `way${sel}(around:${RADIUS_M},${lat},${lng});`,
    ];
  });
  return `[out:json][timeout:15];\n(\n${clauses.join("\n")}\n);\nout center tags ${MAX_RESULTS * 3};`;
}

export function addressFrom(tags: Record<string, string>): string | null {
  const parts = [
    [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" "),
    tags["addr:city"] || tags["addr:place"],
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

/** Kurze, rein tag-basierte Notiz (keine erfundenen Fakten). */
export function noteFrom(tags: Record<string, string>): string {
  const parts: string[] = [];
  if (tags.cuisine) parts.push(`Küche: ${tags.cuisine.replace(/_/g, " ")}`);
  if (tags.tourism === "viewpoint") parts.push("Aussichtspunkt");
  if (tags.tourism === "attraction") parts.push("Sehenswürdigkeit");
  if (tags.tourism === "museum") parts.push("Museum");
  if (tags.historic) parts.push(`Historisch: ${tags.historic.replace(/_/g, " ")}`);
  if (tags.natural === "beach") parts.push("Strand/Seezugang");
  if (tags.opening_hours) parts.push(`Öffnungszeiten (laut OSM): ${tags.opening_hours}`);
  return parts.join(" · ");
}

export function confidenceFrom(tags: Record<string, string>): "hoch" | "mittel" | "niedrig" {
  const richness = [tags["addr:street"], tags.opening_hours, tags.website, tags.phone].filter(
    Boolean
  ).length;
  return richness >= 2 ? "hoch" : richness >= 1 ? "mittel" : "niedrig";
}

export interface OsmSearchInput {
  area: AreaKey;
  locality: string;
  lat: number;
  lng: number;
  excludeNames: string[];
  /** Injizierbarer fetch (für Tests). Standard: global fetch. */
  fetchImpl?: typeof fetch;
}

/** Sucht echte Orte per OpenStreetMap – kostenlos, ohne KI-Aufruf. */
export async function searchOsmPlaceCandidates(input: OsmSearchInput): Promise<PlaceCandidate[]> {
  const filters = OVERPASS_FILTERS[input.area];
  if (!filters) return [];

  const query = buildQuery(filters, input.lat, input.lng);
  const fetchImpl = input.fetchImpl ?? fetch;

  let elements: OverpassElement[];
  try {
    const res = await fetchImpl(OVERPASS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Reisefuehrer-OSM/1.0 (kuratierter Reiseführer)",
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Overpass ${res.status}`);
    const data = (await res.json()) as { elements?: OverpassElement[] };
    elements = data.elements ?? [];
  } catch (e) {
    console.error("[osm-places] Abfrage fehlgeschlagen:", e);
    return [];
  }

  const exclude = new Set(input.excludeNames.map((n) => n.toLowerCase()));
  const seen = new Set<string>();
  const withDistance: { c: PlaceCandidate; d: number }[] = [];

  for (const el of elements) {
    const tags = el.tags ?? {};
    const name = tags.name?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (exclude.has(key) || seen.has(key)) continue;
    seen.add(key);

    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (lat == null || lng == null) continue;
    const dLat = lat - input.lat;
    const dLng = lng - input.lng;
    const d = dLat * dLat + dLng * dLng; // grobe Distanz reicht zum Sortieren

    const address = addressFrom(tags);
    withDistance.push({
      c: {
        name,
        note: noteFrom(tags),
        priceLevel: null,
        address,
        sourceUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
        sourceTitle: "OpenStreetMap-Mitwirkende",
        confidence: confidenceFrom(tags),
        mapsUrl: mapsHref(address ?? `${name}, ${input.locality}`),
        // Koordinaten mitgeben: Sie sind exakt und ersparen beim Übernehmen
        // eine Geocoding-Anfrage, die den Ort per Namenssuche auch verfehlen
        // könnte.
        lat,
        lng,
      },
      d,
    });
  }

  return withDistance
    .sort((a, b) => a.d - b.d)
    .slice(0, MAX_RESULTS)
    .map((x) => x.c);
}
