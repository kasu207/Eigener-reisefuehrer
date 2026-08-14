import { geocodePlace } from "./geocode";
import { findOsmPoiByName } from "./osm-places";

/**
 * Koordinaten für einen Ort ermitteln – so genau, wie die Daten es hergeben.
 *
 * Bisher bekamen automatisch angelegte Orte (KI-Vorschläge, YouTube-Auswertung)
 * die **Regions-Mitte** als Platzhalter. Am Comer See heißt das: Jeder Pin
 * steht mitten im Wasser, und die Umkreis-Suche der Auswahl-Engine findet den
 * Eintrag nicht, weil er kilometerweit von seinem echten Ort entfernt liegt.
 *
 * Statt eines einzigen Versuchs läuft deshalb eine Kaskade vom Genauen zum
 * Groben. Entscheidend ist die vorletzte Stufe: Selbst wenn nichts gefunden
 * wird, landet der Ort im **richtigen Dorf** statt in der Seemitte.
 */

export type CoordinateSource =
  | "osm-poi"
  | "address"
  | "name-search"
  | "locality"
  | "region-center";

export const COORDINATE_SOURCE_LABELS: Record<CoordinateSource, string> = {
  "osm-poi": "punktgenau aus OpenStreetMap",
  address: "über die Adresse",
  "name-search": "über die Namenssuche",
  locality: "nur Ortsmitte",
  "region-center": "nicht gefunden",
};

export interface ResolvedCoordinates {
  lat: number;
  lng: number;
  source: CoordinateSource;
  /** Taugt der Wert ohne Nachkontrolle? */
  confidence: "hoch" | "mittel" | "niedrig";
  /** Kurze Begründung für die Redaktion. */
  reason: string;
  /** Von OSM mitgelieferte Adresse, falls der Ort dort gefunden wurde. */
  address?: string | null;
  /** Beleg-Link zum OSM-Eintrag, falls vorhanden. */
  osmUrl?: string;
}

export interface RegionAnchor {
  name: string;
  country: string;
  centerLat: number;
  centerLng: number;
}

export interface ResolveInput {
  name: string;
  locality: string;
  address?: string;
  region: RegionAnchor;
}

/** Für Tests austauschbar. */
export interface CoordinateLookups {
  geocode: typeof geocodePlace;
  findPoi: typeof findOsmPoiByName;
}

const DEFAULT_LOOKUPS: CoordinateLookups = {
  geocode: geocodePlace,
  findPoi: findOsmPoiByName,
};

/** Wie weit ein Treffer höchstens von der Regions-Mitte weg sein darf. */
export const MAX_DISTANCE_FROM_REGION_KM = 60;

function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/**
 * Ist ein Treffer plausibel? Nominatim liefert bei unklaren Namen gern einen
 * gleichnamigen Ort in einem anderen Land – ungeprüft übernommen wäre das
 * schlimmer als der Platzhalter, weil es echt aussieht.
 */
export function isPlausible(
  lat: number,
  lng: number,
  region: RegionAnchor,
  maxKm: number = MAX_DISTANCE_FROM_REGION_KM
): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
  return distanceKm(lat, lng, region.centerLat, region.centerLng) <= maxKm;
}

/** Liegt der Punkt (fast) exakt auf der Regions-Mitte – also ungesetzt? */
export function isRegionCenter(lat: number, lng: number, region: RegionAnchor): boolean {
  return Math.abs(lat - region.centerLat) < 0.0005 && Math.abs(lng - region.centerLng) < 0.0005;
}

export async function resolvePlaceCoordinates(
  input: ResolveInput,
  lookups: CoordinateLookups = DEFAULT_LOOKUPS
): Promise<ResolvedCoordinates> {
  const { region } = input;
  const name = input.name.trim();
  const locality = input.locality.trim();
  const address = (input.address ?? "").trim();

  const fallback: ResolvedCoordinates = {
    lat: region.centerLat,
    lng: region.centerLng,
    source: "region-center",
    confidence: "niedrig",
    reason: "Nichts gefunden – Platzhalter auf der Regions-Mitte, bitte per Kartenklick setzen.",
  };

  // Mittelpunkt des Ortes: Grundlage für die Umkreissuche UND letzte
  // brauchbare Rückfalloption.
  const localityCenter = locality
    ? await lookups.geocode({
        label: locality,
        regionName: region.name,
        country: region.country,
        centerLat: region.centerLat,
        centerLng: region.centerLng,
      })
    : null;

  // 1) Adresse ist die verlässlichste Angabe, wenn sie gepflegt ist.
  if (address) {
    const hit = await lookups.geocode({
      label: [address, locality].filter(Boolean).join(", "),
      regionName: region.name,
      country: region.country,
      centerLat: region.centerLat,
      centerLng: region.centerLng,
    });
    if (hit && isPlausible(hit.lat, hit.lng, region)) {
      return {
        ...hit,
        source: "address",
        confidence: "hoch",
        reason: `Über die Adresse „${address}" verortet.`,
      };
    }
  }

  // 2) Den POI direkt in OpenStreetMap suchen – punktgenau, mit Beleg.
  if (localityCenter && name) {
    const poi = await lookups.findPoi({
      name,
      lat: localityCenter.lat,
      lng: localityCenter.lng,
    });
    if (poi && isPlausible(poi.lat, poi.lng, region)) {
      return {
        lat: poi.lat,
        lng: poi.lng,
        source: "osm-poi",
        confidence: poi.nameScore >= 0.9 ? "hoch" : "mittel",
        reason: `In OpenStreetMap als Eintrag gefunden${poi.address ? ` (${poi.address})` : ""}.`,
        address: poi.address,
        osmUrl: poi.osmUrl,
      };
    }
  }

  // 3) Freitext-Suche „Name, Ort" – trifft oft, ist aber ungenauer.
  if (name) {
    const hit = await lookups.geocode({
      label: [name, locality].filter(Boolean).join(", "),
      regionName: region.name,
      country: region.country,
      centerLat: region.centerLat,
      centerLng: region.centerLng,
    });
    if (hit && isPlausible(hit.lat, hit.lng, region)) {
      // Landet die Suche exakt auf dem Ortsmittelpunkt, hat sie den POI nicht
      // gefunden, sondern nur das Dorf – dann ehrlich als solches ausweisen.
      const onlyLocality =
        localityCenter != null &&
        distanceKm(hit.lat, hit.lng, localityCenter.lat, localityCenter.lng) < 0.05;
      return {
        ...hit,
        source: onlyLocality ? "locality" : "name-search",
        confidence: onlyLocality ? "niedrig" : "mittel",
        reason: onlyLocality
          ? `Nur der Ortsmittelpunkt von „${locality}" – genaue Lage bitte prüfen.`
          : `Über die Namenssuche „${name}, ${locality}" verortet.`,
      };
    }
  }

  // 4) Wenigstens das richtige Dorf statt der Seemitte.
  if (localityCenter && isPlausible(localityCenter.lat, localityCenter.lng, region)) {
    return {
      ...localityCenter,
      source: "locality",
      confidence: "niedrig",
      reason: `Ortsmittelpunkt von „${locality}" – genaue Lage bitte per Kartenklick setzen.`,
    };
  }

  return fallback;
}
