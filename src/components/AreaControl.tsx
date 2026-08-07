"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AreaKey } from "@/lib/areas";

interface Candidate {
  name: string;
  note: string;
  priceLevel: number | null;
  address: string | null;
  sourceUrl: string;
  sourceTitle: string;
  confidence: string;
  mapsUrl: string;
}

/**
 * Inline-Regler (−/+) an einer Abschnitts-Überschrift. Kennt Ort + Bereich.
 * "+" nimmt zuerst geprüfte Orte aus dem Bestand; ist der Ort erschöpft,
 * recherchiert die KI einen echten neuen Ort (mit Quelle) und zeigt ihn als
 * Vorschlag – "❤️" übernimmt ihn in den Guide. Nur für Besitzer.
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
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  // Bestand erschöpft -> Recherche NICHT automatisch starten (Kosten!),
  // sondern erst einen ausdrücklichen Button anbieten.
  const [exhausted, setExhausted] = useState(false);

  async function change(delta: number) {
    setBusy(true);
    setNote(null);
    setCandidate(null);
    setExhausted(false);
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
      if (!res.ok) {
        setNote(res.status === 429 ? "Zu viele Änderungen – kurz warten." : data.error ?? "Fehler.");
        return;
      }
      if (data.changed) {
        setNote(data.message ?? (delta > 0 ? "hinzugefügt" : "entfernt"));
        router.refresh();
        setTimeout(() => setNote(null), 5000);
        return;
      }
      // Nichts mehr im Bestand: bei "+" mit bekanntem Ort Recherche ANBIETEN
      // (nicht automatisch ausführen – Websuche kostet).
      if (delta > 0 && locality) {
        setExhausted(true);
        setNote("Bestand erschöpft.");
      } else {
        setNote(data.message ?? "Keine Änderung möglich.");
      }
    } catch {
      setNote("Netzwerkfehler.");
    } finally {
      setBusy(false);
    }
  }

  async function research() {
    setBusy(true);
    setNote("Recherchiere einen neuen Ort …");
    setCandidate(null);
    try {
      const res = await fetch(`/api/guides/${token}/suggest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ area, locality }),
      });
      const data = (await res.json().catch(() => ({}))) as { candidate?: Candidate; error?: string };
      if (res.ok && data.candidate) {
        setCandidate(data.candidate);
        setNote(null);
      } else {
        setNote(data.error ?? "Kein Vorschlag gefunden.");
      }
    } catch {
      setNote("Recherche fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  async function accept() {
    if (!candidate) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/guides/${token}/suggest/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          area,
          locality,
          name: candidate.name,
          note: candidate.note,
          priceLevel: candidate.priceLevel,
          address: candidate.address,
          sourceUrl: candidate.sourceUrl,
          sourceTitle: candidate.sourceTitle,
        }),
      });
      if (res.ok) {
        setCandidate(null);
        setNote(`„${candidate.name}" wird ergänzt …`);
        router.refresh();
        setTimeout(() => setNote(null), 5000);
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setNote(data.error ?? "Übernehmen fehlgeschlagen.");
      }
    } catch {
      setNote("Netzwerkfehler.");
    } finally {
      setBusy(false);
    }
  }

  const btn =
    "h-6 w-6 rounded-full border border-neutral-300 text-sm leading-none text-neutral-600 transition hover:border-neutral-500 disabled:opacity-40";

  return (
    <span className="no-print ml-3 inline-flex flex-wrap items-center gap-1 align-middle">
      <button onClick={() => change(-1)} disabled={busy} title="weniger" aria-label="weniger" className={btn}>
        −
      </button>
      <button onClick={() => change(1)} disabled={busy} title="mehr" aria-label="mehr" className={btn}>
        +
      </button>
      <span role="status" aria-live="polite" className="ml-1 text-xs font-normal text-neutral-500">
        {note}
      </span>

      {exhausted && !candidate && (
        <button
          onClick={research}
          disabled={busy}
          title="Sucht per Websuche einen neuen, echten Ort (kostet etwas Budget)"
          className="ml-1 rounded-full border border-(--color-accent-soft) bg-(--color-accent-soft)/30 px-2 py-0.5 text-xs text-(--color-accent) disabled:opacity-40"
        >
          🔎 Neuen Ort recherchieren
        </button>
      )}

      {candidate && (
        <span className="mt-2 block w-full max-w-md rounded-lg border border-(--color-accent-soft) bg-(--color-paper) p-3 text-left">
          <span className="block text-sm font-semibold text-neutral-800">
            {candidate.name}
            {candidate.priceLevel ? ` · ${"€".repeat(candidate.priceLevel)}` : ""}
            <span className="ml-2 rounded bg-neutral-100 px-1 text-[10px] font-normal text-neutral-500">
              Sicherheit: {candidate.confidence}
            </span>
          </span>
          {candidate.note && (
            <span className="mt-1 block text-xs leading-relaxed text-neutral-600">{candidate.note}</span>
          )}
          <span className="mt-1 block text-xs text-neutral-500">
            <a href={candidate.mapsUrl} target="_blank" rel="noreferrer" className="text-(--color-accent) underline">
              Karte
            </a>
            {candidate.sourceUrl && (
              <>
                {" · "}
                <a href={candidate.sourceUrl} target="_blank" rel="noreferrer" className="text-(--color-accent) underline">
                  Quelle{candidate.sourceTitle ? `: ${candidate.sourceTitle}` : ""}
                </a>
              </>
            )}
          </span>
          <span className="mt-2 flex items-center gap-2">
            <button
              onClick={accept}
              disabled={busy}
              className="rounded-full bg-(--color-accent) px-3 py-1 text-xs font-medium text-white disabled:opacity-40"
            >
              ❤️ In den Guide
            </button>
            <button
              onClick={() => setCandidate(null)}
              disabled={busy}
              className="rounded-full border border-neutral-300 px-3 py-1 text-xs text-neutral-600 disabled:opacity-40"
            >
              ✕ Verwerfen
            </button>
            <button
              onClick={research}
              disabled={busy}
              className="rounded-full border border-neutral-300 px-3 py-1 text-xs text-neutral-600 disabled:opacity-40"
            >
              🔄 Anderer
            </button>
          </span>
          <span className="mt-1 block text-[10px] text-neutral-400">
            Recherchierter Vorschlag – bitte über die Quelle kurz verifizieren.
          </span>
        </span>
      )}
    </span>
  );
}
