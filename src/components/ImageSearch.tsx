"use client";

import { useState } from "react";
import { addImage } from "@/app/admin/actions";

interface Candidate {
  title: string;
  thumbUrl: string;
  fileUrl: string;
  license: string;
  author: string;
  sourceUrl: string;
  source?: string;
}

/**
 * Bildersuche für die Redaktion: sucht frei lizenzierte Bilder (Wikimedia
 * Commons) zu einem Begriff und übernimmt ein gewähltes Bild mit allen
 * Pflichtangaben (Lizenz, Urheber, Quelllink) direkt an den Ort.
 */
export default function ImageSearch({
  placeId,
  defaultQuery,
}: {
  placeId: string;
  defaultQuery: string;
}) {
  const [query, setQuery] = useState(defaultQuery);
  const [results, setResults] = useState<Candidate[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/image-search?q=${encodeURIComponent(query)}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as { results?: Candidate[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Fehler");
      setResults(data.results ?? []);
      if ((data.results ?? []).length === 0) setError("Keine passenden Bilder gefunden.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bildersuche fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded border border-neutral-200 p-3">
      <p className="mb-2 text-sm font-medium">Bilder suchen (Wikimedia Commons + Openverse)</p>
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              search();
            }
          }}
          placeholder="z. B. Villa del Balbianello"
          className="flex-1 rounded border border-neutral-300 px-2 py-1 text-sm"
        />
        <button
          type="button"
          onClick={search}
          disabled={busy || !query.trim()}
          className="rounded bg-(--color-ink) px-3 py-1 text-sm text-white disabled:opacity-40"
        >
          {busy ? "sucht …" : "Suchen"}
        </button>
      </div>

      {error && <p className="mt-2 text-sm text-amber-700">{error}</p>}

      {results.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {results.map((c) => (
            <div key={c.fileUrl} className="rounded border border-neutral-200 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={c.thumbUrl}
                alt={c.title}
                className="mb-1 h-24 w-full rounded object-cover"
                loading="lazy"
              />
              <p className="truncate text-xs text-neutral-600" title={c.title}>
                {c.title}
              </p>
              <p className="truncate text-xs text-neutral-400" title={`${c.license} · ${c.author}`}>
                {c.license} · {c.author}
              </p>
              {c.source && (
                <p className="truncate text-[10px] text-neutral-400" title={c.source}>
                  {c.source}
                </p>
              )}
              <form action={addImage} className="mt-1">
                <input type="hidden" name="placeId" value={placeId} />
                <input type="hidden" name="fileUrl" value={c.fileUrl} />
                <input type="hidden" name="license" value={c.license} />
                <input type="hidden" name="author" value={c.author} />
                <input type="hidden" name="sourceUrl" value={c.sourceUrl} />
                <button
                  type="submit"
                  className="w-full rounded border border-(--color-accent) px-2 py-1 text-xs text-(--color-accent) hover:bg-(--color-accent) hover:text-white"
                >
                  Übernehmen
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
      <p className="mt-2 text-xs text-neutral-400">
        Es werden nur Bilder mit ermittelbarer Lizenz angezeigt. Bitte die
        Lizenzbedingungen vor Veröffentlichung kurz prüfen.
      </p>
    </div>
  );
}
