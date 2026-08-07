"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Phase = "idle" | "working" | "done" | "failed";

/**
 * Live-Aktualisierung während die KI schreibt: pollt den Status und lädt
 * die Seite neu, sobald neue Kapiteltexte in der DB liegen. So füllt sich
 * der Guide im Browser, während der Nutzer schon blättert. Ist die
 * Generierung fertig, erscheint kurz eine deutliche Bestätigung.
 */
export default function GuideProgress({
  token,
  active,
}: {
  token: string;
  active: boolean;
}) {
  const router = useRouter();
  const lastSeen = useRef<string>("");
  const [phase, setPhase] = useState<Phase>(active ? "working" : "idle");

  // Springt der Server-Status wieder auf "in Arbeit" (z. B. nach einem
  // +/- Feintuning), zeigen wir sofort erneut das Arbeits-Banner.
  useEffect(() => {
    if (active) setPhase("working");
  }, [active]);

  useEffect(() => {
    if (phase !== "working") return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/guides/${token}/status`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { status: string; generatedAt: string };
        const stamp = `${data.status}:${data.generatedAt}`;
        if (stamp !== lastSeen.current) {
          lastSeen.current = stamp;
          router.refresh();
        }
        if (data.status === "ready") {
          clearInterval(interval);
          setPhase("done");
          router.refresh();
        } else if (data.status === "failed") {
          clearInterval(interval);
          setPhase("failed");
          router.refresh();
        }
      } catch {
        // Netzwerkfehler ignorieren, nächster Tick versucht es erneut
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [token, phase, router]);

  // Fertig-Bestätigung nach einigen Sekunden ausblenden
  useEffect(() => {
    if (phase !== "done") return;
    const t = setTimeout(() => setPhase("idle"), 6000);
    return () => clearTimeout(t);
  }, [phase]);

  if (phase === "idle") return null;

  if (phase === "done") {
    return (
      <div role="status" aria-live="polite" className="no-print sticky top-0 z-20 -mx-6 mb-6 flex items-center gap-3 border-b border-emerald-200 bg-emerald-50/95 px-6 py-3 backdrop-blur">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
        <p className="text-sm font-medium text-emerald-800">
          Fertig! Euer Reiseführer ist vollständig generiert. Ihr könnt jetzt
          blättern, bearbeiten und den Umfang je Bereich anpassen.
        </p>
      </div>
    );
  }

  if (phase === "failed") {
    return (
      <div role="status" aria-live="polite" className="no-print sticky top-0 z-20 -mx-6 mb-6 flex items-center gap-3 border-b border-red-200 bg-red-50/95 px-6 py-3 backdrop-blur">
        <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
        <p className="text-sm font-medium text-red-800">
          Bei der Generierung ist ein Fehler aufgetreten. Bitte prüft die
          Worker-Logs oder stoßt die Generierung im Admin-Bereich neu an.
        </p>
      </div>
    );
  }

  return (
    <div role="status" aria-live="polite" className="no-print sticky top-0 z-20 -mx-6 mb-6 flex items-center gap-3 border-b border-(--color-accent-soft) bg-(--color-paper)/95 px-6 py-3 backdrop-blur">
      <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-(--color-accent)" />
      <p className="text-sm text-neutral-700">
        Eure persönlichen Texte werden gerade geschrieben – ihr könnt schon
        blättern und bearbeiten, die Seite aktualisiert sich von selbst.
      </p>
    </div>
  );
}
