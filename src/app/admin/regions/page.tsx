import { prisma } from "@/lib/db";
import { upsertRegion } from "../actions";

export const dynamic = "force-dynamic";

const inputCls = "w-full rounded border border-neutral-300 px-2 py-1 text-sm";

export default async function RegionsPage() {
  const regions = await prisma.region.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { places: true, hikes: true } } },
  });

  return (
    <div className="grid gap-10 md:grid-cols-2">
      <div>
        <h2 className="mb-4 font-serif text-xl">Regionen</h2>
        <ul className="space-y-2 text-sm">
          {regions.map((r) => (
            <li key={r.id} className="rounded border border-neutral-200 bg-white p-3">
              <strong>{r.name}</strong> ({r.slug}, {r.country}) –{" "}
              {r._count.places} Orte, {r._count.hikes} Wanderungen
            </li>
          ))}
          {regions.length === 0 && <li className="text-neutral-500">Noch keine Regionen.</li>}
        </ul>
      </div>
      <div>
        <h2 className="mb-4 font-serif text-xl">Neue Region</h2>
        <form action={upsertRegion} className="space-y-3 rounded border border-neutral-200 bg-white p-4 text-sm">
          <input name="name" placeholder="Name (z. B. Comer See)" className={inputCls} required />
          <input name="slug" placeholder="Slug (z. B. comer-see)" className={inputCls} required />
          <input name="country" placeholder="Land (z. B. Italien)" className={inputCls} required />
          <div className="grid grid-cols-2 gap-2">
            <input name="centerLat" placeholder="Zentrum Lat (z. B. 46.0)" className={inputCls} required />
            <input name="centerLng" placeholder="Zentrum Lng (z. B. 9.26)" className={inputCls} required />
          </div>
          <textarea name="description" placeholder="Beschreibung" className={inputCls} rows={3} />
          <button className="rounded bg-(--color-ink) px-4 py-2 text-white">Anlegen</button>
        </form>
        <p className="mt-3 text-xs text-neutral-500">
          Neue Region = neue DB-Einträge, kein Code (Anforderung 8).
        </p>
      </div>
    </div>
  );
}
