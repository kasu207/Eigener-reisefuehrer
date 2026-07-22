import type { ImageCandidate } from "./search";

/**
 * Bildersuche über Europeana (europeana.eu) – Millionen digitalisierte Objekte
 * aus europäischen Museen, Bibliotheken und Archiven. API-Key nötig
 * (EUROPEANA_API_KEY, kostenlos). Wir filtern auf frei nachnutzbare Objekte
 * (reusability=open) und Bildtyp und übernehmen Lizenz + Einrichtung + Quelllink.
 * Ohne gesetzten Key liefert die Funktion eine leere Liste.
 */

interface EuropeanaItem {
  title?: string[];
  edmPreview?: string[]; // Thumbnails
  edmIsShownBy?: string[]; // direktes Medium (Vollbild)
  dataProvider?: string[]; // liefernde Einrichtung
  rights?: string[]; // Lizenz-URLs
  guid?: string; // Europeana-Objektseite
  link?: string;
}

/** Wandelt eine Rechte-/Lizenz-URL in eine lesbare Kurzangabe. */
function rightsLabel(url: string | undefined): string {
  if (!url) return "";
  const u = url.toLowerCase();
  if (u.includes("publicdomain/zero")) return "CC0 1.0";
  if (u.includes("publicdomain/mark")) return "Public Domain Mark";
  const cc = u.match(/creativecommons\.org\/licenses\/([a-z-]+)\/([0-9.]+)/);
  if (cc) return `CC ${cc[1].toUpperCase()} ${cc[2]}`;
  if (u.includes("rightsstatements.org/vocab/noc")) return "No Copyright";
  if (u.includes("rightsstatements.org")) return "Rights Statement (prüfen)";
  return url;
}

export async function searchEuropeanaImages(query: string, limit = 8): Promise<ImageCandidate[]> {
  const key = process.env.EUROPEANA_API_KEY;
  if (!key) return [];

  const params = new URLSearchParams({
    wskey: key,
    query,
    media: "true",
    thumbnail: "true",
    reusability: "open", // nur frei nachnutzbare Objekte
    qf: "TYPE:IMAGE",
    rows: String(Math.max(1, Math.min(20, limit))),
    profile: "rich",
  });
  const res = await fetch(`https://api.europeana.eu/record/v2/search.json?${params.toString()}`, {
    headers: { "User-Agent": "Reisefuehrer-ImageSearch/1.0", Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Europeana-API ${res.status}`);
  const data = (await res.json()) as { items?: EuropeanaItem[] };

  const candidates: ImageCandidate[] = [];
  for (const it of data.items ?? []) {
    const thumb = it.edmPreview?.[0];
    const full = it.edmIsShownBy?.[0] ?? thumb;
    if (!full) continue;
    const license = rightsLabel(it.rights?.[0]);
    if (!license) continue; // ohne ermittelbare Lizenz nicht übernehmen
    candidates.push({
      title: it.title?.[0]?.trim() || "Europeana-Objekt",
      thumbUrl: thumb ?? full,
      fileUrl: full,
      license,
      author: it.dataProvider?.[0]?.trim() || "unbekannt (Europeana)",
      sourceUrl: it.guid ?? it.link ?? full,
      source: `Europeana${it.dataProvider?.[0] ? ` · ${it.dataProvider[0]}` : ""}`,
    });
  }
  return candidates;
}
