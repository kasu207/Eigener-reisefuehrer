import { describe, it, expect } from "vitest";
import {
  isPlausible,
  isRegionCenter,
  resolvePlaceCoordinates,
  type CoordinateLookups,
  type RegionAnchor,
} from "../src/lib/coordinates";

const COMER: RegionAnchor = {
  name: "Comer See",
  country: "Italien",
  centerLat: 45.98,
  centerLng: 9.26,
};

const TORNO_CENTER = { lat: 45.9707, lng: 9.1385 };
const POI = { lat: 45.9712, lng: 9.1391 };

/** Nachbau der Nachschlage-Funktionen ohne Netz. */
function lookups(overrides: Partial<CoordinateLookups> = {}): CoordinateLookups {
  return {
    geocode: async () => null,
    findPoi: async () => null,
    ...overrides,
  };
}

describe("isPlausible", () => {
  it("akzeptiert Treffer in der Region", () => {
    expect(isPlausible(45.97, 9.14, COMER)).toBe(true);
  });

  it("verwirft Treffer weit außerhalb – z. B. den gleichnamigen Ort anderswo", () => {
    expect(isPlausible(52.52, 13.4, COMER)).toBe(false); // Berlin
  });

  it("verwirft unsinnige Werte", () => {
    expect(isPlausible(Number.NaN, 9.1, COMER)).toBe(false);
    expect(isPlausible(200, 9.1, COMER)).toBe(false);
  });
});

describe("isRegionCenter", () => {
  it("erkennt den Platzhalter auf der Regions-Mitte", () => {
    expect(isRegionCenter(45.98, 9.26, COMER)).toBe(true);
    expect(isRegionCenter(45.97, 9.14, COMER)).toBe(false);
  });
});

describe("resolvePlaceCoordinates", () => {
  it("nimmt die Adresse, wenn sie sich verorten lässt", async () => {
    const out = await resolvePlaceCoordinates(
      { name: "Trattoria", locality: "Torno", address: "Via Plinio 20", region: COMER },
      lookups({
        geocode: async ({ label }) => (label.startsWith("Via Plinio") ? POI : TORNO_CENTER),
      })
    );
    expect(out.source).toBe("address");
    expect(out.confidence).toBe("hoch");
    expect(out.lat).toBe(POI.lat);
  });

  it("findet den POI punktgenau in OpenStreetMap", async () => {
    const out = await resolvePlaceCoordinates(
      { name: "Trattoria Vapore", locality: "Torno", region: COMER },
      lookups({
        geocode: async () => TORNO_CENTER,
        findPoi: async () => ({
          ...POI,
          address: "Piazza Casartelli 4",
          osmUrl: "https://www.openstreetmap.org/node/1",
          nameScore: 1,
        }),
      })
    );
    expect(out.source).toBe("osm-poi");
    expect(out.confidence).toBe("hoch");
    expect(out.address).toBe("Piazza Casartelli 4");
    expect(out.osmUrl).toContain("openstreetmap");
  });

  it("stuft einen unsicheren Namenstreffer aus OSM auf mittel herab", async () => {
    const out = await resolvePlaceCoordinates(
      { name: "Trattoria Vapore", locality: "Torno", region: COMER },
      lookups({
        geocode: async () => TORNO_CENTER,
        findPoi: async () => ({
          ...POI,
          address: null,
          osmUrl: "https://www.openstreetmap.org/node/1",
          nameScore: 0.7,
        }),
      })
    );
    expect(out.confidence).toBe("mittel");
  });

  it("nutzt die Namenssuche, wenn OSM den POI nicht kennt", async () => {
    const out = await resolvePlaceCoordinates(
      { name: "Villa Pliniana", locality: "Torno", region: COMER },
      lookups({
        geocode: async ({ label }) => (label.startsWith("Villa") ? POI : TORNO_CENTER),
      })
    );
    expect(out.source).toBe("name-search");
    expect(out.lat).toBe(POI.lat);
  });

  it("nennt es ehrlich Ortsmitte, wenn die Namenssuche nur das Dorf trifft", async () => {
    const out = await resolvePlaceCoordinates(
      { name: "Unbekannte Bar", locality: "Torno", region: COMER },
      lookups({ geocode: async () => TORNO_CENTER })
    );
    expect(out.source).toBe("locality");
    expect(out.confidence).toBe("niedrig");
    expect(out.lat).toBe(TORNO_CENTER.lat);
  });

  it("verwirft einen Treffer außerhalb der Region und fällt auf den Ort zurück", async () => {
    const out = await resolvePlaceCoordinates(
      { name: "San Giovanni", locality: "Torno", region: COMER },
      lookups({
        geocode: async ({ label }) =>
          label.startsWith("San Giovanni") ? { lat: 40.85, lng: 14.27 } : TORNO_CENTER,
      })
    );
    expect(out.source).toBe("locality");
    expect(out.lat).toBe(TORNO_CENTER.lat);
  });

  it("fällt auf die Regions-Mitte nur zurück, wenn wirklich nichts geht", async () => {
    const out = await resolvePlaceCoordinates(
      { name: "Irgendwas", locality: "", region: COMER },
      lookups()
    );
    expect(out.source).toBe("region-center");
    expect(out.lat).toBe(COMER.centerLat);
  });

  it("landet auch ohne jeden Treffer im richtigen Dorf statt in der Seemitte", async () => {
    // Der Kern der Änderung: vorher bekam JEDER automatisch angelegte Ort die
    // Regions-Mitte – am Comer See buchstäblich das Wasser.
    const out = await resolvePlaceCoordinates(
      { name: "Namenlose Osteria", locality: "Torno", region: COMER },
      lookups({ geocode: async ({ label }) => (label === "Torno" ? TORNO_CENTER : null) })
    );
    expect(out.lat).not.toBe(COMER.centerLat);
    expect(out.lat).toBe(TORNO_CENTER.lat);
  });
});
