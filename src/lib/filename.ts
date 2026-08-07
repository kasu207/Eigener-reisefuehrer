/**
 * Dateinamen für Downloads aus einem freien Titel bilden.
 *
 * Bewusst auf ASCII reduziert: `Content-Disposition` überträgt den
 * `filename`-Parameter als Latin-1, Umlaute oder Emoji im Titel kämen bei
 * manchen Clients verstümmelt an oder zerlegen den Header.
 */
export function downloadFileName(title: string, extension: string, fallback: string): string {
  const slug = title
    .normalize("NFKD")
    // Kombinierende Akzente entfernen (ä -> a), nachdem NFKD sie abgetrennt hat
    .replace(/[̀-ͯ]/g, "")
    // ß zerlegt NFKD nicht – separat behandeln
    .replace(/ß/g, "ss")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    // Ein abschließender Bindestrich kann durch das Kürzen neu entstehen
    .replace(/-+$/, "");
  return slug ? `${slug}.${extension}` : `${fallback}.${extension}`;
}
