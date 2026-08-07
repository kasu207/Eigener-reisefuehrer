import { describe, it, expect } from "vitest";
import { placeScopeFilter, editorialOnlyFilter } from "../src/lib/place-scope";

describe("placeScopeFilter", () => {
  it("lässt den redaktionellen Bestand und die eigenen Ergänzungen zu", () => {
    expect(placeScopeFilter("req-1")).toEqual({
      OR: [{ addedByRequestId: null }, { addedByRequestId: "req-1" }],
    });
  });

  it("bindet Nutzer-Ergänzungen an genau einen Guide", () => {
    // Regression: Ohne diese Bindung landete der private Tipp von Kundin A
    // im Reiseführer von Kunde B, weil die Generierung ALLE verifizierten
    // Orte der Region lädt.
    const mine = placeScopeFilter("req-A").OR.map((c) => c.addedByRequestId);
    expect(mine).toContain(null); // redaktionell geprüfter Bestand
    expect(mine).toContain("req-A");
    expect(mine).not.toContain("req-B");
  });

  it("kennt einen Filter für ausschließlich redaktionelle Orte", () => {
    expect(editorialOnlyFilter).toEqual({ addedByRequestId: null });
  });
});
