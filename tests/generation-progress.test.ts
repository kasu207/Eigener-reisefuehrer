import { describe, it, expect } from "vitest";
import {
  heartbeatAgeSeconds,
  isRunning,
  isStale,
  parsePinnedIds,
  progressLabel,
  progressPercent,
} from "../src/lib/generation-progress";

const now = new Date("2026-08-14T12:00:00Z");
const minutes = (n: number) => new Date(now.getTime() - n * 60_000);
const STALE_MS = 15 * 60_000;

describe("isStale", () => {
  it("meldet einen laufenden Auftrag mit frischem Lebenszeichen nicht als hängend", () => {
    const state = { status: "generating", heartbeatAt: minutes(2), createdAt: minutes(30) };
    expect(isStale(state, now, STALE_MS)).toBe(false);
  });

  it("meldet einen laufenden Auftrag ohne Lebenszeichen seit der Frist als hängend", () => {
    const state = { status: "generating", heartbeatAt: minutes(20), createdAt: minutes(30) };
    expect(isStale(state, now, STALE_MS)).toBe(true);
  });

  it("fällt ohne Lebenszeichen auf die Anlagezeit zurück (Absturz vor dem ersten Kapitel)", () => {
    expect(
      isStale({ status: "generating", heartbeatAt: null, createdAt: minutes(30) }, now, STALE_MS)
    ).toBe(true);
    expect(
      isStale({ status: "generating", heartbeatAt: null, createdAt: minutes(1) }, now, STALE_MS)
    ).toBe(false);
  });

  it("betrifft nur laufende Aufträge – fertige gelten nie als hängend", () => {
    for (const status of ["ready", "failed", "pending"]) {
      expect(isStale({ status, heartbeatAt: minutes(90), createdAt: minutes(90) }, now, STALE_MS)).toBe(
        false
      );
    }
  });
});

describe("isRunning", () => {
  it("umfasst wartende und generierende Aufträge", () => {
    expect(isRunning("pending")).toBe(true);
    expect(isRunning("generating")).toBe(true);
    expect(isRunning("ready")).toBe(false);
    expect(isRunning("failed")).toBe(false);
  });
});

describe("progressPercent", () => {
  it("rechnet Kapitel in Prozent um", () => {
    expect(progressPercent(0, 10)).toBe(0);
    expect(progressPercent(5, 10)).toBe(50);
    expect(progressPercent(10, 10)).toBe(100);
  });

  it("bleibt bei unbekannter Gesamtzahl bei 0 statt NaN", () => {
    expect(progressPercent(3, 0)).toBe(0);
    expect(progressPercent(Number.NaN, 5)).toBe(0);
  });

  it("begrenzt Ausreißer auf 0–100", () => {
    expect(progressPercent(12, 10)).toBe(100);
    expect(progressPercent(-2, 10)).toBe(0);
  });
});

describe("progressLabel", () => {
  it("zeigt das gerade bearbeitete Kapitel", () => {
    expect(progressLabel(2, 9, "Torno")).toBe("Kapitel 3 von 9 · Torno");
  });

  it("kommt ohne Kapitelnamen aus", () => {
    expect(progressLabel(0, 4, "")).toBe("Kapitel 1 von 4");
  });

  it("läuft am Ende nicht über die Gesamtzahl hinaus", () => {
    expect(progressLabel(9, 9, "")).toBe("Kapitel 9 von 9");
  });

  it("meldet einen noch nicht aufgeschlüsselten Auftrag", () => {
    expect(progressLabel(0, 0, "")).toBe("Auswahl wird vorbereitet");
  });
});

describe("heartbeatAgeSeconds", () => {
  it("gibt das Alter in Sekunden zurück", () => {
    expect(heartbeatAgeSeconds(minutes(2), now)).toBe(120);
  });

  it("gibt ohne Lebenszeichen null zurück", () => {
    expect(heartbeatAgeSeconds(null, now)).toBeNull();
  });
});

describe("parsePinnedIds", () => {
  it("liest eine gültige ID-Liste und entfernt Dubletten", () => {
    expect(parsePinnedIds(["a", "b", "a"])).toEqual(["a", "b"]);
  });

  it("verträgt leere und kaputte Werte aus der JSON-Spalte", () => {
    expect(parsePinnedIds(null)).toEqual([]);
    expect(parsePinnedIds({})).toEqual([]);
    expect(parsePinnedIds([1, 2])).toEqual([]);
  });
});
