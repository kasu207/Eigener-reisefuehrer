"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AreaKey } from "@/lib/areas";

/**
 * Kompakter Inline-Regler (−/+) direkt an einer Abschnitts-Überschrift.
 * Passt den Umfang dieses Bereichs an und stößt eine inkrementelle
 * Neu-Generierung an (bestehende Texte bleiben erhalten). Nur für Besitzer.
 */
export default function AreaControl({ token, area }: { token: string; area: AreaKey }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function change(delta: number) {
    setBusy(true);
    try {
      await fetch(`/api/guides/${token}/area`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ area, delta }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="no-print ml-3 inline-flex items-center gap-1 align-middle">
      <button
        onClick={() => change(-1)}
        disabled={busy}
        title="weniger"
        aria-label="weniger"
        className="h-6 w-6 rounded-full border border-neutral-300 text-sm leading-none text-neutral-600 transition hover:border-neutral-500 disabled:opacity-40"
      >
        −
      </button>
      <button
        onClick={() => change(1)}
        disabled={busy}
        title="mehr"
        aria-label="mehr"
        className="h-6 w-6 rounded-full border border-neutral-300 text-sm leading-none text-neutral-600 transition hover:border-neutral-500 disabled:opacity-40"
      >
        +
      </button>
    </span>
  );
}
