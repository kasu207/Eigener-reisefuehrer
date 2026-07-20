import { prisma } from "./db";
import { analyzePdf, analyzeText, analyzeUrl, UnsafeSourceError } from "./ai/analyze-document";
import type { Questionnaire } from "./questionnaire";
import type { KnowledgeChunk } from "@prisma/client";

export { UnsafeSourceError };

/**
 * Verarbeitung von Wissensquellen (Bücher, Reiseführer, Blogs) und Matching
 * der aufbereiteten Notizen auf den Fragebogen.
 */

export async function processKnowledgeDocument(documentId: string): Promise<number> {
  const doc = await prisma.knowledgeDocument.findUniqueOrThrow({
    where: { id: documentId },
    include: { region: true },
  });

  if (doc.moderationStatus !== "approved") {
    throw new Error("Dokument ist nicht freigegeben (Moderation ausstehend oder abgelehnt)");
  }

  let result;
  try {
    if (doc.url) {
      result = await analyzeUrl(doc.region.name, doc.url);
    } else if (doc.fileData && doc.mimeType === "application/pdf") {
      result = await analyzePdf(doc.region.name, Buffer.from(doc.fileData));
    } else if (doc.fileData) {
      result = await analyzeText(doc.region.name, Buffer.from(doc.fileData).toString("utf8"));
    } else {
      throw new Error("Dokument hat weder URL noch Datei");
    }
  } catch (err) {
    // Sicherheitsprüfung: unzulässige Quelle automatisch ablehnen –
    // sie gelangt nie in die Wissensdatenbank
    if (err instanceof UnsafeSourceError) {
      await prisma.knowledgeDocument.update({
        where: { id: doc.id },
        data: { moderationStatus: "rejected", moderationNote: err.reason },
      });
    }
    throw err;
  }

  // Alte Chunks ersetzen (Re-Analyse möglich)
  await prisma.knowledgeChunk.deleteMany({ where: { documentId: doc.id } });
  for (const chunk of result.chunks) {
    await prisma.knowledgeChunk.create({
      data: {
        documentId: doc.id,
        title: chunk.title,
        content: chunk.content,
        interests: chunk.interests,
        placeNames: chunk.placeNames,
      },
    });
  }
  return result.chunks.length;
}

export type ChunkWithSource = KnowledgeChunk & {
  document: { title: string; kind: string; url: string | null };
};

/**
 * Notizen passend zum Fragebogen auswählen: Interessen-Schnittmenge,
 * gewichtete Interessen zählen doppelt. Deterministisch sortiert.
 */
export function matchChunksToQuestionnaire(
  chunks: ChunkWithSource[],
  q: Questionnaire,
  limit = 12
): ChunkWithSource[] {
  const weights = new Map(q.interests.map((i) => [i.key as string, i.weight === "wichtig" ? 2 : 1]));
  return chunks
    .map((chunk) => {
      const score = chunk.interests.reduce((acc, key) => acc + (weights.get(key) ?? 0), 0);
      return { chunk, score };
    })
    .filter((c) => c.score > 0 || c.chunk.interests.length === 0)
    .sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id))
    .slice(0, limit)
    .map((c) => c.chunk);
}

/** Notizen, die sich per Ortsname einem konkreten Eintrag zuordnen lassen. */
export function chunksForPlaceName(chunks: ChunkWithSource[], name: string): ChunkWithSource[] {
  const lower = name.toLowerCase();
  return chunks.filter((c) =>
    c.placeNames.some(
      (p) => lower.includes(p.toLowerCase()) || p.toLowerCase().includes(lower)
    )
  );
}

export function formatChunkForPrompt(chunk: ChunkWithSource): string {
  return `${chunk.title}: ${chunk.content} (Quelle: ${chunk.document.title})`;
}
