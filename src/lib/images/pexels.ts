import type { ImageCandidate } from "./search";

/**
 * Bildersuche über Pexels (kostenlos, aber API-Key nötig: PEXELS_API_KEY).
 * Pexels-Lizenz: frei für kommerzielle Nutzung, Namensnennung nicht
 * verpflichtend, aber erwünscht – wir übernehmen Fotograf:in + Quelllink.
 * Ohne gesetzten Key liefert die Funktion einfach eine leere Liste.
 */

interface PexelsPhoto {
  url: string; // Pexels-Seite (Quelle)
  photographer?: string;
  src?: { original?: string; large2x?: string; large?: string; medium?: string; tiny?: string };
  alt?: string;
}

export async function searchPexelsImages(query: string, limit = 8): Promise<ImageCandidate[]> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) return [];

  const params = new URLSearchParams({
    query,
    per_page: String(Math.max(1, Math.min(20, limit))),
  });
  const res = await fetch(`https://api.pexels.com/v1/search?${params.toString()}`, {
    headers: { Authorization: key, "User-Agent": "Reisefuehrer-ImageSearch/1.0" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Pexels-API ${res.status}`);
  const data = (await res.json()) as { photos?: PexelsPhoto[] };

  const candidates: ImageCandidate[] = [];
  for (const p of data.photos ?? []) {
    const full = p.src?.large2x ?? p.src?.original ?? p.src?.large;
    if (!full) continue;
    candidates.push({
      title: p.alt?.trim() || "Pexels-Foto",
      thumbUrl: p.src?.medium ?? p.src?.tiny ?? full,
      fileUrl: full,
      license: "Pexels-Lizenz (frei nutzbar)",
      author: p.photographer?.trim() || "unbekannt (Pexels)",
      sourceUrl: p.url,
      source: "Pexels",
    });
  }
  return candidates;
}
