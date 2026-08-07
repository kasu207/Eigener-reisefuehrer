/**
 * Sichtbarkeit von Orten für einen konkreten Guide.
 *
 * Der Bestand besteht aus zwei Töpfen:
 * - redaktionell geprüfte Orte (`addedByRequestId = null`) – für alle Guides
 * - Orte, die ein Nutzer im eigenen Guide ergänzt hat – nur für genau diesen
 *
 * Ohne die zweite Regel würde jeder private Tipp („die Bar, die wir letztes
 * Jahr entdeckt haben") sofort in den Reiseführern fremder Kunden auftauchen.
 */
export function placeScopeFilter(requestId: string) {
  return {
    OR: [{ addedByRequestId: null }, { addedByRequestId: requestId }],
  };
}

/** Nur der allgemeine, redaktionell geprüfte Bestand (ohne Nutzer-Ergänzungen). */
export const editorialOnlyFilter = { addedByRequestId: null } as const;
