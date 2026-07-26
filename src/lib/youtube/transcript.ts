/**
 * YouTube-Transkript-Abruf ohne offizielle Data-API (für die Redaktions-Werkstatt).
 *
 * Robust in zwei Stufen, weil das reine Scrapen der Watch-Seite oft an
 * Consent-/Bot-Seiten scheitert:
 *   1. InnerTube-Player-API (youtubei/v1/player, ANDROID-Client) → captionTracks
 *   2. Fallback: Watch-Seite laden und ytInitialPlayerResponse extrahieren
 * Die gewählte Untertitel-Spur wird bevorzugt als JSON3 geladen (stabiler),
 * sonst als timedtext-XML. Rein lesend, kein Download von Video/Audio.
 *
 * Die Netzwerk-Funktion nimmt einen optionalen `fetchImpl` entgegen, damit der
 * gesamte Ablauf offline (mit Fixtures) testbar ist.
 */

import { BROWSER_UA as UA } from "../http";

// Öffentlicher InnerTube-Key des ANDROID-Clients (wie von yt-dlp u. a. genutzt).
const INNERTUBE_KEY = "AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w";
const ANDROID_UA = "com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip";

export interface YoutubeTranscript {
  videoId: string;
  title: string;
  url: string;
  text: string;
}

export interface CaptionTrack {
  baseUrl: string;
  languageCode?: string;
  kind?: string; // "asr" = automatisch erzeugt
  name?: { simpleText?: string; runs?: { text: string }[] };
}

type FetchImpl = typeof fetch;

// ---------------------------------------------------------------------------
// Reine (netzunabhängige) Helfer – vollständig unit-testbar
// ---------------------------------------------------------------------------

/** Extrahiert die 11-stellige Video-ID aus gängigen YouTube-URL-Formen. */
export function parseVideoId(input: string): string | null {
  const s = input.trim();
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
      const m = u.pathname.match(/\/(?:shorts|embed|v)\/([a-zA-Z0-9_-]{11})/);
      if (m) return m[1];
    }
  } catch {
    // keine gültige URL
  }
  return null;
}

/** Grobe HTML-Entity-Dekodierung für timedtext-Inhalte. */
export function decodeEntities(s: string): string {
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

/** timedtext-XML (<text>-Segmente) → Fließtext. */
export function timedTextToPlain(xml: string): string {
  const segments = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map((m) =>
    decodeEntities(m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim())
  );
  return segments.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

/** timedtext-JSON3 ({ events:[{ segs:[{utf8}] }] }) → Fließtext. */
export function json3ToPlain(jsonText: string): string {
  let data: { events?: { segs?: { utf8?: string }[] }[] };
  try {
    data = JSON.parse(jsonText);
  } catch {
    return "";
  }
  const parts: string[] = [];
  for (const ev of data.events ?? []) {
    for (const seg of ev.segs ?? []) {
      if (seg.utf8) parts.push(seg.utf8);
    }
  }
  return parts.join("").replace(/\s+/g, " ").trim();
}

/** captionTracks aus einer playerResponse-Struktur ziehen. */
export function extractCaptionTracks(playerResponse: unknown): CaptionTrack[] {
  const pr = playerResponse as {
    captions?: { playerCaptionsTracklistRenderer?: { captionTracks?: CaptionTrack[] } };
  } | null;
  return pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
}

/** Beste Spur wählen: Deutsch (manuell) → Deutsch → Englisch (manuell) → Englisch → erste. */
export function pickTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  if (!tracks.length) return null;
  return (
    tracks.find((t) => t.languageCode === "de" && t.kind !== "asr") ??
    tracks.find((t) => t.languageCode === "de") ??
    tracks.find((t) => t.languageCode === "en" && t.kind !== "asr") ??
    tracks.find((t) => t.languageCode === "en") ??
    tracks[0]
  );
}

/** ytInitialPlayerResponse-JSON aus der Watch-Seite lösen (balancierte Klammern). */
export function extractPlayerResponseFromHtml(html: string): unknown | null {
  const marker = "ytInitialPlayerResponse";
  const at = html.indexOf(marker);
  if (at === -1) return null;
  const start = html.indexOf("{", at);
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Netzwerk (mit injizierbarem fetchImpl für Tests)
// ---------------------------------------------------------------------------

/** Stufe 1: InnerTube-Player-API. Liefert die playerResponse oder null. */
async function innertubePlayer(videoId: string, fetchImpl: FetchImpl): Promise<unknown | null> {
  try {
    const res = await fetchImpl(
      `https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": ANDROID_UA },
        body: JSON.stringify({
          context: {
            client: {
              clientName: "ANDROID",
              clientVersion: "19.09.37",
              androidSdkVersion: 30,
              hl: "de",
              gl: "DE",
            },
          },
          videoId,
        }),
        signal: AbortSignal.timeout(15_000),
      }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Stufe 2: Watch-Seite laden. Liefert das HTML oder null. */
async function fetchWatchHtml(videoId: string, fetchImpl: FetchImpl): Promise<string | null> {
  try {
    const res = await fetchImpl(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: { "User-Agent": UA, "Accept-Language": "de,en;q=0.8", Cookie: "CONSENT=YES+1" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function titleFrom(playerResponse: unknown, html: string | null, videoId: string): string {
  const pr = playerResponse as { videoDetails?: { title?: string } } | null;
  if (pr?.videoDetails?.title) return pr.videoDetails.title;
  if (html) {
    const m =
      html.match(/<meta[^>]+name=["']title["'][^>]+content=["']([^"']*)["']/i)?.[1] ??
      html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.replace(/\s*-\s*YouTube\s*$/, "");
    if (m) return decodeEntities(m).trim();
  }
  return videoId;
}

/** Untertitel-Spur laden: erst JSON3, dann XML-Fallback. */
async function downloadTranscript(track: CaptionTrack, fetchImpl: FetchImpl): Promise<string> {
  const base = decodeEntities(track.baseUrl);
  // JSON3 zuerst (robuster, sauberer Text)
  try {
    const sep = base.includes("?") ? "&" : "?";
    const res = await fetchImpl(`${base}${sep}fmt=json3`, {
      headers: { "User-Agent": UA, "Accept-Language": "de,en;q=0.8" },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) {
      const text = json3ToPlain(await res.text());
      if (text) return text;
    }
  } catch {
    // weiter zum XML-Fallback
  }
  // XML-Fallback
  const res = await fetchImpl(base, {
    headers: { "User-Agent": UA, "Accept-Language": "de,en;q=0.8" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Untertitel-Abruf fehlgeschlagen (${res.status}).`);
  return timedTextToPlain(await res.text());
}

export interface FetchOptions {
  /** Injizierbarer fetch (für Tests). Standard: global fetch. */
  fetchImpl?: FetchImpl;
}

export async function fetchYoutubeTranscript(
  urlOrId: string,
  opts: FetchOptions = {}
): Promise<YoutubeTranscript> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const videoId = parseVideoId(urlOrId);
  if (!videoId) throw new Error(`Keine gültige YouTube-URL/ID: „${urlOrId}"`);
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  // Stufe 1: InnerTube
  let playerResponse = await innertubePlayer(videoId, fetchImpl);
  let tracks = extractCaptionTracks(playerResponse);
  let html: string | null = null;

  // Stufe 2: Watch-Seite, falls InnerTube nichts lieferte
  if (tracks.length === 0) {
    html = await fetchWatchHtml(videoId, fetchImpl);
    if (html) {
      const prFromHtml = extractPlayerResponseFromHtml(html);
      if (prFromHtml) {
        playerResponse = prFromHtml;
        tracks = extractCaptionTracks(prFromHtml);
      }
      // Letzter Notnagel: captionTracks-Array direkt aus dem HTML
      if (tracks.length === 0) {
        const m = html.match(/"captionTracks":(\[.*?\])/s);
        if (m) {
          try {
            tracks = JSON.parse(m[1]) as CaptionTrack[];
          } catch {
            /* ignorieren */
          }
        }
      }
    }
  }

  if (tracks.length === 0) {
    throw new Error(
      "Kein Transkript verfügbar (Video hat keine Untertitel, ist eingeschränkt oder YouTube blockiert die Anfrage)."
    );
  }

  const track = pickTrack(tracks);
  if (!track?.baseUrl) throw new Error("Untertitel-Spur ohne abrufbare Adresse.");

  const text = await downloadTranscript(track, fetchImpl);
  if (!text) throw new Error("Transkript war leer.");

  return { videoId, title: titleFrom(playerResponse, html, videoId).trim(), url, text };
}
