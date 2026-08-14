import Link from "next/link";
import { prisma } from "@/lib/db";
import { resolvePlaceCoordinatesBulk } from "../../actions";
import { isRegionCenter } from "@/lib/coordinates";

export const dynamic = "force-dynamic";

/** Wie viele Orte ein Lauf verarbeitet – Nominatim erlaubt 1 Anfrage/Sekunde. */
const BATCH_SIZE = 25;

/**
 * Koordinaten nachtragen: listet alle Orte, die noch auf der Regions-Mitte
 * stehen (der alte Platzhalter beim automatischen Anlegen). Am Comer See ist
 * das buchstäblich die Seemitte – der Kartenpin steht im Wasser und die
 * Umkreis-Suche der Auswahl-Engine findet den Eintrag nicht.
 */
export default async function CoordinatesPage({
  searchParams,
}: {
  searchParams: Promise<{ region?: string; done?: string }>;
}) {
  const sp = await searchParams;

  const [regions, places] = await Promise.all([
    prisma.region.findMany({ orderBy: { name: "asc" } }),
    prisma.place.findMany({
      where: sp.region ? { regionId: sp.region } : {},
      orderBy: [{ locality: "asc" }, { name: "asc" }],
      include: { region: true },
    }),
  ]);

  const affected = places.filter((p) =>
    isRegionCenter(p.lat, p.lng, {
      name: p.region.name,
      country: p.region.country,
      centerLat: p.region.centerLat,
      centerLng: p.region.centerLng,
    })
  );
  const batch = affected.slice(0, BATCH_SIZE);
  const withoutLocality = affected.filter((p) => !p.locality.trim()).length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-xl">Koordinaten nachtragen ({affected.length})</h2>
        <Link href="/admin/places" className="text-sm text-(--color-accent) underline">
          zurück zur Orte-Liste
        </Link>
      </div>

      {sp.done && (
        <p className="mb-4 rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">
          Lauf beendet: {sp.done}
        </p>
      )}

      <p className="mb-4 max-w-3xl text-sm text-neutral-600">
        Diese Orte stehen exakt auf der Regions-Mitte – dem Platzhalter, den
        automatisch angelegte Einträge früher bekamen. Am Comer See liegt der
        Pin damit im Wasser, und die Umkreis-Suche findet den Eintrag nicht.
        Die Ermittlung versucht der Reihe nach: Adresse, Eintrag in
        OpenStreetMap, Namenssuche, Ortsmittelpunkt. Wird gar nichts gefunden,
        bleibt der Ort unverändert stehen, damit du ihn hier wiederfindest.
      </p>

      {withoutLocality > 0 && (
        <p className="mb-4 max-w-3xl rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {withoutLocality} dieser Orte haben kein Ort/Stadt-Feld. Ohne das gibt
          es keinen Anhaltspunkt für die Suche – trage die Stadt zuerst nach
          (in der Orte-Liste per Sammelaktion), dann läuft die Ermittlung
          deutlich besser.
        </p>
      )}

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

      {affected.length === 0 ? (
        <p className="rounded-lg border border-neutral-200 bg-white p-6 text-sm text-neutral-500">
          Kein Ort steht mehr auf der Regions-Mitte.
        </p>
      ) : (
        <>
          <form action={resolvePlaceCoordinatesBulk} className="mb-4">
            {batch.map((p) => (
              <input key={p.id} type="hidden" name="ids" value={p.id} />
            ))}
            <button className="rounded bg-(--color-accent) px-4 py-2 text-sm text-white">
              Die nächsten {batch.length} Orte verorten
            </button>
            <span className="ml-3 text-xs text-neutral-500">
              dauert etwa {Math.ceil((batch.length * 1.5) / 10) * 10} Sekunden – die
              Abfragen laufen bewusst langsam, damit OpenStreetMap uns nicht sperrt
            </span>
          </form>

          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-300 text-left text-neutral-500">
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Ort/Stadt</th>
                <th className="py-2 pr-4">Adresse</th>
                <th className="py-2 pr-4">Typ</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Einzeln</th>
              </tr>
            </thead>
            <tbody>
              {affected.map((p, i) => (
                <tr
                  key={p.id}
                  className={`border-b border-neutral-200 ${i < BATCH_SIZE ? "" : "opacity-50"}`}
                >
                  <td className="py-2 pr-4">
                    <Link
                      href={`/admin/places/${p.id}`}
                      className="text-(--color-accent) underline"
                    >
                      {p.name}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">
                    {p.locality || <span className="text-red-700">fehlt</span>}
                  </td>
                  <td className="py-2 pr-4 text-neutral-500">{p.address || "–"}</td>
                  <td className="py-2 pr-4 text-neutral-500">{p.type}</td>
                  <td className="py-2 pr-4">
                    <span className={p.status === "verified" ? "text-green-700" : "text-amber-700"}>
                      {p.status === "verified" ? "geprüft" : "Entwurf"}
                    </span>
                  </td>
                  <td className="py-2 pr-4">
                    <form action={resolvePlaceCoordinatesBulk}>
                      <input type="hidden" name="ids" value={p.id} />
                      <button className="text-xs text-(--color-accent) underline">verorten</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
