import { prisma } from "@/lib/db";
import KnowledgeUpload from "@/components/admin/KnowledgeUpload";
import {
  addKnowledgeUrl,
  deleteKnowledgeDocument,
  reanalyzeKnowledgeDocument,
  approveKnowledgeDocument,
  rejectKnowledgeDocument,
  deleteKnowledgeChunk,
} from "../actions";

export const dynamic = "force-dynamic";

const inputCls = "w-full rounded border border-neutral-300 px-2 py-1 text-sm";

const STATUS_LABEL: Record<string, string> = {
  uploaded: "wartet auf Analyse",
  processing: "wird analysiert",
  analyzed: "analysiert",
  failed: "fehlgeschlagen",
};

/**
 * Wissensbibliothek (Anforderung: community-gespeiste, kuratierte
 * KI-Wissensdatenbank): Bücher/Reiseführer hochladen, Blogs verlinken,
 * Nutzer-Einreichungen moderieren, aufbereitete Notizen prüfen.
 */
export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const sp = await searchParams;
  const regions = await prisma.region.findMany({ orderBy: { name: "asc" } });
  const documents = await prisma.knowledgeDocument.findMany({
    orderBy: { createdAt: "desc" },
    include: { region: true, chunks: { orderBy: { createdAt: "asc" } } },
  });

  const pending = documents.filter((d) => d.moderationStatus === "pending");
  const rest = documents.filter((d) => d.moderationStatus !== "pending");

  return (
    <div className="space-y-10">
      {sp.ok && (
        <div className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {sp.ok}
        </div>
      )}
      {sp.error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Upload nicht möglich: {sp.error}
        </div>
      )}
      <div>
        <h2 className="font-serif text-xl">Wissensbibliothek</h2>
        <p className="mt-1 max-w-2xl text-sm text-neutral-600">
          Bücher, Reiseführer und Blogs werden von der KI eingelesen und als
          paraphrasierte, getaggte Notizen aufbereitet. Passende Notizen fließen
          in die Guides ein. Nutzer-Einreichungen erscheinen hier zur Moderation;
          die KI-Analyse prüft zusätzlich automatisch auf unzulässige Inhalte.
        </p>
      </div>

      {/* Moderations-Queue */}
      {pending.length > 0 && (
        <section className="rounded-2xl border-2 border-amber-400 bg-amber-50 p-4">
          <h3 className="mb-3 font-serif text-lg">
            Moderation: {pending.length} Einreichung(en) warten auf Prüfung
          </h3>
          <ul className="space-y-3">
            {pending.map((doc) => (
              <li key={doc.id} className="rounded border border-amber-200 bg-white p-3 text-sm">
                <p>
                  <strong>{doc.title}</strong> ({doc.kind}, {doc.region.name})
                  {doc.submitterName && (
                    <span className="text-neutral-500"> · eingereicht von {doc.submitterName}</span>
                  )}
                </p>
                {doc.url && (
                  <a href={doc.url} target="_blank" className="break-all text-(--color-accent) underline">
                    {doc.url}
                  </a>
                )}
                <div className="mt-2 flex gap-3">
                  <form action={approveKnowledgeDocument}>
                    <input type="hidden" name="id" value={doc.id} />
                    <button className="rounded bg-green-700 px-3 py-1 text-xs text-white">
                      Freigeben & analysieren
                    </button>
                  </form>
                  <form action={rejectKnowledgeDocument} className="flex gap-2">
                    <input type="hidden" name="id" value={doc.id} />
                    <input name="note" placeholder="Grund (optional)" className="rounded border border-neutral-300 px-2 py-1 text-xs" />
                    <button className="rounded bg-red-700 px-3 py-1 text-xs text-white">Ablehnen</button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Neue Quellen anlegen */}
      <section className="grid gap-6 md:grid-cols-2">
        <KnowledgeUpload regions={regions.map((r) => ({ id: r.id, name: r.name }))} />

        <form
          action={addKnowledgeUrl}
          className="space-y-2 rounded-2xl border border-neutral-200 bg-white p-4 text-sm"
        >
          <h3 className="font-serif text-lg">Blog / Artikel verlinken</h3>
          <select name="regionId" className={inputCls}>
            {regions.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <select name="kind" className={inputCls}>
            <option value="blog">Blog</option>
            <option value="article">Artikel</option>
          </select>
          <input name="title" placeholder="Titel (leer = URL)" className={inputCls} />
          <input name="url" type="url" placeholder="https://..." className={inputCls} required />
          <button className="rounded bg-(--color-ink) px-4 py-2 text-white">Verlinken</button>
        </form>
      </section>

      {/* Bestand */}
      <section>
        <h3 className="mb-3 font-serif text-lg">Quellen ({rest.length})</h3>
        <ul className="space-y-4">
          {rest.map((doc) => (
            <li key={doc.id} className="rounded-2xl border border-neutral-200 bg-white p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <strong>{doc.title}</strong>{" "}
                  <span className="text-neutral-500">
                    ({doc.kind}, {doc.region.name}
                    {doc.submittedByUser ? ", Nutzer-Einreichung" : ""})
                  </span>
                  {doc.url && (
                    <>
                      {" · "}
                      <a href={doc.url} target="_blank" className="text-(--color-accent) underline">
                        Quelle
                      </a>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={
                      doc.moderationStatus === "rejected"
                        ? "text-red-700"
                        : doc.status === "analyzed"
                          ? "text-green-700"
                          : doc.status === "failed"
                            ? "text-red-700"
                            : "text-amber-700"
                    }
                  >
                    {doc.moderationStatus === "rejected"
                      ? `abgelehnt${doc.moderationNote ? `: ${doc.moderationNote}` : ""}`
                      : STATUS_LABEL[doc.status] ?? doc.status}
                  </span>
                  <form action={reanalyzeKnowledgeDocument}>
                    <input type="hidden" name="id" value={doc.id} />
                    <button className="text-xs text-neutral-600 underline">Neu analysieren</button>
                  </form>
                  <form action={deleteKnowledgeDocument}>
                    <input type="hidden" name="id" value={doc.id} />
                    <button className="text-xs text-red-700 underline">Löschen</button>
                  </form>
                </div>
              </div>
              {doc.error && <p className="mt-1 text-xs text-red-600">{doc.error}</p>}
              {doc.chunks.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-neutral-600">
                    {doc.chunks.length} aufbereitete Notizen
                  </summary>
                  <ul className="mt-2 space-y-2">
                    {doc.chunks.map((chunk) => (
                      <li key={chunk.id} className="rounded bg-neutral-50 p-3">
                        <p className="font-medium">{chunk.title}</p>
                        <p className="mt-1 text-neutral-700">{chunk.content}</p>
                        <p className="mt-1 text-xs text-neutral-500">
                          Interessen: {chunk.interests.join(", ") || "–"}
                          {chunk.placeNames.length > 0 && ` · Orte: ${chunk.placeNames.join(", ")}`}
                        </p>
                        <form action={deleteKnowledgeChunk}>
                          <input type="hidden" name="id" value={chunk.id} />
                          <button className="text-xs text-red-700 underline">Notiz löschen</button>
                        </form>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          ))}
          {rest.length === 0 && <li className="text-neutral-500">Noch keine Quellen.</li>}
        </ul>
      </section>
    </div>
  );
}
