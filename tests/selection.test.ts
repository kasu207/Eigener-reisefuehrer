import { describe, it, expect } from "vitest";
import {
  selectContent,
  applyPinnedEntries,
  hikePassesHardFilters,
  restaurantPassesHardFilters,
  placePassesHardFilters,
  computeTargets,
  type SelectablePlace,
  type SelectableHike,
} from "../src/lib/selection";
import { questionnaireSchema, type Questionnaire } from "../src/lib/questionnaire";
import { validateContentAgainstSelection, type GuideContent } from "../src/lib/guide-content";

function makeQuestionnaire(overrides: Partial<Questionnaire> = {}): Questionnaire {
  return questionnaireSchema.parse({
    regionSlug: "comer-see",
    dateFrom: "2026-08-01",
    dateTo: "2026-08-07",
    accommodation: { label: "Varenna", lat: 46.0106, lng: 9.2833 },
    mobility: ["car"],
    adults: 2,
    children: [],
    occasion: "",
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
    foodPreferences: ["regional_traditionell"],
    firstNames: "Anna & Jonas",
    email: "test@example.com",
    gdprConsent: true,
    ...overrides,
  });
}

function makePlace(overrides: Partial<SelectablePlace> = {}): SelectablePlace {
  return {
    id: Math.random().toString(36).slice(2),
    type: "sight",
    name: "Testort",
    lat: 46.0,
    lng: 9.26,
    tags: [],
    priceLevel: null,
    childFriendly: true,
    access: "public",
    dietaryOptions: [],
    qualityScore: 3,
    ...overrides,
  };
}

function makeHike(overrides: Partial<SelectableHike> = {}): SelectableHike {
  return {
    id: Math.random().toString(36).slice(2),
    name: "Testwanderung",
    startLat: 46.0,
    startLng: 9.26,
    distanceKm: 8,
    durationMin: 180,
    elevationGainM: 400,
    difficulty: "medium",
    childFriendly: true,
    tags: [],
    ...overrides,
  };
}

describe("harte Filter", () => {
  it("filtert Wanderungen über der maximalen Dauer", () => {
    const q = makeQuestionnaire({ maxHikeDurationMin: 120 });
    expect(hikePassesHardFilters(makeHike({ durationMin: 300 }), q)).toBe(false);
    expect(hikePassesHardFilters(makeHike({ durationMin: 90 }), q)).toBe(true);
  });

  it("filtert Wanderungen über der Höhenmeter-Toleranz", () => {
    const q = makeQuestionnaire({ maxElevationGainM: 500 });
    expect(hikePassesHardFilters(makeHike({ elevationGainM: 900 }), q)).toBe(false);
  });

  it("filtert schwere Wanderungen bei niedrigem Fitness-Level", () => {
    const q = makeQuestionnaire({ fitnessLevel: "niedrig" });
    expect(hikePassesHardFilters(makeHike({ difficulty: "hard" }), q)).toBe(false);
    expect(hikePassesHardFilters(makeHike({ difficulty: "easy" }), q)).toBe(true);
  });

  it("filtert nicht-kindertaugliche Einträge bei kleinen Kindern", () => {
    const q = makeQuestionnaire({ children: [{ ageGroup: "0-3" }] });
    expect(placePassesHardFilters(makePlace({ childFriendly: false }), q)).toBe(false);
    expect(hikePassesHardFilters(makeHike({ childFriendly: false }), q)).toBe(false);
  });

  it("schließt Auto-Ziele nur bei reiner Fuß-/Rad-Mobilität aus", () => {
    // Verkehrsmittel sind bewusst nicht restriktiv (mehrere Optionen möglich).
    const onlyFoot = makeQuestionnaire({ mobility: ["foot"] });
    expect(placePassesHardFilters(makePlace({ access: "car" }), onlyFoot)).toBe(false);
    expect(placePassesHardFilters(makePlace({ access: "public" }), onlyFoot)).toBe(true);

    // ÖPNV allein schließt Auto-Ziele NICHT aus (nur im Text erwähnt).
    const publicOnly = makeQuestionnaire({ mobility: ["public"] });
    expect(placePassesHardFilters(makePlace({ access: "car" }), publicOnly)).toBe(true);

    // Mehrere Verkehrsmittel: alles erreichbar.
    const multi = makeQuestionnaire({ mobility: ["car", "public"] });
    expect(placePassesHardFilters(makePlace({ access: "car" }), multi)).toBe(true);
  });

  it("respektiert Ernährungsweisen bei Restaurants (harte Kriterien)", () => {
    const q = makeQuestionnaire({ diets: ["vegan"] });
    expect(
      restaurantPassesHardFilters(
        makePlace({ type: "restaurant", dietaryOptions: ["vegetarian"] }),
        q
      )
    ).toBe(false);
    expect(
      restaurantPassesHardFilters(
        makePlace({ type: "restaurant", dietaryOptions: ["vegetarian", "vegan"] }),
        q
      )
    ).toBe(true);
  });

  it("respektiert das Preisniveau bei Restaurants", () => {
    const q = makeQuestionnaire({ priceLevel: 2 });
    expect(restaurantPassesHardFilters(makePlace({ type: "restaurant", priceLevel: 4 }), q)).toBe(false);
    expect(restaurantPassesHardFilters(makePlace({ type: "restaurant", priceLevel: 2 }), q)).toBe(true);
  });
});

describe("Zielmengen je Bereich (4.2)", () => {
  it("Essen-Standard: wenige gehobene, mehr mittlere/günstige", () => {
    const t = computeTargets(makeQuestionnaire());
    expect(t.foodFancy).toBeLessThanOrEqual(2);
    expect(t.foodBudget).toBeGreaterThan(t.foodFancy);
    expect(t.foodMid).toBeGreaterThan(t.foodFancy);
    expect(t.sights).toBeGreaterThan(0);
    expect(t.hotels).toBeGreaterThan(0);
  });

  it("Pro-Bereich-Feintuning erhöht/senkt gezielt", () => {
    const base = computeTargets(makeQuestionnaire());
    const more = computeTargets(makeQuestionnaire(), undefined, { hikes: 3, foodBudget: 4 });
    expect(more.hikes).toBe(base.hikes + 3);
    expect(more.foodBudget).toBe(base.foodBudget + 4);
    expect(more.sights).toBe(base.sights); // andere Bereiche unverändert
  });

  it("skaliert mit dem Reisetempo", () => {
    const relaxed = computeTargets(makeQuestionnaire({ pace: "entspannt" }));
    const packed = computeTargets(makeQuestionnaire({ pace: "vollgepackt" }));
    expect(packed.sights).toBeGreaterThanOrEqual(relaxed.sights);
  });
});

describe("selectContent", () => {
  it("ist deterministisch und bevorzugt passende Tags", () => {
    const q = makeQuestionnaire({
      interests: [{ key: "seen_baden", weight: "wichtig" }],
    });
    const beach = makePlace({ id: "beach", type: "beach", tags: ["baden", "lido"], qualityScore: 3 });
    const boring = makePlace({ id: "boring", type: "sight", tags: [], qualityScore: 3 });
    const places = [beach, boring];

    const s1 = selectContent(places, [], q);
    const s2 = selectContent(places, [], q);
    expect(s1.placeIds).toEqual(s2.placeIds);
    expect(s1.placeIds[0]).toBe("beach");
  });

  it("nimmt Must-See-Orte immer auf, auch wenn sie sonst nicht gewählt würden", () => {
    const q = makeQuestionnaire();
    // Ein unattraktiver Ort ohne Tags, der normal nicht bevorzugt würde
    const mustSee = makePlace({ id: "must", type: "sight", tags: [], qualityScore: 1, mustSee: true });
    const restMust = makePlace({
      id: "rmust",
      type: "restaurant",
      priceLevel: 2,
      qualityScore: 1,
      mustSee: true,
    });
    const s = selectContent([mustSee, restMust], [], q);
    expect(s.placeIds).toContain("must");
    expect(s.restaurantIds).toContain("rmust");
  });

  it("erzeugt keine Dubletten bei Must-See, die ohnehin gewählt würden", () => {
    const q = makeQuestionnaire();
    const p = makePlace({ id: "p", type: "sight", tags: ["kultur"], qualityScore: 5, mustSee: true });
    const s = selectContent([p], [], q);
    expect(s.placeIds.filter((id) => id === "p")).toHaveLength(1);
  });

  it("trennt Restaurants, Orte und Praktisches", () => {
    const q = makeQuestionnaire();
    const places = [
      makePlace({ id: "p1", type: "village" }),
      makePlace({ id: "r1", type: "restaurant", priceLevel: 2 }),
      makePlace({ id: "x1", type: "practical" }),
    ];
    const s = selectContent(places, [makeHike({ id: "h1" })], q);
    expect(s.placeIds).toContain("p1");
    expect(s.restaurantIds).toContain("r1");
    expect(s.practicalIds).toContain("x1");
    expect(s.placeIds).not.toContain("r1");
    expect(s.hikeIds).toContain("h1");
  });
});

describe("Faktentreue-Prüfung (Anforderung 8)", () => {
  it("erkennt Einträge ohne DB-Beleg", () => {
    const q = makeQuestionnaire();
    const s = selectContent([makePlace({ id: "p1", type: "village" })], [], q);
    const content: GuideContent = {
      intro: { title: "t", text: "t" },
      daySuggestions: [],
      chapters: [
        {
          key: "area-1",
          kind: "places",
          title: "Kapitel",
          introText: "",
          entries: [
            { id: "p1", personalText: "ok", reason: "Weil ..." },
            { id: "erfunden", personalText: "nicht ok", reason: "" },
          ],
        },
      ],
      removedIds: [],
    };
    const check = validateContentAgainstSelection(content, s);
    expect(check.ok).toBe(false);
    expect(check.unknownIds).toEqual(["erfunden"]);
  });
});

describe("gesetzte Einträge (❤️ In den Guide)", () => {
  it("nimmt einen frisch recherchierten Ort auf, obwohl er die harten Filter reißt", () => {
    // Genau der Fall aus der Praxis: Ein per "+"-Recherche angelegtes
    // Restaurant hat noch keine Ernährungsangaben und fiele bei gewählter
    // vegetarischer Ernährung durch den harten Filter – der Nutzer hat es
    // aber selbst ausgewählt.
    const q = makeQuestionnaire({ diets: ["vegetarian"] });
    const fresh = makePlace({ id: "fresh", type: "restaurant", priceLevel: 2, dietaryOptions: [] });
    expect(restaurantPassesHardFilters(fresh, q)).toBe(false);

    const selection = selectContent([fresh], [], q);
    expect(selection.restaurantIds).not.toContain("fresh");

    applyPinnedEntries(selection, new Set(["fresh"]), [fresh], []);
    expect(selection.restaurantIds).toContain("fresh");
  });

  it("sticht das Scoring: der gesetzte Ort kommt zusätzlich zu den bestbewerteten", () => {
    const q = makeQuestionnaire();
    const strong = makePlace({ id: "strong", qualityScore: 5, tags: ["kultur", "aussicht"] });
    const weak = makePlace({ id: "weak", qualityScore: 1 });

    const selection = selectContent([strong, weak], [], q);
    applyPinnedEntries(selection, new Set(["weak"]), [strong, weak], []);

    expect(selection.placeIds).toContain("weak");
    expect(selection.placeIds).toContain("strong");
  });

  it("sortiert nach Art: Bars zu Gastro, Praktisches zu Praktischem, Wanderungen zu Wanderungen", () => {
    const q = makeQuestionnaire();
    const bar = makePlace({ id: "bar", type: "bar" });
    const practical = makePlace({ id: "practical", type: "practical" });
    const hike = makeHike({ id: "hike", durationMin: 9999, elevationGainM: 9999 });

    const selection = selectContent([], [], q);
    applyPinnedEntries(selection, new Set(["bar", "practical", "hike"]), [bar, practical], [hike]);

    expect(selection.restaurantIds).toContain("bar");
    expect(selection.practicalIds).toContain("practical");
    expect(selection.hikeIds).toContain("hike");
    expect(selection.placeIds).not.toContain("bar");
  });

  it("legt bereits ausgewählte Einträge nicht doppelt ab", () => {
    const q = makeQuestionnaire();
    const p = makePlace({ id: "dup", qualityScore: 5 });
    const selection = selectContent([p], [], q);

    applyPinnedEntries(selection, new Set(["dup"]), [p], []);
    applyPinnedEntries(selection, new Set(["dup"]), [p], []);

    expect(selection.placeIds.filter((id) => id === "dup")).toHaveLength(1);
  });

  it("lässt die Auswahl unverändert, wenn nichts gesetzt ist", () => {
    const q = makeQuestionnaire();
    const p = makePlace({ id: "a" });
    const selection = selectContent([p], [], q);
    const before = JSON.stringify(selection);

    applyPinnedEntries(selection, new Set(), [p], []);
    expect(JSON.stringify(selection)).toBe(before);
  });

  it("bleibt für den Faktentreue-Check gültig", () => {
    const q = makeQuestionnaire({ diets: ["vegan"] });
    const fresh = makePlace({ id: "fresh", type: "restaurant", dietaryOptions: [] });
    const selection = selectContent([fresh], [], q);
    applyPinnedEntries(selection, new Set(["fresh"]), [fresh], []);

    const content: GuideContent = {
      intro: { title: "Euer Comer See", text: "…" },
      chapters: [
        {
          key: "town-torno",
          kind: "town",
          title: "Torno",
          introText: "…",
          entries: [{ id: "fresh", personalText: "…", reason: "…" }],
        },
      ],
      daySuggestions: [],
      removedIds: [],
    };
    expect(validateContentAgainstSelection(content, selection).ok).toBe(true);
  });
});

describe("Tagesausflüge", () => {
  it("wählt Tagesausflüge aus und legt sie zu den Orten", () => {
    const q = makeQuestionnaire();
    const trip = makePlace({ id: "trip", type: "daytrip", name: "Bergamo" });
    const selection = selectContent([trip], [], q);
    expect(selection.placeIds).toContain("trip");
  });

  it("skaliert die Menge mit der Reisedauer, aber bleibt sparsam", () => {
    // Ein Tagesausflug will geplant werden – nicht jeder Tag ist einer.
    const kurz = computeTargets(makeQuestionnaire({ dateFrom: "2026-08-01", dateTo: "2026-08-03" }));
    const lang = computeTargets(makeQuestionnaire({ dateFrom: "2026-08-01", dateTo: "2026-08-21" }));
    expect(kurz.daytrips).toBeGreaterThanOrEqual(1);
    expect(lang.daytrips).toBeGreaterThan(kurz.daytrips);
    expect(lang.daytrips).toBeLessThanOrEqual(6);
  });

  it("respektiert das Pro-Bereich-Feintuning", () => {
    const q = makeQuestionnaire();
    const ohne = computeTargets(q);
    const mehr = computeTargets(q, undefined, { daytrips: 3 });
    expect(mehr.daytrips).toBe(ohne.daytrips + 3);
  });

  it("hält die harten Filter ein", () => {
    // Kleine Kinder + nicht kindertauglich = raus, wie bei jedem anderen Typ
    const q = makeQuestionnaire({ children: [{ ageGroup: "0-3" }] });
    const trip = makePlace({ id: "trip", type: "daytrip", childFriendly: false });
    expect(selectContent([trip], [], q).placeIds).not.toContain("trip");
  });

  it("nimmt Must-See-Tagesausflüge unabhängig von der Zielmenge auf", () => {
    const q = makeQuestionnaire();
    const trips = Array.from({ length: 12 }, (_, i) =>
      makePlace({ id: `t${i}`, type: "daytrip", qualityScore: 5 })
    );
    const pflicht = makePlace({ id: "pflicht", type: "daytrip", qualityScore: 1, mustSee: true });
    const selection = selectContent([...trips, pflicht], [], q);
    expect(selection.placeIds).toContain("pflicht");
  });
});
