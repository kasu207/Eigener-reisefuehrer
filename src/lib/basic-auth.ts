/**
 * Hilfsfunktionen für die HTTP-Basic-Authentifizierung des Admin-Bereichs.
 * Bewusst frei von Node-APIs (`node:crypto`), damit sie auch in der
 * Edge-Runtime der Middleware laufen – und ohne Next-Import, damit sie
 * ohne Server testbar bleiben.
 */

/**
 * Dekodiert einen `Authorization: Basic`-Header nach RFC 7617.
 *
 * Drei Fallstricke, die eine naive Variante (`atob(h.slice(6)).split(":")`) hat:
 * - kaputtes Base64 lässt `atob` werfen → die Middleware stürzt mit 500 ab,
 *   statt sauber 401 zu antworten (jeder Bot kann das auslösen);
 * - `split(":")` zerschneidet Passwörter, die selbst einen Doppelpunkt
 *   enthalten – laut RFC gehört nur der ERSTE Doppelpunkt zum Trenner;
 * - `atob` liefert Bytes als Latin-1, Umlaute im Passwort kämen verstümmelt an.
 */
export function decodeBasicAuth(
  header: string | null | undefined
): { user: string; password: string } | null {
  if (!header) return null;
  const [scheme, ...rest] = header.split(" ");
  if (scheme.toLowerCase() !== "basic" || rest.length === 0) return null;

  let decoded: string;
  try {
    const binary = atob(rest.join("").trim());
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    decoded = new TextDecoder("utf-8").decode(bytes);
  } catch {
    return null;
  }

  const sep = decoded.indexOf(":");
  if (sep < 0) return null;
  return { user: decoded.slice(0, sep), password: decoded.slice(sep + 1) };
}

/**
 * Vergleich in konstanter Zeit, damit sich das Admin-Passwort nicht
 * zeichenweise über Antwortzeiten erraten lässt.
 */
export function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const av = enc.encode(a);
  const bv = enc.encode(b);
  let diff = av.length ^ bv.length;
  for (let i = 0; i < av.length; i++) {
    // Modulo hält die Laufzeit unabhängig von der Länge des Sollwerts.
    diff |= av[i] ^ bv[i % (bv.length || 1)];
  }
  return diff === 0;
}

/** Prüft die Zugangsdaten aus dem Header gegen Soll-Benutzer und -Passwort. */
export function basicAuthMatches(
  header: string | null | undefined,
  expectedUser: string,
  expectedPassword: string
): boolean {
  const creds = decodeBasicAuth(header);
  if (!creds) return false;
  // Beide Vergleiche laufen immer, damit kein früher Abbruch verrät,
  // ob schon der Benutzername falsch war.
  const userOk = safeEqual(creds.user, expectedUser);
  const passOk = safeEqual(creds.password, expectedPassword);
  return userOk && passOk;
}
