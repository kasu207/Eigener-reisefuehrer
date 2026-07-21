"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Live-Aktualisierung während die KI schreibt: pollt den Status und lädt
 * die Seite neu, sobald neue Kapiteltexte in der DB liegen. So füllt sich
 * der Guide im Browser, während der Nutzer schon blättert.
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

  useEffect(() => {
    if (!active) return;
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
        if (data.status === "ready" || data.status === "failed") {
          clearInterval(interval);
          router.refresh();
        }
      } catch {
        // Netzwerkfehler ignorieren, nächster Tick versucht es erneut
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [token, active, router]);

  if (!active) return null;

  return (
    <div className="no-print sticky top-0 z-20 -mx-6 mb-6 flex items-center gap-3 border-b border-(--color-accent-soft) bg-(--color-paper)/95 px-6 py-3 backdrop-blur">
      <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-(--color-accent)" />
      <p className="text-sm text-neutral-700">
        Eure persönlichen Texte werden gerade geschrieben – ihr könnt schon
        blättern und bearbeiten, die Seite aktualisiert sich von selbst.
      </p>
    </div>
  );
}
