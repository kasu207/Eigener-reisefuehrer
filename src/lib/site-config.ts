/**
 * Betreiber-Angaben für Impressum und Datenschutzerklärung.
 *
 * Bewusst aus der Umgebung statt fest im Code: Diese Angaben ändern sich
 * (Umzug, Rechtsform, neue Kontaktadresse), und niemand soll dafür den Code
 * anfassen und neu deployen müssen. Fehlt etwas, sagt das die
 * Startklar-Prüfung im Admin – ein Impressum mit Platzhaltern ist in
 * Deutschland ein Abmahnrisiko, sobald gewerblich angeboten wird.
 */

export interface SiteOperator {
  name: string;
  street: string;
  city: string;
  email: string;
  /** Optional: nur bei Umsatzsteuerpflicht. */
  vatId: string;
  /** Optional: inhaltlich Verantwortlicher, falls abweichend vom Betreiber. */
  responsible: string;
  /** Optional: Telefonnummer. */
  phone: string;
}

function env(key: string): string {
  return (process.env[key] ?? "").trim();
}

export function siteOperator(): SiteOperator {
  return {
    name: env("OPERATOR_NAME"),
    street: env("OPERATOR_STREET"),
    city: env("OPERATOR_CITY"),
    email: env("OPERATOR_EMAIL"),
    vatId: env("OPERATOR_VAT_ID"),
    responsible: env("OPERATOR_RESPONSIBLE"),
    phone: env("OPERATOR_PHONE"),
  };
}

/** Pflichtangaben nach § 5 DDG (früher TMG) – ohne diese kein Live-Betrieb. */
export const REQUIRED_OPERATOR_FIELDS: (keyof SiteOperator)[] = [
  "name",
  "street",
  "city",
  "email",
];

export const OPERATOR_FIELD_LABELS: Record<keyof SiteOperator, string> = {
  name: "Name / Firma (OPERATOR_NAME)",
  street: "Straße und Hausnummer (OPERATOR_STREET)",
  city: "PLZ und Ort (OPERATOR_CITY)",
  email: "Kontakt-E-Mail (OPERATOR_EMAIL)",
  vatId: "USt-IdNr. (OPERATOR_VAT_ID)",
  responsible: "Inhaltlich Verantwortlicher (OPERATOR_RESPONSIBLE)",
  phone: "Telefon (OPERATOR_PHONE)",
};

/** Welche Pflichtangaben fehlen noch? */
export function missingOperatorFields(op: SiteOperator = siteOperator()): (keyof SiteOperator)[] {
  return REQUIRED_OPERATOR_FIELDS.filter((f) => !op[f]);
}

export function operatorIsComplete(op: SiteOperator = siteOperator()): boolean {
  return missingOperatorFields(op).length === 0;
}
