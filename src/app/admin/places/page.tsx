import Link from "next/link";
import { prisma } from "@/lib/db";
import PlacesTable, { type PlaceRow } from "@/components/admin/PlacesTable";
import {
  GAP_KEYS,
  GAP_LABELS,
  curationGaps,
  gapWeight,
  type GapKey,
} from "@/lib/place-quality";
import { normalizeName } from "@/lib/duplicates";

export const dynamic = "force-dynamic";

const PLACE_TYPES = [
  "village",
  "sight",
  "viewpoint",
  "beach",
  "restaurant",
  "bar",
  "hotel",
  "event",
  "practical",
] as const;

const selectCls = "rounded border border-neutral-300 px-2 py-1 text-sm";

interface SearchParams {
  q?: string;
  region?: string;
  type?: string;
  status?: string;
  gap?: string;
  sort?: string;
}

/**
 * Orte-Übersicht als Arbeitsliste: filtern, Lücken sehen, in Stapeln ändern.
 * Die Filter stehen in der URL, damit sich eine Arbeitsansicht („alle
 * Entwürfe in Torno ohne Bild") als Lesezeichen halten lässt.
 */
export default async function PlacesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const query = (sp.q ?? "").trim();
  const gapFilter = GAP_KEYS.includes(sp.gap as GapKey) ? (sp.gap as GapKey) : null;
  const sort = sp.sort === "name" ? "name" : sp.sort === "recent" ? "recent" : "gaps";

  const [regions, places] = await Promise.all([
    prisma.region.findMany({ orderBy: { name: "asc" } }),
    prisma.place.findMany({
      orderBy: [{ name: "asc" }],
      include: {
        region: true,
        images: { take: 1 },
        _count: { select: { images: true, sources: true } },
      },
    }),
  ]);
  const centerByRegion = new Map(regions.map((r) => [r.id, { lat: r.centerLat, lng: r.centerLng }]));

  const normalizedQuery = normalizeName(query);
  const filtered = places.filter((p) => {
    if (sp.region && p.regionId !== sp.region) return false;
    if (sp.type && p.type !== sp.type) return false;
    if (sp.status && p.status !== sp.status) return false;
    if (normalizedQuery) {
      const haystack = normalizeName(`${p.name} ${p.locality} ${p.address}`);
      if (!haystack.includes(normalizedQuery)) return false;
    }
    return true;
  });

  const rows: (PlaceRow & { weight: number; verifiedAt: number })[] = filtered.map((p) => {
    const gaps = curationGaps(
      {
        type: p.type,
        lat: p.lat,
        lng: p.lng,
        locality: p.locality,
        priceLevel: p.priceLevel,
        dietaryOptions: p.dietaryOptions,
        editorNotes: p.editorNotes,
        status: p.status,
        lastVerifiedAt: p.lastVerifiedAt,
        imageCount: p._count.images,
        sourceCount: p._count.sources,
      },
      centerByRegion.get(p.regionId)
    );
    return {
      id: p.id,
      name: p.name,
      locality: p.locality,
      type: p.type,
      regionName: p.region.name,
      status: p.status,
      mustSee: p.mustSee,
      gaps,
      thumbUrl: p.images[0]?.fileUrl ?? null,
      imageCount: p._count.images,
      sourceCount: p._count.sources,
      weight: gapWeight(gaps),
      verifiedAt: p.lastVerifiedAt?.getTime() ?? 0,
    };
  });

  const visible = (gapFilter ? rows.filter((r) => r.gaps.includes(gapFilter)) : rows).sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name, "de");
    if (sort === "recent") return b.verifiedAt - a.verifiedAt;
    return b.weight - a.weight || a.name.localeCompare(b.name, "de");
  });

  const localities = [...new Set(places.map((p) => p.locality).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "de")
  );
  const withGaps = rows.filter((r) => r.gaps.length > 0).length;
  const withoutImage = rows.filter((r) => r.imageCount === 0).length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-xl">
          Orte ({visible.length}
          {visible.length !== places.length && ` von ${places.length}`})
        </h2>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link
            href="/admin/places/duplicates"
            className="rounded border border-neutral-300 px-3 py-2 hover:border-neutral-500"
          >
            Dubletten prüfen
          </Link>
          <Link
            href="/admin/places/images"
            className="rounded border border-neutral-300 px-3 py-2 hover:border-neutral-500"
          >
            Bilder nachtragen ({withoutImage})
          </Link>
          <Link href="/admin/places/new" className="rounded bg-(--color-ink) px-3 py-2 text-white">
            + Neuer Ort
          </Link>
        </div>
      </div>

      <form className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-neutral-200 bg-white p-3">
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Suche
          <input
            name="q"
            defaultValue={query}
            placeholder="Name, Ort oder Adresse"
            className={`${selectCls} w-52`}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Region
          <select name="region" defaultValue={sp.region ?? ""} className={selectCls}>
            <option value="">alle</option>
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Typ
          <select name="type" defaultValue={sp.type ?? ""} className={selectCls}>
            <option value="">alle</option>
            {PLACE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Status
          <select name="status" defaultValue={sp.status ?? ""} className={selectCls}>
            <option value="">alle</option>
            <option value="draft">Entwurf</option>
            <option value="verified">geprüft</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Lücke
          <select name="gap" defaultValue={sp.gap ?? ""} className={selectCls}>
            <option value="">egal</option>
            {GAP_KEYS.map((g) => (
              <option key={g} value={g}>
                {GAP_LABELS[g]} fehlt
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Sortierung
          <select name="sort" defaultValue={sort} className={selectCls}>
            <option value="gaps">unvollständig zuerst</option>
            <option value="name">Name</option>
            <option value="recent">zuletzt geprüft</option>
          </select>
        </label>
        <button className="rounded bg-(--color-ink) px-3 py-2 text-sm text-white">Filtern</button>
        <Link href="/admin/places" className="px-2 py-2 text-sm text-neutral-500 underline">
          zurücksetzen
        </Link>
      </form>

      <p className="mb-3 text-xs text-neutral-500">
        {withGaps} von {rows.length} Einträgen haben offene Lücken. Rot markierte
        Lücken wirken sich direkt auf den Guide aus (falsche Kartenposition,
        Eintrag wird ausgefiltert, falsches Kapitel).
      </p>

      <PlacesTable rows={visible} localities={localities} />
    </div>
  );
}
