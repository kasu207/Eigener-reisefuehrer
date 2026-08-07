import { describe, it, expect } from "vitest";
import {
  questionnaireSchema,
  questionnaireInputSchema,
  isRealCalendarDate,
  tripDays,
  MAX_TRIP_DAYS,
} from "../src/lib/questionnaire";

function payload(overrides: Record<string, unknown> = {}) {
  return {
    regionSlug: "comer-see",
    dateFrom: "2026-06-01",
    dateTo: "2026-06-07",
    accommodation: { label: "Torno", lat: null, lng: null },
    mobility: ["car", "public"],
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
    firstNames: "Anna & Jonas",
    gdprConsent: true,
    ...overrides,
  };
}

describe("isRealCalendarDate", () => {
  it("erkennt echte Kalendertage", () => {
    expect(isRealCalendarDate("2026-06-01")).toBe(true);
    expect(isRealCalendarDate("2024-02-29")).toBe(true); // Schaltjahr
  });

  it("weist Formfehler und nicht existierende Tage ab", () => {
    expect(isRealCalendarDate("2026-02-31")).toBe(false);
    expect(isRealCalendarDate("2025-02-29")).toBe(false); // kein Schaltjahr
    expect(isRealCalendarDate("2026-13-01")).toBe(false);
    expect(isRealCalendarDate("2026-00-10")).toBe(false);
    expect(isRealCalendarDate("01.06.2026")).toBe(false);
    expect(isRealCalendarDate("")).toBe(false);
  });
});

describe("questionnaireInputSchema (neue Eingaben)", () => {
  it("akzeptiert einen gültigen Fragebogen", () => {
    expect(questionnaireInputSchema.safeParse(payload()).success).toBe(true);
  });

  it("lehnt den 31. Februar ab, statt ihn still auf März zu schieben", () => {
    const res = questionnaireInputSchema.safeParse(payload({ dateFrom: "2026-02-31" }));
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0].message).toMatch(/Kalenderdatum/);
    }
  });

  it("lehnt ein Enddatum vor dem Startdatum ab", () => {
    const res = questionnaireInputSchema.safeParse(
      payload({ dateFrom: "2026-06-10", dateTo: "2026-06-01" })
    );
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0].message).toMatch(/Enddatum/);
    }
  });

  it("erlaubt eine eintägige Reise", () => {
    const res = questionnaireInputSchema.safeParse(
      payload({ dateFrom: "2026-06-01", dateTo: "2026-06-01" })
    );
    expect(res.success).toBe(true);
  });

  it("begrenzt die Reisedauer", () => {
    expect(
      questionnaireInputSchema.safeParse(payload({ dateFrom: "2026-06-01", dateTo: "2026-06-30" }))
        .success
    ).toBe(true); // exakt 30 Tage
    const tooLong = questionnaireInputSchema.safeParse(
      payload({ dateFrom: "2026-06-01", dateTo: "2026-08-01" })
    );
    expect(tooLong.success).toBe(false);
  });
});

describe("questionnaireSchema (gespeicherte Daten)", () => {
  it("bleibt nachsichtig, damit bestehende Guides weiter lesbar sind", () => {
    // Altbestand, der vor der strengeren Eingabeprüfung entstanden sein kann.
    const res = questionnaireSchema.safeParse(payload({ dateFrom: "2026-02-31" }));
    expect(res.success).toBe(true);
  });
});

describe("tripDays", () => {
  const days = (from: string, to: string) =>
    tripDays(questionnaireSchema.parse(payload({ dateFrom: from, dateTo: to })));

  it("zählt An- und Abreisetag mit", () => {
    expect(days("2026-06-01", "2026-06-01")).toBe(1);
    expect(days("2026-06-01", "2026-06-07")).toBe(7);
  });

  it("rechnet über die Sommerzeit-Umstellung hinweg korrekt", () => {
    // In Europa wird in der Nacht auf den 29.03.2026 auf Sommerzeit gestellt.
    expect(days("2026-03-27", "2026-03-30")).toBe(4);
    // ... und Ende Oktober zurück.
    expect(days("2026-10-24", "2026-10-27")).toBe(4);
  });

  it("deckelt bei der maximalen Reisedauer", () => {
    expect(days("2026-01-01", "2026-12-31")).toBe(MAX_TRIP_DAYS);
  });

  it("fällt bei verdrehten Daten auf 1 zurück", () => {
    expect(days("2026-06-10", "2026-06-01")).toBe(1);
  });
});
