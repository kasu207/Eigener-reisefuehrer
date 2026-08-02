import { prisma } from "./db";
import {
  analyzePdf,
  analyzeText,
  analyzeUrl,
  UnsafeSourceError,
  type AnalyzedChunk,
  type KnownPlace,
} from "./ai/analyze-document";
import { INTEREST_LABELS, type Questionnaire } from "./questionnaire";
import type { KnowledgeChunk } from "@prisma/client";

export { UnsafeSourceError };

/**
 * Verarbeitung von Wissensquellen (Bücher, Reiseführer, Blogs) und Matching
 * der aufbereiteten Notizen auf Fragebogen und Orte.
 *
 * Bewusst OHNE Embeddings/externe Dienste – alles läuft mit Postgres-
 * Bordmitteln (Extensions "pg_trgm" und "unaccent", Teil jedes Standard-
 * Postgres-Images, kein API-Key, keine Netzwerkabhängigkeit):
 *
 * - **Retrieval**: Hybrid aus Tag-Matching (strukturiertes, redaktionelles
 *   Signal aus den Interessen-Tags) und Postgres-Volltextsuche
 *   (`websearch_to_tsquery`/`ts_rank_cd`, freies Textsignal – findet auch
 *   Begriffe, die nicht als Tag hinterlegt sind). Fusion per Reciprocal
 *   Rank Fusion (RRF), Standard-Rezept für Hybrid Search.
 * - **Dedup**: Trigram-Ähnlichkeit (`similarity()` aus pg_trgm) zwischen
 *   neuen und bestehenden Notizen der Region.
 * - **Ortszuordnung**: exakt über `placeIds` (von der KI-Analyse geliefert,
 *   gegen die echte Orte-Liste validiert); nicht auflösbare Namen bleiben
 *   als Orts-Kandidaten für die Redaktion stehen.
 */

/** Ab dieser Trigram-Ähnlichkeit (0–1) gilt eine neue Notiz als Duplikat. */
const DUPLICATE_SIMILARITY = 0.42;

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
// Ingestion: Quelle analysieren, Orte auflösen, deduplizieren
// ---------------------------------------------------------------------------

interface PreparedChunk {
  title: string;
  content: string;
  interests: string[];
  placeIds: string[];
  placeNames: string[];
}

/** Analyse-Ergebnis in speicherbare Notizen überführen (Orte auflösen). */
function prepareChunks(analyzed: AnalyzedChunk[], knownPlaces: KnownPlace[]): PreparedChunk[] {
  return analyzed.map((chunk) => {
    // KI-gelieferte ids + code-seitige Namensauflösung als zweites Netz
    const resolved = resolvePlaceNames(chunk.placeNames, knownPlaces);
    return {
      title: chunk.title,
      content: chunk.content,
      interests: chunk.interests,
      placeIds: [...new Set([...chunk.placeIds, ...resolved.placeIds])],
      placeNames: resolved.unresolved,
    };
  });
}

/**
 * Höchste Trigram-Ähnlichkeit einer bestehenden Notiz der Region zu einem
 * Text (Titel + Inhalt kombiniert). Läuft gegen alle Notizen der Region
 * außer dem aktuellen Dokument (dessen alte Chunks wurden vor dem Lauf
 * bereits gelöscht) – erfasst damit sowohl Dubletten aus anderen Quellen
 * als auch bereits in diesem Lauf eingefügte Notizen.
 */
async function maxExistingSimilarity(regionId: string, combinedText: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ similarity: number }[]>`
    SELECT similarity(unaccent(kc.title || ' ' || kc.content), unaccent(${combinedText})) AS similarity
    FROM knowledge_chunks kc
    JOIN knowledge_documents kd ON kd.id = kc.document_id
    WHERE kd.region_id = ${regionId}
    ORDER BY similarity DESC
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

  const prepared = prepareChunks(result.chunks, knownPlaces);

  // Alte Chunks ersetzen (Re-Analyse möglich) – vor dem Dedup, damit die
  // eigenen alten Notizen nicht als "Duplikat" zählen.
  await prisma.knowledgeChunk.deleteMany({ where: { documentId: doc.id } });

  let created = 0;
  let skippedDuplicates = 0;

  for (const chunk of prepared) {
    const combinedText = `${chunk.title} ${chunk.content}`;
    const similarity = await maxExistingSimilarity(doc.regionId, combinedText);
    if (similarity >= DUPLICATE_SIMILARITY) {
      skippedDuplicates++;
      continue;
    }
    await prisma.knowledgeChunk.create({
      data: {
        documentId: doc.id,
        title: chunk.title,
        content: chunk.content,
        interests: chunk.interests,
        placeIds: chunk.placeIds,
        placeNames: chunk.placeNames,
      },
    });
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

const DIET_LABELS: Record<string, string> = {
  vegetarian: "vegetarisch",
  vegan: "vegan",
  glutenfree: "glutenfrei",
};

const FOOD_PREFERENCE_LABELS: Record<string, string> = {
  regional_traditionell: "regional traditionell",
  gehoben: "gehoben",
  unkompliziert: "unkompliziert",
  aperitivo_bar: "Aperitivo Bar",
};

/** Freitext-Suchbegriffe aus dem Fragebogen (für die Postgres-Volltextsuche). */
export function questionnaireSearchTerms(q: Questionnaire): string[] {
  const terms: string[] = [
    ...q.interests.map((i) => INTEREST_LABELS[i.key]),
    ...q.diets.map((d) => DIET_LABELS[d] ?? d),
    ...q.foodPreferences.map((f) => FOOD_PREFERENCE_LABELS[f] ?? f),
  ];
  if (q.children.length > 0) terms.push("Familie", "Kinder");
  if (q.occasion) terms.push(q.occasion);
  if (q.accommodation.label) terms.push(q.accommodation.label);
  for (const a of q.anchors ?? []) if (a.label) terms.push(a.label);
  return [...new Set(terms.map((t) => t.trim()).filter(Boolean))];
}

/** Escaped Suchbegriffe zu einer `websearch_to_tsquery`-tauglichen OR-Kette. */
function toSearchQueryText(terms: string[]): string {
  // websearch_to_tsquery interpretiert "OR" als logisches Oder und ignoriert
  // übrige Satzzeichen selbst robust – kein manuelles Escaping der Lexeme
  // nötig, nur potenzielle Anführungszeichen (Phrasensuche) neutralisieren.
  return terms.map((t) => t.replace(/"/g, " ")).join(" OR ");
}

/** RRF-Fusion zweier Rankings (Standard-Konstante k=60). */
function reciprocalRankFusion(rankings: string[][], k = 60): string[] {
  const scores = new Map<string, number>();
  for (const ranking of rankings) {
    ranking.forEach((id, index) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + index + 1));
    });
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id]) => id);
}

/** Volltextsuche-Ranking (Postgres `ts_rank_cd`) über die Notizen der Region. */
async function fullTextChunkIds(
  regionId: string,
  searchText: string,
  limit: number
): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT kc.id
    FROM knowledge_chunks kc
    JOIN knowledge_documents kd ON kd.id = kc.document_id
    WHERE kd.region_id = ${regionId}
      AND kd.status = 'analyzed'
      AND to_tsvector('german', unaccent(kc.title || ' ' || kc.content))
          @@ websearch_to_tsquery('german', unaccent(${searchText}))
    ORDER BY ts_rank_cd(
      to_tsvector('german', unaccent(kc.title || ' ' || kc.content)),
      websearch_to_tsquery('german', unaccent(${searchText}))
    ) DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => r.id);
}

/**
 * Notizen passend zum Fragebogen auswählen: Hybrid aus Tag-Matching
 * (strukturiert) und Postgres-Volltextsuche (frei), per RRF fusioniert.
 * Fällt bei DB-Problemen auf reines Tag-Matching zurück.
 */
export async function selectChunksForQuestionnaire(
  regionId: string,
  chunks: ChunkWithSource[],
  q: Questionnaire,
  limit = 12
): Promise<ChunkWithSource[]> {
  const tagRanked = matchChunksToQuestionnaire(chunks, q, chunks.length).map((c) => c.id);

  let ftsRanked: string[] = [];
  try {
    const searchText = toSearchQueryText(questionnaireSearchTerms(q));
    if (searchText) ftsRanked = await fullTextChunkIds(regionId, searchText, chunks.length);
  } catch (err) {
    console.warn("Volltextsuche für Wissensdatenbank fehlgeschlagen, nur Tag-Matching:", err);
  }

  const fusedIds = reciprocalRankFusion([tagRanked, ftsRanked]);
  const byId = new Map(chunks.map((c) => [c.id, c]));
  return fusedIds
    .map((id) => byId.get(id))
    .filter((c): c is ChunkWithSource => Boolean(c))
    .slice(0, limit);
}

/**
 * Tag-basiertes Matching: Interessen-Schnittmenge, gewichtete Interessen
 * zählen doppelt. Deterministisch sortiert.
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
  return chunks.filter((c) => c.placeIds.includes(placeId) || matchesPlaceName(c, name));
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
