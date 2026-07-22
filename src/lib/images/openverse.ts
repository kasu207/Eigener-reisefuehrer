import type { ImageCandidate } from "./search";

/**
 * Bildersuche über Openverse (openverse.org) – ein Aggregator frei lizenzierter
 * Bilder aus vielen Quellen (Flickr, Museen/Smithsonian, Wikimedia, Rawpixel …).
 * Kein API-Key nötig (anonym rate-limitiert). Wir filtern auf Lizenzen, die
 * kommerzielle Nutzung UND Bearbeitung erlauben (CC BY, CC BY-SA, CC0, PDM),
 * und übernehmen Lizenz + Urheber + Quelllink für die Pflichtangaben.
 */

interface OpenverseResult {
  title?: string;
  creator?: string;
  url?: string; // Voll-Bild
  thumbnail?: string; // Openverse-Thumbnail
  foreign_landing_url?: string; // Quellseite
  license?: string; // z. B. "by-sa", "cc0", "pdm"
  license_version?: string; // z. B. "4.0"
  source?: string; // z. B. "flickr", "wikimedia"
}

/** Baut eine lesbare Lizenzangabe aus Openverse-Feldern. */
function licenseLabel(license: string, version?: string): string {
  const l = license.toLowerCase();
  if (l === "cc0") return "CC0 1.0";
  if (l === "pdm") return "Public Domain Mark";
  return `CC ${license.toUpperCase()}${version ? ` ${version}` : ""}`.trim();
}

export async function searchOpenverseImages(
  query: string,
  limit = 8
): Promise<ImageCandidate[]> {
  const params = new URLSearchParams({
    q: query,
    page_size: String(Math.max(1, Math.min(20, limit))),
    // nur nachnutzbare Lizenzen (kommerziell + Bearbeitung erlaubt)
    license_type: "commercial,modification",
    mature: "false",
  });
  const url = `https://api.openverse.org/v1/images/?${params.toString()}`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Reisefuehrer-ImageSearch/1.0 (kuratierte Reiseführer-DB)",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Openverse-API ${res.status}`);
  const data = (await res.json()) as { results?: OpenverseResult[] };

  const candidates: ImageCandidate[] = [];
  for (const r of data.results ?? []) {
    if (!r.url || !r.license) continue;
    candidates.push({
      title: r.title?.trim() || "Openverse-Bild",
      thumbUrl: r.thumbnail || r.url,
      fileUrl: r.url,
      license: licenseLabel(r.license, r.license_version),
      author: r.creator?.trim() || `unbekannt (${r.source || "Openverse"})`,
      sourceUrl: r.foreign_landing_url || r.url,
      source: `Openverse${r.source ? ` · ${r.source}` : ""}`,
    });
  }
  return candidates;
}
