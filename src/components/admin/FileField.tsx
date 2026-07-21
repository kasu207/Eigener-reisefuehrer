"use client";

import { useState } from "react";

/**
 * Zuverlässiges Datei-Auswahlfeld – auch auf iOS Safari.
 *
 * Hintergrund: Ein direkt gestyltes <input type="file"> ist auf iOS Safari
 * teils nicht antippbar. Zuverlässig ist ein <label>-Button, der ein
 * visuell verstecktes, aber weiterhin aktives Datei-Feld umschließt: Ein Tap
 * auf das Label öffnet den Datei-Dialog. `accept` nur mit Datei-Endungen, weil
 * iOS mit MIME-Typen wie application/epub+zip nicht zuverlässig umgeht.
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
      <label className="inline-flex cursor-pointer items-center gap-2 rounded border border-neutral-300 bg-neutral-50 px-4 py-2 text-sm font-medium text-neutral-700 active:bg-neutral-100">
        <span aria-hidden>📄</span>
        Datei auswählen
        <input
          type="file"
          name={name}
          accept={accept}
          required={required}
          className="sr-only"
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
        />
      </label>
      {fileName ? (
        <p className="break-all text-xs text-neutral-600">Gewählt: {fileName}</p>
      ) : (
        <p className="text-xs text-neutral-400">Keine Datei gewählt</p>
      )}
    </div>
  );
}
