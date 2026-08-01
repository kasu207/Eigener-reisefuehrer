import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import {
  embedTexts,
  embeddingsEnabled,
  toVectorLiteral,
} from "../src/lib/ai/embeddings";
import { contextualChunkText, resolvePlaceNames } from "../src/lib/knowledge";

const prisma = new PrismaClient();

/**
 * Backfill für Bestandsnotizen nach der pgvector-Umstellung:
 *
 * 1. Freie `placeNames` gegen die Orte der Region auflösen → `placeIds`
 *    (nicht auflösbare Namen bleiben als Orts-Kandidaten stehen).
 * 2. Fehlende Embeddings über den kontextualisierten Notiz-Text erzeugen.
 *
 * Aufruf: npm run db:backfill-embeddings
 * Idempotent – bereits embeddete Notizen werden übersprungen.
 */
async function main() {
  if (!embeddingsEnabled()) {
    console.log(
      "Hinweis: kein VOYAGE_API_KEY gesetzt und nicht im Mock-Modus – " +
        "es werden nur placeIds aufgelöst, keine Embeddings erzeugt."
    );
  }

  const regions = await prisma.region.findMany({
    include: { documents: { include: { chunks: true } } },
  });

  // Welche Notizen haben schon ein Embedding? (Unsupported-Spalte => Raw-SQL)
  const embeddedRows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM knowledge_chunks WHERE embedding IS NOT NULL
  `;
  const alreadyEmbedded = new Set(embeddedRows.map((r) => r.id));

  let resolvedCount = 0;
  let embeddedCount = 0;

  for (const region of regions) {
    const knownPlaces = await prisma.place.findMany({
      where: { regionId: region.id },
      select: { id: true, name: true, locality: true },
    });
    const nameById = new Map(knownPlaces.map((p) => [p.id, p.name]));

    for (const doc of region.documents) {
      const toEmbed: { id: string; text: string }[] = [];

      for (const chunk of doc.chunks) {
        // 1. placeNames → placeIds auflösen (nur wenn noch nichts aufgelöst
        //    wurde oder neue Namen auflösbar sind)
        const resolved = resolvePlaceNames(chunk.placeNames, knownPlaces);
        const placeIds = [...new Set([...chunk.placeIds, ...resolved.placeIds])];
        const placeNames = resolved.unresolved;
        const changed =
          placeIds.length !== chunk.placeIds.length ||
          placeNames.length !== chunk.placeNames.length;
        if (changed) {
          await prisma.knowledgeChunk.update({
            where: { id: chunk.id },
            data: { placeIds, placeNames },
          });
          resolvedCount++;
        }

        // 2. Embedding fehlt? Kontexttext vormerken.
        if (!alreadyEmbedded.has(chunk.id)) {
          const placeLabels = [
            ...placeIds.map((id) => nameById.get(id)).filter((n): n is string => Boolean(n)),
            ...placeNames,
          ];
          toEmbed.push({
            id: chunk.id,
            text: contextualChunkText({
              regionName: region.name,
              sourceTitle: doc.title,
              sourceKind: doc.kind,
              title: chunk.title,
              content: chunk.content,
              placeLabels,
            }),
          });
        }
      }

      if (toEmbed.length === 0) continue;
      const vectors = await embedTexts(
        toEmbed.map((c) => c.text),
        "document"
      );
      if (!vectors) continue; // Embeddings nicht konfiguriert
      for (let i = 0; i < toEmbed.length; i++) {
        await prisma.$executeRaw`
          UPDATE knowledge_chunks
          SET embedding = ${toVectorLiteral(vectors[i])}::vector
          WHERE id = ${toEmbed[i].id}
        `;
        embeddedCount++;
      }
      console.log(`Quelle "${doc.title}": ${toEmbed.length} Notizen embedded`);
    }
  }

  console.log(
    `Fertig: ${resolvedCount} Notizen mit aufgelösten placeIds, ${embeddedCount} neue Embeddings.`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
