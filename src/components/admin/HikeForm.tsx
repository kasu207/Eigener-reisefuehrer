import type { Hike, Region } from "@prisma/client";
import CoordPicker from "./CoordPicker";

const inputCls = "w-full rounded border border-neutral-300 px-2 py-1 text-sm";
const labelCls = "block text-xs font-medium text-neutral-600 mb-1";

export default function HikeForm({
  hike,
  regions,
  action,
  submitLabel,
}: {
  hike?: Hike | null;
  regions: Region[];
  action: (fd: FormData) => Promise<void>;
  submitLabel: string;
}) {
  const region = regions.find((r) => r.id === hike?.regionId) ?? regions[0];
  return (
    <form action={action} className="space-y-4 rounded border border-neutral-200 bg-white p-4">
      {hike && <input type="hidden" name="id" value={hike.id} />}
      <div>
        <label className={labelCls}>Region</label>
        <select name="regionId" defaultValue={hike?.regionId ?? region?.id} className={inputCls}>
          {regions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className={labelCls}>Name</label>
          <input name="name" defaultValue={hike?.name} className={inputCls} required />
        </div>
        <div>
          <label className={labelCls}>Ort/Stadt (optional)</label>
          <input name="locality" defaultValue={hike?.locality} className={inputCls} placeholder="leer = regionsweit" />
        </div>
      </div>
      <div>
        <label className={labelCls}>Link zur Tour (Komoot/Outdooractive – wird als QR-Code abgebildet)</label>
        <input name="externalUrl" defaultValue={hike?.externalUrl ?? ""} className={inputCls} placeholder="https://..." />
      </div>
      <div>
        <label className={labelCls}>Startpunkt (Klick auf die Karte)</label>
        <CoordPicker
          latName="startLat"
          lngName="startLng"
          initialLat={hike?.startLat}
          initialLng={hike?.startLng}
          centerLat={region?.centerLat}
          centerLng={region?.centerLng}
        />
      </div>
      <div>
        <label className={labelCls}>Startpunkt-Beschreibung</label>
        <input name="startDescription" defaultValue={hike?.startDescription} className={inputCls} />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label className={labelCls}>Distanz (km)</label>
          <input name="distanceKm" defaultValue={hike?.distanceKm} className={inputCls} required />
        </div>
        <div>
          <label className={labelCls}>Dauer (min)</label>
          <input name="durationMin" defaultValue={hike?.durationMin} className={inputCls} required />
        </div>
        <div>
          <label className={labelCls}>Höhenmeter</label>
          <input name="elevationGainM" defaultValue={hike?.elevationGainM} className={inputCls} required />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className={labelCls}>Schwierigkeit</label>
          <select name="difficulty" defaultValue={hike?.difficulty ?? "medium"} className={inputCls}>
            <option value="easy">leicht</option>
            <option value="medium">mittel</option>
            <option value="hard">anspruchsvoll</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>GPX-Datei-URL (optional, Lizenz beachten)</label>
          <input name="gpxFile" defaultValue={hike?.gpxFile ?? ""} className={inputCls} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="childFriendly" defaultChecked={hike?.childFriendly ?? false} />
        kindertauglich
      </label>
      <div>
        <label className={labelCls}>Tags (kommagetrennt)</label>
        <input name="tags" defaultValue={hike?.tags.join(", ")} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Redaktionsnotizen (interner Kontext für die KI)</label>
        <textarea
          name="descriptionNotes"
          defaultValue={hike?.descriptionNotes}
          className={inputCls}
          rows={3}
        />
      </div>
      <div>
        <label className={labelCls}>Prüfstatus (nur „verified" gelangt in Guides)</label>
        <select name="status" defaultValue={hike?.status ?? "draft"} className={inputCls}>
          <option value="draft">Entwurf</option>
          <option value="verified">Geprüft</option>
        </select>
      </div>
      <button className="rounded bg-(--color-ink) px-4 py-2 text-sm text-white">{submitLabel}</button>
    </form>
  );
}
