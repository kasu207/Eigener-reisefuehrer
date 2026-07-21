import { prisma } from "@/lib/db";
import CoordPicker from "@/components/admin/CoordPicker";
import { createMapSpot, updateMapSpot, deleteMapSpot } from "../actions";

export const dynamic = "force-dynamic";

const inputCls = "w-full rounded border border-neutral-300 px-2 py-1 text-sm";
const labelCls = "block text-xs font-medium text-neutral-600 mb-1";

const CATEGORY_LABEL: Record<string, string> = {
  photo: "Foto-Spot",
  food: "Essen/Trinken",
  viewpoint: "Aussicht",
  hidden_gem: "Geheimtipp",
  beach: "Baden",
  other: "Sonstiges",
};

function CategorySelect({ value }: { value?: string }) {
  return (
    <select name="category" defaultValue={value ?? "photo"} className={inputCls}>
      {Object.entries(CATEGORY_LABEL).map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

/**
 * Karten-Spots (Instagram-/Foto-Fundorte). Bewusst getrennt von den
 * kuratierten Orten: nur Standort-Pin + Notiz + Quell-Link. Es wird KEIN
 * Instagram-Inhalt eingebettet (Rechtslage 5.3) – nur der Profil-/Post-Link
 * als Quelle. Verifizierte Spots erscheinen auf der Guide-Karte.
 */
export default async function SpotsPage() {
  const regions = await prisma.region.findMany({ orderBy: { name: "asc" } });
  const spots = await prisma.mapSpot.findMany({
    orderBy: [{ status: "asc" }, { name: "asc" }],
    include: { region: true },
  });
  const region = regions[0];

  return (
    <div className="space-y-10">
      <div>
        <h2 className="font-serif text-xl">Karten-Spots (Instagram-/Foto-Fundorte)</h2>
        <p className="mt-1 max-w-2xl text-sm text-neutral-600">
          Zusätzliche Pins zu den kuratierten Orten – z. B. auf Instagram
          entdeckte Foto-Spots und Geheimtipps. Es wird kein Instagram-Inhalt
          eingebettet; gespeichert werden nur Standort, eine eigene Notiz und der
          Quell-Link (Profil/Beitrag). Nur „geprüfte" Spots erscheinen auf der
          Guide-Karte.
        </p>
      </div>

      {/* Bestand */}
      <section>
        <h3 className="mb-3 font-serif text-lg">Vorhandene Spots ({spots.length})</h3>
        <ul className="space-y-4">
          {spots.map((spot) => (
            <li key={spot.id} className="rounded-2xl border border-neutral-200 bg-white p-4">
              <form action={updateMapSpot} className="space-y-3 text-sm">
                <input type="hidden" name="id" value={spot.id} />
                <input type="hidden" name="regionId" value={spot.regionId} />
                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <label className={labelCls}>Name</label>
                    <input name="name" defaultValue={spot.name} className={inputCls} required />
                  </div>
                  <div>
                    <label className={labelCls}>Kategorie</label>
                    <CategorySelect value={spot.category} />
                  </div>
                  <div>
                    <label className={labelCls}>Ort/Stadt (optional)</label>
                    <input name="locality" defaultValue={spot.locality} className={inputCls} />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Koordinaten (Klick auf die Karte)</label>
                  <CoordPicker
                    latName="lat"
                    lngName="lng"
                    initialLat={spot.lat}
                    initialLng={spot.lng}
                    centerLat={spot.region.centerLat}
                    centerLng={spot.region.centerLng}
                  />
                </div>
                <div>
                  <label className={labelCls}>Notiz (eigene Worte)</label>
                  <textarea name="note" defaultValue={spot.note} rows={2} className={inputCls} />
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <label className={labelCls}>Quell-Link (Instagram-Profil/Post)</label>
                    <input name="sourceUrl" defaultValue={spot.sourceUrl} className={inputCls} placeholder="https://instagram.com/..." />
                  </div>
                  <div>
                    <label className={labelCls}>Quelle-Bezeichnung</label>
                    <input name="sourceLabel" defaultValue={spot.sourceLabel} className={inputCls} placeholder="@profilname" />
                  </div>
                  <div>
                    <label className={labelCls}>Status</label>
                    <select name="status" defaultValue={spot.status} className={inputCls}>
                      <option value="draft">Entwurf</option>
                      <option value="verified">Geprüft (auf Karte)</option>
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <button className="rounded bg-(--color-ink) px-3 py-1.5 text-xs text-white">Speichern</button>
                </div>
              </form>
              <form action={deleteMapSpot} className="mt-2">
                <input type="hidden" name="id" value={spot.id} />
                <button className="text-xs text-red-700 underline">Spot löschen</button>
              </form>
            </li>
          ))}
          {spots.length === 0 && <li className="text-sm text-neutral-500">Noch keine Spots.</li>}
        </ul>
      </section>

      {/* Neu */}
      {region && (
        <section>
          <h3 className="mb-3 font-serif text-lg">Neuer Spot</h3>
          <form action={createMapSpot} className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4 text-sm">
            <input type="hidden" name="regionId" value={region.id} />
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <label className={labelCls}>Name</label>
                <input name="name" className={inputCls} placeholder="z. B. Fotopunkt am Bootssteg" required />
              </div>
              <div>
                <label className={labelCls}>Kategorie</label>
                <CategorySelect />
              </div>
              <div>
                <label className={labelCls}>Ort/Stadt (optional)</label>
                <input name="locality" className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Koordinaten (Klick auf die Karte)</label>
              <CoordPicker latName="lat" lngName="lng" centerLat={region.centerLat} centerLng={region.centerLng} />
            </div>
            <div>
              <label className={labelCls}>Notiz (eigene Worte)</label>
              <textarea name="note" rows={2} className={inputCls} placeholder="Was macht diesen Ort besonders?" />
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <label className={labelCls}>Quell-Link (Instagram-Profil/Post)</label>
                <input name="sourceUrl" className={inputCls} placeholder="https://instagram.com/..." />
              </div>
              <div>
                <label className={labelCls}>Quelle-Bezeichnung</label>
                <input name="sourceLabel" className={inputCls} placeholder="@profilname" />
              </div>
              <div>
                <label className={labelCls}>Status</label>
                <select name="status" defaultValue="draft" className={inputCls}>
                  <option value="draft">Entwurf</option>
                  <option value="verified">Geprüft (auf Karte)</option>
                </select>
              </div>
            </div>
            <button className="rounded bg-(--color-ink) px-4 py-2 text-white">Spot anlegen</button>
          </form>
        </section>
      )}
    </div>
  );
}
