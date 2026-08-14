import { prisma } from "@/lib/db";
import { requeueGuideRequest } from "./actions";
import AutoRefresh from "@/components/admin/AutoRefresh";
import {
  heartbeatAgeSeconds,
  isStale,
  progressLabel,
  progressPercent,
} from "@/lib/generation-progress";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  pending: "wartet",
  generating: "wird generiert",
  ready: "fertig",
  failed: "fehlgeschlagen",
};

/** "vor 8 s" / "vor 3 min" – Alter des letzten Lebenszeichens. */
function ageLabel(seconds: number | null): string {
  if (seconds == null) return "noch kein Lebenszeichen";
  if (seconds < 90) return `vor ${seconds} s`;
  return `vor ${Math.round(seconds / 60)} min`;
}

/** Liste der GuideRequests mit Status, Fortschritt und Neu-Generierung (4.5). */
export default async function AdminDashboard() {
  const requests = await prisma.guideRequest.findMany({
    orderBy: { createdAt: "desc" },
    include: { guides: { orderBy: { generatedAt: "desc" }, take: 1 } },
    take: 100,
  });
  const now = new Date();

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-serif text-xl">Guide-Requests</h2>
        <AutoRefresh seconds={5} />
      </div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-neutral-300 text-left text-neutral-500">
            <th className="py-2 pr-4">Erstellt</th>
            <th className="py-2 pr-4">E-Mail</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4">Fortschritt</th>
            <th className="py-2 pr-4">Tokens (in/out)</th>
            <th className="py-2 pr-4">Aktionen</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((r) => {
            const guide = r.guides[0];
            const running = r.status === "generating";
            const stale = isStale(r, now);
            const percent = progressPercent(r.progressDone, r.progressTotal);
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
                <td className="py-2 pr-4">
                  {running ? (
                    <div className="min-w-40">
                      <p className={stale ? "text-xs text-red-700" : "text-xs text-neutral-600"}>
                        {progressLabel(r.progressDone, r.progressTotal, r.progressLabel)}
                      </p>
                      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-neutral-200">
                        <div
                          className={`h-full rounded-full ${stale ? "bg-red-400" : "bg-amber-500"}`}
                          style={{ width: `${Math.max(percent, 3)}%` }}
                        />
                      </div>
                      <p
                        className={`mt-1 text-[11px] ${stale ? "font-medium text-red-700" : "text-neutral-400"}`}
                      >
                        {stale ? "hängt – kein Lebenszeichen " : "Lebenszeichen "}
                        {ageLabel(heartbeatAgeSeconds(r.heartbeatAt, now))}
                      </p>
                    </div>
                  ) : (
                    <span className="text-neutral-400">
                      {r.status === "pending" ? "wartet auf Worker" : "–"}
                    </span>
                  )}
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
              <td colSpan={6} className="py-6 text-neutral-500">
                Noch keine Anfragen.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
