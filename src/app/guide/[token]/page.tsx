import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { guideContentSchema, type Chapter } from "@/lib/guide-content";
import { questionnaireSchema } from "@/lib/questionnaire";
import type { Selection } from "@/lib/selection";
import GuideMap, { type MapMarker } from "@/components/GuideMap";
import AdjustPanel from "@/components/AdjustPanel";
import ShareBox from "@/components/ShareBox";
import { ChapterIcon } from "@/components/illustrations";
import type { Place, Hike, Image as DbImage } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * Web-Ansicht des digitalen Reiseführers (Anforderung 4.4).
 * Zugriff nur über den nicht erratbaren Link, kein Login.
 * Fakten-Boxen werden direkt aus der DB gerendert (Faktentreue).
 */

type PlaceWithImages = Place & { images: DbImage[] };
type HikeWithImages = Hike & { images: DbImage[] };

function FactBox({ rows }: { rows: [string, string][] }) {
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

function EntryImage({ images }: { images: DbImage[] }) {
  const img = images[0];
  if (!img) return null;
  return (
    <figure className="print-avoid-break mt-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={img.fileUrl} alt="" className="max-h-72 w-full rounded-xl object-cover" />
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
  return access === "car" ? "Am besten mit dem Auto" : access === "public" ? "Mit ÖPNV/Fähre erreichbar" : "Zu Fuß/Rad erreichbar";
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

  // Zugriff über Besitzer-Link (publicToken, mit Anpassungs-Rechten) oder
  // geteilten Lese-Link (shareToken, read-only)
  const guide = await prisma.guide.findFirst({
    where: { OR: [{ publicToken: token }, { shareToken: token }] },
    include: { guideRequest: true },
  });
  if (!guide) notFound();
  const isOwner = guide.publicToken === token;
  const regenerating =
    guide.guideRequest.status === "pending" || guide.guideRequest.status === "generating";

  const content = guideContentSchema.parse(guide.content);
  const selection = guide.selection as unknown as Selection;
  const q = questionnaireSchema.parse(guide.guideRequest.questionnaire);
  const region = await prisma.region.findUnique({
    where: { slug: q.regionSlug },
    include: { infos: { orderBy: { sortOrder: "asc" } } },
  });
  const regionInfos = region?.infos ?? [];

  const allPlaceIds = [...selection.placeIds, ...selection.restaurantIds, ...selection.practicalIds];
  const places = await prisma.place.findMany({
    where: { id: { in: allPlaceIds } },
    include: { images: true },
  });
  const hikes = await prisma.hike.findMany({
    where: { id: { in: selection.hikeIds } },
    include: { images: true },
  });
  const placeById = new Map<string, PlaceWithImages>(places.map((p) => [p.id, p]));
  const hikeById = new Map<string, HikeWithImages>(hikes.map((h) => [h.id, h]));

  const markers: MapMarker[] = [
    ...selection.placeIds
      .map((id) => placeById.get(id))
      .filter((p): p is PlaceWithImages => Boolean(p))
      .map((p) => ({ lat: p.lat, lng: p.lng, label: p.name, kind: "place" as const })),
    ...selection.restaurantIds
      .map((id) => placeById.get(id))
      .filter((p): p is PlaceWithImages => Boolean(p))
      .map((p) => ({ lat: p.lat, lng: p.lng, label: p.name, kind: "restaurant" as const })),
    ...selection.hikeIds
      .map((id) => hikeById.get(id))
      .filter((h): h is HikeWithImages => Boolean(h))
      .map((h) => ({ lat: h.startLat, lng: h.startLng, label: h.name, kind: "hike" as const })),
  ];

  function renderChapterEntry(chapter: Chapter, entry: Chapter["entries"][number]) {
    if (chapter.kind === "hikes") {
      const hike = hikeById.get(entry.id);
      if (!hike) return null;
      return (
        <article key={entry.id} className="print-avoid-break border-t border-neutral-200 pt-6">
          <h3 className="font-serif text-xl">{hike.name}</h3>
          <p className="mt-2 leading-relaxed">{entry.personalText}</p>
          <p className="mt-2 text-sm italic text-(--color-accent)">{entry.reason}</p>
          <FactBox
            rows={[
              ["Distanz", `${hike.distanceKm} km`],
              ["Dauer", `ca. ${Math.round(hike.durationMin / 60 * 10) / 10} Std.`],
              ["Höhenmeter", `${hike.elevationGainM} m`],
              ["Schwierigkeit", hike.difficulty === "easy" ? "leicht" : hike.difficulty === "medium" ? "mittel" : "anspruchsvoll"],
              ["Startpunkt", hike.startDescription],
              ["Hinweis", verifiedNote(hike.lastVerifiedAt)],
            ]}
          />
          {hike.gpxFile && (
            <p className="no-print mt-2 text-sm">
              <a href={hike.gpxFile} className="text-(--color-accent) underline">
                GPX-Track herunterladen
              </a>
            </p>
          )}
          <EntryImage images={hike.images} />
        </article>
      );
    }

    const place = placeById.get(entry.id);
    if (!place) return null;
    return (
      <article key={entry.id} className="print-avoid-break border-t border-neutral-200 pt-6">
        <h3 className="font-serif text-xl">{place.name}</h3>
        <p className="mt-2 leading-relaxed">{entry.personalText}</p>
        <p className="mt-2 text-sm italic text-(--color-accent)">{entry.reason}</p>
        <FactBox
          rows={[
            ["Adresse", place.address],
            ["Preisniveau", place.priceLevel ? "€".repeat(place.priceLevel) : ""],
            ["Öffnungszeiten", place.openingNotes],
            ["Erreichbarkeit", accessLabel(place.access)],
            ["Hinweis", verifiedNote(place.lastVerifiedAt)],
          ]}
        />
        <EntryImage images={place.images} />
      </article>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      {/* Cover */}
      <header className="py-16 text-center">
        <p className="text-sm uppercase tracking-widest text-(--color-accent)">
          {region?.name ?? "Comer See"} · {new Date(q.dateFrom).toLocaleDateString("de-DE")} –{" "}
          {new Date(q.dateTo).toLocaleDateString("de-DE")}
        </p>
        <h1 className="mt-4 font-serif text-5xl leading-tight">{content.intro.title}</h1>
        <p className="mt-4 text-xl text-neutral-600">für {q.firstNames}</p>
        <div className="no-print mt-8">
          <a
            href={`/guide/${token}/pdf`}
            className="inline-block rounded-full border border-(--color-ink) px-6 py-3 text-sm transition hover:bg-(--color-ink) hover:text-white"
          >
            Als PDF herunterladen (A5)
          </a>
        </div>
      </header>

      {/* Besitzer-Funktionen: Anpassen & Teilen */}
      {isOwner && (
        <div className="no-print mb-10 space-y-4">
          <AdjustPanel token={token} regenerating={regenerating} />
          <ShareBox
            shareUrl={`${process.env.APP_URL ?? "http://localhost:3000"}/guide/${guide.shareToken}`}
          />
        </div>
      )}

      {/* Persönliche Einleitung */}
      <section className="mx-auto max-w-2xl">
        <p className="text-lg leading-relaxed whitespace-pre-line">{content.intro.text}</p>
      </section>

      {/* Inhaltsverzeichnis (v. a. für das PDF) */}
      <nav className="print-break-before mt-12 rounded-2xl border border-neutral-200 bg-white p-6">
        <h2 className="font-serif text-2xl">Inhalt</h2>
        <ol className="mt-4 space-y-1 text-neutral-700">
          {content.chapters.map((c, i) => (
            <li key={c.key}>
              {i + 1}. {c.title}
            </li>
          ))}
          {content.daySuggestions.length > 0 && (
            <li>{content.chapters.length + 1}. Eure Tage am See</li>
          )}
          {regionInfos.length > 0 && <li>Gut zu wissen</li>}
          <li>Register</li>
        </ol>
      </nav>

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
          Orange: Orte & Sehenswertes · Blau: Essen & Trinken · Grün: Wanderungen
        </p>
      </section>

      {/* Kapitel */}
      {content.chapters.map((chapter) => (
        <section key={chapter.key} className="print-break-before mt-16">
          <div className="flex items-center gap-3">
            <ChapterIcon kind={chapter.kind === "practical" ? "practical" : chapter.kind} />
            <h2 className="font-serif text-3xl">{chapter.title}</h2>
          </div>
          <p className="mt-3 leading-relaxed text-neutral-700">{chapter.introText}</p>
          <div className="mt-6 space-y-8">
            {chapter.entries.map((entry) => renderChapterEntry(chapter, entry))}
          </div>
        </section>
      ))}

      {/* Tagesvorschläge */}
      {content.daySuggestions.length > 0 && (
        <section className="print-break-before mt-16">
          <div className="flex items-center gap-3">
            <ChapterIcon kind="days" />
            <h2 className="font-serif text-3xl">Eure Tage am See</h2>
          </div>
          <div className="mt-6 space-y-6">
            {content.daySuggestions.map((d) => (
              <article key={d.day} className="print-avoid-break border-t border-neutral-200 pt-4">
                <h3 className="font-serif text-xl">
                  Tag {d.day}: {d.title}
                </h3>
                <p className="mt-2 leading-relaxed">{d.text}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Gut zu wissen: Standard-Infos zur Region (Währung, Geschichte,
          Sprachführer, Trinkwasser ...), redaktionell gepflegt */}
      {regionInfos.length > 0 && (
        <section className="print-break-before mt-16">
          <div className="flex items-center gap-3">
            <ChapterIcon kind="info" />
            <h2 className="font-serif text-3xl">Gut zu wissen</h2>
          </div>
          <div className="mt-6 space-y-6">
            {regionInfos.map((info) => (
              <article key={info.id} className="print-avoid-break border-t border-neutral-200 pt-4">
                <h3 className="font-serif text-xl">{info.title}</h3>
                <p className="mt-2 leading-relaxed whitespace-pre-line">{info.content}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* Register: alphabetisches Verzeichnis aller Orte wie im Buch */}
      <section className="print-break-before mt-16">
        <div className="flex items-center gap-3">
          <ChapterIcon kind="register" />
          <h2 className="font-serif text-3xl">Register</h2>
        </div>
        <ul className="mt-6 columns-2 gap-8 text-sm leading-7">
          {content.chapters
            .flatMap((chapter, i) =>
              chapter.entries.map((entry) => ({
                name:
                  placeById.get(entry.id)?.name ?? hikeById.get(entry.id)?.name ?? "",
                chapter: i + 1,
              }))
            )
            .filter((e) => e.name)
            .sort((a, b) => a.name.localeCompare(b.name, "de"))
            .map((e) => (
              <li key={`${e.name}-${e.chapter}`} className="flex justify-between gap-2">
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
