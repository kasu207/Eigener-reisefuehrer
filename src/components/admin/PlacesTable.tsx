"use client";

import Link from "next/link";
import { useState } from "react";
import { bulkUpdatePlaces } from "@/app/admin/actions";
import { GAP_HINTS, GAP_LABELS, type GapKey } from "@/lib/place-quality";

export interface PlaceRow {
  id: string;
  name: string;
  locality: string;
  type: string;
  regionName: string;
  status: string;
  mustSee: boolean;
  /** Private Ergänzung eines Kunden – gehört nicht zum allgemeinen Bestand. */
  privateToGuide: boolean;
  gaps: GapKey[];
  thumbUrl: string | null;
  imageCount: number;
  sourceCount: number;
}

/**
 * Orte-Liste mit Mehrfachauswahl und Sammelaktionen. Der Zeitfresser bei der
 * Kuration ist nicht das Bearbeiten, sondern die Klickstrecke drumherum –
 * deshalb lassen sich Status, Ort und Must-See für viele Einträge auf einmal
 * setzen, und die Lücken stehen direkt in der Zeile.
 */
export default function PlacesTable({
  rows,
  localities,
}: {
  rows: PlaceRow[];
  localities: string[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const allSelected = rows.length > 0 && selected.size === rows.length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  }

  return (
    <form action={bulkUpdatePlaces}>
      {[...selected].map((id) => (
        <input key={id} type="hidden" name="ids" value={id} />
      ))}

      <div
        className={`sticky top-0 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm backdrop-blur ${
          selected.size > 0
            ? "border-(--color-accent-soft) bg-(--color-accent-soft)/30"
            : "border-neutral-200 bg-white/90 text-neutral-400"
        }`}
      >
        <span className="font-medium">
          {selected.size > 0 ? `${selected.size} ausgewählt` : "Nichts ausgewählt"}
        </span>
        {selected.size > 0 && (
          <>
            <button
              name="operation"
              value="verify"
              className="rounded border border-green-700 px-2 py-1 text-xs text-green-700 hover:bg-green-700 hover:text-white"
            >
              geprüft setzen
            </button>
            <button
              name="operation"
              value="draft"
              className="rounded border border-amber-700 px-2 py-1 text-xs text-amber-700 hover:bg-amber-700 hover:text-white"
            >
              auf Entwurf
            </button>
            <button
              name="operation"
              value="mustSee"
              className="rounded border border-neutral-400 px-2 py-1 text-xs hover:bg-neutral-700 hover:text-white"
            >
              ★ Must-See
            </button>
            <button
              name="operation"
              value="unmustSee"
              className="rounded border border-neutral-400 px-2 py-1 text-xs hover:bg-neutral-700 hover:text-white"
            >
              ☆ kein Must-See
            </button>
            <span className="ml-2 inline-flex items-center gap-1">
              <input
                name="locality"
                list="admin-localities"
                placeholder="Ort setzen …"
                className="w-36 rounded border border-neutral-300 px-2 py-1 text-xs"
              />
              <datalist id="admin-localities">
                {localities.map((l) => (
                  <option key={l} value={l} />
                ))}
              </datalist>
              <button
                name="operation"
                value="locality"
                className="rounded border border-neutral-400 px-2 py-1 text-xs hover:bg-neutral-700 hover:text-white"
              >
                übernehmen
              </button>
            </span>
            <button
              name="operation"
              value="delete"
              onClick={(e) => {
                if (!confirm(`${selected.size} Ort(e) endgültig löschen?`)) e.preventDefault();
              }}
              className="ml-auto rounded border border-red-700 px-2 py-1 text-xs text-red-700 hover:bg-red-700 hover:text-white"
            >
              löschen
            </button>
          </>
        )}
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-neutral-300 text-left text-neutral-500">
            <th className="py-2 pr-2">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                aria-label="alle auswählen"
              />
            </th>
            <th className="py-2 pr-2">Bild</th>
            <th className="py-2 pr-4">Name</th>
            <th className="py-2 pr-4">Typ</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4">Fehlt noch</th>
            <th className="py-2 pr-4">B/Q</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr
              key={p.id}
              className={`border-b border-neutral-200 ${selected.has(p.id) ? "bg-(--color-accent-soft)/20" : ""}`}
            >
              <td className="py-2 pr-2">
                <input
                  type="checkbox"
                  checked={selected.has(p.id)}
                  onChange={() => toggle(p.id)}
                  aria-label={`${p.name} auswählen`}
                />
              </td>
              <td className="py-2 pr-2">
                {p.thumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.thumbUrl}
                    alt=""
                    className="h-10 w-14 rounded object-cover"
                    loading="lazy"
                  />
                ) : (
                  <span className="flex h-10 w-14 items-center justify-center rounded bg-neutral-100 text-[10px] text-neutral-400">
                    kein Bild
                  </span>
                )}
              </td>
              <td className="py-2 pr-4">
                <Link href={`/admin/places/${p.id}`} className="text-(--color-accent) underline">
                  {p.name}
                </Link>
                {p.mustSee && (
                  <span className="ml-1 align-middle text-amber-500" title="Must-See">
                    ★
                  </span>
                )}
                {p.privateToGuide && (
                  <span
                    className="ml-1 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] text-violet-700"
                    title="Eigener Tipp eines Kunden – erscheint nur in dessen Guide. Auf der Ort-Seite lässt er sich in den allgemeinen Bestand übernehmen."
                  >
                    privat
                  </span>
                )}
                <span className="block text-xs text-neutral-400">
                  {p.locality || "ohne Ort"} · {p.regionName}
                </span>
              </td>
              <td className="py-2 pr-4 text-neutral-600">{p.type}</td>
              <td className="py-2 pr-4">
                <span className={p.status === "verified" ? "text-green-700" : "text-amber-700"}>
                  {p.status === "verified" ? "geprüft" : "Entwurf"}
                </span>
              </td>
              <td className="py-2 pr-4">
                <span className="flex flex-wrap gap-1">
                  {p.gaps.map((g) => (
                    <span
                      key={g}
                      title={GAP_HINTS[g]}
                      className={`rounded px-1.5 py-0.5 text-[10px] ${
                        g === "coords" || g === "diet" || g === "locality"
                          ? "bg-red-100 text-red-700"
                          : "bg-neutral-100 text-neutral-500"
                      }`}
                    >
                      {GAP_LABELS[g]}
                    </span>
                  ))}
                  {p.gaps.length === 0 && <span className="text-xs text-green-700">vollständig</span>}
                </span>
              </td>
              <td className="py-2 pr-4 text-neutral-500">
                {p.imageCount} / {p.sourceCount}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="py-6 text-neutral-500">
                Keine Orte für diesen Filter.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </form>
  );
}
