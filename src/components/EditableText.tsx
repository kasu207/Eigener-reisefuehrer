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
    return (
      <div className="no-print my-1">
        {multiline ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={Math.max(3, Math.ceil(draft.length / 80))}
            maxLength={4000}
            autoFocus
            className="w-full rounded-lg border border-(--color-accent) bg-white px-3 py-2 text-base focus:outline-none"
          />
        ) : (
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={4000}
            autoFocus
            className="w-full rounded-lg border border-(--color-accent) bg-white px-3 py-2 focus:outline-none"
          />
        )}
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        <div className="mt-2 flex gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="rounded-full bg-(--color-accent) px-4 py-1.5 text-xs text-white disabled:opacity-50"
          >
            {saving ? "Speichert ..." : "Speichern"}
          </button>
          <button
            onClick={() => {
              setDraft(value);
              setEditing(false);
            }}
            className="rounded-full border border-neutral-300 px-4 py-1.5 text-xs"
          >
            Abbrechen
          </button>
        </div>
      </div>
    );
  }

  return (
    <Tag
      className={`${className} group/edit relative cursor-text whitespace-pre-line rounded-sm transition hover:bg-(--color-accent-soft)/30 ${
        !value ? "text-neutral-400" : ""
      }`}
      onClick={() => setEditing(true)}
      title="Klicken zum Bearbeiten"
    >
      {value || placeholder || "Klicken, um Text zu schreiben …"}
      <span className="no-print ml-2 inline-block align-middle text-xs text-(--color-accent) opacity-0 transition group-hover/edit:opacity-100">
        ✎ bearbeiten
      </span>
    </Tag>
  );
}
