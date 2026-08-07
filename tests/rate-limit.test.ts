import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  checkRateLimit,
  rateLimit,
  resetRateLimits,
  rateLimitKeyCount,
} from "../src/lib/rate-limit";

beforeEach(() => {
  resetRateLimits();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("checkRateLimit", () => {
  it("erlaubt bis zum Limit und blockt danach", () => {
    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit("a", 3, 60_000).ok).toBe(true);
    }
    expect(checkRateLimit("a", 3, 60_000).ok).toBe(false);
  });

  it("zählt Schlüssel getrennt", () => {
    expect(checkRateLimit("a", 1, 60_000).ok).toBe(true);
    expect(checkRateLimit("a", 1, 60_000).ok).toBe(false);
    expect(checkRateLimit("b", 1, 60_000).ok).toBe(true);
  });

  it("meldet die verbleibenden Anfragen", () => {
    expect(checkRateLimit("a", 3, 60_000).remaining).toBe(2);
    expect(checkRateLimit("a", 3, 60_000).remaining).toBe(1);
    expect(checkRateLimit("a", 3, 60_000).remaining).toBe(0);
  });

  it("nennt die Wartezeit bis zum nächsten freien Slot", () => {
    checkRateLimit("a", 1, 60_000);
    const blocked = checkRateLimit("a", 1, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBe(60_000);

    vi.advanceTimersByTime(45_000);
    expect(checkRateLimit("a", 1, 60_000).retryAfterMs).toBe(15_000);
  });

  it("gibt nach Ablauf des Fensters wieder frei", () => {
    expect(checkRateLimit("a", 1, 60_000).ok).toBe(true);
    expect(checkRateLimit("a", 1, 60_000).ok).toBe(false);
    vi.advanceTimersByTime(60_001);
    expect(checkRateLimit("a", 1, 60_000).ok).toBe(true);
  });
});

describe("Aufräumen", () => {
  it("entfernt abgelaufene Schlüssel, statt unbegrenzt zu wachsen", () => {
    for (let i = 0; i < 500; i++) {
      checkRateLimit(`ip-${i}`, 5, 60_000);
    }
    expect(rateLimitKeyCount()).toBe(500);

    // Alle Fenster sind abgelaufen; der nächste Aufruf nach dem
    // Sweep-Intervall muss die Altlasten abräumen.
    vi.advanceTimersByTime(6 * 60 * 1000);
    checkRateLimit("neu", 5, 60_000);

    expect(rateLimitKeyCount()).toBe(1);
  });

  it("räumt noch aktive Fenster NICHT ab", () => {
    checkRateLimit("aktiv", 1, 60 * 60 * 1000);
    vi.advanceTimersByTime(6 * 60 * 1000);
    checkRateLimit("neu", 5, 60_000);

    // "aktiv" läuft noch eine Stunde – das Limit muss erhalten bleiben.
    expect(checkRateLimit("aktiv", 1, 60 * 60 * 1000).ok).toBe(false);
  });
});

describe("rateLimit (Kurzform)", () => {
  it("verhält sich wie checkRateLimit().ok", () => {
    expect(rateLimit("k", 2, 60_000)).toBe(true);
    expect(rateLimit("k", 2, 60_000)).toBe(true);
    expect(rateLimit("k", 2, 60_000)).toBe(false);
  });
});
