import { describe, it, expect } from "vitest";
import {
  curationGaps,
  gapWeight,
  isRegionCenterFallback,
  type PlaceQualityInput,
} from "../src/lib/place-quality";

const CENTER = { lat: 45.98, lng: 9.26 };
const NOW = new Date("2026-08-14T12:00:00Z");

function place(overrides: Partial<PlaceQualityInput> = {}): PlaceQualityInput {
  return {
    type: "sight",
    lat: 45.97,
    lng: 9.14,
    locality: "Torno",
    priceLevel: null,
    dietaryOptions: [],
    editorNotes: "Redaktionsnotiz",
    status: "verified",
    lastVerifiedAt: new Date("2026-06-01T00:00:00Z"),
    imageCount: 1,
    sourceCount: 1,
    ...overrides,
  };
}

describe("isRegionCenterFallback", () => {
  it("erkennt Orte, die auf der Regionsmitte kleben", () => {
    expect(isRegionCenterFallback(45.98, 9.26, CENTER)).toBe(true);
    expect(isRegionCenterFallback(45.97, 9.14, CENTER)).toBe(false);
  });

  it("meldet ohne bekannte Regionsmitte nichts", () => {
    expect(isRegionCenterFallback(45.98, 9.26, undefined)).toBe(false);
  });
});

describe("curationGaps", () => {
  it("meldet für einen vollständigen Eintrag nichts", () => {
    expect(curationGaps(place(), CENTER, NOW)).toEqual([]);
  });

  it("meldet fehlende Koordinaten, wenn der Ort auf der Regionsmitte liegt", () => {
    expect(curationGaps(place({ lat: 45.98, lng: 9.26 }), CENTER, NOW)).toContain("coords");
  });

  it("meldet bei Gastro fehlende Ernährungsangaben und fehlendes Preisniveau", () => {
    const gaps = curationGaps(place({ type: "restaurant" }), CENTER, NOW);
    expect(gaps).toContain("diet");
    expect(gaps).toContain("price");
  });

  it("verlangt Ernährungsangaben nicht bei Sehenswürdigkeiten", () => {
    expect(curationGaps(place({ type: "sight" }), CENTER, NOW)).not.toContain("diet");
  });

  it("meldet fehlende Bilder, Quellen und Notizen", () => {
    const gaps = curationGaps(
      place({ imageCount: 0, sourceCount: 0, editorNotes: "  " }),
      CENTER,
      NOW
    );
    expect(gaps).toEqual(expect.arrayContaining(["image", "source", "notes"]));
  });

  it("meldet fehlenden Ort – außer bei regionsweitem Praktischem", () => {
    expect(curationGaps(place({ locality: "" }), CENTER, NOW)).toContain("locality");
    expect(curationGaps(place({ locality: "", type: "practical" }), CENTER, NOW)).not.toContain(
      "locality"
    );
  });

  it("meldet überfällige Prüfung nur bei geprüften Einträgen", () => {
    const old = new Date("2024-01-01T00:00:00Z");
    expect(curationGaps(place({ lastVerifiedAt: old }), CENTER, NOW)).toContain("stale");
    expect(
      curationGaps(place({ status: "draft", lastVerifiedAt: old }), CENTER, NOW)
    ).not.toContain("stale");
    expect(curationGaps(place({ lastVerifiedAt: null }), CENTER, NOW)).toContain("stale");
  });
});

describe("gapWeight", () => {
  it("gewichtet guide-wirksame Lücken höher als kosmetische", () => {
    expect(gapWeight(["coords"])).toBeGreaterThan(gapWeight(["notes"]));
    expect(gapWeight(["diet", "locality"])).toBeGreaterThan(gapWeight(["image"]));
    expect(gapWeight([])).toBe(0);
  });
});
