import { describe, it, expect } from "vitest";
import {
  filterByPriceTier,
  priceLevelMatchesTier,
  type PlaceCandidate,
} from "../src/lib/ai/research-place";

function candidate(name: string, priceLevel: number | null): PlaceCandidate {
  return {
    name,
    note: "",
    priceLevel,
    address: null,
    sourceUrl: "https://example.com",
    sourceTitle: "Quelle",
    confidence: "mittel",
    mapsUrl: "https://maps.example.com",
  };
}

describe("priceLevelMatchesTier", () => {
  it("ordnet belegte Preisniveaus der richtigen Klasse zu", () => {
    expect(priceLevelMatchesTier(4, "fancy")).toBe(true);
    expect(priceLevelMatchesTier(3, "fancy")).toBe(false);
    expect(priceLevelMatchesTier(3, "mid")).toBe(true);
    expect(priceLevelMatchesTier(2, "mid")).toBe(false);
    expect(priceLevelMatchesTier(2, "budget")).toBe(true);
    expect(priceLevelMatchesTier(4, "budget")).toBe(false);
  });

  it("schließt unbelegte Preisniveaus nicht aus", () => {
    expect(priceLevelMatchesTier(null, "fancy")).toBe(true);
    expect(priceLevelMatchesTier(null, "budget")).toBe(true);
  });
});

describe("filterByPriceTier", () => {
  it("verwirft Vorschläge, die der gesuchten Klasse widersprechen", () => {
    const out = filterByPriceTier(
      [candidate("Pizzeria", 2), candidate("Gourmet", 4)],
      "fancy"
    );
    expect(out.map((c) => c.name)).toEqual(["Gourmet"]);
  });

  it("stellt belegte Treffer vor unbelegte", () => {
    const out = filterByPriceTier(
      [candidate("Ohne Angabe", null), candidate("Belegt", 3)],
      "mid"
    );
    expect(out.map((c) => c.name)).toEqual(["Belegt", "Ohne Angabe"]);
  });

  it("lässt ohne Preisklasse (z. B. Sehenswürdigkeiten) alles durch", () => {
    const list = [candidate("Aussicht", null), candidate("Museum", 1)];
    expect(filterByPriceTier(list)).toEqual(list);
  });
});
