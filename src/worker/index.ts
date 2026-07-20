import "dotenv/config";
import { prisma } from "../lib/db";
import { generateGuideForRequest } from "../lib/guide-generation";

/**
 * DB-basierte Job-Queue (Anforderung 7): pollt `guide_requests` mit Status
 * `pending`, claimt sie atomar und generiert den Guide im Hintergrund.
 * Start: `npm run worker`
 */

const POLL_INTERVAL_MS = 5000;

async function claimNextRequest(): Promise<string | null> {
  // Atomarer Claim: pending -> generating (verhindert Doppelverarbeitung)
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE guide_requests
    SET status = 'generating'
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
  for (;;) {
    try {
      if (Date.now() - lastCleanup > 24 * 60 * 60 * 1000) {
        await cleanupOldPersonalData();
        lastCleanup = Date.now();
      }
      const worked = await processOne();
      if (!worked) await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    } catch (err) {
      console.error("[worker] Unerwarteter Fehler:", err);
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }
}

main();
