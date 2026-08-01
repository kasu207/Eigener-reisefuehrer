import { prisma } from "./db";
import {
  analyzePdf,
  analyzeText,
  analyzeUrl,
  UnsafeSourceError,
  type AnalyzedChunk,
  type KnownPlace,
} from "./ai/analyze-document";
import {
  embedText,
  embedTexts,
  embeddingsEnabled,
  toVectorLiteral,
  cosineSimilarity,
} from "./ai/embeddings";
import { INTEREST_LABELS, type Questionnaire } from "./questionnaire";
import type { KnowledgeChunk } from "@prisma/client";

export { UnsafeSourceError };

/**
 * Verarbeitung von Wissensquellen (Bücher, Reiseführer, Blogs) und Matching
 * der aufbereiteten Notizen auf Fragebogen und Orte.
 *
 * Retrieval-Strategie:
 * 1. Semantisch (pgvector + Voyage-Embeddings), wenn konfiguriert –
 *    Fragebogen wird zu einem Suchtext, Notizen sind kontextualisiert
 *    embedded ("Contextual Retrieval").
 * 2. Fallback: Tag-basiertes Interessen-Matching (funktioniert immer,
 *    auch ganz ohne Embedding-Schlüssel).
 *
 * Ortszuordnung: Notizen tragen aufgelöste `placeIds` (exakt); freie
 * `placeNames` bleiben nur für nicht auflösbare Orte stehen und dienen der
 * Redaktion als Kandidaten für neue Einträge.
 */

/** Ab dieser Cosine-Ähnlichkeit gilt eine neue Notiz als Duplikat. */
const DUPLICATE_SIMILARITY = 0.92;

// ---------------------------------------------------------------------------
// Ortsnamen-Auflösung
// ---------------------------------------------------------------------------

/** Normalisiert Ortsnamen für den Vergleich (Akzente, Groß-/Kleinschreibung). */
export function normalizePlaceKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Freie Ortsnamen gegen die bekannten Orte auflösen. Zurück kommen die
 * gefundenen `placeIds` und die unauflösbaren Namen (Orts-Kandidaten).
 */
export function resolvePlaceNames(
  names: string[],
  knownPlaces: KnownPlace[]
): { placeIds: string[]; unresolved: string[] } {
  const byKey = new Map(knownPlaces.map((p) => [normalizePlaceKey(p.name), p.id]));
  const placeIds: string[] = [];
  const unresolved: string[] = [];
  for (const name of names) {
    const key = normalizePlaceKey(name);
    if (!key) continue;
    const id = byKey.get(key);
    if (id) placeIds.push(id);
    else unresolved.push(name);
  }
  return { placeIds: [...new Set(placeIds)], unresolved: [...new Set(unresolved)] };
}

// ---------------------------------------------------------------------------
// Ingestion: Quelle analysieren, kontextualisieren, embedden, deduplizieren
// ---------------------------------------------------------------------------

/**
 * Kontextualisierter Text, der embedded wird ("Contextual Retrieval" nach
 * Anthropic): Region, Quelle und Orte werden dem Notiz-Text vorangestellt,
 * damit das Embedding den Zusammenhang kennt.
 */
export function contextualChunkText(args: {
  regionName: string;
  sourceTitle: string;
  sourceKind: string;
  title: string;
  content: string;
  placeLabels: string[];
}): string {
  const places = args.placeLabels.length ? ` · Orte: ${args.placeLabels.join(", ")}` : "";
  return `Region ${args.regionName} · Quelle: ${args.sourceTitle} (${args.sourceKind})${places}\n${args.title}: ${args.content}`;
}

interface PreparedChunk {
  title: string;
  content: string;
  interests: string[];
  placeIds: string[];
  placeNames: string[];
  contextText: string;
}

/** Analyse-Ergebnis in speicherbare Notizen überführen (Orte auflösen). */
function prepareChunks(
  analyzed: AnalyzedChunk[],
  knownPlaces: KnownPlace[],
  regionName: string,
  sourceTitle: string,
  sourceKind: string
): PreparedChunk[] {
  const nameById = new Map(knownPlaces.map((p) => [p.id, p.name]));
  return analyzed.map((chunk) => {
    // KI-gelieferte ids + code-seitige Namensauflösung als zweites Netz
    const resolved = resolvePlaceNames(chunk.placeNames, knownPlaces);
    const placeIds = [...new Set([...chunk.placeIds, ...resolved.placeIds])];
    const placeNames = resolved.unresolved;
    const placeLabels = [
      ...placeIds.map((id) => nameById.get(id)).filter((n): n is string => Boolean(n)),
      ...placeNames,
    ];
    return {
      title: chunk.title,
      content: chunk.content,
      interests: chunk.interests,
      placeIds,
      placeNames,
      contextText: contextualChunkText({
        regionName,
        sourceTitle,
        sourceKind,
        title: chunk.title,
        content: chunk.content,
        placeLabels,
      }),
    };
  });
}

/** Nächste bestehende Notiz der Region zu einem Vektor (für Dedup). */
async function nearestExistingSimilarity(
  regionId: string,
  excludeDocumentId: string,
  vector: number[]
): Promise<number> {
  const literal = toVectorLiteral(vector);
  const rows = await prisma.$queryRaw<{ similarity: number }[]>`
    SELECT 1 - (kc.embedding <=> ${literal}::vector) AS similarity
    FROM knowledge_chunks kc
    JOIN knowledge_documents kd ON kd.id = kc.document_id
    WHERE kd.region_id = ${regionId}
      AND kd.id <> ${excludeDocumentId}
      AND kc.embedding IS NOT NULL
    ORDER BY kc.embedding <=> ${literal}::vector
    LIMIT 1
  `;
  return rows[0]?.similarity ?? 0;
}

export interface ProcessResult {
  created: number;
  /** Als Duplikat bestehender Notizen übersprungen. */
  skippedDuplicates: number;
}

export async function processKnowledgeDocument(documentId: string): Promise<ProcessResult> {
  const doc = await prisma.knowledgeDocument.findUniqueOrThrow({
    where: { id: documentId },
    include: { region: true },
  });

  if (doc.moderationStatus !== "approved") {
    throw new Error("Dokument ist nicht freigegeben (Moderation ausstehend oder abgelehnt)");
  }

  const knownPlaces: KnownPlace[] = await prisma.place.findMany({
    where: { regionId: doc.regionId },
    select: { id: true, name: true, locality: true },
    orderBy: { name: "asc" },
  });

  let result;
  try {
    if (doc.url) {
      result = await analyzeUrl(doc.region.name, knownPlaces, doc.url);
    } else if (doc.fileData && doc.mimeType === "application/pdf") {
      result = await analyzePdf(doc.region.name, knownPlaces, Buffer.from(doc.fileData));
    } else if (doc.fileData) {
      result = await analyzeText(
        doc.region.name,
        knownPlaces,
        Buffer.from(doc.fileData).toString("utf8")
      );
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

  const prepared = prepareChunks(
    result.chunks,
    knownPlaces,
    doc.region.name,
    doc.title,
    doc.kind
  );

  // Embeddings über die kontextualisierten Texte (null = nicht konfiguriert)
  let vectors: (number[] | null)[] = prepared.map(() => null);
  const embedded = await embedTexts(
    prepared.map((c) => c.contextText),
    "document"
  );
  if (embedded) vectors = embedded;

  // Alte Chunks ersetzen (Re-Analyse möglich) – vor dem Dedup, damit die
  // eigenen alten Notizen nicht als "Duplikat" zählen.
  await prisma.knowledgeChunk.deleteMany({ where: { documentId: doc.id } });

  let created = 0;
  let skippedDuplicates = 0;
  const insertedVectors: number[][] = [];

  for (let i = 0; i < prepared.length; i++) {
    const chunk = prepared[i];
    const vector = vectors[i];

    if (vector) {
      // Dedup gegen bereits eingefügte Notizen dieses Laufs …
      const batchDup = insertedVectors.some(
        (v) => cosineSimilarity(v, vector) >= DUPLICATE_SIMILARITY
      );
      // … und gegen den Bestand anderer Quellen der Region
      const existingSim = batchDup
        ? 0
        : await nearestExistingSimilarity(doc.regionId, doc.id, vector);
      if (batchDup || existingSim >= DUPLICATE_SIMILARITY) {
        skippedDuplicates++;
        continue;
      }
    }

    const row = await prisma.knowledgeChunk.create({
      data: {
        documentId: doc.id,
        title: chunk.title,
        content: chunk.content,
        interests: chunk.interests,
        placeIds: chunk.placeIds,
        placeNames: chunk.placeNames,
      },
    });
    if (vector) {
      await prisma.$executeRaw`
        UPDATE knowledge_chunks
        SET embedding = ${toVectorLiteral(vector)}::vector
        WHERE id = ${row.id}
      `;
      insertedVectors.push(vector);
    }
    created++;
  }

  return { created, skippedDuplicates };
}

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------

export type ChunkWithSource = KnowledgeChunk & {
  document: { title: string; kind: string; url: string | null };
};

/** Fragebogen zu einem semantischen Suchtext verdichten. */
export function questionnaireToSearchText(q: Questionnaire, regionName: string): string {
  const important = q.interests
    .filter((i) => i.weight === "wichtig")
    .map((i) => INTEREST_LABELS[i.key]);
  const nice = q.interests
    .filter((i) => i.weight === "interessant")
    .map((i) => INTEREST_LABELS[i.key]);
  const parts = [
    `Reise: ${regionName}, Unterkunft in ${q.accommodation.label}`,
    important.length ? `Besonders wichtig: ${important.join(", ")}` : "",
    nice.length ? `Außerdem interessant: ${nice.join(", ")}` : "",
    q.children.length
      ? `Mit ${q.children.length} Kind(ern) (${q.children.map((c) => c.ageGroup).join(", ")} Jahre)`
      : "Ohne Kinder",
    `Tempo: ${q.pace}, Fitness: ${q.fitnessLevel}`,
    q.diets.length ? `Ernährung: ${q.diets.join(", ")}` : "",
    q.foodPreferences.length ? `Essens-Vorlieben: ${q.foodPreferences.join(", ")}` : "",
    q.occasion ? `Anlass: ${q.occasion}` : "",
    (q.anchors ?? []).length
      ? `Wunsch-Orte: ${(q.anchors ?? []).map((a) => a.label).join(", ")}`
      : "",
  ];
  return parts.filter(Boolean).join(". ");
}

/** Semantische Top-K-Notizen der Region (null = Embeddings nicht verfügbar). */
async function semanticChunkIds(
  regionId: string,
  q: Questionnaire,
  regionName: string,
  limit: number
): Promise<string[] | null> {
  if (!embeddingsEnabled()) return null;
  const vector = await embedText(questionnaireToSearchText(q, regionName), "query");
  if (!vector) return null;
  const literal = toVectorLiteral(vector);
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT kc.id
    FROM knowledge_chunks kc
    JOIN knowledge_documents kd ON kd.id = kc.document_id
    WHERE kd.region_id = ${regionId}
      AND kd.status = 'analyzed'
      AND kc.embedding IS NOT NULL
    ORDER BY kc.embedding <=> ${literal}::vector
    LIMIT ${limit}
  `;
  return rows.map((r) => r.id);
}

/**
 * Notizen passend zum Fragebogen auswählen: semantisch (pgvector), wenn
 * verfügbar; Notizen ohne Embedding (Altbestand) und der Komplett-Fallback
 * laufen über das Tag-Matching.
 */
export async function selectChunksForQuestionnaire(
  regionId: string,
  regionName: string,
  chunks: ChunkWithSource[],
  q: Questionnaire,
  limit = 12
): Promise<ChunkWithSource[]> {
  try {
    const ids = await semanticChunkIds(regionId, q, regionName, limit);
    if (ids && ids.length > 0) {
      const byId = new Map(chunks.map((c) => [c.id, c]));
      const picked = ids
        .map((id) => byId.get(id))
        .filter((c): c is ChunkWithSource => Boolean(c));
      if (picked.length >= limit) return picked.slice(0, limit);
      // Rest über Tag-Matching auffüllen (z. B. Notizen ohne Embedding)
      const pickedIds = new Set(picked.map((c) => c.id));
      const rest = matchChunksToQuestionnaire(
        chunks.filter((c) => !pickedIds.has(c.id)),
        q,
        limit - picked.length
      );
      return [...picked, ...rest];
    }
  } catch (err) {
    console.warn("Semantische Notiz-Suche fehlgeschlagen, Tag-Fallback:", err);
  }
  return matchChunksToQuestionnaire(chunks, q, limit);
}

/**
 * Tag-basiertes Matching (Fallback ohne Embeddings): Interessen-Schnittmenge,
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

/**
 * Notizen zu einem konkreten Ort: exakt über `placeIds`, plus Namens-Matching
 * für Altbestand (Notizen von vor der Umstellung) und Wanderungen.
 */
export function chunksForPlace(
  chunks: ChunkWithSource[],
  placeId: string,
  name: string
): ChunkWithSource[] {
  return chunks.filter(
    (c) => c.placeIds.includes(placeId) || matchesPlaceName(c, name)
  );
}

/** Notizen, die sich per Ortsname einem Eintrag zuordnen lassen (Fallback). */
export function chunksForPlaceName(chunks: ChunkWithSource[], name: string): ChunkWithSource[] {
  return chunks.filter((c) => matchesPlaceName(c, name));
}

function matchesPlaceName(chunk: ChunkWithSource, name: string): boolean {
  const lower = name.toLowerCase();
  return chunk.placeNames.some(
    (p) => lower.includes(p.toLowerCase()) || p.toLowerCase().includes(lower)
  );
}

export function formatChunkForPrompt(chunk: ChunkWithSource): string {
  return `${chunk.title}: ${chunk.content} (Quelle: ${chunk.document.title})`;
}
