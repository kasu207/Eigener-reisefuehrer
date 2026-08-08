import { describe, it, expect } from "vitest";
import {
  buildQuery,
  addressFrom,
  noteFrom,
  confidenceFrom,
  searchOsmPlaceCandidates,
} from "../src/lib/osm-places";

function res(body: object) {
  return {
    ok: true,
    status: 200,
    async json() {
      return body;
    },
  } as unknown as Response;
}

describe("buildQuery", () => {
  it("baut eine Overpass-QL-Abfrage mit key=value- und key-only-Filtern", () => {
    const q = buildQuery(
      [
        ["amenity", "cafe"],
        ["historic", null],
      ],
      45.87,
      9.11
    );
    expect(q).toContain('node["amenity"="cafe"](around:1500,45.87,9.11);');
    expect(q).toContain('way["amenity"="cafe"](around:1500,45.87,9.11);');
    expect(q).toContain('node["historic"](around:1500,45.87,9.11);');
    expect(q).toContain("out center tags");
  });
});

describe("addressFrom", () => {
  it("baut eine Adresse aus addr:*-Tags", () => {
    expect(
      addressFrom({ "addr:street": "Via Plinio", "addr:housenumber": "20", "addr:city": "Torno" })
    ).toBe("Via Plinio 20, Torno");
  });
  it("liefert null ohne addr-Tags", () => {
    expect(addressFrom({ name: "Bar Italia" })).toBeNull();
  });
});

describe("noteFrom", () => {
  it("formuliert eine faktenbasierte Notiz aus Tags", () => {
    expect(noteFrom({ cuisine: "italian_pizza", opening_hours: "Mo-Su 08:00-20:00" })).toBe(
      "Küche: italian pizza · Öffnungszeiten (laut OSM): Mo-Su 08:00-20:00"
    );
    expect(noteFrom({ tourism: "viewpoint" })).toBe("Aussichtspunkt");
  });
  it("liefert eine leere Notiz ohne nützliche Tags", () => {
    expect(noteFrom({ name: "X" })).toBe("");
  });
});

describe("confidenceFrom", () => {
  it("bewertet reich getaggte Orte höher", () => {
    expect(
      confidenceFrom({ "addr:street": "X", opening_hours: "Mo-Fr", website: "https://x.de" })
    ).toBe("hoch");
    expect(confidenceFrom({ website: "https://x.de" })).toBe("mittel");
    expect(confidenceFrom({})).toBe("niedrig");
  });
});

describe("searchOsmPlaceCandidates", () => {
  it("wandelt Overpass-Elemente in Kandidaten um, sortiert nach Nähe, filtert Ausschlüsse", async () => {
    const fetchImpl = (async () =>
      res({
        elements: [
          {
            type: "node",
            id: 1,
            lat: 45.9,
            lon: 9.2,
            tags: { name: "Weit weg Café", amenity: "cafe" },
          },
          {
            type: "node",
            id: 2,
            lat: 45.8701,
            lon: 9.1101,
            tags: { name: "Nahes Café", amenity: "cafe", "addr:street": "Via Roma", "addr:housenumber": "1" },
          },
          {
            type: "way",
            id: 3,
            center: { lat: 45.87, lon: 9.11 },
            tags: { name: "Ausgeschlossenes Café", amenity: "cafe" },
          },
          { type: "node", id: 4, lat: 45.87, lon: 9.11, tags: { amenity: "cafe" } }, // ohne Namen -> raus
        ],
      })) as unknown as typeof fetch;

    const out = await searchOsmPlaceCandidates({
      area: "foodBudget",
      locality: "Torno",
      lat: 45.87,
      lng: 9.11,
      excludeNames: ["Ausgeschlossenes Café"],
      fetchImpl,
    });

    expect(out.map((c) => c.name)).toEqual(["Nahes Café", "Weit weg Café"]);
    expect(out[0].address).toBe("Via Roma 1");
    expect(out[0].sourceUrl).toBe("https://www.openstreetmap.org/node/2");
    expect(out[0].sourceTitle).toBe("OpenStreetMap-Mitwirkende");
    // Koordinaten müssen durchgereicht werden: Beim Übernehmen in den Guide
    // ersparen sie eine Geocoding-Anfrage, die den Ort per Namenssuche auch
    // verfehlen könnte (Regression: früher fielen sie unter den Tisch).
    expect(out[0].lat).toBe(45.8701);
    expect(out[0].lng).toBe(9.1101);
    // Auch für Elemente mit "center" statt lat/lon (ways/relations)
    const weitWeg = out.find((c) => c.name === "Weit weg Café")!;
    expect(weitWeg.lat).toBe(45.9);
    expect(weitWeg.lng).toBe(9.2);
  });

  it("liefert [] für nicht unterstützte Bereiche (z. B. hikes) ohne Netzaufruf", async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return res({ elements: [] });
    }) as unknown as typeof fetch;
    const out = await searchOsmPlaceCandidates({
      // "hikes" ist ein gültiger AreaKey, aber absichtlich nicht in OVERPASS_FILTERS
      area: "hikes",
      locality: "Torno",
      lat: 45.87,
      lng: 9.11,
      excludeNames: [],
      fetchImpl,
    });
    expect(out).toEqual([]);
    expect(called).toBe(false);
  });

  it("liefert [] statt zu werfen, wenn Overpass fehlschlägt", async () => {
    const fetchImpl = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const out = await searchOsmPlaceCandidates({
      area: "sights",
      locality: "Torno",
      lat: 45.87,
      lng: 9.11,
      excludeNames: [],
      fetchImpl,
    });
    expect(out).toEqual([]);
  });
});
