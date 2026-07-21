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

  async function remove() {
    if (!confirm(`„${name}" aus eurem Reiseführer entfernen?`)) return;
    setBusy(true);
    await fetch(`/api/guides/${token}/edit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "remove-entry", entryId }),
    });
    router.refresh();
  }

  return (
    <button
      onClick={remove}
      disabled={busy}
      className="no-print text-xs text-neutral-400 underline transition hover:text-red-600 disabled:opacity-50"
      title="Eintrag entfernen"
    >
      {busy ? "…" : "Entfernen"}
    </button>
  );
}
