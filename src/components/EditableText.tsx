"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type EditTarget =
  | { kind: "intro"; field: "title" | "text" }
  | { kind: "chapter"; chapterKey: string; field: "title" | "introText" }
  | { kind: "entry"; entryId: string; field: "personalText" | "reason" }
  | { kind: "day"; day: number; field: "title" | "text" };

/**
 * Inline-Bearbeitung im Browser-Guide (nur Besitzer): Klick auf den Stift
 * macht jeden Text direkt editierbar. Änderungen werden gespeichert und
 * überleben KI-Neugenerierungen.
 */
export default function EditableText({
  token,
  target,
  value,
  editable,
  multiline = true,
  className = "",
  placeholder = "",
  as = "p",
}: {
  token: string;
  target: EditTarget;
  value: string;
  editable: boolean;
  multiline?: boolean;
  className?: string;
  placeholder?: string;
  as?: "p" | "span" | "h1" | "h2" | "h3";
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const Tag = as;

  /**
   * Beim Öffnen IMMER vom aktuellen Server-Wert ausgehen.
   *
   * `useState(value)` übernimmt den Wert nur beim ersten Mounten. Während der
   * Worker die Texte schreibt, aktualisiert `router.refresh()` aber nur die
   * Props – die Komponente bleibt montiert. Ohne diesen Abgleich stünde im
   * Editor noch der leere Ausgangswert, und Speichern würde den frisch
   * generierten Text überschreiben.
   */
  function startEditing() {
    setDraft(value);
    setError(null);
    setEditing(true);
  }

  function cancelEditing() {
    setDraft(value);
    setError(null);
    setEditing(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/guides/${token}/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "set-text", target, value: draft }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Speichern fehlgeschlagen.");
      }
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Speichern fehlgeschlagen.");
    } finally {
      setSaving(false);
    }
  }

  if (!editable) {
    if (!value && placeholder) {
      return <Tag className={`${className} animate-pulse text-neutral-400`}>{placeholder}</Tag>;
    }
    return <Tag className={`${className} whitespace-pre-line`}>{value}</Tag>;
  }

  if (editing) {
    // Escape bricht ab, Strg/Cmd+Enter speichert – im mehrzeiligen Feld ist
    // Enter selbst ein Zeilenumbruch und darf nicht absenden.
    const onKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancelEditing();
      } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey || !multiline)) {
        e.preventDefault();
        void save();
      }
    };
    const fieldCls =
      "w-full rounded-lg border border-(--color-accent) bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-(--color-accent)/40";

    return (
      <div className="no-print my-1">
        {multiline ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            rows={Math.max(3, Math.ceil(draft.length / 80))}
            maxLength={4000}
            autoFocus
            aria-label="Text bearbeiten"
            className={`${fieldCls} text-base`}
          />
        ) : (
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            maxLength={4000}
            autoFocus
            aria-label="Text bearbeiten"
            className={fieldCls}
          />
        )}
        {error && (
          <p role="alert" className="mt-1 text-xs text-red-600">
            {error}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-full bg-(--color-accent) px-4 py-1.5 text-xs text-white disabled:opacity-50"
          >
            {saving ? "Speichert ..." : "Speichern"}
          </button>
          <button
            type="button"
            onClick={cancelEditing}
            disabled={saving}
            className="rounded-full border border-neutral-300 px-4 py-1.5 text-xs disabled:opacity-50"
          >
            Abbrechen
          </button>
          <span className="text-[11px] text-neutral-400">
            {multiline ? "Strg/⌘ + Enter speichert" : "Enter speichert"} · Esc bricht ab
          </span>
        </div>
      </div>
    );
  }

  const shown = value || placeholder || "Klicken, um Text zu schreiben …";

  // Der Button steckt IM Tag, statt den Tag selbst klickbar zu machen: So
  // bleibt eine Überschrift für Screenreader eine Überschrift, und der Text
  // ist zugleich per Tab erreichbar (vorher war Bearbeiten nur per Maus
  // möglich).
  return (
    <Tag className={className}>
      <button
        type="button"
        onClick={startEditing}
        aria-label={value ? `Bearbeiten: ${value.slice(0, 60)}` : "Text hinzufügen"}
        // `inline` + geerbte Ausrichtung: Ein Block-Button mit `text-left`
        // würde zentrierte Überschriften (Cover-Titel) linksbündig ziehen.
        style={{ font: "inherit", color: "inherit", textAlign: "inherit" }}
        className={`group/edit inline cursor-text rounded-sm whitespace-pre-line transition hover:bg-(--color-accent-soft)/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent) ${
          !value ? "text-neutral-400" : ""
        }`}
      >
        {shown}
        {/* Nur bei Hover/Fokus im Fluss. Mit `opacity-0` bliebe der Hinweis
            umbruchrelevant und reservierte in großen Überschriften eine
            komplette leere Zeile. */}
        <span className="no-print ml-2 hidden align-middle text-xs whitespace-nowrap text-(--color-accent) group-hover/edit:inline group-focus-visible/edit:inline">
          ✎ bearbeiten
        </span>
      </button>
    </Tag>
  );
}
