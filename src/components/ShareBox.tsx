"use client";

import { useRef, useState } from "react";

/** Lese-Link zum Teilen mit Mitreisenden (ohne Anpassungs-Rechte). */
export default function ShareBox({ shareUrl }: { shareUrl: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const inputRef = useRef<HTMLInputElement>(null);

  async function copy() {
    try {
      // Ohne HTTPS (oder bei entzogener Berechtigung) gibt es keine
      // Clipboard-API. Vorher passierte dann schlicht nichts – der Klick
      // wirkte kaputt. Jetzt markieren wir den Text und sagen es.
      if (!navigator.clipboard) throw new Error("no clipboard");
      await navigator.clipboard.writeText(shareUrl);
      setState("copied");
      setTimeout(() => setState("idle"), 2000);
    } catch {
      inputRef.current?.select();
      setState("failed");
    }
  }

  return (
    <div className="no-print rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="font-serif text-xl">Mit Mitreisenden teilen</h2>
      <p className="mt-1 text-sm text-neutral-600">
        Dieser Lese-Link zeigt den Guide, erlaubt aber keine Anpassungen:
      </p>
      <div className="mt-3 flex gap-2">
        <input
          ref={inputRef}
          readOnly
          value={shareUrl}
          onFocus={(e) => e.target.select()}
          aria-label="Lese-Link zum Teilen"
          className="w-full rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent)"
        />
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-lg bg-(--color-ink) px-4 py-2 text-sm text-white transition hover:bg-(--color-accent) focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent)"
        >
          {state === "copied" ? "Kopiert!" : "Kopieren"}
        </button>
      </div>
      <p aria-live="polite" className="mt-2 text-xs text-neutral-500">
        {state === "copied" && "✓ Link in der Zwischenablage."}
        {state === "failed" && "Der Link ist markiert – bitte mit Strg/⌘ + C kopieren."}
      </p>
    </div>
  );
}
