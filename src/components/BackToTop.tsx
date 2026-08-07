"use client";

import { useEffect, useState } from "react";

/**
 * Der Guide ist bewusst ein langes Dokument (Kapitel je Ort, Wanderungen,
 * Register). Das Inhaltsverzeichnis steht aber nur ganz oben – auf dem Handy
 * bedeutet das minutenlanges Wischen zurück. Der Knopf erscheint erst, wenn
 * er gebraucht wird, und bleibt aus dem Druck heraus.
 */
export default function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 1200);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={() =>
        window.scrollTo({
          top: 0,
          // Wer „reduzierte Bewegung" eingestellt hat, springt ohne Animation.
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "auto"
            : "smooth",
        })
      }
      aria-label="Zurück zum Inhaltsverzeichnis"
      className="no-print fixed bottom-5 right-5 z-30 flex h-11 items-center gap-2 rounded-full border border-neutral-200 bg-white/95 pl-3 pr-4 text-sm text-neutral-700 shadow-lg backdrop-blur transition hover:border-(--color-accent) hover:text-(--color-accent) focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent)"
    >
      <span aria-hidden="true">↑</span>
      <span className="hidden sm:inline">Inhalt</span>
    </button>
  );
}
