import { describe, it, expect } from "vitest";
import {
  normalizeLocalityText,
  localityMatchesLabel,
  resolveCanonicalLocality,
} from "../src/lib/areas";

describe("localityMatchesLabel", () => {
  it("matched exakt gleiche Namen (Groß-/Kleinschreibung egal)", () => {
    expect(localityMatchesLabel("Torno", "torno")).toBe(true);
    expect(localityMatchesLabel("Torno", "TORNO")).toBe(true);
  });

  it("matcht Adressen und Freitext, die den Ortsnamen enthalten", () => {
    // Das Fragebogen-Feld heißt ausdrücklich "Ort ODER Adresse"
    expect(localityMatchesLabel("Torno", "Via Plinio 20, Torno")).toBe(true);
    expect(localityMatchesLabel("Torno", "Torno, Comer See")).toBe(true);
    expect(localityMatchesLabel("Torno", "Ferienwohnung in Torno (Seeblick)")).toBe(true);
  });

  it("ignoriert Whitespace und Akzente", () => {
    expect(localityMatchesLabel("  Torno  ", "torno")).toBe(true);
    expect(localityMatchesLabel("Cernóbbio", "Cernobbio")).toBe(true);
  });

  it("matcht NICHT als Teilstring in einem anderen Wort (Wortgrenzen)", () => {
    expect(localityMatchesLabel("Torno", "Tornoletta")).toBe(false);
    expect(localityMatchesLabel("Como", "Comer See")).toBe(false);
  });

  it("liefert false bei leeren Eingaben", () => {
    expect(localityMatchesLabel("", "Torno")).toBe(false);
    expect(localityMatchesLabel("Torno", "")).toBe(false);
  });

  it("matcht Bindestrich-getrennte Ortsangaben", () => {
    expect(localityMatchesLabel("Torno", "Cadenabbia-Torno")).toBe(true);
  });
});

describe("normalizeLocalityText", () => {
  it("trimmt, kleinschreibt und entfernt Akzente", () => {
    expect(normalizeLocalityText("  Cernóbbio ")).toBe("cernobbio");
  });
});

describe("resolveCanonicalLocality", () => {
  it("findet den kanonischen Namen unter bestehenden Orten", () => {
    expect(resolveCanonicalLocality(["Torno", "Bellagio"], "Via Plinio 20, Torno")).toBe(
      "Torno"
    );
  });

  it("fällt auf das getrimmte Label zurück, wenn nichts passt", () => {
    expect(resolveCanonicalLocality(["Bellagio"], "  Neuer Ort  ")).toBe("Neuer Ort");
  });
});
