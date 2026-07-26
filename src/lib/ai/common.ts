import Anthropic from "@anthropic-ai/sdk";
import * as z from "zod/v4";

/**
 * Gemeinsame KI-Bausteine (ein Client, eine Sicherheitsprüfung).
 * Zentralisiert, damit Verhalten (Retries, Ablehnungsgründe) überall gleich
 * ist und nicht in jedem Modul erneut definiert wird.
 */

/** Ein gemeinsamer Anthropic-Client für alle KI-Aufrufe. */
export const aiClient = new Anthropic({ maxRetries: 3 });

/**
 * Sicherheitsprüfung für community-gespeiste Inhalte (Wissens-DB, Vorschläge):
 * gemeinsames Zod-Fragment für die strukturierte Ausgabe der Modelle.
 */
export const safetySchema = z.object({
  acceptable: z.boolean(),
  reason: z.string(),
});

/** Wird geworfen, wenn die Sicherheitsprüfung eine Quelle/Anfrage ablehnt. */
export class UnsafeContentError extends Error {
  constructor(public reason: string) {
    super(`Abgelehnt: ${reason}`);
    this.name = "UnsafeContentError";
  }
}

/**
 * Liest aus einem KI-Fehler eine knappe, aussagekräftige Ursache heraus
 * (HTTP-Status + Anthropic-Fehlertyp/-Meldung, z. B. "429 rate_limit_error").
 * Für Anthropic.APIError-Instanzen (ungültiger/erschöpfter API-Key,
 * Budget-/Ratenlimit erreicht, Modell nicht verfügbar …) ist die generische
 * `error.message` sonst schwer aus den Server-Logs herauszulesen.
 */
export function describeAiError(e: unknown): string {
  if (e instanceof Anthropic.APIError) {
    // e.message enthält bereits "<status> <Fehlertext>"; e.type ist der
    // Anthropic-Fehlertyp (z. B. "rate_limit_error", "invalid_request_error",
    // "authentication_error", "overloaded_error") – zusammen gut aus den
    // Server-Logs lesbar, ohne selbst in die Roh-Antwort greifen zu müssen.
    return e.type ? `${e.message} [${e.type}]` : e.message;
  }
  return e instanceof Error ? e.message : String(e);
}
