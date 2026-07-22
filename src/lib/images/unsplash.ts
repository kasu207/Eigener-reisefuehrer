import type { ImageCandidate } from "./search";

/**
 * Bildersuche über Unsplash (kostenlos, aber API-Key nötig:
 * UNSPLASH_ACCESS_KEY). Unsplash-Lizenz: frei nutzbar (auch kommerziell),
 * Namensnennung erwünscht – wir übernehmen Fotograf:in + Quelllink.
 * Ohne gesetzten Key liefert die Funktion eine leere Liste.
 */

interface UnsplashPhoto {
  urls?: { full?: string; regular?: string; small?: string; thumb?: string };
  links?: { html?: string };
  description?: string | null;
  alt_description?: string | null;
  user?: { name?: string; links?: { html?: string } };
}

export async function searchUnsplashImages(query: string, limit = 8): Promise<ImageCandidate[]> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return [];

  const params = new URLSearchParams({
    query,
    per_page: String(Math.max(1, Math.min(20, limit))),
    content_filter: "high",
  });
  const res = await fetch(`https://api.unsplash.com/search/photos?${params.toString()}`, {
    headers: {
      Authorization: `Client-ID ${key}`,
      "Accept-Version": "v1",
      "User-Agent": "Reisefuehrer-ImageSearch/1.0",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Unsplash-API ${res.status}`);
  const data = (await res.json()) as { results?: UnsplashPhoto[] };

  const candidates: ImageCandidate[] = [];
  for (const p of data.results ?? []) {
    const full = p.urls?.regular ?? p.urls?.full;
    if (!full) continue;
    candidates.push({
      title: (p.description || p.alt_description || "Unsplash-Foto").trim(),
      thumbUrl: p.urls?.small ?? p.urls?.thumb ?? full,
      fileUrl: full,
      license: "Unsplash-Lizenz (frei nutzbar)",
      author: p.user?.name?.trim() || "unbekannt (Unsplash)",
      sourceUrl: p.links?.html ?? full,
      source: "Unsplash",
    });
  }
  return candidates;
}
