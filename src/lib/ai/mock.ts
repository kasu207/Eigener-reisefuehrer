/**
 * Mock-Modus für Entwicklung und Tests OHNE Claude-API-Kosten.
 *
 * Aktivierung: AI_MODE=mock in der .env.
 *
 * Wichtig zur Einordnung: Dieses System "trainiert" kein Modell – es ist eine
 * RAG-Architektur (Retrieval Augmented Generation). Das Wissen liegt in der
 * eigenen Postgres-Datenbank (Orte, Wanderungen, KnowledgeChunks) und wird
 * dem Modell zur Laufzeit als Kontext mitgegeben. Die Wissensdatenbank wächst
 * also komplett ohne API-Kosten – nur die Textgenerierung und die
 * Quellen-Analyse kosten Tokens, und genau die ersetzt dieser Mock.
 */

export const AI_MODE = process.env.AI_MODE === "mock" ? "mock" : "live";

export function isMock(): boolean {
  return AI_MODE === "mock";
}

/** Deterministischer Pseudo-Text für Kapitel-Einträge im Mock-Modus. */
export function mockPersonalText(name: string): string {
  return `${name} passt gut in eure Reise: Nehmt euch hier bewusst Zeit, schlendert ohne Plan und schaut, was euch anzieht. (Mock-Text – im Live-Modus schreibt die KI hier einen individuellen Empfehlungstext auf Basis der geprüften Datenbank-Fakten.)`;
}

export function mockReason(): string {
  return "Weil ihr laut Fragebogen genau solche Momente sucht. (Mock)";
}
