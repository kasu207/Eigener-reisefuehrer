import Link from "next/link";
import { prisma } from "@/lib/db";
import { isMock } from "@/lib/ai/mock";
import { AREA_KEYS, placeMatchesArea, type AreaKey } from "@/lib/areas";
import { missingOperatorFields, OPERATOR_FIELD_LABELS } from "@/lib/site-config";
import { evaluateReadiness, readinessVerdict, MIN_STOCK } from "@/lib/launch-readiness";

export const dynamic = "force-dynamic";

const LEVEL_STYLE: Record<string, string> = {
  blocker: "border-red-300 bg-red-50 text-red-900",
  warnung: "border-amber-300 bg-amber-50 text-amber-900",
  ok: "border-emerald-200 bg-emerald-50 text-emerald-900",
};
const LEVEL_ICON: Record<string, string> = { blocker: "✗", warnung: "!", ok: "✓" };

/**
 * „Kann ich das verkaufen?" – eine Seite, die vor dem Live-Gang ehrlich sagt,
 * was noch fehlt. Bündelt Recht, KI-Modus, Ortsbestand und Betrieb.
 */
export default async function StartklarPage() {
  // Nur redaktionell geprüfter Bestand zählt – Nutzer-Ergänzungen gehören
  // jeweils nur zu einem Guide und sagen nichts über die Verkaufsreife.
  const places = await prisma.place.findMany({
    where: { status: "verified", addedByRequestId: null },
    select: { type: true, priceLevel: true },
  });
  const hikeCount = await prisma.hike.count({ where: { status: "verified" } });

  const stock = Object.fromEntries(
    AREA_KEYS.map((area) => [
      area,
      area === "hikes"
        ? hikeCount
        : places.filter((p) => placeMatchesArea(p.type, p.priceLevel, area)).length,
    ])
  ) as Record<AreaKey, number>;

  const staleCutoff = new Date(Date.now() - 15 * 60 * 1000);
  const [stalePending, failed] = await Promise.all([
    prisma.guideRequest.count({
      where: { status: { in: ["pending", "generating"] }, createdAt: { lt: staleCutoff } },
    }),
    prisma.guideRequest.count({ where: { status: "failed" } }),
  ]);

  const adminPw = process.env.ADMIN_PASSWORD ?? "";
  const checks = evaluateReadiness({
    stock,
    missingOperatorFields: missingOperatorFields().map((f) => OPERATOR_FIELD_LABELS[f]),
    aiIsMock: isMock(),
    hasApiKey: Boolean((process.env.ANTHROPIC_API_KEY ?? "").trim()),
    stalePendingRequests: stalePending,
    failedRequests: failed,
    hasAppUrl: Boolean((process.env.APP_URL ?? "").trim()),
    adminPasswordIsWeak: adminPw.length < 12 || adminPw === "change-me",
  });
  const verdict = readinessVerdict(checks);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-serif text-xl">Startklar?</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Was noch zwischen dir und dem ersten bezahlten Reiseführer steht.
        </p>
      </div>

      <div
        className={`rounded-lg border px-4 py-3 ${
          verdict.sellable ? LEVEL_STYLE.ok : LEVEL_STYLE.blocker
        }`}
      >
        <p className="font-medium">
          {verdict.sellable
            ? "Keine Blocker – aus technischer Sicht verkaufsfähig."
            : `${verdict.blockers} Blocker offen.`}
          {verdict.warnings > 0 && ` ${verdict.warnings} Hinweis(e).`}
        </p>
        {verdict.sellable && (
          <p className="mt-1 text-sm">
            Ob der Guide seinen Preis wert ist, entscheidet trotzdem der Inhalt.
            Erstelle einen echten Reiseführer für eine echte Reise und lies ihn
            von vorne bis hinten, bevor du Geld verlangst.
          </p>
        )}
      </div>

      <ul className="space-y-3">
        {checks.map((c) => (
          <li key={c.id} className={`rounded-lg border px-4 py-3 ${LEVEL_STYLE[c.level]}`}>
            <p className="font-medium">
              <span className="mr-2" aria-hidden="true">
                {LEVEL_ICON[c.level]}
              </span>
              {c.title}
            </p>
            <p className="mt-1 text-sm">{c.detail}</p>
            {c.action && <p className="mt-1 text-sm opacity-80">→ {c.action}</p>}
          </li>
        ))}
      </ul>

      <section className="rounded border border-neutral-200 bg-white p-4">
        <h3 className="font-serif text-lg">Ortsbestand je Bereich</h3>
        <p className="mt-1 text-sm text-neutral-600">
          Nur geprüfte, redaktionelle Einträge. Der Sollwert ist die Zielmenge
          einer typischen Wochenreise – darunter zeigt der Guide weniger, als er
          verspricht.
        </p>
        <table className="mt-3 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-300 text-left text-neutral-500">
              <th className="py-1.5 pr-4">Bereich</th>
              <th className="py-1.5 pr-4">Vorhanden</th>
              <th className="py-1.5 pr-4">Soll</th>
            </tr>
          </thead>
          <tbody>
            {AREA_KEYS.map((area) => {
              const have = stock[area];
              const need = MIN_STOCK[area];
              return (
                <tr key={area} className="border-b border-neutral-100">
                  <td className="py-1.5 pr-4">{area}</td>
                  <td className={`py-1.5 pr-4 ${have < need ? "text-red-700" : "text-emerald-700"}`}>
                    {have}
                  </td>
                  <td className="py-1.5 pr-4 text-neutral-500">{need}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="mt-3 text-sm">
          <Link href="/admin/kuratieren" className="text-(--color-accent) underline">
            → Zum Kuratieren (OpenStreetMap-Import)
          </Link>
        </p>
      </section>

      <section className="rounded border border-neutral-200 bg-white p-4">
        <h3 className="font-serif text-lg">Nicht automatisch prüfbar</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-700">
          <li>
            <strong>Textqualität.</strong> Lies einen echten Guide komplett.
            Kein Prüfprogramm ersetzt das.
          </li>
          <li>
            <strong>Widerrufsbelehrung und AGB.</strong> Bei bezahlten digitalen
            Inhalten Pflicht bzw. dringend empfohlen – hol dir dafür eine
            Vorlage von IHK/Anwalt. Wir liefern hier bewusst keinen
            Rechtstext.
          </li>
          <li>
            <strong>Zahlungsabwicklung.</strong> Ist im MVP nicht enthalten
            (siehe README, Phase 2).
          </li>
          <li>
            <strong>Auftragsverarbeitungsverträge</strong> mit Anthropic, dem
            Mail-Dienst und dem Hoster.
          </li>
        </ul>
      </section>
    </div>
  );
}
