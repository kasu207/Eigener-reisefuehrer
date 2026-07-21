import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { addRegionInfo, updateRegionInfo, deleteRegionInfo } from "../../actions";

export const dynamic = "force-dynamic";

const inputCls = "w-full rounded border border-neutral-300 px-2 py-1 text-sm";

/** Pflege der "Gut zu wissen"-Kapitel (Währung, Geschichte, Sprachführer ...). */
export default async function RegionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const region = await prisma.region.findUnique({
    where: { id },
    include: { infos: { orderBy: { sortOrder: "asc" } } },
  });
  if (!region) notFound();

  return (
    <div className="max-w-3xl">
      <h2 className="mb-1 font-serif text-xl">„Gut zu wissen“: {region.name}</h2>
      <p className="mb-6 text-sm text-neutral-600">
        Diese Abschnitte erscheinen in jedem Guide dieser Region – wie die
        Standard-Infos in einem klassischen Reiseführer (Währung, Geschichte,
        kleiner Sprachführer, Trinkwasser, Anreise ...).
      </p>

      <ul className="space-y-4">
        {region.infos.map((info) => (
          <li key={info.id} className="rounded-2xl border border-neutral-200 bg-white p-4">
            <form action={updateRegionInfo} className="space-y-2 text-sm">
              <input type="hidden" name="id" value={info.id} />
              <div className="flex gap-2">
                <input name="title" defaultValue={info.title} className={inputCls} required />
                <select name="format" defaultValue={info.format} className="w-32 rounded border border-neutral-300 px-2 py-1 text-sm">
                  <option value="prose">Fließtext</option>
                  <option value="table">Tabelle</option>
                  <option value="timeline">Zeitleiste</option>
                </select>
                <input
                  name="sortOrder"
                  defaultValue={info.sortOrder}
                  className="w-16 rounded border border-neutral-300 px-2 py-1 text-sm"
                  title="Sortierung"
                />
              </div>
              <textarea name="content" defaultValue={info.content} rows={6} className={inputCls} required />
              <div className="flex gap-3">
                <button className="rounded bg-(--color-ink) px-3 py-1.5 text-xs text-white">Speichern</button>
              </div>
            </form>
            <form action={deleteRegionInfo} className="mt-2">
              <input type="hidden" name="id" value={info.id} />
              <button className="text-xs text-red-700 underline">Abschnitt löschen</button>
            </form>
          </li>
        ))}
        {region.infos.length === 0 && (
          <li className="text-sm text-neutral-500">Noch keine Abschnitte.</li>
        )}
      </ul>

      <form
        action={addRegionInfo}
        className="mt-8 space-y-2 rounded-2xl border border-neutral-200 bg-white p-4 text-sm"
      >
        <h3 className="font-serif text-lg">Neuer Abschnitt</h3>
        <input type="hidden" name="regionId" value={region.id} />
        <div className="flex gap-2">
          <input name="title" placeholder="Titel (z. B. Währung & Bezahlen)" className={inputCls} required />
          <select name="format" defaultValue="prose" className="w-32 rounded border border-neutral-300 px-2 py-1 text-sm">
            <option value="prose">Fließtext</option>
            <option value="table">Tabelle</option>
            <option value="timeline">Zeitleiste</option>
          </select>
          <input name="sortOrder" placeholder="0" className="w-16 rounded border border-neutral-300 px-2 py-1 text-sm" />
        </div>
        <p className="text-xs text-neutral-500">
          Tabelle: pro Zeile „Begriff | Übersetzung". Zeitleiste: pro Zeile „Jahr | Ereignis | optionaler Side-Fact".
        </p>
        <textarea name="content" placeholder="Inhalt" rows={6} className={inputCls} required />
        <button className="rounded bg-(--color-ink) px-4 py-2 text-white">Anlegen</button>
      </form>
    </div>
  );
}
