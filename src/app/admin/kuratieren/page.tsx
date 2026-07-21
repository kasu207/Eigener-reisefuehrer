import Link from "next/link";
import { prisma } from "@/lib/db";
import { AI_MODEL } from "@/lib/ai/model";
import { isMock } from "@/lib/ai/mock";
import { generatePlaceDrafts } from "../actions";

export const dynamic = "force-dynamic";

const inputCls = "w-full rounded border border-neutral-300 px-2 py-1 text-sm";

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "sight", label: "Sehenswürdigkeit" },
  { value: "viewpoint", label: "Aussichtspunkt" },
  { value: "beach", label: "Bade-/Seezugang" },
  { value: "restaurant", label: "Restaurant/Café" },
  { value: "bar", label: "Bar/Aperitivo" },
  { value: "hotel", label: "Unterkunft" },
  { value: "event", label: "Veranstaltung" },
  { value: "practical", label: "Praktisches" },
];

// Gruppen für die Abdeckungs-Übersicht
const COVERAGE_GROUPS: { key: string; label: string; types: string[] }[] = [
  { key: "sights", label: "Sehen", types: ["village", "sight", "viewpoint", "beach"] },
  { key: "food", label: "Essen", types: ["restaurant"] },
  { key: "bars", label: "Ausgehen", types: ["bar"] },
  { key: "hotels", label: "Unterkunft", types: ["hotel"] },
  { key: "practical", label: "Praktisch", types: ["practical"] },
];

export default async function KuratierenPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const regions = await prisma.region.findMany({ orderBy: { name: "asc" } });
  const defaultRegion = regions[0];

  const places = await prisma.place.findMany({
    select: { locality: true, type: true, status: true },
  });

  // Abdeckung je Ort (nur verifizierte zählen für den Guide)
  const byLocality = new Map<string, Record<string, number>>();
  for (const p of places) {
    if (p.status !== "verified") continue;
    const loc = p.locality?.trim() || "(ohne Ort)";
    const row = byLocality.get(loc) ?? {};
    const group = COVERAGE_GROUPS.find((g) => g.types.includes(p.type));
    if (group) row[group.key] = (row[group.key] ?? 0) + 1;
    byLocality.set(loc, row);
  }
  const localities = [...byLocality.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const draftCount = places.filter((p) => p.status === "draft").length;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-serif text-xl">Kuratieren</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Zentrale Werkstatt: Inhalte schnell nachpflegen, KI-Entwürfe erzeugen,
          Bücher einlesen und Lücken je Ort erkennen.
        </p>
      </div>

      {sp.created && (
        <div className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {sp.created} Entwurf/Entwürfe angelegt. Prüfe sie unter{" "}
          <Link href="/admin/places" className="underline">
            Orte
          </Link>{" "}
          (Status „Entwurf"), setze Koordinaten per Kartenklick und stelle sie
          auf „Geprüft".
        </div>
      )}
      {sp.error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Abgelehnt: {sp.error}
        </div>
      )}

      {/* KI-Modell & Modus */}
      <section className="rounded border border-neutral-200 bg-white p-4">
        <h3 className="mb-2 font-serif text-lg">KI-Einstellung</h3>
        <p className="text-sm">
          Aktives Modell:{" "}
          <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs">{AI_MODEL}</span>
          {"  "}
          Modus:{" "}
          <span className={isMock() ? "text-amber-700" : "text-emerald-700"}>
            {isMock() ? "mock (kostenlos, Platzhalter)" : "live"}
          </span>
        </p>
        <p className="mt-2 text-xs text-neutral-500">
          Das Modell wird über die Umgebungsvariable <code>ANTHROPIC_MODEL</code>{" "}
          in der <code>.env</code> gesetzt (Standard jetzt{" "}
          <code>claude-sonnet-4-6</code> – deutlich günstiger als Opus). Nach
          einer Änderung die Container neu starten:{" "}
          <code>docker compose -f docker-compose.prod.yml up -d</code>.
        </p>
      </section>

      {/* KI-Ortsvorschläge */}
      <section className="rounded border border-neutral-200 bg-white p-4">
        <h3 className="mb-2 font-serif text-lg">KI-Ortsvorschläge erzeugen</h3>
        <p className="mb-3 text-sm text-neutral-600">
          Die KI schlägt reale Orte als <strong>Entwürfe</strong> vor. Sie erfindet
          keine Guide-Fakten – Koordinaten, Preise und Öffnungszeiten prüfst du
          selbst, bevor du auf „Geprüft" stellst.
        </p>
        <form action={generatePlaceDrafts} className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="regionId" value={defaultRegion?.id ?? ""} />
          <label className="block text-sm">
            <span className="mb-1 block text-neutral-600">Ort/Stadt</span>
            <input name="locality" placeholder="z. B. Torno" className={inputCls} required />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-neutral-600">Typ</span>
            <select name="type" className={inputCls} defaultValue="sight">
              {TYPE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-neutral-600">Anzahl (1–15)</span>
            <input
              name="count"
              type="number"
              min={1}
              max={15}
              defaultValue={5}
              className={inputCls}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-neutral-600">Zusatzhinweis (optional)</span>
            <input
              name="extraHint"
              placeholder="z. B. familienfreundlich, Seeblick"
              className={inputCls}
            />
          </label>
          <div className="sm:col-span-2">
            <button className="rounded bg-(--color-ink) px-4 py-2 text-sm text-white">
              Entwürfe erzeugen
            </button>
            {isMock() && (
              <span className="ml-3 text-xs text-amber-700">
                Im Mock-Modus entstehen nur Platzhalter – für echte Vorschläge
                AI_MODE=live setzen.
              </span>
            )}
          </div>
        </form>
        {draftCount > 0 && (
          <p className="mt-3 text-sm">
            Aktuell{" "}
            <Link href="/admin/places" className="text-(--color-accent) underline">
              {draftCount} Entwurf/Entwürfe
            </Link>{" "}
            zur Prüfung offen.
          </p>
        )}
      </section>

      {/* Bücher einlesen */}
      <section className="rounded border border-neutral-200 bg-white p-4">
        <h3 className="mb-2 font-serif text-lg">Deine Reiseführer einlesen</h3>
        <p className="text-sm text-neutral-600">
          Lade deine gekauften Comer-See-Reiseführer (PDF) oder verlinke Blogs in
          der{" "}
          <Link href="/admin/knowledge" className="text-(--color-accent) underline">
            Wissensbibliothek
          </Link>
          . Die KI legt daraus paraphrasierte, getaggte Notizen an (kein
          wörtliches Kopieren), die als Hintergrund in die Guide-Texte einfließen
          und deine Orte anreichern.
        </p>
      </section>

      {/* Abdeckung je Ort */}
      <section className="rounded border border-neutral-200 bg-white p-4">
        <h3 className="mb-1 font-serif text-lg">Abdeckung je Ort (nur geprüfte)</h3>
        <p className="mb-3 text-xs text-neutral-500">
          Zeigt, wo Inhalte fehlen. Eine <span className="text-red-600">0</span>{" "}
          heißt: In diesem Bereich hat der Ort noch nichts – hier lohnt das
          Nachpflegen. Orte, die noch gar nicht existieren (z. B. Torno), einfach
          oben per KI-Vorschlag oder unter „Orte" anlegen.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-neutral-300 text-left text-neutral-500">
                <th className="py-2 pr-4">Ort</th>
                {COVERAGE_GROUPS.map((g) => (
                  <th key={g.key} className="py-2 pr-4">
                    {g.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {localities.map(([loc, row]) => (
                <tr key={loc} className="border-b border-neutral-200">
                  <td className="py-2 pr-4 font-medium">{loc}</td>
                  {COVERAGE_GROUPS.map((g) => {
                    const n = row[g.key] ?? 0;
                    return (
                      <td
                        key={g.key}
                        className={`py-2 pr-4 ${n === 0 ? "font-semibold text-red-600" : "text-neutral-700"}`}
                      >
                        {n}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {localities.length === 0 && (
                <tr>
                  <td colSpan={COVERAGE_GROUPS.length + 1} className="py-6 text-neutral-500">
                    Noch keine geprüften Orte. Erzeuge oben Entwürfe oder lege
                    Orte an.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
