import { describe, it, expect } from "vitest";
import {
  findDuplicateGroups,
  nameSimilarity,
  normalizeName,
  pairKey,
  ratePair,
  significantTokens,
  type DuplicateCandidate,
} from "../src/lib/duplicates";

function place(overrides: Partial<DuplicateCandidate> = {}): DuplicateCandidate {
  return {
    id: Math.random().toString(36).slice(2),
    regionId: "comer",
    name: "Testort",
    locality: "Torno",
    lat: 45.97,
    lng: 9.14,
    ...overrides,
  };
}

describe("normalizeName", () => {
  it("vereinheitlicht Groß-/Kleinschreibung, Akzente und Satzzeichen", () => {
    expect(normalizeName("Caffè  del  Pòrto!")).toBe("caffe del porto");
  });
});

describe("significantTokens", () => {
  it("wirft Gattungsbegriffe und Artikel weg", () => {
    expect(significantTokens("Ristorante Il Vapore")).toEqual(["vapore"]);
  });

  it("fällt auf alle Wörter zurück, wenn sonst nichts übrig bliebe", () => {
    expect(significantTokens("Il Bar")).toEqual(["il", "bar"]);
  });
});

describe("nameSimilarity", () => {
  it("erkennt denselben Ort trotz Gattungsbegriff", () => {
    expect(nameSimilarity("Ristorante Vapore", "Vapore")).toBe(1);
    expect(nameSimilarity("Hotel Bellavista", "Bellavista")).toBe(1);
  });

  it("verträgt Tippfehler", () => {
    expect(nameSimilarity("Villa Balbianello", "Villa Balbianelo")).toBeGreaterThan(0.85);
  });

  it("hält verschiedene Orte auseinander", () => {
    expect(nameSimilarity("Villa Carlotta", "Villa Melzi")).toBeLessThan(0.65);
  });
});

describe("ratePair", () => {
  it("meldet gleichen Namen im selben Ort als sicher", () => {
    const a = place({ id: "a", name: "Bar Centrale" });
    const b = place({ id: "b", name: "bar centrale", lat: 45.9701, lng: 9.1401 });
    expect(ratePair(a, b)?.confidence).toBe("sicher");
  });

  it("meldet sehr ähnliche Namen in der Nähe als wahrscheinlich", () => {
    const a = place({ id: "a", name: "Ristorante Vapore" });
    const b = place({ id: "b", name: "Vapore Torno", lat: 45.9705, lng: 9.1405 });
    expect(ratePair(a, b)?.confidence).toBe("wahrscheinlich");
  });

  it("verbindet keine Orte aus verschiedenen Regionen", () => {
    const a = place({ id: "a", name: "Bar Centrale", regionId: "comer" });
    const b = place({ id: "b", name: "Bar Centrale", regionId: "garda" });
    expect(ratePair(a, b)).toBeNull();
  });

  it("meldet gleichnamige Orte in verschiedenen Dörfern nicht als Dublette", () => {
    // "Bar Centrale" gibt es an jedem See mehrfach – 12 km auseinander,
    // verschiedene Orte: das ist keine Dublette.
    const a = place({ id: "a", name: "Bar Centrale", locality: "Torno" });
    const b = place({
      id: "b",
      name: "Bar Centrale",
      locality: "Bellagio",
      lat: 45.98,
      lng: 9.26,
    });
    expect(ratePair(a, b)).toBeNull();
  });

  it("vermischt redaktionellen Bestand und private Nutzer-Ergänzungen nicht", () => {
    // Ein privater Tipp darf nicht mit einem geprüften Ort zusammengeführt
    // werden – er würde sonst im allgemeinen Bestand landen und in fremden
    // Guides auftauchen.
    const editorial = place({ id: "a", name: "Bar Centrale", addedByRequestId: null });
    const priv = place({ id: "b", name: "Bar Centrale", addedByRequestId: "req-1" });
    expect(ratePair(editorial, priv)).toBeNull();

    // Zwei private Tipps DESSELBEN Guides dürfen zusammengeführt werden
    const priv2 = place({ id: "c", name: "Bar Centrale", addedByRequestId: "req-1" });
    expect(ratePair(priv, priv2)?.confidence).toBe("sicher");

    // Zwei private Tipps VERSCHIEDENER Guides nicht
    const otherGuide = place({ id: "d", name: "Bar Centrale", addedByRequestId: "req-2" });
    expect(ratePair(priv, otherGuide)).toBeNull();
  });

  it("meldet unähnliche Namen auch bei gleicher Adresse nicht", () => {
    const a = place({ id: "a", name: "Villa Carlotta" });
    const b = place({ id: "b", name: "Gelateria Pinguino" });
    expect(ratePair(a, b)).toBeNull();
  });
});

describe("findDuplicateGroups", () => {
  it("fasst zusammenhängende Dubletten zu einer Gruppe zusammen", () => {
    const groups = findDuplicateGroups([
      place({ id: "a", name: "Ristorante Vapore" }),
      place({ id: "b", name: "Vapore" }),
      place({ id: "c", name: "Il Vapore" }),
      place({ id: "d", name: "Gelateria Pinguino" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].ids.sort()).toEqual(["a", "b", "c"]);
    expect(groups[0].ids).not.toContain("d");
  });

  it("sortiert sichere Treffer nach oben", () => {
    const groups = findDuplicateGroups([
      place({ id: "a", name: "Trattoria Sole" }),
      place({ id: "b", name: "Trattoria Sole Alta", lat: 45.9705, lng: 9.1405 }),
      place({ id: "c", name: "Villa Monastero" }),
      place({ id: "d", name: "villa monastero" }),
    ]);
    expect(groups[0].confidence).toBe("sicher");
    expect(groups[0].ids.sort()).toEqual(["c", "d"]);
  });

  it("überspringt als 'kein Duplikat' markierte Paare", () => {
    const candidates = [
      place({ id: "a", name: "Villa Monastero" }),
      place({ id: "b", name: "villa monastero" }),
    ];
    expect(findDuplicateGroups(candidates)).toHaveLength(1);
    expect(findDuplicateGroups(candidates, new Set([pairKey("a", "b")]))).toHaveLength(0);
  });

  it("liefert für eine dublettenfreie Liste nichts", () => {
    const groups = findDuplicateGroups([
      place({ id: "a", name: "Villa Carlotta" }),
      place({ id: "b", name: "Gelateria Pinguino" }),
      place({ id: "c", name: "Punta Spartivento" }),
    ]);
    expect(groups).toEqual([]);
  });
});

describe("pairKey", () => {
  it("ist richtungsunabhängig", () => {
    expect(pairKey("b", "a")).toBe(pairKey("a", "b"));
  });
});
