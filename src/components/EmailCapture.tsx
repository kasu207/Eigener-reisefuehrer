"use client";

import { useState } from "react";

/**
 * E-Mail-Erfassung NACH der Erstellung: Besitzer:innen können hier optional
 * eine Adresse hinterlegen, um sich den Link zu sichern bzw. benachrichtigt zu
 * werden, sobald die Texte fertig sind. Keine Pflicht – der Guide ist ohnehin
 * direkt im Browser sichtbar.
 */
export default function EmailCapture({
  token,
  alreadySet,
  regenerating,
}: {
  token: string;
  alreadySet: boolean;
  regenerating: boolean;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(alreadySet ? "gesetzt" : null);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setError("Bitte eine gültige E-Mail-Adresse angeben.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/guides/${token}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json().catch(() => ({}))) as { sent?: boolean; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Speichern fehlgeschlagen.");
        return;
      }
      setDone(data.sent ? "sent" : "queued");
    } catch {
      setError("Netzwerkfehler.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="no-print rounded-xl bg-(--color-accent-soft)/30 px-4 py-3 text-sm text-neutral-700">
        {done === "sent"
          ? "✓ Wir haben euch den Link per E-Mail geschickt."
          : done === "queued"
            ? "✓ E-Mail gespeichert – ihr bekommt den Link, sobald die Texte fertig sind."
            : "✓ E-Mail-Adresse ist hinterlegt."}
      </div>
    );
  }

  return (
    <div className="no-print rounded-xl border border-(--color-accent-soft) bg-(--color-paper) px-4 py-3">
      <p className="text-sm text-neutral-700">
        <strong>Link per E-Mail sichern?</strong> Optional – dann findet ihr euren
        Reiseführer später leicht wieder{regenerating ? " und werdet benachrichtigt, sobald die Texte fertig sind" : ""}.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="ihr@example.com"
          className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        />
        <button
          onClick={save}
          disabled={busy}
          className="rounded-full bg-(--color-ink) px-4 py-2 text-sm text-white disabled:opacity-40"
        >
          {busy ? "Speichern …" : "Link sichern"}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
