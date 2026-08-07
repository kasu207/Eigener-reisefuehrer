"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Eintrag aus dem Guide entfernen (bleibt auch bei Neugenerierung draußen). */
export default function RemoveEntryButton({
  token,
  entryId,
  name,
}: {
  token: string;
  entryId: string;
  name: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function remove() {
    if (!confirm(`„${name}" aus eurem Reiseführer entfernen?`)) return;
    setBusy(true);
    setError(false);
    try {
      const res = await fetch(`/api/guides/${token}/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "remove-entry", entryId }),
      });
      // Vorher wurde das Ergebnis ignoriert und blind neu geladen: Schlug das
      // Entfernen fehl, stand der Eintrag wieder da – ohne jede Erklärung.
      if (!res.ok) throw new Error("failed");
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="no-print inline-flex items-center gap-2">
      {error && (
        <span role="alert" className="text-xs text-red-600">
          Nicht entfernt – nochmal?
        </span>
      )}
      <button
        type="button"
        onClick={remove}
        disabled={busy}
        aria-label={`„${name}" aus dem Reiseführer entfernen`}
        className="rounded text-xs text-neutral-400 underline transition hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent) disabled:opacity-50"
      >
        {busy ? "…" : "Entfernen"}
      </button>
    </span>
  );
}
