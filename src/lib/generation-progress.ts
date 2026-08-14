import { z } from "zod";

/**
 * Fortschritt und Lebenszeichen der Textgenerierung.
 *
 * Zwei Dinge sollen von außen sichtbar sein: **wie weit** die KI ist
 * (Kapitel x von y) und **ob überhaupt noch jemand arbeitet**. Ohne
 * Lebenszeichen sieht ein abgestürzter Worker exakt aus wie ein laufender –
 * der Status bliebe für immer auf `generating` stehen.
 */

/** Ohne Lebenszeichen gilt ein laufender Auftrag nach dieser Frist als hängend. */
export const DEFAULT_STALE_MINUTES = 15;

export function staleAfterMs(): number {
  const minutes = Number(process.env.GENERATION_STALE_MINUTES ?? DEFAULT_STALE_MINUTES);
  const valid = Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_STALE_MINUTES;
  return valid * 60_000;
}

export interface GenerationState {
  status: string;
  heartbeatAt: Date | null;
  createdAt: Date;
}

/** Wartet der Auftrag noch auf den Worker oder wird gerade generiert? */
export function isRunning(status: string): boolean {
  return status === "pending" || status === "generating";
}

/**
 * Hängend = generiert, aber seit der Frist kein Lebenszeichen. Solange der
 * Worker noch gar nichts geschrieben hat, zählt die Anlagezeit – sonst wären
 * Aufträge aus einem früheren Absturz (heartbeat = null) für immer unsichtbar.
 */
export function isStale(
  state: GenerationState,
  now: Date = new Date(),
  staleMs: number = staleAfterMs()
): boolean {
  if (state.status !== "generating") return false;
  const last = state.heartbeatAt ?? state.createdAt;
  return now.getTime() - last.getTime() > staleMs;
}

/** Alter des letzten Lebenszeichens in Sekunden (null = noch keines). */
export function heartbeatAgeSeconds(
  heartbeatAt: Date | null,
  now: Date = new Date()
): number | null {
  if (!heartbeatAt) return null;
  return Math.max(0, Math.round((now.getTime() - heartbeatAt.getTime()) / 1000));
}

/**
 * Fortschritt in Prozent. `total = 0` (Auftrag noch nicht aufgeschlüsselt)
 * ergibt 0, nicht NaN; Ausreißer werden auf 0–100 begrenzt.
 */
export function progressPercent(done: number, total: number): number {
  if (!Number.isFinite(done) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
}

/** Menschenlesbare Kurzfassung, z. B. "Kapitel 3 von 9 · Torno". */
export function progressLabel(done: number, total: number, label: string): string {
  if (total <= 0) return "Auswahl wird vorbereitet";
  const step = `Kapitel ${Math.min(done + 1, total)} von ${total}`;
  return label ? `${step} · ${label}` : step;
}

/** Gepinnte Einträge: robust gegen Alt-/Fremdformate in der JSON-Spalte. */
const pinnedIdsSchema = z.array(z.string().min(1).max(64)).max(500);

export function parsePinnedIds(raw: unknown): string[] {
  const parsed = pinnedIdsSchema.safeParse(raw ?? []);
  return parsed.success ? [...new Set(parsed.data)] : [];
}
