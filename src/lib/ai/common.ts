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
