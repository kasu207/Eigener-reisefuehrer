import { describe, it, expect } from "vitest";
import { downloadFileName } from "../src/lib/filename";

describe("downloadFileName", () => {
  it("bildet einen sprechenden Namen", () => {
    expect(downloadFileName("Euer Comer See", "pdf", "reisefuehrer")).toBe("Euer-Comer-See.pdf");
  });

  it("reduziert Umlaute und ß auf ASCII", () => {
    expect(downloadFileName("Über Straßen & Gärten", "pdf", "x")).toBe("Uber-Strassen-Garten.pdf");
  });

  it("fällt bei leerem oder rein nicht-lateinischem Titel zurück", () => {
    expect(downloadFileName("", "pdf", "reisefuehrer")).toBe("reisefuehrer.pdf");
    expect(downloadFileName("   ", "pdf", "reisefuehrer")).toBe("reisefuehrer.pdf");
    expect(downloadFileName("🏔️🌊", "pdf", "reisefuehrer")).toBe("reisefuehrer.pdf");
    expect(downloadFileName("привет", "md", "guide")).toBe("guide.md");
  });

  it("lässt keine Zeichen durch, die den Header sprengen könnten", () => {
    const name = downloadFileName('a"b/c\\d;e\nf', "pdf", "x");
    expect(name).toBe("a-b-c-d-e-f.pdf");
    expect(name).toMatch(/^[a-zA-Z0-9-]+\.pdf$/);
  });

  it("kürzt lange Titel ohne Bindestrich am Ende", () => {
    const name = downloadFileName("Wort ".repeat(40), "pdf", "x");
    expect(name.length).toBeLessThanOrEqual(64);
    expect(name).not.toMatch(/-\.pdf$/);
  });
});
