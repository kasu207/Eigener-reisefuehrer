import { describe, it, expect } from "vitest";
import {
  mergePlaceFields,
  referencesAnyId,
  remapGuideContent,
  remapIdList,
  remapSelection,
  type MergeablePlace,
} from "../src/lib/merge-places";
import type { GuideContent } from "../src/lib/guide-content";

const MAP = new Map([["dup", "keep"]]);

function mergeable(overrides: Partial<MergeablePlace> = {}): MergeablePlace {
  return {
    address: "",
    openingNotes: "",
    editorNotes: "",
    locality: "",
    priceLevel: null,
    tags: [],
    dietaryOptions: [],
    qualityScore: 3,
    mustSee: false,
    childFriendly: true,
    status: "draft",
    lastVerifiedAt: null,
    ...overrides,
  };
}

describe("remapIdList", () => {
  it("schreibt IDs um und entfernt entstehende Dubletten", () => {
    expect(remapIdList(["keep", "dup", "other"], MAP)).toEqual(["keep", "other"]);
  });
});

describe("remapGuideContent", () => {
  function content(entries: { id: string; personalText: string }[]): GuideContent {
    return {
      intro: { title: "Euer Comer See", text: "…" },
      chapters: [
        {
          key: "town-torno",
          kind: "town",
          title: "Torno",
          introText: "…",
          entries: entries.map((e) => ({ ...e, reason: "" })),
        },
      ],
      daySuggestions: [],
      removedIds: ["dup"],
    };
  }

  it("zeigt nach dem Zusammenführen auf den behaltenen Ort", () => {
    const out = remapGuideContent(content([{ id: "dup", personalText: "Text" }]), MAP);
    expect(out.chapters[0].entries[0].id).toBe("keep");
    expect(out.chapters[0].entries[0].personalText).toBe("Text");
  });

  it("führt einen entstehenden Doppel-Eintrag zusammen und behält den Text", () => {
    const out = remapGuideContent(
      content([
        { id: "keep", personalText: "" },
        { id: "dup", personalText: "Gut geschriebener Text" },
      ]),
      MAP
    );
    expect(out.chapters[0].entries).toHaveLength(1);
    expect(out.chapters[0].entries[0].personalText).toBe("Gut geschriebener Text");
  });

  it("schreibt auch entfernte Einträge um", () => {
    const out = remapGuideContent(content([{ id: "keep", personalText: "x" }]), MAP);
    expect(out.removedIds).toEqual(["keep"]);
  });
});

describe("remapSelection", () => {
  it("schreibt alle vier ID-Listen um und lässt den Rest in Ruhe", () => {
    const out = remapSelection(
      {
        placeIds: ["dup", "a"],
        hikeIds: ["h1"],
        restaurantIds: ["dup"],
        practicalIds: [],
        targets: { sights: 5 },
        debug: { days: 4 },
      },
      MAP
    ) as Record<string, unknown>;

    expect(out.placeIds).toEqual(["keep", "a"]);
    expect(out.restaurantIds).toEqual(["keep"]);
    expect(out.targets).toEqual({ sights: 5 });
    expect(out.debug).toEqual({ days: 4 });
  });

  it("verträgt kaputte Auswahl-Daten", () => {
    expect(remapSelection(null, MAP)).toBeNull();
    expect(remapSelection("kaputt", MAP)).toBe("kaputt");
  });
});

describe("referencesAnyId", () => {
  it("erkennt betroffene Datensätze", () => {
    expect(referencesAnyId({ chapters: [{ entries: [{ id: "dup" }] }] }, ["dup"])).toBe(true);
    expect(referencesAnyId({ chapters: [] }, ["dup"])).toBe(false);
    expect(referencesAnyId(null, ["dup"])).toBe(false);
  });
});

describe("mergePlaceFields", () => {
  it("füllt Lücken des behaltenen Eintrags aus der Dublette", () => {
    const out = mergePlaceFields(mergeable({ locality: "Torno" }), [
      mergeable({ address: "Via Plinio 20", priceLevel: 3, locality: "Ignoriert" }),
    ]);
    expect(out.address).toBe("Via Plinio 20");
    expect(out.priceLevel).toBe(3);
    // Gepflegte Werte des behaltenen Eintrags werden NICHT überschrieben
    expect(out.locality).toBe("Torno");
  });

  it("vereinigt Tags und Ernährungsangaben", () => {
    const out = mergePlaceFields(mergeable({ tags: ["see"], dietaryOptions: ["vegetarian"] }), [
      mergeable({ tags: ["see", "aussicht"], dietaryOptions: ["vegan"] }),
    ]);
    expect(out.tags.sort()).toEqual(["aussicht", "see"]);
    expect(out.dietaryOptions.sort()).toEqual(["vegan", "vegetarian"]);
  });

  it("übernimmt den besseren Status, Score und Must-See", () => {
    const verified = new Date("2026-05-01T00:00:00Z");
    const out = mergePlaceFields(mergeable(), [
      mergeable({ status: "verified", qualityScore: 5, mustSee: true, lastVerifiedAt: verified }),
    ]);
    expect(out.status).toBe("verified");
    expect(out.qualityScore).toBe(5);
    expect(out.mustSee).toBe(true);
    expect(out.lastVerifiedAt).toEqual(verified);
  });

  it("behält Kindertauglichkeit nur, wenn ihr niemand widerspricht", () => {
    expect(mergePlaceFields(mergeable(), [mergeable({ childFriendly: false })]).childFriendly).toBe(
      false
    );
    expect(mergePlaceFields(mergeable(), [mergeable()]).childFriendly).toBe(true);
  });

  it("hängt Redaktionsnotizen an, statt sie zu überschreiben", () => {
    const out = mergePlaceFields(mergeable({ editorNotes: "Original" }), [
      mergeable({ editorNotes: "Zusatzwissen" }),
    ]);
    expect(out.editorNotes).toContain("Original");
    expect(out.editorNotes).toContain("Zusatzwissen");
  });

  it("dupliziert eine bereits enthaltene Notiz nicht", () => {
    const out = mergePlaceFields(mergeable({ editorNotes: "Gleiche Notiz" }), [
      mergeable({ editorNotes: "Gleiche Notiz" }),
    ]);
    expect(out.editorNotes).toBe("Gleiche Notiz");
  });
});
