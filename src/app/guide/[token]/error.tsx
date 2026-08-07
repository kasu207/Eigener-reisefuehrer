"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Fehlergrenze für die Guide-Seite. Ohne sie landet z. B. ein
 * Schema-Fehler beim Lesen von `guides.content` als roher Next-Stacktrace
 * beim Nutzer – mitten in dem Moment, in dem er seinen fertigen
 * Reiseführer sehen will.
 */
export default function GuideError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[guide] Anzeige fehlgeschlagen:", error);
  }, [error]);

  return (
    <main id="inhalt" className="mx-auto max-w-2xl px-6 py-24 text-center">
      <p className="text-sm uppercase tracking-widest text-(--color-accent)">Unerwarteter Fehler</p>
      <h1 className="mt-4 font-serif text-4xl">Der Reiseführer lässt sich gerade nicht anzeigen</h1>
      <p className="mt-4 leading-relaxed text-neutral-700">
        Euer Reiseführer ist nicht verloren – nur die Anzeige ist gestolpert.
        Meist hilft schon ein neuer Versuch.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-full bg-(--color-ink) px-6 py-3 text-sm text-white transition hover:bg-(--color-accent)"
        >
          Erneut versuchen
        </button>
        <Link
          href="/"
          className="rounded-full border border-neutral-400 px-6 py-3 text-sm text-neutral-700 transition hover:bg-neutral-100"
        >
          Zur Startseite
        </Link>
      </div>
      {error.digest && (
        <p className="mt-8 text-xs text-neutral-400">
          Fehlerkennung für den Support: {error.digest}
        </p>
      )}
    </main>
  );
}
