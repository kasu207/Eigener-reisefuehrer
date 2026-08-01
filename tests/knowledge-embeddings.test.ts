import { describe, it, expect } from "vitest";
import {
  pseudoEmbedding,
  cosineSimilarity,
  toVectorLiteral,
  EMBEDDING_DIM,
} from "../src/lib/ai/embeddings";
import {
  normalizePlaceKey,
  resolvePlaceNames,
  contextualChunkText,
  chunksForPlace,
  questionnaireToSearchText,
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

describe("Pseudo-Embeddings (Mock/Test-Modus)", () => {
  it("sind deterministisch, normalisiert und haben die richtige Dimension", () => {
    const a = pseudoEmbedding("Villa del Balbianello am Comer See");
    const b = pseudoEmbedding("Villa del Balbianello am Comer See");
    expect(a).toEqual(b);
    expect(a).toHaveLength(EMBEDDING_DIM);
    const norm = Math.sqrt(a.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it("ähnliche Texte liegen näher beieinander als unähnliche", () => {
    const villa1 = pseudoEmbedding("Die Villa del Balbianello ist ein Filmdrehort mit Garten");
    const villa2 = pseudoEmbedding("Filmdrehort Villa del Balbianello: der Garten ist berühmt");
    const hike = pseudoEmbedding("Steiler Wanderweg zum Monte Grona mit vielen Höhenmetern");
    expect(cosineSimilarity(villa1, villa2)).toBeGreaterThan(cosineSimilarity(villa1, hike));
  });

  it("erzeugt gültige pgvector-Literale", () => {
    expect(toVectorLiteral([0.5, -1, 2])).toBe("[0.5,-1,2]");
  });
});

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

describe("Kontextualisierung & Ort-Matching", () => {
  it("stellt Region, Quelle und Orte dem Embedding-Text voran", () => {
    const text = contextualChunkText({
      regionName: "Comer See",
      sourceTitle: "Testbuch",
      sourceKind: "book",
      title: "Aperitivo-Tipp",
      content: "Abends ist die Piazza am schönsten.",
      placeLabels: ["Varenna"],
    });
    expect(text).toContain("Comer See");
    expect(text).toContain("Testbuch");
    expect(text).toContain("Varenna");
    expect(text).toContain("Aperitivo-Tipp: Abends ist die Piazza am schönsten.");
  });

  it("chunksForPlace matcht exakt über placeIds und legacy über Namen", () => {
    const exact = makeChunk({ placeIds: ["p1"] });
    const legacy = makeChunk({ placeNames: ["Varenna"] });
    const other = makeChunk({ placeIds: ["p9"], placeNames: ["Bellagio"] });
    expect(chunksForPlace([exact, legacy, other], "p1", "Villa")).toEqual([exact]);
    expect(chunksForPlace([exact, legacy, other], "p2", "Varenna")).toEqual([legacy]);
  });
});

describe("Fragebogen → Suchtext", () => {
  it("verdichtet Interessen, Kinder und Vorlieben zu einem Suchtext", () => {
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
    const text = questionnaireToSearchText(q, "Comer See");
    expect(text).toContain("Wandern");
    expect(text).toContain("Kulinarik");
    expect(text).toContain("Varenna");
    expect(text).toContain("Kind");
    expect(text).toContain("vegetarian");
  });
});
