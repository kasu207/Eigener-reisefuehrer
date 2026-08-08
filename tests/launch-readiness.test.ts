import { describe, it, expect } from "vitest";
import {
  evaluateReadiness,
  readinessVerdict,
  MIN_STOCK,
  type ReadinessInput,
} from "../src/lib/launch-readiness";

/** Ein Betrieb, bei dem alles stimmt – Basis für gezielte Abweichungen. */
function healthy(over: Partial<ReadinessInput> = {}): ReadinessInput {
  return {
    stock: { ...MIN_STOCK },
    missingOperatorFields: [],
    aiIsMock: false,
    hasApiKey: true,
    stalePendingRequests: 0,
    failedRequests: 0,
    hasAppUrl: true,
    adminPasswordIsWeak: false,
    ...over,
  };
}

const find = (checks: ReturnType<typeof evaluateReadiness>, id: string) =>
  checks.find((c) => c.id === id)!;

describe("evaluateReadiness", () => {
  it("meldet einen gesunden Betrieb als verkaufsfähig", () => {
    const v = readinessVerdict(evaluateReadiness(healthy()));
    expect(v.sellable).toBe(true);
    expect(v.blockers).toBe(0);
  });

  it("blockt bei unvollständigem Impressum", () => {
    const checks = evaluateReadiness(healthy({ missingOperatorFields: ["Name / Firma"] }));
    expect(find(checks, "impressum").level).toBe("blocker");
    expect(readinessVerdict(checks).sellable).toBe(false);
  });

  it("blockt den Mock-Modus – Kunden bekämen Blindtexte", () => {
    const checks = evaluateReadiness(healthy({ aiIsMock: true }));
    expect(find(checks, "ai-mode").level).toBe("blocker");
  });

  it("blockt live ohne API-Schlüssel", () => {
    const checks = evaluateReadiness(healthy({ aiIsMock: false, hasApiKey: false }));
    expect(find(checks, "ai-mode").level).toBe("blocker");
  });

  it("blockt, wenn das Rückgrat des Guides fehlt (Sehen/Essen)", () => {
    const checks = evaluateReadiness(
      healthy({ stock: { ...MIN_STOCK, sights: 5 } })
    );
    expect(find(checks, "bestand").level).toBe("blocker");
    expect(find(checks, "bestand").detail).toContain("5 von 25");
  });

  it("warnt nur, wenn ein Randbereich dünn ist", () => {
    const checks = evaluateReadiness(healthy({ stock: { ...MIN_STOCK, bars: 1 } }));
    expect(find(checks, "bestand").level).toBe("warnung");
    expect(readinessVerdict(checks).sellable).toBe(true);
  });

  it("blockt einen stehenden Worker", () => {
    const checks = evaluateReadiness(healthy({ stalePendingRequests: 3 }));
    expect(find(checks, "worker").level).toBe("blocker");
  });

  it("blockt ein schwaches Admin-Passwort", () => {
    const checks = evaluateReadiness(healthy({ adminPasswordIsWeak: true }));
    expect(find(checks, "admin-pw").level).toBe("blocker");
  });

  it("warnt bei fehlgeschlagenen Generierungen und fehlender APP_URL", () => {
    const checks = evaluateReadiness(healthy({ failedRequests: 2, hasAppUrl: false }));
    expect(find(checks, "failed").level).toBe("warnung");
    expect(find(checks, "app-url").level).toBe("warnung");
    expect(readinessVerdict(checks).sellable).toBe(true);
  });

  it("zählt mehrere Blocker zusammen", () => {
    const v = readinessVerdict(
      evaluateReadiness(
        healthy({ aiIsMock: true, missingOperatorFields: ["E-Mail"], adminPasswordIsWeak: true })
      )
    );
    expect(v.blockers).toBe(3);
    expect(v.sellable).toBe(false);
  });
});
