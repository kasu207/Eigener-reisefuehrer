import Link from "next/link";
import { prisma } from "@/lib/db";
import ImageSearch from "@/components/ImageSearch";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 10;

/**
 * Bild-Strecke: alle Orte ohne Bild untereinander, jeweils mit vorbelegter
 * Bildersuche. Bisher hieß „Bilder nachtragen": Liste öffnen, Ort öffnen,
 * suchen, übernehmen, zurück – pro Ort fünf Wege. Hier bleibt man auf einer
 * Seite und arbeitet die Liste von oben nach unten ab.
 */
export default async function PlaceImagesPage({
  searchParams,
}: {
  searchParams: Promise<{ region?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  const [regions, missing] = await Promise.all([
    prisma.region.findMany({ orderBy: { name: "asc" } }),
    prisma.place.findMany({
      where: {
        images: { none: {} },
        ...(sp.region ? { regionId: sp.region } : {}),
      },
      orderBy: [{ status: "desc" }, { name: "asc" }],
      include: { region: { select: { name: true } } },
    }),
  ]);

  const total = missing.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const slice = missing.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const pageHref = (n: number) =>
    `/admin/places/images?${new URLSearchParams({
      ...(sp.region ? { region: sp.region } : {}),
      page: String(n),
    })}`;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-xl">Bilder nachtragen ({total} ohne Bild)</h2>
        <Link href="/admin/places" className="text-sm text-(--color-accent) underline">
          zurück zur Orte-Liste
        </Link>
      </div>

      <form className="mb-6 flex items-end gap-2 rounded-lg border border-neutral-200 bg-white p-3">
        <label className="flex flex-col gap-1 text-xs text-neutral-500">
          Region
          <select
            name="region"
            defaultValue={sp.region ?? ""}
            className="rounded border border-neutral-300 px-2 py-1 text-sm"
          >
            <option value="">alle</option>
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <button className="rounded bg-(--color-ink) px-3 py-2 text-sm text-white">Filtern</button>
      </form>

      {total === 0 && (
        <p className="rounded-lg border border-neutral-200 bg-white p-6 text-sm text-neutral-500">
          Alle Orte haben ein Bild.
        </p>
      )}

      <div className="space-y-6">
        {slice.map((p) => (
          <section key={p.id} className="rounded-lg border border-neutral-200 bg-white p-4">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <Link
                  href={`/admin/places/${p.id}`}
                  className="font-medium text-(--color-accent) underline"
                >
                  {p.name}
                </Link>
                <span className="ml-2 text-xs text-neutral-500">
                  {p.type} · {p.locality || "ohne Ort"} · {p.region.name}
                </span>
              </div>
              <span
                className={`text-xs ${p.status === "verified" ? "text-green-700" : "text-amber-700"}`}
              >
                {p.status === "verified" ? "geprüft" : "Entwurf"}
              </span>
            </div>
            <ImageSearch
              placeId={p.id}
              defaultQuery={`${p.name} ${p.locality}`.trim()}
            />
          </section>
        ))}
      </div>

      {pageCount > 1 && (
        <nav className="mt-6 flex items-center gap-3 text-sm">
          {current > 1 && (
            <Link href={pageHref(current - 1)} className="text-(--color-accent) underline">
              ← vorherige
            </Link>
          )}
          <span className="text-neutral-500">
            Seite {current} von {pageCount}
          </span>
          {current < pageCount && (
            <Link href={pageHref(current + 1)} className="text-(--color-accent) underline">
              nächste →
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
