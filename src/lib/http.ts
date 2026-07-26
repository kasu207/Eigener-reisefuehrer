/**
 * Gemeinsame HTTP-Konstanten für Server-Abrufe externer Seiten.
 * Viele Blogs/Portale blocken generische Clients – daher ein realistischer
 * Browser-User-Agent an EINER Stelle statt in jedem Modul kopiert.
 */
export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36";

export const BROWSER_HEADERS = {
  "User-Agent": BROWSER_UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "de,en;q=0.8",
} as const;
