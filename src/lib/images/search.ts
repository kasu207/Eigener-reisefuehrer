/**
 * Bildersuche über Wikimedia Commons (frei lizenzierte Bilder mit Attribution).
 *
 * Kein API-Key nötig. Es werden nur Dateien mit ermittelbarer Lizenz und
 * Urheberangabe zurückgegeben, damit die Pflichtangaben (Lizenz, Urheber,
 * Quelllink) direkt in die Datenbank übernommen werden können.
 */

export interface ImageCandidate {
  title: string;
  thumbUrl: string;
  fileUrl: string;
  license: string;
  author: string;
  sourceUrl: string;
}

/** HTML aus den extmetadata-Feldern entfernen (Artist enthält oft <a>-Tags). */
function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface CommonsPage {
  title: string;
  imageinfo?: {
    url: string;
    thumburl?: string;
    descriptionurl?: string;
    extmetadata?: Record<string, { value?: string }>;
  }[];
}

export async function searchCommonsImages(
  query: string,
  limit = 8
): Promise<ImageCandidate[]> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "search",
    gsrsearch: `filetype:bitmap ${query}`,
    gsrnamespace: "6", // Datei-Namespace
    gsrlimit: String(Math.max(1, Math.min(20, limit))),
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: "400",
    origin: "*",
  });
  const url = `https://commons.wikimedia.org/w/api.php?${params.toString()}`;

  const res = await fetch(url, {
    headers: { "User-Agent": "Reisefuehrer-ImageSearch/1.0 (kuratierte Reiseführer-DB)" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Wikimedia-API ${res.status}`);
  const data = (await res.json()) as { query?: { pages?: Record<string, CommonsPage> } };

  const pages = Object.values(data.query?.pages ?? {});
  const candidates: ImageCandidate[] = [];
  for (const page of pages) {
    const info = page.imageinfo?.[0];
    if (!info?.url) continue;
    const meta = info.extmetadata ?? {};
    const license = stripHtml(meta.LicenseShortName?.value ?? meta.License?.value ?? "");
    const author = stripHtml(meta.Artist?.value ?? "");
    // Nur Bilder mit ermittelbarer Lizenz übernehmen (Attribution-Pflicht)
    if (!license) continue;
    candidates.push({
      title: page.title.replace(/^File:/, ""),
      thumbUrl: info.thumburl ?? info.url,
      fileUrl: info.url,
      license,
      author: author || "unbekannt (Wikimedia Commons)",
      sourceUrl: info.descriptionurl ?? info.url,
    });
  }
  return candidates;
}
