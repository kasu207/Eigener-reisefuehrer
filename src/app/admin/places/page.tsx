import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function PlacesPage() {
  const places = await prisma.place.findMany({
    orderBy: [{ status: "asc" }, { name: "asc" }],
    include: { region: true, _count: { select: { images: true, sources: true } } },
  });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-serif text-xl">Orte ({places.length})</h2>
        <Link
          href="/admin/places/new"
          className="rounded bg-(--color-ink) px-4 py-2 text-sm text-white"
        >
          + Neuer Ort
        </Link>
      </div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-neutral-300 text-left text-neutral-500">
            <th className="py-2 pr-4">Name</th>
            <th className="py-2 pr-4">Typ</th>
            <th className="py-2 pr-4">Region</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4">Bilder/Quellen</th>
          </tr>
        </thead>
        <tbody>
          {places.map((p) => (
            <tr key={p.id} className="border-b border-neutral-200">
              <td className="py-2 pr-4">
                <Link href={`/admin/places/${p.id}`} className="text-(--color-accent) underline">
                  {p.name}
                </Link>
              </td>
              <td className="py-2 pr-4">{p.type}</td>
              <td className="py-2 pr-4">{p.region.name}</td>
              <td className="py-2 pr-4">
                <span className={p.status === "verified" ? "text-green-700" : "text-amber-700"}>
                  {p.status === "verified" ? "geprüft" : "Entwurf"}
                </span>
              </td>
              <td className="py-2 pr-4 text-neutral-500">
                {p._count.images} / {p._count.sources}
              </td>
            </tr>
          ))}
          {places.length === 0 && (
            <tr>
              <td colSpan={5} className="py-6 text-neutral-500">
                Noch keine Orte. Lege zuerst eine Region an, dann Orte.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
