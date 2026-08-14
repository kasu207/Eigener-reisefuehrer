import "dotenv/config";
import { prisma } from "../lib/db";
import { generateGuideForRequest } from "../lib/guide-generation";
import { processKnowledgeDocument } from "../lib/knowledge";
import { ensureAccommodationPlaces } from "../lib/accommodation";
import { staleAfterMs } from "../lib/generation-progress";

/**
 * DB-basierte Job-Queue (Anforderung 7): pollt `guide_requests` mit Status
 * `pending`, claimt sie atomar und generiert den Guide im Hintergrund.
 * Start: `npm run worker`
 */

const POLL_INTERVAL_MS = 5000;
/** Wie oft nach hängengebliebenen Aufträgen gesucht wird. */
const STALE_SWEEP_INTERVAL_MS = 60_000;

async function claimNextRequest(): Promise<string | null> {
  // Atomarer Claim: pending -> generating (verhindert Doppelverarbeitung).
  // Fortschritt zurücksetzen und sofort ein Lebenszeichen setzen, damit ein
  // frisch geclaimter Auftrag nicht als hängend gilt.
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE guide_requests
    SET status = 'generating',
        heartbeat_at = NOW(),
        progress_done = 0,
        progress_total = 0,
        progress_label = ''
    WHERE id = (
      SELECT id FROM guide_requests
      WHERE status = 'pending'
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id
  `;
  return rows[0]?.id ?? null;
}

async function processOne(): Promise<boolean> {
  const id = await claimNextRequest();
  if (!id) return false;

  console.log(`[worker] Generiere Guide für Request ${id} ...`);
  const started = Date.now();
  try {
    // Einmalig echte Orte für den Unterkunfts-/Wunsch-Ort laden (idempotent,
    // no-op bei genug Bestand) – damit z. B. Torno echte Tipps bekommt.
    await ensureAccommodationPlaces(id);
    const guideId = await generateGuideForRequest(id);
    await prisma.guideRequest.update({ where: { id }, data: { status: "ready", error: null } });
    console.log(`[worker] Fertig: Guide ${guideId} in ${Math.round((Date.now() - started) / 1000)}s`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[worker] Fehler bei Request ${id}:`, message);
    await prisma.guideRequest.update({
      where: { id },
      data: { status: "failed", error: message.slice(0, 2000) },
    });
  }
  return true;
}

/** Wissensquellen (Bücher/Blogs) einlesen und von der KI aufbereiten lassen. */
async function claimNextDocument(): Promise<string | null> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE knowledge_documents
    SET status = 'processing'
    WHERE id = (
      SELECT id FROM knowledge_documents
      WHERE status = 'uploaded' AND moderation_status = 'approved'
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id
  `;
  return rows[0]?.id ?? null;
}

async function processOneDocument(): Promise<boolean> {
  const id = await claimNextDocument();
  if (!id) return false;

  console.log(`[worker] Analysiere Wissensquelle ${id} ...`);
  try {
    const { created, skippedDuplicates } = await processKnowledgeDocument(id);
    await prisma.knowledgeDocument.update({
      where: { id },
      data: { status: "analyzed", error: null },
    });
    console.log(
      `[worker] Wissensquelle ${id}: ${created} Notizen angelegt` +
        (skippedDuplicates > 0 ? `, ${skippedDuplicates} Duplikate übersprungen` : "")
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[worker] Fehler bei Wissensquelle ${id}:`, message);
    await prisma.knowledgeDocument.update({
      where: { id },
      data: { status: "failed", error: message.slice(0, 2000) },
    });
  }
  return true;
}

/**
 * Hängende Aufträge einsammeln: Stirbt der Worker mitten in der Generierung
 * (Absturz, Neustart, OOM), bliebe der Request für immer auf `generating` –
 * die Guide-Seite würde endlos „wird geschrieben" anzeigen. Ohne Lebenszeichen
 * innerhalb der Frist gilt der Auftrag deshalb als fehlgeschlagen und kann im
 * Admin neu angestoßen werden.
 */
async function failStaleRequests() {
  const cutoff = new Date(Date.now() - staleAfterMs());
  const stuck = await prisma.guideRequest.findMany({
    where: {
      status: "generating",
      OR: [
        { heartbeatAt: { lt: cutoff } },
        // Aufträge aus einem Absturz vor Einführung des Lebenszeichens
        { heartbeatAt: null, createdAt: { lt: cutoff } },
      ],
    },
    select: { id: true },
  });
  for (const { id } of stuck) {
    console.error(`[worker] Auftrag ${id} ohne Lebenszeichen – als fehlgeschlagen markiert`);
    await prisma.guideRequest.update({
      where: { id },
      data: {
        status: "failed",
        error:
          "Die Generierung wurde unterbrochen (kein Lebenszeichen des Workers). " +
          "Bitte im Admin neu anstoßen.",
      },
    });
  }
}

/** DSGVO-Löschroutine: Personendaten nach konfigurierbarer Frist entfernen. */
async function cleanupOldPersonalData() {
  const months = Number(process.env.DATA_RETENTION_MONTHS ?? "12");
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const result = await prisma.guideRequest.deleteMany({ where: { createdAt: { lt: cutoff } } });
  if (result.count > 0) {
    console.log(`[worker] DSGVO-Löschung: ${result.count} alte Guide-Requests entfernt`);
  }
}

async function main() {
  console.log("[worker] Guide-Worker gestartet, warte auf Aufträge ...");
  let lastCleanup = 0;
  let lastStaleSweep = 0;
  for (;;) {
    try {
      if (Date.now() - lastCleanup > 24 * 60 * 60 * 1000) {
        await cleanupOldPersonalData();
        lastCleanup = Date.now();
      }
      if (Date.now() - lastStaleSweep > STALE_SWEEP_INTERVAL_MS) {
        await failStaleRequests();
        lastStaleSweep = Date.now();
      }
      const workedGuide = await processOne();
      const workedDoc = await processOneDocument();
      if (!workedGuide && !workedDoc) await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    } catch (err) {
      console.error("[worker] Unerwarteter Fehler:", err);
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }
}

main();
