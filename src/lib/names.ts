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

/** Regions-Mitte als Platzhalter – dieselbe Toleranz wie in `place-quality`. */
function isPlaceholderCoord(
  lat: number,
  lng: number,
  center?: { lat: number; lng: number }
): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return true;
  if (lat === 0 && lng === 0) return true;
  if (!center) return false;
  return Math.abs(lat - center.lat) < 0.0005 && Math.abs(lng - center.lng) < 0.0005;
}

/**
 * Karten-Link für einen Ort-Eintrag.
 *
 * Bewusst **zuerst die Koordinaten**: Eine Suche nach „Trattoria Vapore, Torno"
 * findet Google oft nicht – kleine Lokale sind dort nicht unter dem Namen
 * verzeichnet, den die Redaktion vergeben hat, und der Gast landet irgendwo
 * oder nirgends. Die Koordinaten aus der Datenbank setzen den Pin dagegen
 * immer exakt. Erst wenn sie Platzhalter sind (Regions-Mitte, 0/0), fallen wir
 * auf Adresse und Name zurück – dann ist eine ungefähre Suche besser als ein
 * Pin mitten im See.
 */
export function placeMapsHref(input: {
  name: string;
  locality?: string;
  address?: string;
  lat: number;
  lng: number;
  regionCenter?: { lat: number; lng: number };
}): string {
  if (!isPlaceholderCoord(input.lat, input.lng, input.regionCenter)) {
    return mapsHref(`${input.lat},${input.lng}`);
  }
  const address = (input.address ?? "").trim();
  if (address) return mapsHref(address);
  const locality = (input.locality ?? "").trim();
  return mapsHref(locality ? `${input.name}, ${locality}` : input.name);
}
