"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AreaKey } from "@/lib/areas";

/**
 * Kompakter Inline-Regler (−/+) direkt an einer Abschnitts-Überschrift.
 * Passt den Umfang dieses Bereichs an und stößt eine inkrementelle
 * Neu-Generierung an (bestehende Texte bleiben erhalten). Nur für Besitzer.
 * Gibt sofort sichtbares Feedback, damit klar ist, dass der Klick wirkt.
 */
export default function AreaControl({
  token,
  area,
  locality,
}: {
  token: string;
  area: AreaKey;
  locality?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function change(delta: number) {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(`/api/guides/${token}/area`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ area, delta, locality }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        changed?: boolean;
        error?: string;
      };
      if (res.ok) {
        setNote(data.message ?? (delta > 0 ? "mehr angefragt …" : "weniger angefragt …"));
        // Nur bei echter Änderung neu laden (löst Neu-Generierung/Banner aus)
        if (data.changed) router.refresh();
        setTimeout(() => setNote(null), 6000);
      } else if (res.status === 429) {
        setNote("Zu viele Änderungen – kurz warten.");
      } else {
        setNote(data.error ?? "Fehler – bitte erneut versuchen.");
      }
    } catch {
      setNote("Netzwerkfehler – bitte erneut versuchen.");
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
      {note && (
        <span className="ml-1 text-xs font-normal text-neutral-500">{note}</span>
      )}
    </span>
  );
}
