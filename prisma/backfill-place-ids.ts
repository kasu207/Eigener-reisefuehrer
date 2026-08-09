import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { resolvePlaceNames } from "../src/lib/knowledge";

const prisma = new PrismaClient();

/**
 * Backfill für Bestandsnotizen nach der Umstellung auf exakte Ortszuordnung:
 * löst freie `placeNames` gegen die Orte der jeweiligen Region auf und
 * schreibt Treffer in `placeIds`. Nicht auflösbare Namen bleiben als
 * Orts-Kandidaten stehen (Hinweis für die Redaktion, neue Orte anzulegen).
 *
 * Aufruf: npm run db:backfill-place-ids
 * Idempotent – bereits aufgelöste Notizen ändern sich nicht noch einmal,
 * solange sich die Orte-Liste der Region nicht geändert hat.
 */
async function main() {
  const regions = await prisma.region.findMany({
    include: { documents: { include: { chunks: true } } },
  });

  let updated = 0;

  for (const region of regions) {
    const knownPlaces = await prisma.place.findMany({
      where: { regionId: region.id },
      select: { id: true, name: true, locality: true },
    });

    for (const doc of region.documents) {
      for (const chunk of doc.chunks) {
        const resolved = resolvePlaceNames(chunk.placeNames, knownPlaces);
        const placeIds = [...new Set([...chunk.placeIds, ...resolved.placeIds])];
        const placeNames = resolved.unresolved;
        const changed =
          placeIds.length !== chunk.placeIds.length ||
          placeNames.length !== chunk.placeNames.length;
        if (!changed) continue;
        await prisma.knowledgeChunk.update({
          where: { id: chunk.id },
          data: { placeIds, placeNames },
        });
        updated++;
      }
    }
  }

  console.log(`Fertig: ${updated} Notizen mit neu aufgelösten placeIds aktualisiert.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
