"use client";

import { useState } from "react";

/**
 * Eine Leiste statt vier Kästen.
 *
 * Vorher standen Feintuning, Anpassungswunsch und Teilen als drei
 * gleichwertige Karten direkt unter dem Cover – zusammen rund 700 px, also
 * der komplette erste Bildschirm nach dem Titel. Der Kunde sah zuerst die
 * Verwaltung seines Reiseführers und erst weit darunter den Reiseführer
 * selbst. Werkzeuge gehören in die Nebenrolle: eine Zeile, die sich auf
 * Wunsch öffnet.
 */
export default function OwnerToolbar({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <section className="no-print mb-10" aria-label="Euren Reiseführer bearbeiten">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 rounded-xl border border-neutral-200 bg-white/70 px-4 py-3 text-left transition hover:border-(--color-accent) focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent) active:translate-y-px"
      >
        <span>
          <span className="text-sm font-medium">Anpassen, ergänzen, teilen</span>
          <span className="mt-0.5 block text-xs text-neutral-500">
            Umfang je Bereich ändern, Wünsche äußern, Lese-Link für Mitreisende
          </span>
        </span>
        <span
          aria-hidden="true"
          className={`shrink-0 text-neutral-400 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        >
          ▾
        </span>
      </button>

      {open && <div className="mt-3 space-y-3">{children}</div>}
    </section>
  );
}
