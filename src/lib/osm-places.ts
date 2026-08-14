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
  // Gehoben/Mittelklasse: nur echte Restaurants – Cafés und Imbisse gehören
  // dort nicht hin, egal wie nah sie liegen.
  foodFancy: [["amenity", "restaurant"]],
  foodMid: [["amenity", "restaurant"]],
  foodBudget: [
    ["amenity", "cafe"],
    ["amenity", "restaurant"],
    ["amenity", "fast_food"],
    ["amenity", "ice_cream"],
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

export type PriceTier = "fancy" | "mid" | "budget";

/** Welche Preisklasse ein Gastro-Bereich meint. */
export const FOOD_AREA_TIERS: Partial<Record<AreaKey, PriceTier>> = {
  foodFancy: "fancy",
  foodMid: "mid",
  foodBudget: "budget",
};

/**
 * Darf ein Ort OHNE erkennbare Preisklasse in diesem Bereich vorgeschlagen
 * werden? Ein schlicht getaggtes `amenity=restaurant` ist als Mittelklasse
 * oder günstig plausibel – als "gehoben" ist es eine reine Behauptung. Für
 * `fancy` greift deshalb die KI-Recherche, die Preisniveaus belegen kann.
 */
const TIER_ACCEPTS_UNKNOWN: Record<PriceTier, boolean> = {
  fancy: false,
  mid: true,
  budget: true,
};

const BUDGET_CUISINES = new Set([
  "pizza",
  "burger",
  "kebab",
  "sandwich",
  "fish_and_chips",
  "ice_cream",
  "coffee_shop",
  "bakery",
  "friture",
  "donut",
]);

const FANCY_CUISINES = new Set(["fine_dining", "gourmet"]);

function cuisinesOf(tags: Record<string, string>): string[] {
  return (tags.cuisine ?? "")
    .toLowerCase()
    .split(";")
    .map((c) => c.trim())
    .filter(Boolean);
}

/**
 * Preisklasse aus OSM-Tags ableiten.
 *
 * OSM hat kein verlässliches Preisfeld – `price_range` ist selten gesetzt –,
 * aber die Betriebsart und einzelne Tags trennen grob genug. Wichtig:
 * `null` heißt "steht nicht in den Daten", NICHT "Mittelklasse". Sonst würde
 * jedes namenlos getaggte Restaurant in jeder Preisklasse auftauchen – und
 * genau das ließ günstig/mittel/gehoben immer dasselbe anzeigen.
 */
export function priceTierFromTags(tags: Record<string, string>): PriceTier | null {
  const amenity = tags.amenity ?? "";
  // Betriebsart ist das stärkste Signal
  if (amenity === "fast_food" || amenity === "ice_cream") return "budget";
  if (tags.takeaway === "only" || tags.self_service === "yes") return "budget";

  // Explizite Preisangabe, wenn ausnahmsweise vorhanden ($$ / €€ / "moderate")
  const range = (tags.price_range ?? "").toLowerCase();
  const symbols = range.match(/[$€£]/g);
  if (symbols) {
    if (symbols.length >= 3) return "fancy";
    return symbols.length === 2 ? "mid" : "budget";
  }
  if (range) {
    if (/expensive|teuer|hoch/.test(range)) return "fancy";
    if (/moderate|mittel/.test(range)) return "mid";
    if (/cheap|budget|g(ü|ue)nstig/.test(range)) return "budget";
  }

  const cuisines = cuisinesOf(tags);
  if (tags.michelin_star || tags["michelin:stars"]) return "fancy";
  if (cuisines.some((c) => FANCY_CUISINES.has(c))) return "fancy";
  if (tags.reservation === "required") return "fancy";

  if (amenity === "cafe") return "budget";
  if (cuisines.some((c) => BUDGET_CUISINES.has(c))) return "budget";

  return null; // z. B. schlichtes amenity=restaurant ohne weitere Hinweise
}

/**
 * Preisniveau 1–4 aus Tags – nur wenn die Daten es hergeben, sonst null.
 * So bekommt ein übernommener Ort einen belegten Wert statt der pauschalen
 * Bereichs-Vorgabe.
 */
export function priceLevelFromTags(tags: Record<string, string>): number | null {
  const tier = priceTierFromTags(tags);
  if (!tier) return null;
  if (tier === "fancy") return 4;
  if (tier === "mid") return 3;
  const amenity = tags.amenity ?? "";
  return amenity === "fast_food" || amenity === "ice_cream" ? 1 : 2;
}

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
  if (tags.price_range) parts.push(`Preisangabe (laut OSM): ${tags.price_range}`);
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
  const wantedTier = FOOD_AREA_TIERS[input.area] ?? null;
  const ranked: { c: PlaceCandidate; tierRank: number; d: number }[] = [];

  for (const el of elements) {
    const tags = el.tags ?? {};
    const name = tags.name?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (exclude.has(key) || seen.has(key)) continue;
    seen.add(key);

    // Preisklasse ernst nehmen: fremde Klassen raus, unbekannte nur dort, wo
    // sie plausibel sind – und immer hinter den belegten Treffern.
    let tierRank = 0;
    if (wantedTier) {
      const tier = priceTierFromTags(tags);
      if (tier && tier !== wantedTier) continue;
      if (!tier && !TIER_ACCEPTS_UNKNOWN[wantedTier]) continue;
      tierRank = tier === wantedTier ? 0 : 1;
    }

    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (lat == null || lng == null) continue;
    const dLat = lat - input.lat;
    const dLng = lng - input.lng;
    const d = dLat * dLat + dLng * dLng; // grobe Distanz reicht zum Sortieren

    const address = addressFrom(tags);
    ranked.push({
      c: {
        name,
        note: noteFrom(tags),
        priceLevel: priceLevelFromTags(tags),
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
      tierRank,
      d,
    });
  }

  return ranked
    .sort((a, b) => a.tierRank - b.tierRank || a.d - b.d)
    .slice(0, MAX_RESULTS)
    .map((x) => x.c);
}
