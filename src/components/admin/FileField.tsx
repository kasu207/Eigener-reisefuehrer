"use client";

import { useState } from "react";

/**
 * Zuverlässiges Datei-Auswahlfeld – auch auf iOS Safari.
 *
 * Hintergrund: Ein direkt gestyltes <input type="file"> ist auf iOS teils nicht
 * antippbar, und ein per <label> weitergeleitetes verstecktes Feld öffnet dort
 * nicht immer den Dialog. Bulletproof ist deshalb ein transparentes, voll
 * dimensioniertes Datei-Feld, das DIREKT über dem sichtbaren Button liegt: Der
 * Tap landet auf dem Input selbst (opacity 0 hält es interaktiv). `accept` nur
 * mit Datei-Endungen, weil iOS mit MIME-Typen unzuverlässig umgeht.
 */
export default function FileField({
  name,
  accept = ".pdf,.epub,.txt,.md",
  required,
}: {
  name: string;
  accept?: string;
  required?: boolean;
}) {
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <div className="relative inline-block">
        <span className="pointer-events-none inline-flex items-center gap-2 rounded border border-neutral-300 bg-neutral-50 px-4 py-2 text-sm font-medium text-neutral-700">
          <span aria-hidden>📄</span>
          Datei auswählen
        </span>
        <input
          type="file"
          name={name}
          accept={accept}
          required={required}
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          aria-label="Datei auswählen"
        />
      </div>
      {fileName ? (
        <p className="break-all text-xs text-neutral-600">Gewählt: {fileName}</p>
      ) : (
        <p className="text-xs text-neutral-400">Keine Datei gewählt</p>
      )}
    </div>
  );
}
