import { describe, it, expect } from "vitest";
import { cleanName, mapsHref } from "../src/lib/names";
import { parseVideoId } from "../src/lib/youtube/transcript";

describe("cleanName", () => {
  it("entfernt (Beispiel) und Varianten am Ende", () => {
    expect(cleanName("Trattoria im Zentrum (Beispiel)")).toBe("Trattoria im Zentrum");
    expect(cleanName("Villa Carlotta (Platzhalter)")).toBe("Villa Carlotta");
    expect(cleanName("Bar am See (muster)")).toBe("Bar am See");
  });
  it("lässt normale Namen unverändert", () => {
    expect(cleanName("Villa Balbianello")).toBe("Villa Balbianello");
    // "Beispiel" nur als angehängter Klammer-Marker, nicht mitten im Namen
    expect(cleanName("Beispielhaus am See")).toBe("Beispielhaus am See");
  });
});

describe("mapsHref", () => {
  it("baut einen Google-Maps-Suchlink mit kodierter Query", () => {
    expect(mapsHref("Via Regina 2, Como")).toBe(
      "https://www.google.com/maps/search/?api=1&query=Via%20Regina%202%2C%20Como"
    );
  });
});

describe("parseVideoId", () => {
  it("erkennt gängige YouTube-URL-Formen", () => {
    expect(parseVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseVideoId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });
  it("gibt null bei ungültiger Eingabe", () => {
    expect(parseVideoId("https://example.com")).toBeNull();
    expect(parseVideoId("kein-link")).toBeNull();
  });
});
