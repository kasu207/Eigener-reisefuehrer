import { describe, it, expect } from "vitest";
import {
  normalizePlaceKey,
  resolvePlaceNames,
  chunksForPlace,
  questionnaireSearchTerms,
  type ChunkWithSource,
} from "../src/lib/knowledge";
import { questionnaireSchema } from "../src/lib/questionnaire";

function makeChunk(overrides: Partial<ChunkWithSource> = {}): ChunkWithSource {
  return {
    id: Math.random().toString(36).slice(2),
    documentId: "doc1",
    title: "Notiz",
    content: "Inhalt",
    interests: [],
    placeIds: [],
    placeNames: [],
    createdAt: new Date(),
    document: { title: "Testbuch", kind: "book", url: null },
    ...overrides,
  } as ChunkWithSource;
}

describe("Ortsnamen-Auflösung", () => {
  const known = [
    { id: "p1", name: "Villa del Balbianello", locality: "Lenno" },
    { id: "p2", name: "Varenna", locality: "" },
  ];

  it("normalisiert Akzente und Schreibweisen", () => {
    expect(normalizePlaceKey("Café Rossi!")).toBe(normalizePlaceKey("cafe rossi"));
  });

  it("löst bekannte Namen zu placeIds auf, unbekannte bleiben Kandidaten", () => {
    const { placeIds, unresolved } = resolvePlaceNames(
      ["villa del balbianello", "Crotto dei Platti"],
      known
    );
    expect(placeIds).toEqual(["p1"]);
    expect(unresolved).toEqual(["Crotto dei Platti"]);
  });

  it("dedupliziert mehrfach genannte Orte", () => {
    const { placeIds } = resolvePlaceNames(["Varenna", "VARENNA"], known);
    expect(placeIds).toEqual(["p2"]);
  });
});

describe("Ort-Matching für den Guide-Prompt", () => {
  it("chunksForPlace matcht exakt über placeIds und legacy über Namen", () => {
    const exact = makeChunk({ placeIds: ["p1"] });
    const legacy = makeChunk({ placeNames: ["Varenna"] });
    const other = makeChunk({ placeIds: ["p9"], placeNames: ["Bellagio"] });
    expect(chunksForPlace([exact, legacy, other], "p1", "Villa")).toEqual([exact]);
    expect(chunksForPlace([exact, legacy, other], "p2", "Varenna")).toEqual([legacy]);
  });
});

describe("Fragebogen → Suchbegriffe (Postgres-Volltextsuche)", () => {
  it("verdichtet Interessen, Kinder, Ernährung und Orte zu Suchbegriffen", () => {
    const q = questionnaireSchema.parse({
      regionSlug: "comer-see",
      dateFrom: "2026-08-01",
      dateTo: "2026-08-07",
      accommodation: { label: "Varenna", lat: null, lng: null },
      mobility: ["car"],
      adults: 2,
      children: [{ ageGroup: "4-9" }],
      interests: [
        { key: "wandern", weight: "wichtig" },
        { key: "kulinarik", weight: "interessant" },
      ],
      fitnessLevel: "mittel",
      maxHikeDurationMin: 240,
      maxElevationGainM: 800,
      pace: "ausgewogen",
      priceLevel: 3,
      diets: ["vegetarian"],
      foodPreferences: ["aperitivo_bar"],
      firstNames: "Test",
      gdprConsent: true,
    });
    const terms = questionnaireSearchTerms(q);
    expect(terms).toContain("Wandern");
    expect(terms).toContain("Kulinarik");
    expect(terms).toContain("Varenna");
    expect(terms).toContain("Familie");
    expect(terms).toContain("vegetarisch");
    expect(terms).toContain("Aperitivo Bar");
  });

  it("dedupliziert Begriffe", () => {
    const q = questionnaireSchema.parse({
      regionSlug: "comer-see",
      dateFrom: "2026-08-01",
      dateTo: "2026-08-07",
      accommodation: { label: "Varenna", lat: null, lng: null },
      mobility: ["car"],
      adults: 2,
      children: [],
      interests: [{ key: "wandern", weight: "wichtig" }],
      fitnessLevel: "mittel",
      maxHikeDurationMin: 240,
      maxElevationGainM: 800,
      pace: "ausgewogen",
      priceLevel: 3,
      diets: [],
      foodPreferences: [],
      anchors: [{ label: "Varenna", lat: null, lng: null }],
      firstNames: "Test",
      gdprConsent: true,
    });
    const terms = questionnaireSearchTerms(q);
    expect(terms.filter((t) => t === "Varenna")).toHaveLength(1);
  });
});
