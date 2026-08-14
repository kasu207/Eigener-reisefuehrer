"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Lädt die Server-Komponente in festem Takt neu, damit laufende Generierungen
 * im Admin ohne manuelles F5 mitlaufen. Abschaltbar, damit man in Ruhe lesen
 * kann, während im Hintergrund gearbeitet wird.
 */
export default function AutoRefresh({ seconds = 5 }: { seconds?: number }) {
  const router = useRouter();
  const [on, setOn] = useState(true);

  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(t);
  }, [on, seconds, router]);

  return (
    <label className="flex items-center gap-2 text-xs text-neutral-500">
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => setOn(e.target.checked)}
        className="h-3.5 w-3.5"
      />
      alle {seconds}s aktualisieren
    </label>
  );
}
