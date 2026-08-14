import { describe, it, expect } from "vitest";
import {
  buildQuery,
  addressFrom,
  noteFrom,
  confidenceFrom,
  priceTierFromTags,
  priceLevelFromTags,
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

describe("priceTierFromTags", () => {
  it("erkennt günstige Betriebsarten an der Betriebsart selbst", () => {
    expect(priceTierFromTags({ amenity: "fast_food" })).toBe("budget");
    expect(priceTierFromTags({ amenity: "ice_cream" })).toBe("budget");
    expect(priceTierFromTags({ amenity: "cafe" })).toBe("budget");
    expect(priceTierFromTags({ amenity: "restaurant", takeaway: "only" })).toBe("budget");
  });

  it("liest eine explizite Preisangabe, wenn OSM eine hat", () => {
    expect(priceTierFromTags({ amenity: "restaurant", price_range: "$$$" })).toBe("fancy");
    expect(priceTierFromTags({ amenity: "restaurant", price_range: "€€" })).toBe("mid");
    expect(priceTierFromTags({ amenity: "restaurant", price_range: "$" })).toBe("budget");
    expect(priceTierFromTags({ amenity: "restaurant", price_range: "moderate" })).toBe("mid");
    expect(priceTierFromTags({ amenity: "restaurant", price_range: "expensive" })).toBe("fancy");
  });

  it("erkennt gehobene Häuser an Auszeichnung, Küche oder Reservierungspflicht", () => {
    expect(priceTierFromTags({ amenity: "restaurant", michelin_star: "1" })).toBe("fancy");
    expect(priceTierFromTags({ amenity: "restaurant", cuisine: "fine_dining" })).toBe("fancy");
    expect(priceTierFromTags({ amenity: "restaurant", reservation: "required" })).toBe("fancy");
  });

  it("erkennt günstige Küchen", () => {
    expect(priceTierFromTags({ amenity: "restaurant", cuisine: "pizza;kebab" })).toBe("budget");
  });

  it("gibt null zurück, wenn die Daten nichts hergeben (nicht 'mittel')", () => {
    expect(priceTierFromTags({ amenity: "restaurant" })).toBeNull();
    expect(priceTierFromTags({ amenity: "restaurant", cuisine: "italian" })).toBeNull();
  });
});

describe("priceLevelFromTags", () => {
  it("leitet ein Preisniveau nur aus belegten Tags ab", () => {
    expect(priceLevelFromTags({ amenity: "restaurant", cuisine: "fine_dining" })).toBe(4);
    expect(priceLevelFromTags({ amenity: "restaurant", price_range: "€€" })).toBe(3);
    expect(priceLevelFromTags({ amenity: "cafe" })).toBe(2);
    expect(priceLevelFromTags({ amenity: "fast_food" })).toBe(1);
    expect(priceLevelFromTags({ amenity: "restaurant" })).toBeNull();
  });
});

describe("searchOsmPlaceCandidates – Preisklassen", () => {
  const elements = [
    { type: "node", id: 1, lat: 45.87, lon: 9.11, tags: { name: "Imbiss", amenity: "fast_food" } },
    { type: "node", id: 2, lat: 45.87, lon: 9.11, tags: { name: "Café Centrale", amenity: "cafe" } },
    {
      type: "node",
      id: 3,
      lat: 45.8705,
      lon: 9.1105,
      tags: { name: "Trattoria", amenity: "restaurant" },
    },
    {
      type: "node",
      id: 4,
      lat: 45.88,
      lon: 9.12,
      tags: { name: "Ristorante Alto", amenity: "restaurant", cuisine: "fine_dining" },
    },
  ];
  const fetchImpl = (async () => res({ elements })) as unknown as typeof fetch;
  const base = { locality: "Torno", lat: 45.87, lng: 9.11, excludeNames: [], fetchImpl };

  it("liefert für 'gehoben' nur belegt gehobene Häuser – kein Café, kein Imbiss", async () => {
    const out = await searchOsmPlaceCandidates({ ...base, area: "foodFancy" });
    expect(out.map((c) => c.name)).toEqual(["Ristorante Alto"]);
    expect(out[0].priceLevel).toBe(4);
  });

  it("liefert für 'mittel' Restaurants ohne Preisangabe, aber nicht das Fine-Dining-Haus", async () => {
    const out = await searchOsmPlaceCandidates({ ...base, area: "foodMid" });
    expect(out.map((c) => c.name)).toEqual(["Trattoria"]);
  });

  it("liefert für 'günstig' Café und Imbiss, nicht das gehobene Restaurant", async () => {
    const out = await searchOsmPlaceCandidates({ ...base, area: "foodBudget" });
    expect(out.map((c) => c.name)).toContain("Café Centrale");
    expect(out.map((c) => c.name)).toContain("Imbiss");
    expect(out.map((c) => c.name)).not.toContain("Ristorante Alto");
  });

  it("zeigt die drei Preisklassen nicht mehr dasselbe Lokal", async () => {
    const [fancy, mid, budget] = await Promise.all([
      searchOsmPlaceCandidates({ ...base, area: "foodFancy" }),
      searchOsmPlaceCandidates({ ...base, area: "foodMid" }),
      searchOsmPlaceCandidates({ ...base, area: "foodBudget" }),
    ]);
    expect(fancy[0].name).not.toBe(mid[0].name);
    expect(mid[0].name).not.toBe(budget[0].name);
    expect(fancy[0].name).not.toBe(budget[0].name);
  });

  it("stellt belegte Treffer der Preisklasse vor unbelegte", async () => {
    const out = await searchOsmPlaceCandidates({
      ...base,
      area: "foodBudget",
      // "Nahe Trattoria" liegt am dichtesten, hat aber keine Preisangabe
      fetchImpl: (async () =>
        res({
          elements: [
            {
              type: "node",
              id: 9,
              lat: 45.87,
              lon: 9.11,
              tags: { name: "Nahe Trattoria", amenity: "restaurant" },
            },
            {
              type: "node",
              id: 10,
              lat: 45.9,
              lon: 9.2,
              tags: { name: "Fernes Café", amenity: "cafe" },
            },
          ],
        })) as unknown as typeof fetch,
    });
    expect(out.map((c) => c.name)).toEqual(["Fernes Café", "Nahe Trattoria"]);
  });

  it("filtert bei Nicht-Gastro-Bereichen nicht nach Preisklasse", async () => {
    const out = await searchOsmPlaceCandidates({
      ...base,
      area: "sights",
      fetchImpl: (async () =>
        res({
          elements: [
            { type: "node", id: 11, lat: 45.87, lon: 9.11, tags: { name: "Aussicht", tourism: "viewpoint" } },
          ],
        })) as unknown as typeof fetch,
    });
    expect(out.map((c) => c.name)).toEqual(["Aussicht"]);
  });
});
