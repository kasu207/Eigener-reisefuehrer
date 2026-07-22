import { describe, it, expect } from "vitest";
import {
  parseVideoId,
  decodeEntities,
  timedTextToPlain,
  json3ToPlain,
  extractCaptionTracks,
  pickTrack,
  extractPlayerResponseFromHtml,
  fetchYoutubeTranscript,
  type CaptionTrack,
} from "../src/lib/youtube/transcript";

// Minimaler Response-Stub für den injizierten fetch
function res(body: string | object, ok = true, status = 200) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok,
    status,
    async text() {
      return text;
    },
    async json() {
      return typeof body === "string" ? JSON.parse(body) : body;
    },
  } as unknown as Response;
}

describe("parseVideoId", () => {
  it("erkennt URL-Formen und lehnt Ungültiges ab", () => {
    expect(parseVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseVideoId("https://youtu.be/dQw4w9WgXcQ?t=10")).toBe("dQw4w9WgXcQ");
    expect(parseVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseVideoId("https://m.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(parseVideoId("kein-link")).toBeNull();
  });
});

describe("Transkript-Parser (rein)", () => {
  it("decodeEntities dekodiert HTML-Entities", () => {
    expect(decodeEntities("Caf&#233; &amp; Bar")).toBe("Café & Bar");
  });

  it("timedTextToPlain wandelt XML in Fließtext", () => {
    const xml =
      '<transcript><text start="0" dur="1">Hallo &amp; willkommen</text>' +
      '<text start="1">in <b>Torno</b></text></transcript>';
    expect(timedTextToPlain(xml)).toBe("Hallo & willkommen in Torno");
  });

  it("json3ToPlain fügt Segmente zusammen", () => {
    const j = JSON.stringify({
      events: [{ segs: [{ utf8: "Hallo " }, { utf8: "Welt" }] }, { segs: [{ utf8: " heute" }] }],
    });
    expect(json3ToPlain(j)).toBe("Hallo Welt heute");
  });

  it("extractCaptionTracks liest die Spuren aus playerResponse", () => {
    const pr = {
      captions: {
        playerCaptionsTracklistRenderer: {
          captionTracks: [{ baseUrl: "u", languageCode: "de" }],
        },
      },
    };
    expect(extractCaptionTracks(pr)).toHaveLength(1);
    expect(extractCaptionTracks({})).toEqual([]);
    expect(extractCaptionTracks(null)).toEqual([]);
  });

  it("pickTrack bevorzugt manuelles Deutsch vor Auto und Englisch", () => {
    const tracks: CaptionTrack[] = [
      { baseUrl: "en", languageCode: "en" },
      { baseUrl: "de-asr", languageCode: "de", kind: "asr" },
      { baseUrl: "de", languageCode: "de" },
    ];
    expect(pickTrack(tracks)?.baseUrl).toBe("de");
    expect(pickTrack([{ baseUrl: "x", languageCode: "fr" }])?.baseUrl).toBe("x");
    expect(pickTrack([])).toBeNull();
  });

  it("extractPlayerResponseFromHtml löst balanciertes JSON (auch mit Klammern in Strings)", () => {
    const html =
      'foo var ytInitialPlayerResponse = {"videoDetails":{"title":"A {weird} title"},"n":1};var x=2;';
    const pr = extractPlayerResponseFromHtml(html) as { videoDetails?: { title?: string } };
    expect(pr?.videoDetails?.title).toBe("A {weird} title");
    expect(extractPlayerResponseFromHtml("kein Marker")).toBeNull();
  });
});

describe("fetchYoutubeTranscript (Ablauf mit injiziertem fetch)", () => {
  it("Stufe 1: InnerTube liefert Spuren, JSON3-Transkript wird geladen", async () => {
    const fetchImpl = (async (input: string | URL) => {
      const u = String(input);
      if (u.includes("youtubei/v1/player")) {
        return res({
          videoDetails: { title: "Torno am Comer See" },
          captions: {
            playerCaptionsTracklistRenderer: {
              captionTracks: [
                { baseUrl: "https://timedtext.example/de", languageCode: "de" },
              ],
            },
          },
        });
      }
      if (u.includes("fmt=json3")) {
        return res({ events: [{ segs: [{ utf8: "Willkommen " }, { utf8: "in Torno" }] }] });
      }
      throw new Error(`unerwartete URL: ${u}`);
    }) as unknown as typeof fetch;

    const t = await fetchYoutubeTranscript("https://youtu.be/dQw4w9WgXcQ", { fetchImpl });
    expect(t.videoId).toBe("dQw4w9WgXcQ");
    expect(t.title).toBe("Torno am Comer See");
    expect(t.text).toBe("Willkommen in Torno");
  });

  it("Stufe 2: InnerTube blockiert → Watch-HTML-Fallback + XML-Transkript", async () => {
    const html =
      'x var ytInitialPlayerResponse = {"videoDetails":{"title":"Fallback-Video"},' +
      '"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":' +
      '[{"baseUrl":"https://timedtext.example/en","languageCode":"en"}]}}};var y=1;';
    const fetchImpl = (async (input: string | URL) => {
      const u = String(input);
      if (u.includes("youtubei/v1/player")) return res("", false, 403); // InnerTube blockiert
      if (u.includes("/watch?v=")) return res(html);
      if (u.includes("fmt=json3")) return res("", false, 404); // JSON3 nicht verfügbar
      // XML-Fallback
      return res('<transcript><text start="0">Hallo aus dem</text><text>Fallback</text></transcript>');
    }) as unknown as typeof fetch;

    const t = await fetchYoutubeTranscript("dQw4w9WgXcQ", { fetchImpl });
    expect(t.title).toBe("Fallback-Video");
    expect(t.text).toBe("Hallo aus dem Fallback");
  });

  it("wirft klare Meldung, wenn keine Untertitel gefunden werden", async () => {
    const fetchImpl = (async (input: string | URL) => {
      const u = String(input);
      if (u.includes("youtubei/v1/player")) return res({ videoDetails: { title: "Ohne UT" } });
      if (u.includes("/watch?v=")) return res("<html>keine Tracks</html>");
      return res("", false, 404);
    }) as unknown as typeof fetch;

    await expect(fetchYoutubeTranscript("dQw4w9WgXcQ", { fetchImpl })).rejects.toThrow(
      /Kein Transkript verfügbar/
    );
  });
});
