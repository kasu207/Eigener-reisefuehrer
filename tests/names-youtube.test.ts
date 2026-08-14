import { describe, it, expect } from "vitest";
import { cleanName, mapsHref, placeMapsHref } from "../src/lib/names";
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

describe("placeMapsHref", () => {
  const CENTER = { lat: 45.98, lng: 9.26 };

  it("verlinkt auf die Koordinaten, wenn sie gesetzt sind", () => {
    // Der eigentliche Punkt: Eine Google-Suche nach „Trattoria Vapore, Torno"
    // findet das Lokal oft NICHT – die Koordinaten treffen immer.
    const url = placeMapsHref({
      name: "Trattoria Vapore",
      locality: "Torno",
      lat: 45.9712,
      lng: 9.1391,
      regionCenter: CENTER,
    });
    expect(url).toContain("query=45.9712%2C9.1391");
    expect(url).not.toContain("Vapore");
  });

  it("fällt auf die Adresse zurück, wenn die Koordinaten Platzhalter sind", () => {
    const url = placeMapsHref({
      name: "Trattoria Vapore",
      locality: "Torno",
      address: "Via Plinio 20, Torno",
      lat: CENTER.lat,
      lng: CENTER.lng,
      regionCenter: CENTER,
    });
    expect(decodeURIComponent(url)).toContain("Via Plinio 20, Torno");
  });

  it("fällt zuletzt auf Name und Ort zurück", () => {
    const url = placeMapsHref({
      name: "Trattoria Vapore",
      locality: "Torno",
      lat: CENTER.lat,
      lng: CENTER.lng,
      regionCenter: CENTER,
    });
    expect(decodeURIComponent(url)).toContain("Trattoria Vapore, Torno");
  });

  it("behandelt 0/0 als Platzhalter", () => {
    const url = placeMapsHref({ name: "Irgendwo", locality: "Torno", lat: 0, lng: 0 });
    expect(decodeURIComponent(url)).toContain("Irgendwo, Torno");
  });

  it("nutzt Koordinaten auch ohne bekannte Regions-Mitte", () => {
    const url = placeMapsHref({ name: "X", locality: "Torno", lat: 45.97, lng: 9.14 });
    expect(url).toContain("query=45.97%2C9.14");
  });
});
