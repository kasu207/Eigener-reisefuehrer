"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AREA_KEYS, AREA_LABELS, type AreaKey, type AreaCounts } from "@/lib/areas";

/**
 * Pro-Bereich-Feintuning: je Bereich ein "mehr/weniger"-Regler. Passt den
 * Umfang an (mehr Wanderungen, mehr günstige Cafés ...) und stößt eine
 * inkrementelle Neu-Generierung an (bestehende Texte bleiben erhalten).
 */
export default function FineTunePanel({
  token,
  areaCounts,
  regenerating,
}: {
  token: string;
  areaCounts: AreaCounts;
  regenerating: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<AreaKey | null>(null);
  const [counts, setCounts] = useState<AreaCounts>(areaCounts);

  async function change(area: AreaKey, delta: number) {
    setBusy(area);
    try {
      const res = await fetch(`/api/guides/${token}/area`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ area, delta }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.areaCounts) setCounts(data.areaCounts);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="no-print rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif text-xl">Umfang je Bereich anpassen</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Mehr oder weniger pro Bereich – z. B. mehr Wanderungen oder mehr
            günstige Cafés. Bestehende Texte bleiben erhalten.
          </p>
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          className="rounded-full border border-(--color-ink) px-5 py-2 text-sm transition hover:bg-(--color-ink) hover:text-white"
        >
          {open ? "Schließen" : "Feintuning"}
        </button>
      </div>

      {open && (
        <div className="mt-4 space-y-2">
          {regenerating && (
            <p className="rounded-lg bg-(--color-accent-soft)/40 px-3 py-2 text-xs text-neutral-600">
              Eine Anpassung wird gerade verarbeitet – weitere Klicks werden
              anschließend übernommen.
            </p>
          )}
          {AREA_KEYS.map((area) => {
            const delta = counts[area] ?? 0;
            return (
              <div
                key={area}
                className="flex items-center justify-between gap-3 border-t border-neutral-100 py-2 text-sm"
              >
                <span>{AREA_LABELS[area]}</span>
                <div className="flex items-center gap-2">
                  {delta !== 0 && (
                    <span className={delta > 0 ? "text-(--color-accent)" : "text-neutral-400"}>
                      {delta > 0 ? `+${delta}` : delta}
                    </span>
                  )}
                  <button
                    onClick={() => change(area, -1)}
                    disabled={busy === area}
                    className="h-8 w-8 rounded-full border border-neutral-300 text-lg leading-none transition hover:border-neutral-500 disabled:opacity-40"
                    aria-label="weniger"
                  >
                    −
                  </button>
                  <button
                    onClick={() => change(area, 1)}
                    disabled={busy === area}
                    className="h-8 w-8 rounded-full border border-neutral-300 text-lg leading-none transition hover:border-neutral-500 disabled:opacity-40"
                    aria-label="mehr"
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
