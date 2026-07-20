import { prisma } from "@/lib/db";
import { requeueGuideRequest } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  pending: "wartet",
  generating: "wird generiert",
  ready: "fertig",
  failed: "fehlgeschlagen",
};

/** Liste der GuideRequests mit Status, Vorschau und Neu-Generierung (4.5). */
export default async function AdminDashboard() {
  const requests = await prisma.guideRequest.findMany({
    orderBy: { createdAt: "desc" },
    include: { guides: { orderBy: { generatedAt: "desc" }, take: 1 } },
    take: 100,
  });

  return (
    <div>
      <h2 className="mb-4 font-serif text-xl">Guide-Requests</h2>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-neutral-300 text-left text-neutral-500">
            <th className="py-2 pr-4">Erstellt</th>
            <th className="py-2 pr-4">E-Mail</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4">Tokens (in/out)</th>
            <th className="py-2 pr-4">Aktionen</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => {
            const guide = r.guides[0];
            return (
              <tr key={r.id} className="border-b border-neutral-200 align-top">
                <td className="py-2 pr-4">{r.createdAt.toLocaleString("de-DE")}</td>
                <td className="py-2 pr-4">{r.email}</td>
                <td className="py-2 pr-4">
                  <span
                    className={
                      r.status === "ready"
                        ? "text-green-700"
                        : r.status === "failed"
                          ? "text-red-700"
                          : "text-amber-700"
                    }
                  >
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                  {r.error && <p className="mt-1 max-w-xs text-xs text-red-600">{r.error}</p>}
                </td>
                <td className="py-2 pr-4 text-neutral-500">
                  {guide ? `${guide.inputTokens} / ${guide.outputTokens}` : "–"}
                </td>
                <td className="py-2 pr-4">
                  <div className="flex gap-3">
                    {guide && (
                      <a
                        href={`/guide/${guide.publicToken}`}
                        target="_blank"
                        className="text-(--color-accent) underline"
                      >
                        Vorschau
                      </a>
                    )}
                    <form action={requeueGuideRequest}>
                      <input type="hidden" name="id" value={r.id} />
                      <button className="text-neutral-600 underline">Neu generieren</button>
                    </form>
                  </div>
                </td>
              </tr>
            );
          })}
          {requests.length === 0 && (
            <tr>
              <td colSpan={5} className="py-6 text-neutral-500">
                Noch keine Anfragen.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
