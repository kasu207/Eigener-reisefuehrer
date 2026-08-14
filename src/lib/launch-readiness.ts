import { AREA_LABELS, type AreaKey } from "./areas";

/**
 * Startklar-Prüfung: Was steht dem bezahlten Betrieb noch im Weg?
 *
 * Zweck ist Ehrlichkeit vor dem ersten Verkauf. Die Technik kann fehlerfrei
 * laufen und das Produkt trotzdem enttäuschen – weil der Ortsbestand zu dünn
 * ist, weil noch Platzhalter-Texte online stehen oder weil die KI im
 * Mock-Modus Blindtexte schreibt. Diese Funktion ist bewusst rein
 * (keine DB, kein Netz), damit sie testbar bleibt.
 */

export type CheckLevel = "blocker" | "warnung" | "ok";

export interface ReadinessCheck {
  id: string;
  title: string;
  level: CheckLevel;
  detail: string;
  /** Konkreter nächster Schritt, wenn nicht ok. */
  action?: string;
}

/** Mindestbestand je Bereich, damit ein Guide nicht dünn wirkt.
 *
 *  Hergeleitet aus `computeTargets` in selection.ts: Eine Woche mit
 *  ausgewogenem Tempo zielt auf ~28 Sehenswürdigkeiten, ~8 Restaurants der
 *  Mittelklasse usw. Weniger Bestand als Zielmenge heißt: Der Guide zeigt
 *  weniger, als er könnte, und „+" meldet sofort „erschöpft". */
export const MIN_STOCK: Record<AreaKey, number> = {
  sights: 25,
  hikes: 8,
  foodFancy: 3,
  foodMid: 10,
  foodBudget: 12,
  bars: 6,
  hotels: 6,
  // Tagesausflüge sind pro Guide wenige, aber ohne Bestand bleibt das
  // Kapitel leer – vier Ziele decken auch eine lange Reise ab.
  daytrips: 4,
};

export interface ReadinessInput {
  /** Verifizierte Orte je Bereich (ohne Nutzer-Ergänzungen). */
  stock: Record<AreaKey, number>;
  /** Fehlende Impressum-Pflichtfelder (Klartext-Labels). */
  missingOperatorFields: string[];
  /** Läuft die KI im Mock-Modus? */
  aiIsMock: boolean;
  /** Ist ein Anthropic-Schlüssel konfiguriert? */
  hasApiKey: boolean;
  /** Guide-Requests, die seit über 15 Minuten auf den Worker warten. */
  stalePendingRequests: number;
  /** Fehlgeschlagene Guide-Requests der letzten Zeit. */
  failedRequests: number;
  /** Ist eine öffentliche Basis-URL gesetzt (E-Mail-Links, PDF)? */
  hasAppUrl: boolean;
  /** Ist der Admin durch ein eigenes Passwort geschützt? */
  adminPasswordIsWeak: boolean;
}

export function evaluateReadiness(input: ReadinessInput): ReadinessCheck[] {
  const checks: ReadinessCheck[] = [];

  // --- Rechtliches: ohne das darf gewerblich nicht angeboten werden --------
  if (input.missingOperatorFields.length > 0) {
    checks.push({
      id: "impressum",
      title: "Impressum unvollständig",
      level: "blocker",
      detail: `Es fehlen: ${input.missingOperatorFields.join(", ")}.`,
      action:
        "Angaben in der .env setzen (OPERATOR_*) und neu starten. Ein unvollständiges Impressum ist bei gewerblichem Angebot abmahnfähig.",
    });
  } else {
    checks.push({
      id: "impressum",
      title: "Impressum vollständig",
      level: "ok",
      detail: "Alle Pflichtangaben nach § 5 DDG sind gesetzt.",
    });
  }

  // --- KI: Mock liefert Blindtexte ----------------------------------------
  if (input.aiIsMock) {
    checks.push({
      id: "ai-mode",
      title: "KI läuft im Mock-Modus",
      level: "blocker",
      detail: "Guides bekommen Platzhalter-Texte statt echter Empfehlungen.",
      action: 'AI_MODE="live" setzen (und ANTHROPIC_API_KEY hinterlegen).',
    });
  } else if (!input.hasApiKey) {
    checks.push({
      id: "ai-mode",
      title: "Kein API-Schlüssel hinterlegt",
      level: "blocker",
      detail: "AI_MODE ist live, aber ANTHROPIC_API_KEY fehlt – jede Generierung schlägt fehl.",
      action: "ANTHROPIC_API_KEY in der .env setzen.",
    });
  } else {
    checks.push({
      id: "ai-mode",
      title: "KI im Live-Modus",
      level: "ok",
      detail: "Guides bekommen echte, personalisierte Texte.",
    });
  }

  // --- Bestand: der eigentliche Qualitätshebel ----------------------------
  const thin = (Object.keys(MIN_STOCK) as AreaKey[])
    .map((area) => ({ area, have: input.stock[area] ?? 0, need: MIN_STOCK[area] }))
    .filter((r) => r.have < r.need);

  if (thin.length === 0) {
    checks.push({
      id: "bestand",
      title: "Ortsbestand ausreichend",
      level: "ok",
      detail: "Jeder Bereich hat genug geprüfte Einträge für einen vollen Guide.",
    });
  } else {
    // Sehen/Essen sind das Rückgrat jedes Guides – fehlen sie, wirkt er leer.
    const coreThin = thin.some((r) => r.area === "sights" || r.area === "foodMid");
    checks.push({
      id: "bestand",
      title: "Ortsbestand zu dünn",
      level: coreThin ? "blocker" : "warnung",
      detail: thin
        .map((r) => `${AREA_LABELS[r.area]}: ${r.have} von ${r.need}`)
        .join(" · "),
      action:
        'Im Admin unter „Kuratieren" Orte aus OpenStreetMap importieren, prüfen und auf „Geprüft" stellen.',
    });
  }

  // --- Betrieb -------------------------------------------------------------
  if (input.stalePendingRequests > 0) {
    checks.push({
      id: "worker",
      title: "Worker verarbeitet nichts",
      level: "blocker",
      detail: `${input.stalePendingRequests} Anfrage(n) warten seit über 15 Minuten.`,
      action: "Worker-Prozess starten bzw. Logs prüfen (npm run worker).",
    });
  }

  if (input.failedRequests > 0) {
    checks.push({
      id: "failed",
      title: "Fehlgeschlagene Generierungen",
      level: "warnung",
      detail: `${input.failedRequests} Anfrage(n) mit Status „failed".`,
      action: "Fehlermeldung im Dashboard ansehen und neu anstoßen.",
    });
  }

  if (!input.hasAppUrl) {
    checks.push({
      id: "app-url",
      title: "APP_URL nicht gesetzt",
      level: "warnung",
      detail: "E-Mail-Links und Teilen-Links zeigen sonst auf localhost.",
      action: "APP_URL auf die öffentliche Adresse setzen.",
    });
  }

  if (input.adminPasswordIsWeak) {
    checks.push({
      id: "admin-pw",
      title: "Admin-Passwort ist unsicher",
      level: "blocker",
      detail: "Es ist leer oder noch auf dem Beispielwert.",
      action: "ADMIN_PASSWORD auf ein langes, zufälliges Passwort setzen.",
    });
  }

  return checks;
}

/** Kurzfazit: Kann verkauft werden? */
export function readinessVerdict(checks: ReadinessCheck[]): {
  sellable: boolean;
  blockers: number;
  warnings: number;
} {
  const blockers = checks.filter((c) => c.level === "blocker").length;
  const warnings = checks.filter((c) => c.level === "warnung").length;
  return { sellable: blockers === 0, blockers, warnings };
}
