import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { guideContentSchema, type Chapter } from "@/lib/guide-content";
import { questionnaireSchema } from "@/lib/questionnaire";
import { qrDataUri } from "@/lib/qr";
import { foodTier } from "@/lib/selection";
import { parseAreaCounts, type AreaKey } from "@/lib/areas";
import { cleanName, mapsHref } from "@/lib/names";
import GuideMap, { type MapMarker } from "@/components/GuideMap";
import AdjustPanel from "@/components/AdjustPanel";
import FineTunePanel from "@/components/FineTunePanel";
import AreaControl from "@/components/AreaControl";
import ShareBox from "@/components/ShareBox";
import EmailCapture from "@/components/EmailCapture";
import GuideProgress from "@/components/GuideProgress";
import BackToTop from "@/components/BackToTop";
import OwnerToolbar from "@/components/OwnerToolbar";
import EditableText from "@/components/EditableText";
import RemoveEntryButton from "@/components/RemoveEntryButton";
import RegionInfoBlock from "@/components/RegionInfoBlock";
import { ChapterIcon, LakeHero } from "@/components/illustrations";
import type { Place, Hike, Image as DbImage } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * Der Guide-Link ist der einzige Zugangsschutz (Anforderung 8). Deshalb
 * konsequent aus dem Index halten – ergänzend zu `robots.txt`, denn ein
 * direkt geteilter Link erreicht Crawler auch ohne Verzeichnisdurchlauf.
 * Der Titel macht Browser-Tabs und Lesezeichen unterscheidbar.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const guide = await prisma.guide.findFirst({
    where: { OR: [{ publicToken: token }, { shareToken: token }] },
    select: { content: true },
  });
  const parsed = guide ? guideContentSchema.safeParse(guide.content) : null;
  const title = parsed?.success ? parsed.data.intro.title : null;
  return {
    // Nur der eigene Teil – den Zusatz hängt das Template im Root-Layout an.
    title: title || "Euer Reiseführer",
    robots: { index: false, follow: false, nocache: true },
  };
}

/**
 * Interaktiver Browser-Reiseführer im Buch-Stil:
 * - Ort-Kapitel mit festen Unterabschnitten (Sehenswürdigkeiten, Essen &
 *   Trinken, Ausgehen, Unterkunft, Veranstaltungen, Praktisches)
 * - Wanderungen mit Link und QR-Code zum Aufrufen
 * - Front-Matter (Geschichte als Timeline, Sprachführer als Tabelle)
 * - alles direkt im Browser bearbeitbar (Besitzer), Fakten aus der DB
 */

type PlaceWithImages = Place & { images: DbImage[] };
type HikeWithImages = Hike & { images: DbImage[] };

/** Feste Ort-Unterabschnitte – immer in gleicher Reihenfolge und Benennung.
 * "food" wird nach Preisklassen (gehoben/mittel/günstig) unterteilt. */
type SubSection =
  | { kind: "types"; title: string; types: PlaceWithImages["type"][]; area?: AreaKey }
  | { kind: "food" };
const SUBSECTIONS: SubSection[] = [
  { kind: "types", title: "Sehenswürdigkeiten & Ausblicke", types: ["village", "sight", "viewpoint"], area: "sights" },
  { kind: "types", title: "Baden & Seezugang", types: ["beach"] },
  { kind: "food" },
  { kind: "types", title: "Ausgehen & Aperitivo", types: ["bar"], area: "bars" },
  { kind: "types", title: "Unterkunft", types: ["hotel"], area: "hotels" },
  { kind: "types", title: "Veranstaltungen", types: ["event"] },
  { kind: "types", title: "Praktisches vor Ort", types: ["practical"] },
];

/** Preisklassen-Bänder innerhalb "Essen & Trinken" – je Band ein eigener Regler. */
const FOOD_TIERS: { tier: "fancy" | "mid" | "budget"; title: string; area: AreaKey }[] = [
  { tier: "fancy", title: "Gehoben", area: "foodFancy" },
  { tier: "mid", title: "Mittelklasse", area: "foodMid" },
  { tier: "budget", title: "Günstig & Cafés", area: "foodBudget" },
];

const TEXT_PLACEHOLDER = "✍️ Euer persönlicher Text entsteht gerade …";

function FactBox({ rows }: { rows: [string, React.ReactNode][] }) {
  const filled = rows.filter(([, v]) => v);
  if (filled.length === 0) return null;
  return (
    <dl className="print-avoid-break mt-3 rounded-xl bg-(--color-accent-soft)/40 px-4 py-3 text-sm">
      {filled.map(([k, v]) => (
        <div key={k} className="flex gap-2">
          <dt className="w-32 shrink-0 font-medium text-neutral-600">{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function EntryImage({ images, name }: { images: DbImage[]; name: string }) {
  const img = images[0];
  if (!img) return null;
  return (
    <figure className="print-avoid-break mt-3">
      {/* Feste Höhe statt max-h: Ohne gespeicherte Bildmaße hat das Element
          sonst bis zum Laden die Höhe 0 und der Text darunter springt.
          eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={img.fileUrl}
        alt={`Foto von ${name}`}
        loading="lazy"
        decoding="async"
        className="h-72 w-full rounded-xl bg-neutral-100 object-cover"
      />
      <figcaption className="mt-1 text-xs text-neutral-500">
        Foto: {img.author} · Lizenz: {img.license} ·{" "}
        <a href={img.sourceUrl} className="underline">
          Quelle
        </a>
      </figcaption>
    </figure>
  );
}

function accessLabel(access: string): string {
  return access === "car"
    ? "Am besten mit dem Auto"
    : access === "public"
      ? "Mit ÖPNV/Fähre erreichbar"
      : "Zu Fuß/Rad erreichbar";
}

function priceLabel(level: number | null): string {
  return level ? "€".repeat(level) : "";
}

function verifiedNote(date: Date | null): string {
  if (!date) return "";
  return `Stand: ${date.toLocaleDateString("de-DE", { month: "2-digit", year: "numeric" })}, bitte kurz prüfen`;
}

export default async function GuidePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const guide = await prisma.guide.findFirst({
    where: { OR: [{ publicToken: token }, { shareToken: token }] },
    include: { guideRequest: true },
  });
  if (!guide) notFound();
  const isOwner = guide.publicToken === token;
  const regenerating =
    guide.guideRequest.status === "pending" || guide.guideRequest.status === "generating";

  const content = guideContentSchema.parse(guide.content);
  const q = questionnaireSchema.parse(guide.guideRequest.questionnaire);
  const region = await prisma.region.findUnique({
    where: { slug: q.regionSlug },
    include: { infos: { orderBy: { sortOrder: "asc" } } },
  });
  const regionInfos = region?.infos ?? [];

  // Zusätzliche Karten-Spots (Instagram-/Foto-Fundorte), nur geprüfte
  const mapSpots = region
    ? await prisma.mapSpot.findMany({
        where: { regionId: region.id, status: "verified" },
        orderBy: { name: "asc" },
      })
    : [];

  const allEntryIds = content.chapters.flatMap((c) => c.entries.map((e) => e.id));
  const places = await prisma.place.findMany({
    where: { id: { in: allEntryIds } },
    include: { images: true },
  });
  const hikes = await prisma.hike.findMany({
    where: { id: { in: allEntryIds } },
    include: { images: true },
  });
  const placeById = new Map<string, PlaceWithImages>(places.map((p) => [p.id, p]));
  const hikeById = new Map<string, HikeWithImages>(hikes.map((h) => [h.id, h]));

  // QR-Codes für Wanderungen mit Link vorab erzeugen (offline)
  const hikeQr = new Map<string, string>();
  for (const h of hikes) {
    if (h.externalUrl) hikeQr.set(h.id, await qrDataUri(h.externalUrl));
  }

  const markers: MapMarker[] = content.chapters.flatMap((chapter) =>
    chapter.entries.flatMap((entry): MapMarker[] => {
      const h = hikeById.get(entry.id);
      if (h) return [{ lat: h.startLat, lng: h.startLng, label: cleanName(h.name), kind: "hike" }];
      const p = placeById.get(entry.id);
      if (!p || p.type === "practical") return [];
      const kind = p.type === "restaurant" || p.type === "bar" ? "restaurant" : "place";
      return [{ lat: p.lat, lng: p.lng, label: cleanName(p.name), kind }];
    })
  );
  // Instagram-/Foto-Fundorte als eigene (violette) Pins ergänzen
  for (const s of mapSpots) {
    markers.push({ lat: s.lat, lng: s.lng, label: s.name, kind: "spot" });
  }

  // ---- Render-Helfer -------------------------------------------------------

  /**
   * Ebene der Eintrags-Überschrift.
   *
   * In Ort-Kapiteln steht über den Einträgen noch ein h3-Unterabschnitt
   * ("Essen & Trinken"), dort ist h4 richtig. In den Listen-Kapiteln
   * (Wanderungen, Praktisches) und bei den Foto-Spots folgen die Einträge
   * direkt auf das h2 – ein h4 wäre dort ein Ebenensprung, über den
   * Screenreader-Nutzer beim Navigieren stolpern.
   */
  function EntryHeader({
    id,
    name,
    level = 4,
  }: {
    id: string;
    name: string;
    level?: 3 | 4;
  }) {
    const H = level === 3 ? "h3" : "h4";
    return (
      <div className="flex items-baseline justify-between gap-3">
        <H className="font-serif text-lg">{name}</H>
        {isOwner && <RemoveEntryButton token={token} entryId={id} name={name} />}
      </div>
    );
  }

  function EntryTexts({ entry }: { entry: Chapter["entries"][number] }) {
    return (
      <>
        <EditableText
          token={token}
          editable={isOwner}
          target={{ kind: "entry", entryId: entry.id, field: "personalText" }}
          value={entry.personalText}
          placeholder={regenerating ? TEXT_PLACEHOLDER : "Klicken, um einen Text zu schreiben …"}
          className="measure mt-1 leading-relaxed"
        />
        <EditableText
          token={token}
          editable={isOwner}
          target={{ kind: "entry", entryId: entry.id, field: "reason" }}
          value={entry.reason}
          placeholder={isOwner && !regenerating ? "Eure Begründung (optional) …" : ""}
          className="mt-2 text-sm italic text-(--color-accent)"
        />
      </>
    );
  }

  function renderPlaceEntry(entry: Chapter["entries"][number], level: 3 | 4 = 4) {
    const place = placeById.get(entry.id);
    if (!place) return null;
    const name = cleanName(place.name);
    const hasAddress = Boolean(place.address?.trim());
    const mapsQuery = hasAddress
      ? place.address
      : `${name}${place.locality ? `, ${place.locality}` : ""}`;
    const mapsUrl = mapsHref(mapsQuery);
    return (
      <article key={entry.id} className="print-avoid-break border-t border-neutral-100 pt-4">
        <EntryHeader id={entry.id} name={name} level={level} />
        <EntryTexts entry={entry} />
        <FactBox
          rows={[
            [
              "Adresse",
              hasAddress ? (
                <a href={mapsUrl} target="_blank" rel="noreferrer" className="text-(--color-accent) underline">
                  {place.address}
                </a>
              ) : (
                ""
              ),
            ],
            ["Preisniveau", priceLabel(place.priceLevel)],
            ["Öffnungszeiten", place.openingNotes],
            ["Erreichbarkeit", accessLabel(place.access)],
            [
              "Karte",
              <a key="m" href={mapsUrl} target="_blank" rel="noreferrer" className="text-(--color-accent) underline">
                Auf Google Maps öffnen
              </a>,
            ],
            ["Hinweis", verifiedNote(place.lastVerifiedAt)],
          ]}
        />
        <EntryImage images={place.images} name={name} />
      </article>
    );
  }

  function renderHikeEntry(entry: Chapter["entries"][number], level: 3 | 4 = 4) {
    const hike = hikeById.get(entry.id);
    if (!hike) return null;
    const qr = hikeQr.get(hike.id);
    const startMapsUrl = mapsHref(`${hike.startLat},${hike.startLng}`);
    return (
      <article key={entry.id} className="print-avoid-break border-t border-neutral-200 pt-6">
        <EntryHeader id={entry.id} name={cleanName(hike.name)} level={level} />
        <EntryTexts entry={entry} />
        <FactBox
          rows={[
            ["Distanz", `${hike.distanceKm} km`],
            ["Dauer", `ca. ${Math.round((hike.durationMin / 60) * 10) / 10} Std.`],
            ["Höhenmeter", `${hike.elevationGainM} m`],
            [
              "Schwierigkeit",
              hike.difficulty === "easy" ? "leicht" : hike.difficulty === "medium" ? "mittel" : "anspruchsvoll",
            ],
            ["Startpunkt", hike.startDescription],
            [
              "Karte",
              <a key="m" href={startMapsUrl} target="_blank" rel="noreferrer" className="text-(--color-accent) underline">
                Startpunkt auf Google Maps
              </a>,
            ],
            ["Hinweis", verifiedNote(hike.lastVerifiedAt)],
          ]}
        />
        {hike.externalUrl && (
          <div className="print-avoid-break mt-3 flex items-center gap-4 rounded-xl border border-neutral-200 p-3">
            {qr && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qr} alt="" loading="lazy" className="h-24 w-24 shrink-0" />
            )}
            <div className="text-sm">
              <p className="font-medium">Tour aufrufen</p>
              <p className="mt-1 text-neutral-600">
                QR-Code scannen oder öffnen:
                <br />
                <a href={hike.externalUrl} className="break-all text-(--color-accent) underline">
                  {hike.externalUrl}
                </a>
              </p>
              {hike.gpxFile && (
                <a href={hike.gpxFile} className="mt-1 inline-block text-(--color-accent) underline">
                  GPX-Track herunterladen
                </a>
              )}
            </div>
          </div>
        )}
        {!hike.externalUrl && hike.gpxFile && (
          <p className="no-print mt-2 text-sm">
            <a href={hike.gpxFile} className="text-(--color-accent) underline">
              GPX-Track herunterladen
            </a>
          </p>
        )}
        <EntryImage images={hike.images} name={cleanName(hike.name)} />
      </article>
    );
  }

  function renderTownChapter(chapter: Chapter) {
    // Ort-Schlüssel für das Pro-Ort-Feintuning (muss zur Generierung passen:
    // locality der Einträge, leere locality => "Rund um den See"). Nur bei
    // echten Ort-Kapiteln (kind "town"), nicht bei Anker-Sektionen.
    const townLocality =
      chapter.locality?.trim() ||
      (chapter.kind === "town"
        ? chapter.entries.map((e) => placeById.get(e.id)).find((p) => p)?.locality?.trim() ||
          "Rund um den See"
        : undefined);
    // Einträge nach festen Unterabschnitten gruppieren (immer gleiche Struktur)
    return (
      <section key={chapter.key} id={`kap-${chapter.key}`} className="print-break-before mt-16 scroll-mt-24">
        <div className="flex items-center gap-3">
          <ChapterIcon kind="places" />
          <EditableText
            token={token}
            editable={isOwner}
            target={{ kind: "chapter", chapterKey: chapter.key, field: "title" }}
            value={chapter.title}
            multiline={false}
            as="h2"
            className="font-serif text-3xl"
          />
        </div>
        <EditableText
          token={token}
          editable={isOwner}
          target={{ kind: "chapter", chapterKey: chapter.key, field: "introText" }}
          value={chapter.introText}
          placeholder={regenerating ? TEXT_PLACEHOLDER : "Klicken für ein Kurzporträt des Ortes …"}
          className="measure mt-3 leading-relaxed text-neutral-700"
        />
        {SUBSECTIONS.map((sub) => {
          if (sub.kind === "food") {
            const foodEntries = chapter.entries.filter(
              (e) => placeById.get(e.id)?.type === "restaurant"
            );
            if (foodEntries.length === 0) return null;
            return (
              <div key="food" className="mt-8">
                <h3 className="font-serif text-xl text-(--color-accent)">Essen & Trinken</h3>
                {FOOD_TIERS.map(({ tier, title, area }) => {
                  const tierEntries = foodEntries.filter(
                    (e) => foodTier(placeById.get(e.id)?.priceLevel ?? null) === tier
                  );
                  if (tierEntries.length === 0 && !isOwner) return null;
                  return (
                    // Leere Bänder zeigen wir nur der Besitzerin (zum
                    // Befüllen) – im PDF/Druck bliebe sonst eine Überschrift
                    // ohne Inhalt stehen. Genau das lässt ein bezahltes
                    // Produkt unfertig wirken.
                    <div key={tier} className={tierEntries.length === 0 ? "mt-4 print:hidden" : "mt-4"}>
                      <div className="flex flex-wrap items-baseline">
                        <h4 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
                          {title}
                        </h4>
                        {isOwner && <AreaControl token={token} area={area} locality={townLocality} />}
                      </div>
                      {tierEntries.length > 0 ? (
                        <div className="mt-2 space-y-5">{tierEntries.map((e) => renderPlaceEntry(e, 4))}</div>
                      ) : (
                        <p className="no-print mt-1 text-xs text-neutral-400">
                          Noch keine – mit „+" hinzufügen.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          }
          const entries = chapter.entries.filter((e) => {
            const p = placeById.get(e.id);
            return p && sub.types.includes(p.type);
          });
          // Bereiche mit Regler auch bei 0 zeigen (zum Hinzufügen), sonst nur wenn befüllt
          if (entries.length === 0 && !(isOwner && sub.area)) return null;
          return (
            <div key={sub.title} className={entries.length === 0 ? "mt-8 print:hidden" : "mt-8"}>
              <div className="flex flex-wrap items-baseline">
                <h3 className="font-serif text-xl text-(--color-accent)">{sub.title}</h3>
                {isOwner && sub.area && (
                  <AreaControl token={token} area={sub.area} locality={townLocality} />
                )}
              </div>
              {entries.length > 0 ? (
                <div className="mt-3 space-y-5">{entries.map((e) => renderPlaceEntry(e, 4))}</div>
              ) : (
                <p className="no-print mt-1 text-xs text-neutral-400">
                  Noch keine – mit „+" hinzufügen.
                </p>
              )}
            </div>
          );
        })}
      </section>
    );
  }

  function renderListChapter(chapter: Chapter, icon: "hikes" | "practical") {
    const isHikes = chapter.kind === "hikes";
    return (
      <section key={chapter.key} id={`kap-${chapter.key}`} className="print-break-before mt-16 scroll-mt-24">
        <div className="flex items-center gap-3">
          <ChapterIcon kind={icon} />
          <EditableText
            token={token}
            editable={isOwner}
            target={{ kind: "chapter", chapterKey: chapter.key, field: "title" }}
            value={chapter.title}
            multiline={false}
            as="h2"
            className="font-serif text-3xl"
          />
          {isOwner && isHikes && <AreaControl token={token} area="hikes" />}
        </div>
        <EditableText
          token={token}
          editable={isOwner}
          target={{ kind: "chapter", chapterKey: chapter.key, field: "introText" }}
          value={chapter.introText}
          placeholder={regenerating ? TEXT_PLACEHOLDER : "Klicken für eine Kapitel-Einleitung …"}
          className="measure mt-3 leading-relaxed text-neutral-700"
        />
        <div className="mt-6 space-y-8">
          {chapter.entries.map((e) => (isHikes ? renderHikeEntry(e, 3) : renderPlaceEntry(e, 3)))}
        </div>
      </section>
    );
  }

  const townChapters = content.chapters.filter((c) => c.kind === "town" || c.kind === "places");
  const hikeChapter = content.chapters.find((c) => c.kind === "hikes");
  const practicalChapter = content.chapters.find(
    (c) => c.kind === "practical" || c.kind === "restaurants"
  );

  // Register: alle Einträge alphabetisch
  const registerItems = content.chapters
    .flatMap((chapter, i) =>
      chapter.entries.map((entry) => ({
        name: cleanName(placeById.get(entry.id)?.name ?? hikeById.get(entry.id)?.name ?? ""),
        chapter: i + 1,
      }))
    )
    .filter((e) => e.name)
    .sort((a, b) => a.name.localeCompare(b.name, "de"));

  return (
    <main id="inhalt" className="mx-auto max-w-3xl px-6 py-6">
      <GuideProgress token={token} active={regenerating} />
      <BackToTop />

      {/* Cover */}
      <header className="py-12 text-center">
        <p className="text-sm uppercase tracking-widest text-(--color-accent)">
          {region?.name ?? "Comer See"} · {new Date(q.dateFrom).toLocaleDateString("de-DE")} –{" "}
          {new Date(q.dateTo).toLocaleDateString("de-DE")}
        </p>
        <EditableText
          token={token}
          editable={isOwner}
          target={{ kind: "intro", field: "title" }}
          value={content.intro.title}
          multiline={false}
          as="h1"
          className="mt-4 font-serif text-5xl leading-tight"
        />
        <p className="mt-4 text-xl text-neutral-600">für {q.firstNames}</p>

        {/* Titelbild: Die Startseite hatte eine Illustration, das bezahlte
            Artefakt selbst nicht – das Cover wirkte wie ein Rohentwurf.
            Druckt mit, ohne eine eigene Seite zu belegen. */}
        <div className="mx-auto mt-10 max-w-xl overflow-hidden rounded-2xl border border-(--color-accent-soft)">
          <LakeHero className="block w-full" />
        </div>

        {/* PDF ist die Hauptaktion. Markdown ist ein Prüf-/Debug-Export und
            stand vorher als gleichwertiger Knopf daneben. */}
        <div className="no-print mt-8 flex flex-col items-center gap-3">
          <a
            href={`/guide/${token}/pdf`}
            className="inline-block rounded-full bg-(--color-ink) px-7 py-3 text-sm text-white shadow-sm transition hover:bg-(--color-accent) focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent) active:translate-y-px"
          >
            Als PDF herunterladen (A5)
          </a>
          <a
            href={`/guide/${token}/md`}
            className="rounded text-xs text-neutral-500 underline underline-offset-2 transition hover:text-neutral-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent)"
            title="Reine Textfassung zum Prüfen"
          >
            oder als Textfassung (.md)
          </a>
        </div>
      </header>

      {/* Besitzer-Funktionen. Die E-Mail-Erfassung bleibt sichtbar, solange
          keine hinterlegt ist – wer den Link verliert, verliert den Guide.
          Alles Übrige liegt in einer Leiste, damit der Reiseführer selbst
          den ersten Bildschirm bekommt. */}
      {isOwner && (
        <div className="no-print mb-10 space-y-3">
          {!guide.guideRequest.email && (
            <EmailCapture token={token} alreadySet={false} regenerating={regenerating} />
          )}
          <OwnerToolbar>
            {guide.guideRequest.email && (
              <EmailCapture token={token} alreadySet regenerating={regenerating} />
            )}
            <FineTunePanel
              token={token}
              areaCounts={parseAreaCounts(guide.guideRequest.areaCounts)}
              regenerating={regenerating}
            />
            <AdjustPanel token={token} regenerating={regenerating} />
            <ShareBox
              shareUrl={`${process.env.APP_URL ?? "http://localhost:3000"}/guide/${guide.shareToken}`}
            />
            <p className="rounded-xl bg-(--color-accent-soft)/30 px-4 py-2 text-xs text-neutral-600">
              Tipp: Klickt auf einen beliebigen Text, um ihn direkt zu bearbeiten.
              Einträge lassen sich über „Entfernen" aussortieren – beides bleibt
              auch bei einer Neu-Generierung erhalten.
            </p>
          </OwnerToolbar>
        </div>
      )}

      {/* Einleitung */}
      <section className="mx-auto max-w-2xl">
        <EditableText
          token={token}
          editable={isOwner}
          target={{ kind: "intro", field: "text" }}
          value={content.intro.text}
          placeholder={regenerating ? TEXT_PLACEHOLDER : "Klicken, um eure Einleitung zu schreiben …"}
          className="measure text-lg leading-relaxed"
        />
      </section>

      {/* Inhaltsverzeichnis (klickbar – im Browser und beim Druck/PDF) */}
      <nav aria-label="Inhaltsverzeichnis" className="print-break-before mt-12 rounded-2xl border border-neutral-200 bg-white p-6">
        <h2 className="font-serif text-2xl">Inhalt</h2>
        <ol className="mt-4 space-y-1 text-neutral-700">
          {regionInfos.length > 0 && (
            <li>
              <a href="#region-info" className="hover:text-(--color-accent) hover:underline">
                Die Region verstehen
              </a>
            </li>
          )}
          {townChapters.map((c) => (
            <li key={c.key}>
              <a href={`#kap-${c.key}`} className="hover:text-(--color-accent) hover:underline">
                {c.title}
              </a>
            </li>
          ))}
          {hikeChapter && (
            <li>
              <a href={`#kap-${hikeChapter.key}`} className="hover:text-(--color-accent) hover:underline">
                {hikeChapter.title}
              </a>
            </li>
          )}
          {practicalChapter && (
            <li>
              <a href={`#kap-${practicalChapter.key}`} className="hover:text-(--color-accent) hover:underline">
                {practicalChapter.title}
              </a>
            </li>
          )}
          {mapSpots.length > 0 && (
            <li>
              <a href="#fotospots" className="hover:text-(--color-accent) hover:underline">
                Foto-Spots & Fundorte
              </a>
            </li>
          )}
          {content.daySuggestions.length > 0 && (
            <li>
              <a href="#tage" className="hover:text-(--color-accent) hover:underline">
                Eure Tage am See
              </a>
            </li>
          )}
          <li>
            <a href="#register" className="hover:text-(--color-accent) hover:underline">
              Register
            </a>
          </li>
        </ol>
      </nav>

      {/* Front-Matter: Die Region verstehen (Geschichte, Sprachführer, ...) */}
      {regionInfos.length > 0 && (
        <section id="region-info" className="print-break-before mt-16 scroll-mt-24">
          <div className="flex items-center gap-3">
            <ChapterIcon kind="info" />
            <h2 className="font-serif text-3xl">Die Region verstehen</h2>
          </div>
          <div className="mt-6 space-y-8">
            {regionInfos.map((info) => (
              <RegionInfoBlock key={info.id} info={info} />
            ))}
          </div>
        </section>
      )}

      {/* Übersichtskarte */}
      <section className="no-print mt-12">
        <div className="mb-4 flex items-center gap-3">
          <ChapterIcon kind="map" />
          <h2 className="font-serif text-2xl">Eure Orte auf der Karte</h2>
        </div>
        <GuideMap
          center={{ lat: region?.centerLat ?? 46.0, lng: region?.centerLng ?? 9.26 }}
          markers={markers}
        />
        <p className="mt-2 text-xs text-neutral-500">
          Orange: Orte & Sehenswertes · Blau: Essen, Trinken & Ausgehen · Grün:
          Wanderungen{mapSpots.length > 0 ? " · Violett: Foto-Spots & Fundorte" : ""}
        </p>
      </section>

      {/* Ort-Kapitel */}
      {townChapters.map(renderTownChapter)}

      {/* Wanderungen (mit Link + QR) */}
      {hikeChapter && renderListChapter(hikeChapter, "hikes")}

      {/* Praktisches rund um den See */}
      {practicalChapter && renderListChapter(practicalChapter, "practical")}

      {/* Foto-Spots & Instagram-Fundorte (zusätzliche Karten-Pins) */}
      {mapSpots.length > 0 && (
        <section id="fotospots" className="print-break-before mt-16 scroll-mt-24">
          <div className="flex items-center gap-3">
            <ChapterIcon kind="map" />
            <h2 className="font-serif text-3xl">Foto-Spots & Fundorte</h2>
          </div>
          <p className="mt-3 leading-relaxed text-neutral-700">
            Handverlesene Orte für schöne Fotos und Geheimtipps – auf der Karte
            violett markiert.
          </p>
          <ul className="mt-6 space-y-4">
            {mapSpots.map((s) => (
              <li key={s.id} className="print-avoid-break border-t border-neutral-100 pt-4">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-serif text-lg">{s.name}</h3>
                  {s.locality && <span className="text-sm text-neutral-500">{s.locality}</span>}
                </div>
                {s.note && <p className="mt-1 leading-relaxed">{s.note}</p>}
                {s.sourceUrl && (
                  <p className="mt-1 text-sm text-neutral-500">
                    Entdeckt via{" "}
                    <a href={s.sourceUrl} className="text-(--color-accent) underline">
                      {s.sourceLabel || "Quelle"}
                    </a>
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Tagesvorschläge */}
      {(content.daySuggestions.length > 0 || regenerating) && (
        <section id="tage" className="print-break-before mt-16 scroll-mt-24">
          <div className="flex items-center gap-3">
            <ChapterIcon kind="days" />
            <h2 className="font-serif text-3xl">Eure Tage am See</h2>
          </div>
          {content.daySuggestions.length === 0 && regenerating && (
            <p className="mt-4 animate-pulse text-neutral-400">{TEXT_PLACEHOLDER}</p>
          )}
          <div className="mt-6 space-y-6">
            {content.daySuggestions.map((d) => (
              <article key={d.day} className="print-avoid-break border-t border-neutral-200 pt-4">
                <div className="flex items-baseline gap-2">
                  <h3 className="shrink-0 font-serif text-xl">Tag {d.day}:</h3>
                  <EditableText
                    token={token}
                    editable={isOwner}
                    target={{ kind: "day", day: d.day, field: "title" }}
                    value={d.title}
                    multiline={false}
                    as="span"
                    className="font-serif text-xl"
                  />
                </div>
                <EditableText
                  token={token}
                  editable={isOwner}
                  target={{ kind: "day", day: d.day, field: "text" }}
                  value={d.text}
                  className="measure mt-2 leading-relaxed"
                />
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Register */}
      <section id="register" className="print-break-before mt-16 scroll-mt-24">
        <div className="flex items-center gap-3">
          <ChapterIcon kind="register" />
          <h2 className="font-serif text-3xl">Register</h2>
        </div>
        <ul className="mt-6 columns-2 gap-8 text-sm leading-7">
          {registerItems.map((e, i) => (
            // Index im Schlüssel: Gleichnamige Einträge im selben Kapitel
            // (z. B. zwei „Lido") kollidieren sonst.
            <li key={`${e.name}-${e.chapter}-${i}`} className="flex justify-between gap-2">
              <span>{e.name}</span>
              <span className="text-neutral-400">Kap. {e.chapter}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-16 border-t border-neutral-200 pt-6 text-xs text-neutral-500">
        Alle Angaben wurden redaktionell geprüft, können sich aber ändern – bitte
        Öffnungszeiten und Fahrpläne vor Ort kurz verifizieren. Karte:
        OpenStreetMap-Mitwirkende.
      </p>
    </main>
  );
}
