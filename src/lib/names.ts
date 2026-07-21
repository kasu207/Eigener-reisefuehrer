/**
 * Helfer rund um Anzeige-Namen und Karten-Links.
 * `cleanName` entfernt Redaktions-Marker wie „(Beispiel)" aus dem laufenden
 * Text – sowohl in der Anzeige als auch im Kontext für die KI-Texte, damit die
 * generierten Texte diese Platzhalter nicht erwähnen.
 */
export function cleanName(name: string): string {
  return name.replace(/\s*\((?:Beispiel|Platzhalter|Muster|Demo)\)\s*$/i, "").trim();
}

/** Google-Maps-Suchlink für eine Adresse, einen Ort oder Koordinaten. */
export function mapsHref(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query.trim())}`;
}
