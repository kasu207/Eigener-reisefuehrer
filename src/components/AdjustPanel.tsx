"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ADJUSTMENT_PRESETS, ADJUSTMENT_LABELS, type AdjustmentPreset } from "@/lib/adjustments";

/**
 * Anpassungs-Panel für den Guide-Besitzer: Presets ("Mehr Wandern",
 * "Mehr günstige Tipps" ...) plus Freitext. Stößt eine Neu-Generierung an.
 */
export default function AdjustPanel({
  token,
  regenerating,
}: {
  token: string;
  regenerating: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [presets, setPresets] = useState<AdjustmentPreset[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  if (regenerating || done) {
    return (
      <div className="no-print rounded-2xl border border-(--color-accent) bg-(--color-accent-soft)/40 p-5 text-sm">
        <p className="font-medium">Eure Anpassung ist in Arbeit.</p>
        <p className="mt-1 text-neutral-600">
          Wir überarbeiten den Reiseführer gerade nach euren Wünschen – das dauert ein paar
          Minuten. Ihr bekommt eine E-Mail, sobald die neue Version unter diesem Link bereitsteht.
        </p>
        <button onClick={() => router.refresh()} className="mt-2 text-(--color-accent) underline">
          Aktualisieren
        </button>
      </div>
    );
  }

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/guides/${token}/adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ presets, text }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Etwas ist schiefgelaufen.");
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Etwas ist schiefgelaufen.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="no-print rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif text-xl">Noch nicht ganz euer Ding?</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Sagt uns, was ihr euch mehr wünscht – wir überarbeiten den Guide.
          </p>
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          className="rounded-full border border-(--color-ink) px-5 py-2 text-sm transition hover:bg-(--color-ink) hover:text-white"
        >
          {open ? "Schließen" : "Anpassen"}
        </button>
      </div>

      {open && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            {ADJUSTMENT_PRESETS.map((key) => {
              const active = presets.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() =>
                    setPresets((p) => (active ? p.filter((k) => k !== key) : [...p, key]))
                  }
                  className={`rounded-full border px-4 py-2 text-sm transition ${
                    active
                      ? "border-(--color-ink) bg-(--color-ink) text-white"
                      : "border-neutral-300 bg-white hover:border-neutral-500"
                  }`}
                >
                  {ADJUSTMENT_LABELS[key]}
                </button>
              );
            })}
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Eigener Wunsch, z. B.: Wir hätten gern mehr Tipps für regnerische Tage."
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-(--color-accent) focus:outline-none"
          />
          {error && <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
          <button
            onClick={submit}
            disabled={submitting || (presets.length === 0 && !text.trim())}
            className="rounded-full bg-(--color-accent) px-6 py-3 text-sm text-white transition hover:bg-(--color-ink) disabled:opacity-50"
          >
            {submitting ? "Wird gesendet ..." : "Guide überarbeiten lassen"}
          </button>
        </div>
      )}
    </div>
  );
}
