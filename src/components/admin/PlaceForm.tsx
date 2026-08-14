import type { Place, Region } from "@prisma/client";
import CoordPicker from "./CoordPicker";

const inputCls = "w-full rounded border border-neutral-300 px-2 py-1 text-sm";
const labelCls = "block text-xs font-medium text-neutral-600 mb-1";

export default function PlaceForm({
  place,
  regions,
  action,
  submitLabel,
}: {
  place?: Place | null;
  regions: Region[];
  action: (fd: FormData) => Promise<void>;
  submitLabel: string;
}) {
  const region = regions.find((r) => r.id === place?.regionId) ?? regions[0];
  return (
    <form action={action} className="space-y-4 rounded border border-neutral-200 bg-white p-4">
      {place && <input type="hidden" name="id" value={place.id} />}
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className={labelCls}>Region</label>
          <select name="regionId" defaultValue={place?.regionId ?? region?.id} className={inputCls}>
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Typ</label>
          <select name="type" defaultValue={place?.type ?? "sight"} className={inputCls}>
            <option value="village">Dorf/Ort</option>
            <option value="sight">Sehenswürdigkeit</option>
            <option value="viewpoint">Aussichtspunkt</option>
            <option value="beach">Strand/Lido</option>
            <option value="restaurant">Restaurant</option>
            <option value="bar">Bar</option>
            <option value="hotel">Unterkunft/Hotel</option>
            <option value="event">Veranstaltung</option>
            <option value="daytrip">Tagesausflug</option>
            <option value="practical">Praktisches</option>
          </select>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className={labelCls}>Name</label>
          <input name="name" defaultValue={place?.name} className={inputCls} required />
        </div>
        <div>
          <label className={labelCls}>Ort/Stadt (für die Kapitel-Zuordnung, z. B. Varenna)</label>
          <input name="locality" defaultValue={place?.locality} className={inputCls} placeholder="leer = regionsweit" />
        </div>
      </div>
      <div>
        <label className={labelCls}>Koordinaten (Klick auf die Karte)</label>
        <CoordPicker
          latName="lat"
          lngName="lng"
          initialLat={place?.lat}
          initialLng={place?.lng}
          centerLat={region?.centerLat}
          centerLng={region?.centerLng}
        />
      </div>
      <div>
        <label className={labelCls}>Adresse</label>
        <input name="address" defaultValue={place?.address} className={inputCls} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className={labelCls}>Tags (kommagetrennt, z. B. dorf, aussicht, baden)</label>
          <input name="tags" defaultValue={place?.tags.join(", ")} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Preisniveau (1–4, leer = k. A.)</label>
          <input name="priceLevel" defaultValue={place?.priceLevel ?? ""} className={inputCls} />
        </div>
      </div>
      <div>
        <label className={labelCls}>Öffnungszeiten-Hinweise</label>
        <input name="openingNotes" defaultValue={place?.openingNotes} className={inputCls} />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <label className={labelCls}>Erreichbarkeit</label>
          <select name="access" defaultValue={place?.access ?? "car"} className={inputCls}>
            <option value="car">Auto</option>
            <option value="public">ÖPNV/Fähre</option>
            <option value="foot">zu Fuß/Rad</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Qualität (1–5)</label>
          <input name="qualityScore" defaultValue={place?.qualityScore ?? 3} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Ernährung (vegetarian, vegan, glutenfree)</label>
          <input
            name="dietaryOptions"
            defaultValue={place?.dietaryOptions.join(", ")}
            className={inputCls}
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="childFriendly" defaultChecked={place?.childFriendly ?? true} />
        kindertauglich
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="mustSee" defaultChecked={place?.mustSee ?? false} />
        <span>
          <strong>Must-See</strong> – Pflicht-Highlight, erscheint immer im Guide
          (unabhängig vom Matching)
        </span>
      </label>
      <div>
        <label className={labelCls}>Redaktionsnotizen (interner Kontext für die KI)</label>
        <textarea name="editorNotes" defaultValue={place?.editorNotes} className={inputCls} rows={3} />
      </div>
      <div>
        <label className={labelCls}>Prüfstatus (nur „verified" gelangt in Guides)</label>
        <select name="status" defaultValue={place?.status ?? "draft"} className={inputCls}>
          <option value="draft">Entwurf</option>
          <option value="verified">Geprüft</option>
        </select>
        {place?.lastVerifiedAt && (
          <p className="mt-1 text-xs text-neutral-500">
            Zuletzt geprüft: {place.lastVerifiedAt.toLocaleDateString("de-DE")}
          </p>
        )}
      </div>
      <button className="rounded bg-(--color-ink) px-4 py-2 text-sm text-white">{submitLabel}</button>
    </form>
  );
}
