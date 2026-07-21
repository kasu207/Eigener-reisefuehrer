/**
 * Zentrale Modellwahl für alle KI-Aufrufe.
 *
 * Standard ist das kostengünstige Sonnet-Modell. Über die Umgebungsvariable
 * ANTHROPIC_MODEL (in der .env) lässt sich jederzeit ein anderes Modell setzen,
 * z. B. `claude-opus-4-8` für einzelne, besonders anspruchsvolle Läufe.
 *
 * Kostenhinweis: Opus ist um ein Vielfaches teurer als Sonnet. Für den
 * Normalbetrieb ist Sonnet die empfohlene Wahl.
 */
export const AI_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
