import { describe, it, expect } from "vitest";
import { modifiersFromAdjustments, describeAdjustments } from "../src/lib/adjustments";
import { matchChunksToQuestionnaire, chunksForPlaceName, type ChunkWithSource } from "../src/lib/knowledge";
import { questionnaireSchema, type Questionnaire } from "../src/lib/questionnaire";

function makeQuestionnaire(overrides: Partial<Questionnaire> = {}): Questionnaire {
  return questionnaireSchema.parse({
    regionSlug: "comer-see",
    dateFrom: "2026-08-01",
    dateTo: "2026-08-07",
    accommodation: { label: "Varenna", lat: null, lng: null },
    mobility: ["car"],
    adults: 2,
    children: [],
    interests: [
      { key: "wandern", weight: "wichtig" },
      { key: "kulinarik", weight: "interessant" },
    ],
    fitnessLevel: "mittel",
    maxHikeDurationMin: 240,
    maxElevationGainM: 800,
    pace: "ausgewogen",
    priceLevel: 3,
    diets: [],
    foodPreferences: [],
    firstNames: "Test",
    email: "test@example.com",
    gdprConsent: true,
    ...overrides,
  });
}

function makeChunk(overrides: Partial<ChunkWithSource> = {}): ChunkWithSource {
  return {
    id: Math.random().toString(36).slice(2),
    documentId: "doc1",
    title: "Notiz",
    content: "Inhalt",
    interests: [],
    placeNames: [],
    createdAt: new Date(),
    document: { title: "Testbuch", kind: "book", url: null },
    ...overrides,
  } as ChunkWithSource;
}

describe("Anpassungswünsche (Nutzer-Feedback)", () => {
  it("'mehr Wandern' erhöht Wander-Ziel und -Gewicht", () => {
    const mods = modifiersFromAdjustments([
      { presets: ["mehr_wandern"], text: "", createdAt: "2026-01-01" },
    ]);
    expect(mods.extraHikes).toBeGreaterThan(0);
    expect(mods.interestBoosts["wandern"]).toBeGreaterThan(0);
  });

  it("'mehr günstige Tipps' aktiviert Budget-Boost und mehr Restaurants", () => {
    const mods = modifiersFromAdjustments([
      { presets: ["mehr_guenstig"], text: "", createdAt: "2026-01-01" },
    ]);
    expect(mods.budgetFoodBoost).toBe(true);
    expect(mods.extraRestaurants).toBeGreaterThan(0);
  });

  it("kumuliert mehrere Anpassungen, zählt Presets aber nur einmal", () => {
    const once = modifiersFromAdjustments([
      { presets: ["mehr_essen"], text: "", createdAt: "2026-01-01" },
    ]);
    const twice = modifiersFromAdjustments([
      { presets: ["mehr_essen"], text: "", createdAt: "2026-01-01" },
      { presets: ["mehr_essen"], text: "mehr davon", createdAt: "2026-01-02" },
    ]);
    expect(twice.extraRestaurants).toBe(once.extraRestaurants);
  });

  it("beschreibt Wünsche für den KI-Prompt inkl. Freitext", () => {
    const text = describeAdjustments([
      { presets: ["mehr_wandern"], text: "Bitte mehr Regentage-Tipps", createdAt: "2026-01-01" },
    ]);
    expect(text).toContain("Mehr Wandern");
    expect(text).toContain("Regentage");
  });
});

describe("Wissensdatenbank-Matching", () => {
  it("wählt Notizen mit Interessen-Überschneidung, gewichtet 'wichtig' höher", () => {
    const q = makeQuestionnaire();
    const hiking = makeChunk({ id: "a", interests: ["wandern"] });
    const food = makeChunk({ id: "b", interests: ["kulinarik"] });
    const unrelated = makeChunk({ id: "c", interests: ["entspannung"] });
    const matched = matchChunksToQuestionnaire([unrelated, food, hiking], q, 2);
    expect(matched.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("ordnet Notizen über Ortsnamen konkreten Einträgen zu", () => {
    const chunk = makeChunk({ placeNames: ["Varenna"] });
    expect(chunksForPlaceName([chunk], "Varenna")).toHaveLength(1);
    expect(chunksForPlaceName([chunk], "Bellagio")).toHaveLength(0);
  });
});
