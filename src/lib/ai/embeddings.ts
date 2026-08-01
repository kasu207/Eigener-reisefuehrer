import { isMock } from "./mock";

/**
 * Text-Embeddings für die Wissensdatenbank (semantische Suche + Dedup).
 *
 * Anthropic bietet keine eigenen Embeddings an und empfiehlt Voyage AI
 * (https://platform.claude.com/docs/en/build-with-claude/embeddings).
 * Modell: voyage-3.5 – mehrsprachig (deckt deutsche, italienische und
 * englische Quellen ab), 1024 Dimensionen, großes Gratis-Kontingent.
 *
 * Verhalten ohne Schlüssel: Alle Funktionen liefern `null`, die Aufrufer
 * fallen auf das Tag-basierte Matching zurück – kein harter Ausfall.
 * Im Mock-Modus (AI_MODE=mock) entstehen deterministische Pseudo-Embeddings
 * (Bag-of-Words-Hashing), damit der komplette Ablauf inkl. Dedup und
 * Retrieval ohne API-Kosten funktioniert und testbar bleibt.
 */

export const EMBEDDING_DIM = 1024;

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_MODEL = process.env.VOYAGE_EMBED_MODEL || "voyage-3.5";
// Voyage erlaubt große Batches; 100 hält einzelne Requests klein und robust.
const BATCH_SIZE = 100;

export type EmbeddingInputType = "document" | "query";

/** Sind Embeddings nutzbar (API-Key vorhanden oder Mock-Modus)? */
export function embeddingsEnabled(): boolean {
  return isMock() || Boolean(process.env.VOYAGE_API_KEY);
}

/**
 * Mehrere Texte einbetten. `inputType` unterscheidet gespeicherte Notizen
 * ("document") von Suchanfragen ("query") – Voyage optimiert darauf.
 * Liefert `null`, wenn Embeddings nicht konfiguriert sind.
 */
export async function embedTexts(
  texts: string[],
  inputType: EmbeddingInputType
): Promise<number[][] | null> {
  if (texts.length === 0) return [];
  if (isMock()) return texts.map(pseudoEmbedding);
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) return null;

  const result: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const res = await fetch(VOYAGE_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: VOYAGE_MODEL,
        input: batch,
        input_type: inputType,
        output_dimension: EMBEDDING_DIM,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      throw new Error(`Voyage-Embeddings fehlgeschlagen (${res.status}): ${detail}`);
    }
    const data = (await res.json()) as {
      data: { index: number; embedding: number[] }[];
    };
    const ordered = [...data.data].sort((a, b) => a.index - b.index);
    result.push(...ordered.map((d) => d.embedding));
  }
  return result;
}

export async function embedText(
  text: string,
  inputType: EmbeddingInputType
): Promise<number[] | null> {
  const vectors = await embedTexts([text], inputType);
  return vectors?.[0] ?? null;
}

/** pgvector-Literal für Raw-SQL (`'[0.1,0.2,...]'::vector`). */
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Deterministisches Pseudo-Embedding für Mock/Tests: Wörter werden per
 * FNV-1a-Hash auf Dimensionen verteilt (Bag-of-Words). Ähnliche Texte
 * bekommen so tatsächlich ähnliche Vektoren – Dedup und Ranking sind
 * dadurch offline sinnvoll prüfbar.
 */
export function pseudoEmbedding(text: string): number[] {
  const vec = new Array<number>(EMBEDDING_DIM).fill(0);
  const tokens = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
  for (const token of tokens) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < token.length; i++) {
      hash ^= token.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    vec[Math.abs(hash) % EMBEDDING_DIM] += 1;
  }
  const norm = Math.sqrt(vec.reduce((s, x) => s + x * x, 0));
  return norm === 0 ? vec : vec.map((x) => x / norm);
}
