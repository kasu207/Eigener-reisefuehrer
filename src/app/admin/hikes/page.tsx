import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function HikesPage() {
  const hikes = await prisma.hike.findMany({
    orderBy: [{ status: "asc" }, { name: "asc" }],
    include: { region: true },
  });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-serif text-xl">Wanderungen ({hikes.length})</h2>
        <Link href="/admin/hikes/new" className="rounded bg-(--color-ink) px-4 py-2 text-sm text-white">
          + Neue Wanderung
        </Link>
      </div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-neutral-300 text-left text-neutral-500">
            <th className="py-2 pr-4">Name</th>
            <th className="py-2 pr-4">Eckdaten</th>
            <th className="py-2 pr-4">Region</th>
            <th className="py-2 pr-4">GPX</th>
            <th className="py-2 pr-4">Status</th>
          </tr>
        </thead>
        <tbody>
          {hikes.map((h) => (
            <tr key={h.id} className="border-b border-neutral-200">
              <td className="py-2 pr-4">
                <Link href={`/admin/hikes/${h.id}`} className="text-(--color-accent) underline">
                  {h.name}
                </Link>
              </td>
              <td className="py-2 pr-4 text-neutral-600">
                {h.distanceKm} km · {h.durationMin} min · {h.elevationGainM} hm · {h.difficulty}
              </td>
              <td className="py-2 pr-4">{h.region.name}</td>
              <td className="py-2 pr-4">{h.gpxFile ? "✓" : "–"}</td>
              <td className="py-2 pr-4">
                <span className={h.status === "verified" ? "text-green-700" : "text-amber-700"}>
                  {h.status === "verified" ? "geprüft" : "Entwurf"}
                </span>
              </td>
            </tr>
          ))}
          {hikes.length === 0 && (
            <tr>
              <td colSpan={5} className="py-6 text-neutral-500">
                Noch keine Wanderungen.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
