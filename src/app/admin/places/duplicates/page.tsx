import Link from "next/link";
import { prisma } from "@/lib/db";
import { dismissDuplicate, mergePlaces, restoreDuplicatePair } from "../../actions";
import { findDuplicateGroups, formatKm, pairKey, type DuplicateConfidence } from "@/lib/duplicates";

export const dynamic = "force-dynamic";

const CONFIDENCE_STYLE: Record<DuplicateConfidence, string> = {
  sicher: "border-red-300 bg-red-50",
  wahrscheinlich: "border-amber-300 bg-amber-50",
  möglich: "border-neutral-200 bg-white",
};

/**
 * Dubletten-Ansicht: gruppiert wahrscheinliche Doppel-Einträge und führt sie
 * auf Knopfdruck zusammen. Beim Zusammenführen wandern Bilder, Quellen und
 * gepflegte Felder mit, und bestehende Guides zeigen anschließend auf den
 * behaltenen Ort – der Eintrag verschwindet dort also nicht.
 */
export default async function DuplicatesPage() {
  const [places, dismissals] = await Promise.all([
    prisma.place.findMany({
      orderBy: { name: "asc" },
      include: {
        region: { select: { name: true } },
        _count: { select: { images: true, sources: true } },
      },
    }),
    prisma.duplicateDismissal.findMany({ orderBy: { createdAt: "desc" } }),
  ]);

  const byId = new Map(places.map((p) => [p.id, p]));
  const dismissed = new Set(dismissals.map((d) => pairKey(d.aId, d.bId)));
  const groups = findDuplicateGroups(
    places.map((p) => ({
      id: p.id,
      regionId: p.regionId,
      name: p.name,
      locality: p.locality,
      lat: p.lat,
      lng: p.lng,
      addedByRequestId: p.addedByRequestId,
    })),
    dismissed
  );

  // Markierungen zu gelöschten Orten sind wirkungslos – nicht anzeigen
  const activeDismissals = dismissals.filter((d) => byId.has(d.aId) && byId.has(d.bId));

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-serif text-xl">Dubletten ({groups.length})</h2>
        <Link href="/admin/places" className="text-sm text-(--color-accent) underline">
          zurück zur Orte-Liste
        </Link>
      </div>

      <p className="mb-6 max-w-3xl text-sm text-neutral-600">
        Gefunden über Namensähnlichkeit und Entfernung – „Ristorante Vapore" und
        „Vapore" im selben Ort gelten als dasselbe. Beim Zusammenführen wählst du
        den Eintrag, der bleibt; Bilder, Quellen und gepflegte Angaben der
        anderen wandern hinüber, leere Felder werden aufgefüllt, und bestehende
        Guides verweisen danach auf den behaltenen Ort.
      </p>

      {groups.length === 0 && (
        <p className="rounded-lg border border-neutral-200 bg-white p-6 text-sm text-neutral-500">
          Keine Dubletten gefunden.
        </p>
      )}

      <div className="space-y-4">
        {groups.map((group) => {
          const members = group.ids
            .map((id) => byId.get(id))
            .filter((p): p is NonNullable<typeof p> => Boolean(p));
          if (members.length < 2) return null;
          const allIds = members.map((m) => m.id).join(",");

          return (
            <section
              key={group.ids.join("-")}
              className={`rounded-lg border p-4 ${CONFIDENCE_STYLE[group.confidence]}`}
            >
              <div className="mb-3 flex flex-wrap items-baseline gap-2">
                <span className="text-xs font-medium uppercase tracking-wide">
                  {group.confidence}
                </span>
                <span className="text-xs text-neutral-500">
                  {group.pairs
                    .map((p) => p.reason)
                    .filter((r, i, all) => all.indexOf(r) === i)
                    .join(" · ")}
                </span>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {members.map((m) => (
                  <div key={m.id} className="rounded border border-neutral-200 bg-white p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <Link
                        href={`/admin/places/${m.id}`}
                        className="font-medium text-(--color-accent) underline"
                      >
                        {m.name}
                      </Link>
                      <span
                        className={`text-xs ${m.status === "verified" ? "text-green-700" : "text-amber-700"}`}
                      >
                        {m.status === "verified" ? "geprüft" : "Entwurf"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-neutral-500">
                      {m.type} · {m.locality || "ohne Ort"} · {m.region.name}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {m._count.images} Bilder · {m._count.sources} Quellen ·
                      Qualität {m.qualityScore}
                      {m.mustSee && " · ★ Must-See"}
                    </p>
                    {m.address && <p className="mt-1 text-xs text-neutral-500">{m.address}</p>}
                    {m.editorNotes && (
                      <p className="mt-1 line-clamp-3 text-xs text-neutral-600">{m.editorNotes}</p>
                    )}
                    <form action={mergePlaces} className="mt-2">
                      <input type="hidden" name="keepId" value={m.id} />
                      <input type="hidden" name="mergeIds" value={allIds} />
                      <button className="rounded bg-(--color-ink) px-3 py-1.5 text-xs text-white">
                        Diesen behalten &amp; zusammenführen
                      </button>
                    </form>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap gap-3 text-xs">
                {group.pairs.map((p) => (
                  <form key={pairKey(p.a, p.b)} action={dismissDuplicate}>
                    <input type="hidden" name="aId" value={p.a} />
                    <input type="hidden" name="bId" value={p.b} />
                    <button className="text-neutral-500 underline hover:text-neutral-800">
                      „{byId.get(p.a)?.name}" und „{byId.get(p.b)?.name}" sind kein Duplikat (
                      {formatKm(p.distanceKm)})
                    </button>
                  </form>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {activeDismissals.length > 0 && (
        <section className="mt-10">
          <h3 className="mb-2 font-serif text-lg">Als „kein Duplikat" markiert</h3>
          <ul className="space-y-1 text-sm">
            {activeDismissals.map((d) => (
              <li key={d.id} className="flex items-center gap-3">
                <span className="text-neutral-600">
                  {byId.get(d.aId)?.name} ↔ {byId.get(d.bId)?.name}
                </span>
                <form action={restoreDuplicatePair}>
                  <input type="hidden" name="id" value={d.id} />
                  <button className="text-xs text-(--color-accent) underline">wieder prüfen</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
