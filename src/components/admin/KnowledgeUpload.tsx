"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const inputCls = "w-full rounded border border-neutral-300 px-2 py-1 text-sm";

/**
 * Buch-Upload über einen echten API-Endpunkt (nicht Server-Action), damit große
 * PDFs/EPUBs zuverlässig durchgehen. Zeigt Fortschritt und Ergebnis direkt an.
 */
export default function KnowledgeUpload({
  regions,
}: {
  regions: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // Kleine Stücke, damit kein Body-Limit (Proxy/Framework) greift
  const CHUNK_SIZE = 4 * 1024 * 1024;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setMsg({ type: "err", text: "Bitte zuerst eine Datei auswählen." });
      return;
    }
    setBusy(true);
    setMsg(null);
    setProgress(0);

    const uploadId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const totalChunks = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
    const baseParams = {
      uploadId,
      totalChunks: String(totalChunks),
      regionId: String(data.get("regionId") ?? ""),
      kind: String(data.get("kind") ?? "book"),
      title: String(data.get("title") ?? ""),
      filename: file.name,
      type: file.type || "",
    };

    try {
      for (let i = 0; i < totalChunks; i++) {
        const blob = file.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        const params = new URLSearchParams({ ...baseParams, chunkIndex: String(i) });
        const res = await fetch(`/api/admin/knowledge-upload?${params.toString()}`, {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: blob,
        });
        const body = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          partial?: boolean;
          error?: string;
          title?: string;
          textLen?: number;
        };
        if (!res.ok || !body.ok) {
          throw new Error(body.error ?? `Fehler (HTTP ${res.status}).`);
        }
        setProgress(Math.round(((i + 1) / totalChunks) * 100));

        // Letzter Chunk -> Server hat verarbeitet und liefert das Ergebnis
        if (!body.partial) {
          setMsg({
            type: "ok",
            text: `„${body.title}" hochgeladen – Text extrahiert (${body.textLen?.toLocaleString("de-DE")} Zeichen). Die KI-Analyse läuft im Hintergrund.`,
          });
          form.reset();
          setFileName(null);
          router.refresh();
        }
      }
    } catch (err) {
      setMsg({ type: "err", text: err instanceof Error ? err.message : "Upload fehlgeschlagen." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-2 rounded-2xl border border-neutral-200 bg-white p-4 text-sm"
    >
      <h3 className="font-serif text-lg">Buch / Reiseführer hochladen</h3>
      <select name="regionId" className={inputCls} required>
        {regions.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
      <select name="kind" className={inputCls}>
        <option value="guidebook">Reiseführer</option>
        <option value="book">Buch</option>
      </select>
      <input name="title" placeholder="Titel (leer = Dateiname)" className={inputCls} />

      {/* Datei-Feld: transparentes Input über sichtbarem Button (iOS-tauglich) */}
      <div className="space-y-2">
        <div className="relative inline-block">
          <span className="pointer-events-none inline-flex items-center gap-2 rounded border border-neutral-300 bg-neutral-50 px-4 py-2 text-sm font-medium text-neutral-700">
            <span aria-hidden>📄</span> Datei auswählen
          </span>
          <input
            type="file"
            name="file"
            accept=".pdf,.epub,.txt,.md"
            required
            onChange={(e) => {
              setFileName(e.target.files?.[0]?.name ?? null);
              setMsg(null);
            }}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label="Datei auswählen"
          />
        </div>
        <p className={fileName ? "break-all text-xs text-neutral-600" : "text-xs text-neutral-400"}>
          {fileName ? `Gewählt: ${fileName}` : "Keine Datei gewählt"}
        </p>
      </div>

      <p className="text-xs text-neutral-500">
        PDF/EPUB/TXT/MD, max. 120 MB. Der Text wird beim Upload lokal extrahiert
        (Bilder werden ignoriert) – große Bücher sind kein Problem. Kopiergeschützte
        (DRM) Bücher lassen sich technisch nicht auslesen.
      </p>

      {busy && (
        <div className="space-y-1">
          <div className="h-2 w-full overflow-hidden rounded bg-neutral-100">
            <div
              className="h-full bg-(--color-accent) transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-neutral-500">
            {progress < 100 ? `Lädt hoch … ${progress}%` : "Text wird extrahiert …"}
          </p>
        </div>
      )}

      {msg && (
        <p
          className={
            msg.type === "ok"
              ? "rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800"
              : "rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
          }
        >
          {msg.text}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="rounded bg-(--color-ink) px-4 py-2 text-white disabled:opacity-50"
      >
        {busy ? "Lädt …" : "Hochladen"}
      </button>
    </form>
  );
}
