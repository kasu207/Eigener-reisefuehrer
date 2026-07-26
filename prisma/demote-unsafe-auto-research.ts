import "dotenv/config";
import { PrismaClient } from "@prisma/client";

/**
 * Einmaliges Aufräum-Skript für einen Bug, der bereits Daten angelegt hat:
 * `ensureAccommodationPlaces` (automatische Unterkunfts-Recherche) hat VOR
 * diesem Fix jeden recherchierten Kandidaten – auch mit KI-Selbsteinschätzung
 * "Sicherheit real: niedrig" – direkt als `status: "verified"` gespeichert.
 * Ein "niedrig"-Kandidat heißt: die KI ist sich selbst nicht sicher, dass der
 * Ort so existiert. Das erzeugte genau den beobachteten Fall (ein Guide-Text,
 * der einräumt, der Ort sei nicht sicher auffindbar).
 *
 * Dieses Skript stuft alle betroffenen, bereits verifizierten Orte auf
 * "draft" zurück (nicht löschen – Redaktion kann sie im Admin prüfen und ggf.
 * freigeben). Erkennung über den festen editorNotes-Marker, den nur diese
 * automatische Recherche setzt. Idempotent: bereits zurückgestufte Orte
 * werden nicht erneut angefasst (Query filtert auf status "verified").
 *
 * Ausführen:
 *   docker compose -f docker-compose.prod.yml exec app npx tsx prisma/demote-unsafe-auto-research.ts
 *   # oder lokal:  npx tsx prisma/demote-unsafe-auto-research.ts
 */

const prisma = new PrismaClient();

async function main() {
  const affected = await prisma.place.findMany({
    where: {
      status: "verified",
      AND: [
        { editorNotes: { contains: "Automatisch zum Unterkunfts-Ort recherchiert" } },
        { editorNotes: { contains: "Sicherheit real: niedrig" } },
      ],
    },
    select: { id: true, name: true, locality: true },
  });

  if (affected.length === 0) {
    console.log("Nichts zu tun: keine betroffenen Orte gefunden.");
    return;
  }

  for (const p of affected) {
    await prisma.place.update({
      where: { id: p.id },
      data: { status: "draft", lastVerifiedAt: null },
    });
    console.log(`- Zurückgestuft (draft): "${p.name}" (${p.locality || "regionsweit"})`);
  }

  console.log(
    `\n${affected.length} Ort(e) auf "Entwurf" zurückgestuft. Prüfe sie im Admin unter ` +
      `"Orte" (Status "Entwurf") und stelle sie erst nach Prüfung auf "Geprüft". ` +
      `Guides, die diese Orte enthalten, müssen einmal "Neu generieren", damit sie verschwinden.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
