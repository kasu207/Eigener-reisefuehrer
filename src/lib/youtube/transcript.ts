/**
 * YouTube-Transkript-Abruf ohne offizielle API (für die Redaktions-Werkstatt).
 *
 * Vorgehen: Watch-Seite laden, `ytInitialPlayerResponse` extrahieren, daraus die
 * `captionTracks` lesen und die timedtext-Spur (bevorzugt Deutsch, sonst
 * Englisch, sonst erste) als XML holen und zu reinem Text säubern. Rein
 * lesend, kein Download von Video/Audio. Fehler werden als klare Meldung
 * geworfen, damit die Redaktion sie sieht.
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36";

export interface YoutubeTranscript {
  videoId: string;
  title: string;
  url: string;
  text: string;
}

/** Extrahiert die 11-stellige Video-ID aus gängigen YouTube-URL-Formen. */
export function parseVideoId(input: string): string | null {
  const s = input.trim();
  // Reine ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    if (u.hostname === "youtu.be") {
      const id = u.pathname.slice(1, 12);
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (u.hostname.includes("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
      // /shorts/<id> oder /embed/<id>
      const m = u.pathname.match(/\/(?:shorts|embed|v)\/([a-zA-Z0-9_-]{11})/);
      if (m) return m[1];
    }
  } catch {
    // keine gültige URL
  }
  return null;
}

/** Grobe HTML-Entity-Dekodierung für timedtext-Inhalte. */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&#34;/g, '"')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

/** Wandelt timedtext-XML (<text>-Segmente) in Fließtext. */
function timedTextToPlain(xml: string): string {
  const segments = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map((m) =>
    decodeEntities(m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim())
  );
  return segments.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

interface CaptionTrack {
  baseUrl: string;
  languageCode?: string;
  kind?: string;
}

export async function fetchYoutubeTranscript(urlOrId: string): Promise<YoutubeTranscript> {
  const videoId = parseVideoId(urlOrId);
  if (!videoId) throw new Error(`Keine gültige YouTube-URL/ID: „${urlOrId}"`);
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      "Accept-Language": "de,en;q=0.8",
      // Consent-Cookie umgehen (EU-Consent-Redirect)
      Cookie: "CONSENT=YES+1",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`YouTube-Abruf fehlgeschlagen (${res.status})`);
  const html = await res.text();

  const title =
    html.match(/<meta[^>]+name=["']title["'][^>]+content=["']([^"']*)["']/i)?.[1] ??
    html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.replace(/\s*-\s*YouTube\s*$/, "") ??
    videoId;

  // captionTracks aus ytInitialPlayerResponse ziehen
  const tracksMatch = html.match(/"captionTracks":(\[.*?\])/s);
  if (!tracksMatch) {
    throw new Error(
      "Kein Transkript verfügbar (Video hat keine Untertitel oder ist eingeschränkt)."
    );
  }
  let tracks: CaptionTrack[];
  try {
    tracks = JSON.parse(tracksMatch[1]) as CaptionTrack[];
  } catch {
    throw new Error("Untertitel-Spuren konnten nicht gelesen werden.");
  }
  if (!tracks.length) throw new Error("Kein Transkript verfügbar.");

  // Bevorzugt Deutsch, dann Englisch, sonst die erste Spur; manuell vor auto
  const pick =
    tracks.find((t) => t.languageCode === "de" && t.kind !== "asr") ??
    tracks.find((t) => t.languageCode === "de") ??
    tracks.find((t) => t.languageCode === "en" && t.kind !== "asr") ??
    tracks.find((t) => t.languageCode === "en") ??
    tracks[0];

  const captionUrl = decodeEntities(pick.baseUrl);
  const capRes = await fetch(captionUrl, {
    headers: { "User-Agent": UA, "Accept-Language": "de,en;q=0.8" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!capRes.ok) throw new Error(`Untertitel-Abruf fehlgeschlagen (${capRes.status}).`);
  const xml = await capRes.text();
  const text = timedTextToPlain(xml);
  if (!text) throw new Error("Transkript war leer.");

  return { videoId, title: decodeEntities(title).trim(), url, text };
}
