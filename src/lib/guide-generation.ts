import { prisma } from "./db";
import { questionnaireSchema, type Questionnaire } from "./questionnaire";
import {
  selectContent,
  haversineKm,
  placePassesHardFilters,
  restaurantPassesHardFilters,
  scorePlace,
  type SelectablePlace,
  type SelectableHike,
} from "./selection";
import {
  parseAreaCounts,
  parseLocalityCounts,
  placeMatchesArea,
  REGION_WIDE_KEY,
  AREA_KEYS,
  localityMatchesLabel,
} from "./areas";
import {
  generateChapter,
  generateIntro,
  modelUsed,
  type ChapterJob,
  type EntryContext,
  type TokenUsage,
} from "./ai/generate";
import {
  validateContentAgainstSelection,
  guideContentSchema,
  type GuideContent,
} from "./guide-content";
import { cleanName } from "./names";
import { generatePublicToken } from "./token";
import { sendGuideReadyEmail } from "./email";
import {
  adjustmentsSchema,
  modifiersFromAdjustments,
  describeAdjustments,
} from "./adjustments";
import {
  matchChunksToQuestionnaire,
  chunksForPlaceName,
  formatChunkForPrompt,
  type ChunkWithSource,
} from "./knowledge";
import type { Place, Hike, Source, GuideRequest, Guide } from "@prisma/client";

/**
 * Guide-Erzeugung in zwei Stufen:
 *
 * 1. `createGuideSkeleton` (synchron im Request): Auswahl-Engine läuft sofort,
 *    der Nutzer landet direkt im Browser-Guide mit allen Orten, Fakten,
 *    Bildern und Karte – die Textfelder sind noch leer.
 * 2. `generateGuideForRequest` (Worker): füllt die KI-Texte kapitelweise nach
 *    und schreibt nach jedem Kapitel in die DB, sodass der Guide sich live
 *    füllt. Manuelle Nutzer-Änderungen (edited/removedIds) werden bewahrt.
 */

function placeFacts(p: Place): string {
  const parts = [
    `Typ: ${p.type}`,
    p.address ? `Adresse: ${p.address}` : "",
    p.priceLevel ? `Preisniveau: ${"€".repeat(p.priceLevel)}` : "",
    p.openingNotes ? `Hinweise zu Öffnungszeiten: ${p.openingNotes}` : "",
    `Erreichbarkeit: ${p.access}`,
    p.childFriendly ? "kindertauglich" : "",
    p.dietaryOptions.length ? `Ernährung: ${p.dietaryOptions.join(", ")}` : "",
    p.tags.length ? `Merkmale: ${p.tags.join(", ")}` : "",
    p.editorNotes ? `Redaktionsnotiz: ${p.editorNotes}` : "",
    p.lastVerifiedAt ? `Stand: ${p.lastVerifiedAt.toISOString().slice(0, 7)}` : "",
  ];
  return parts.filter(Boolean).join("; ");
}

function hikeFacts(h: Hike): string {
  const parts = [
    `Distanz: ${h.distanceKm} km`,
    `Dauer: ca. ${h.durationMin} min`,
    `Höhenmeter: ${h.elevationGainM} m`,
    `Schwierigkeit: ${h.difficulty}`,
    h.startDescription ? `Startpunkt: ${h.startDescription}` : "",
    h.childFriendly ? "kindertauglich" : "",
    h.descriptionNotes ? `Redaktionsnotiz: ${h.descriptionNotes}` : "",
  ];
  return parts.filter(Boolean).join("; ");
}

function sourceExcerpts(sources: Source[], libraryChunks: ChunkWithSource[], name: string): string[] {
  const own = sources.filter((s) => s.excerpt).map((s) => s.excerpt);
  const library = chunksForPlaceName(libraryChunks, name).map(formatChunkForPrompt);
  return [...own, ...library];
}

function toEntryContext(p: Place & { sources: Source[] }, chunks: ChunkWithSource[]): EntryContext {
  return {
    id: p.id,
    name: cleanName(p.name),
    facts: placeFacts(p),
    sourceExcerpts: sourceExcerpts(p.sources, chunks, p.name),
  };
}

interface PreparedGuideData {
  q: Questionnaire;
  regionName: string;
  jobs: ChapterJob[];
  selection: ReturnType<typeof selectContent>;
  extraContext: string;
  entryNameById: Map<string, string>;
}

/** Auswahl-Engine + Kapitel-Jobs aufbauen (gemeinsam für Skeleton und Worker). */
async function prepareGuideData(
  request: GuideRequest,
  removedIds: Set<string>
): Promise<PreparedGuideData> {
  const q: Questionnaire = questionnaireSchema.parse(request.questionnaire);
  const adjustments = adjustmentsSchema.parse(request.adjustments ?? []);
  const mods = modifiersFromAdjustments(adjustments);
  const areaCounts = parseAreaCounts(request.areaCounts);

  const region = await prisma.region.findUniqueOrThrow({ where: { slug: q.regionSlug } });

  const allChunks: ChunkWithSource[] = await prisma.knowledgeChunk.findMany({
    where: { document: { regionId: region.id, status: "analyzed" } },
    include: { document: { select: { title: true, kind: true, url: true } } },
  });
  const matchedChunks = matchChunksToQuestionnaire(allChunks, q);

  // Nur verifizierte Einträge gelangen in Guides (Anforderung 4.5);
  // vom Nutzer entfernte Einträge werden nicht wieder aufgenommen
  const places = (
    await prisma.place.findMany({
      where: { regionId: region.id, status: "verified" },
      include: { sources: true },
    })
  ).filter((p) => !removedIds.has(p.id));
  const hikes = (
    await prisma.hike.findMany({
      where: { regionId: region.id, status: "verified" },
      include: { sources: true },
    })
  ).filter((h) => !removedIds.has(h.id));

  const selectablePlaces: SelectablePlace[] = places.map((p) => ({
    id: p.id,
    type: p.type,
    name: p.name,
    lat: p.lat,
    lng: p.lng,
    tags: p.tags,
    priceLevel: p.priceLevel,
    childFriendly: p.childFriendly,
    access: p.access,
    dietaryOptions: p.dietaryOptions,
    qualityScore: p.qualityScore,
    mustSee: p.mustSee,
  }));
  const selectableHikes: SelectableHike[] = hikes.map((h) => ({
    id: h.id,
    name: h.name,
    startLat: h.startLat,
    startLng: h.startLng,
    distanceKm: h.distanceKm,
    durationMin: h.durationMin,
    elevationGainM: h.elevationGainM,
    difficulty: h.difficulty,
    childFriendly: h.childFriendly,
    tags: h.tags,
  }));

  const selection = selectContent(selectablePlaces, selectableHikes, q, mods, areaCounts);

  const placeById = new Map(places.map((p) => [p.id, p]));
  const hikeById = new Map(hikes.map((h) => [h.id, h]));
  const entryNameById = new Map<string, string>([
    ...places.map((p) => [p.id, cleanName(p.name)] as const),
    ...hikes.map((h) => [h.id, cleanName(h.name)] as const),
  ]);

  const jobs: ChapterJob[] = [];

  // Reihenfolge der Ort-Unterabschnitte (auch für die Reihenfolge der
  // Einträge, die die KI sieht). Muss zur Anzeige-Reihenfolge passen.
  const subsectionRank: Record<string, number> = {
    village: 0,
    sight: 1,
    viewpoint: 2,
    beach: 3,
    restaurant: 4,
    bar: 5,
    hotel: 6,
    event: 7,
    practical: 8,
  };

  type PlaceWithSources = Place & { sources: Source[] };
  const localityOf = (p: PlaceWithSources) => (p.locality?.trim() ? p.locality.trim() : "");

  // Alle ausgewählten ortsgebundenen Einträge (Orte + Restaurants/Bars)
  const selectedTownPlaceIds = new Set([...selection.placeIds, ...selection.restaurantIds]);
  const townScopedAll = places.filter(
    (p) => selectedTownPlaceIds.has(p.id) && p.type !== "practical"
  );

  // Orte, die ein eigenes Kapitel bekommen (Einträge mit gesetzter Stadt).
  const chapterLocalities = new Set(
    townScopedAll.map(localityOf).filter(Boolean).map((l) => l.toLowerCase())
  );
  // Überblicks-Einträge (ohne Stadt, z. B. ein "Dorf"-Eintrag "Varenna") weglassen,
  // wenn ihr Name einem Ort mit eigenem Kapitel entspricht – sonst würde derselbe
  // Ort doppelt beschrieben (einmal als Kapitel, einmal als Kurzporträt in
  // "Rund um den See").
  const townScopedPlaces = townScopedAll.filter(
    (p) => localityOf(p) || !chapterLocalities.has(p.name.trim().toLowerCase())
  );

  // Praktisches nach ortsgebunden vs. regionsweit trennen
  const practicalPlaces = selection.practicalIds
    .map((id) => placeById.get(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  // Ort-Kapitel gruppieren
  const townGroups = new Map<string, PlaceWithSources[]>();
  for (const p of townScopedPlaces) {
    const loc = localityOf(p) || "Rund um den See";
    (townGroups.get(loc) ?? townGroups.set(loc, []).get(loc)!).push(p);
  }
  // Ortsgebundenes Praktisches in das jeweilige Ort-Kapitel einsortieren
  const regionPractical: PlaceWithSources[] = [];
  for (const p of practicalPlaces) {
    const loc = localityOf(p);
    if (loc && townGroups.has(loc)) townGroups.get(loc)!.push(p);
    else if (loc && townScopedPlaces.some((tp) => localityOf(tp) === loc)) {
      townGroups.set(loc, [...(townGroups.get(loc) ?? []), p]);
    } else regionPractical.push(p);
  }

  // Pro-Ort-Feintuning anwenden: je Ort und Bereich zusätzliche geprüfte
  // Einträge aufnehmen (mehr) bzw. die schwächsten entfernen (weniger).
  const localityCounts = parseLocalityCounts(request.localityCounts);
  const selectableById = new Map(selectablePlaces.map((sp) => [sp.id, sp]));
  const localityKeyOf = (p: PlaceWithSources) => localityOf(p) || REGION_WIDE_KEY;
  for (const [town, origGroup] of [...townGroups.entries()]) {
    const counts = localityCounts[town];
    if (!counts) continue;
    let group = [...origGroup];
    const present = new Set(group.map((p) => p.id));
    for (const area of AREA_KEYS) {
      const delta = counts[area] ?? 0;
      if (delta > 0) {
        const candidates = places
          .filter((p) => {
            if (present.has(p.id)) return false;
            if (localityKeyOf(p) !== town) return false;
            if (!placeMatchesArea(p.type, p.priceLevel, area)) return false;
            const sp = selectableById.get(p.id);
            if (!sp) return false;
            return p.type === "restaurant" || p.type === "bar"
              ? restaurantPassesHardFilters(sp, q)
              : placePassesHardFilters(sp, q);
          })
          .map((p) => ({ p, score: scorePlace(selectableById.get(p.id)!, q, mods) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, delta)
          .map((x) => x.p);
        for (const p of candidates) {
          group.push(p);
          present.add(p.id);
          if (p.type === "restaurant" || p.type === "bar") selection.restaurantIds.push(p.id);
          else selection.placeIds.push(p.id);
        }
      } else if (delta < 0) {
        const removable = group
          .filter(
            (p) =>
              placeMatchesArea(p.type, p.priceLevel, area) &&
              !p.mustSee &&
              selectableById.has(p.id)
          )
          .map((p) => ({ p, score: scorePlace(selectableById.get(p.id)!, q, mods) }))
          .sort((a, b) => a.score - b.score)
          .slice(0, -delta)
          .map((x) => x.p.id);
        const removeSet = new Set(removable);
        group = group.filter((p) => !removeSet.has(p.id));
      }
    }
    townGroups.set(town, group);
  }

  // Unterkunfts-Ort aus den normalen Ort-Kapiteln herauslösen: Er wird unten
  // GARANTIERT als erstes Kapitel gebaut (mit Ortsporträt + Umgebung) – hier
  // entfernen, damit er nicht zusätzlich als gewöhnliches Kapitel erscheint.
  const accLabel = (q.accommodation.label ?? "").trim();
  if (accLabel) {
    for (const [town] of [...townGroups.entries()]) {
      if (localityMatchesLabel(town, accLabel)) townGroups.delete(town);
    }
  }

  const slug = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "ort";

  // Ort-Kapitel nach Lage (Nord → Süd) sortieren für einen natürlichen Fluss
  const orderedTowns = [...townGroups.entries()].sort((a, b) => {
    const latA = a[1].reduce((s, p) => s + p.lat, 0) / a[1].length;
    const latB = b[1].reduce((s, p) => s + p.lat, 0) / b[1].length;
    return latB - latA;
  });

  for (const [town, townPlaces] of orderedTowns) {
    const sorted = [...townPlaces].sort(
      (a, b) => (subsectionRank[a.type] ?? 9) - (subsectionRank[b.type] ?? 9)
    );
    jobs.push({
      key: `town-${slug(town)}`,
      kind: "town",
      workingTitle: town,
      instruction: `Dies ist das Ort-Kapitel für ${town}. Schreibe als Kapitel-Einleitung ("introText") ein lebendiges Kurzporträt des Ortes (4-6 Sätze): Charakter, Lage am See, Atmosphäre, wofür der Ort bekannt ist. Für jeden Eintrag einen einladenden, konkreten Empfehlungstext (3-5 Sätze), sodass man den Ort wirklich kennenlernt. Die Einträge umfassen Sehenswürdigkeiten, Essen & Trinken, Ausgehen, Unterkunft, Veranstaltungen und Praktisches – gehe auf die jeweilige Art passend ein (bei Hotels z. B. Lage/Charakter, bei Restaurants Küche/Ambiente).`,
      entries: sorted.map((p) => toEntryContext(p, allChunks)),
    });
  }

  const selectedHikes = selection.hikeIds
    .map((id) => hikeById.get(id))
    .filter((h): h is NonNullable<typeof h> => Boolean(h));
  if (selectedHikes.length > 0) {
    jobs.push({
      key: "hikes",
      kind: "hikes",
      workingTitle: "Wanderungen",
      instruction:
        "Beschreibe die Wanderungen mit Charakter und Landschaftseindruck (3-5 Sätze je Tour). Eckdaten (Distanz, Dauer, Höhenmeter) stehen in der Fakten-Box – nicht im Fließtext wiederholen. Erwähne, was den Weg besonders macht und für wen er sich eignet.",
      entries: selectedHikes.map((h) => ({
        id: h.id,
        name: cleanName(h.name),
        facts: hikeFacts(h),
        sourceExcerpts: sourceExcerpts(h.sources, allChunks, h.name),
      })),
    });
  }

  if (regionPractical.length > 0) {
    jobs.push({
      key: "practical",
      kind: "practical",
      workingTitle: "Praktisches rund um den See",
      instruction:
        "Fasse die übergreifenden praktischen Hinweise zusammen (Fähren/ÖPNV, Anreise, regionale Besonderheiten). Nenne die verschiedenen Verkehrsmittel als Optionen, ohne dich auf eines zu versteifen.",
      entries: regionPractical.map((p) => toEntryContext(p, allChunks)),
    });
  }

  // Unterkunfts- und Wunsch-Ort-Kapitel: Die Unterkunft bekommt IMMER ein
  // eigenes erstes Kapitel (Ortsporträt + Orte im Ort + nächstgelegene Ziele);
  // weitere Anker-Orte nur, wenn es lohnende Ziele in der Nähe gibt.
  const alreadyShown = new Set<string>([...selectedTownPlaceIds, ...selection.practicalIds]);
  const townKeys = [...townGroups.keys()];

  // nächstgelegene geprüfte Orte um einen Punkt (Umkreis, ohne bereits Gezeigtes)
  const nearbyPlaces = (lat: number, lng: number, exclude: Set<string>) =>
    places
      .filter((p) => !exclude.has(p.id) && p.type !== "practical")
      .map((p) => ({ p, d: haversineKm(lat, lng, p.lat, p.lng) }))
      .filter((x) => {
        const sp = selectableById.get(x.p.id);
        return x.d <= 15 && sp != null && placePassesHardFilters(sp, q);
      })
      .sort((a, b) => a.d - b.d)
      .slice(0, 8)
      .map((x) => x.p);

  const addToSelection = (p: PlaceWithSources) => {
    if (p.type === "restaurant" || p.type === "bar") {
      if (!selection.restaurantIds.includes(p.id)) selection.restaurantIds.push(p.id);
    } else if (!selection.placeIds.includes(p.id)) {
      selection.placeIds.push(p.id);
    }
  };

  const anchorJobs: ChapterJob[] = [];

  // 1) Unterkunfts-Kapitel – IMMER und als ERSTES, auch ohne DB-Daten.
  if (accLabel) {
    // ALLE geprüften Orte im Unterkunfts-Ort (nicht nur die von der Auswahl-
    // Engine getroffenen), damit frisch recherchierte Orte garantiert erscheinen.
    const localPlaces = places
      .filter((p) => {
        if (!localityMatchesLabel(localityOf(p), accLabel)) return false;
        const sp = selectableById.get(p.id);
        if (!sp) return true; // z. B. Praktisches ohne Score trotzdem zeigen
        return p.type === "restaurant" || p.type === "bar"
          ? restaurantPassesHardFilters(sp, q)
          : placePassesHardFilters(sp, q);
      })
      .slice(0, 15);
    for (const p of localPlaces) alreadyShown.add(p.id);
    const nearby =
      q.accommodation.lat != null && q.accommodation.lng != null
        ? nearbyPlaces(q.accommodation.lat, q.accommodation.lng, alreadyShown)
        : [];
    const entries = [...localPlaces, ...nearby].sort(
      (a, b) => (subsectionRank[a.type] ?? 9) - (subsectionRank[b.type] ?? 9)
    );
    for (const p of entries) {
      alreadyShown.add(p.id);
      addToSelection(p);
    }
    anchorJobs.push({
      key: `town-${slug(accLabel)}`,
      kind: "town",
      workingTitle: accLabel,
      locality: accLabel,
      instruction: `Dies ist der Ort EURER UNTERKUNFT (${accLabel}) und der erste Anlaufpunkt der Reise. Schreibe als Kapitel-Einleitung ("introText") ein einladendes Porträt von ${accLabel} selbst (4-6 Sätze): Charakter, Lage am See, Atmosphäre, wofür der Ort bekannt ist, und eine kurze Orientierung für den ersten Tag. Für jeden Eintrag einen konkreten Empfehlungstext (3-5 Sätze); Ziele in der näheren Umgebung ruhig als "wenige Minuten entfernt / in kurzer Distanz" einordnen.`,
      entries: entries.map((p) => toEntryContext(p, allChunks)),
    });
  }

  // 2) Weitere Wunsch-Orte (Anker) – nur wenn es Umgebung gibt, ohne Dubletten.
  const seenAnchorLabels = new Set<string>([accLabel.toLowerCase()]);
  for (const anchor of q.anchors ?? []) {
    const label = (anchor.label ?? "").trim();
    const labelLower = label.toLowerCase();
    if (!label || anchor.lat == null || anchor.lng == null) continue;
    if (seenAnchorLabels.has(labelLower)) continue;
    seenAnchorLabels.add(labelLower);
    // Hat der Anker-Ort ein eigenes Ort-Kapitel, ist er bereits abgedeckt
    if (townKeys.some((t) => localityMatchesLabel(t, label))) continue;

    const nearby = nearbyPlaces(anchor.lat, anchor.lng, alreadyShown);
    if (nearby.length === 0) continue;
    for (const p of nearby) {
      alreadyShown.add(p.id);
      addToSelection(p);
    }
    anchorJobs.push({
      key: `near-${slug(label)}`,
      kind: "places",
      workingTitle: `Rund um ${label}`,
      locality: label,
      instruction: `Die Reisenden interessieren sich für ${label} (Wunsch-Ort). Für diesen Ort gibt es kein eigenes Kapitel – stelle hier die nächstgelegenen lohnenden Ziele als schnelle Orientierung vor (je 3-5 Sätze): was sich in kurzer Distanz anbietet und warum es sich lohnt.`,
      entries: nearby.map((p) => toEntryContext(p, allChunks)),
    });
  }

  // Anker-Sektionen an den Anfang stellen (direkt relevant für die Reisenden)
  jobs.unshift(...anchorJobs);

  const adjustmentContext = describeAdjustments(adjustments);
  const libraryContext =
    matchedChunks.length > 0
      ? `NOTIZEN AUS UNSERER BIBLIOTHEK (paraphrasiert, als Hintergrund nutzen, nicht wörtlich zitieren):\n${matchedChunks
          .map((c) => `- ${formatChunkForPrompt(c)}`)
          .join("\n")}`
      : "";
  const extraContext = [adjustmentContext, libraryContext].filter(Boolean).join("\n\n");

  return { q, regionName: region.name, jobs, selection, extraContext, entryNameById };
}

/** Kapitel-Struktur mit leeren Textfeldern – sofort durchblätterbar. */
function buildSkeletonContent(data: PreparedGuideData): GuideContent {
  return {
    intro: { title: `Euer ${data.regionName}`, text: "" },
    chapters: data.jobs.map((job) => ({
      key: job.key,
      kind: job.kind,
      title: job.workingTitle,
      introText: "",
      locality: job.locality,
      entries: job.entries.map((e) => ({ id: e.id, personalText: "", reason: "" })),
    })),
    daySuggestions: [],
    removedIds: [],
  };
}

/**
 * Stufe 1 (synchron im Fragebogen-Request): Guide-Gerüst anlegen und
 * Besitzer-Token zurückgeben, damit der Nutzer sofort in den Browser-Guide
 * weitergeleitet werden kann.
 */
export async function createGuideSkeleton(requestId: string): Promise<string> {
  const existing = await prisma.guide.findFirst({ where: { guideRequestId: requestId } });
  if (existing) return existing.publicToken;

  const request = await prisma.guideRequest.findUniqueOrThrow({ where: { id: requestId } });
  const data = await prepareGuideData(request, new Set());
  const content = buildSkeletonContent(data);

  const guide = await prisma.guide.create({
    data: {
      guideRequestId: requestId,
      selection: JSON.parse(JSON.stringify(data.selection)),
      content: JSON.parse(JSON.stringify(content)),
      publicToken: generatePublicToken(),
      shareToken: generatePublicToken(),
      modelUsed: "skeleton",
    },
  });
  return guide.publicToken;
}

function parseExistingContent(guide: Guide | null): GuideContent | null {
  if (!guide) return null;
  const parsed = guideContentSchema.safeParse(guide.content);
  return parsed.success ? parsed.data : null;
}

/**
 * Stufe 2 (Worker): KI-Texte kapitelweise erzeugen. Nach jedem Kapitel wird
 * der Guide-Inhalt gespeichert, sodass sich die Seite live füllt. Manuelle
 * Änderungen und entfernte Einträge bleiben erhalten.
 */
export async function generateGuideForRequest(requestId: string): Promise<string> {
  const request = await prisma.guideRequest.findUniqueOrThrow({ where: { id: requestId } });
  const q: Questionnaire = questionnaireSchema.parse(request.questionnaire);

  const existing = await prisma.guide.findFirst({
    where: { guideRequestId: request.id },
    orderBy: { generatedAt: "desc" },
  });
  const existingContent = parseExistingContent(existing);
  const removedIds = new Set(existingContent?.removedIds ?? []);

  const data = await prepareGuideData(request, removedIds);

  // Bestehende Texte je Eintrag/Kapitel, um sie inkrementell zu bewahren:
  // Nur NEUE Einträge werden von der KI getextet (spart Tokens beim
  // Feintuning "mehr/weniger" – bestehende Texte bleiben unangetastet).
  const oldChapterByKey = new Map((existingContent?.chapters ?? []).map((c) => [c.key, c]));
  const oldEntry = (id: string) => {
    for (const c of existingContent?.chapters ?? []) {
      const e = c.entries.find((x) => x.id === id);
      if (e) return e;
    }
    return undefined;
  };

  // Guide-Zeile (falls Skeleton noch nicht existiert, anlegen)
  const guideId = existing
    ? existing.id
    : (
        await prisma.guide.create({
          data: {
            guideRequestId: request.id,
            selection: JSON.parse(JSON.stringify(data.selection)),
            content: JSON.parse(JSON.stringify(buildSkeletonContent(data))),
            publicToken: generatePublicToken(),
            shareToken: generatePublicToken(),
            modelUsed: "skeleton",
          },
        })
      ).id;

  const chapters: GuideContent["chapters"] = [];
  const saveProgress = async () => {
    const partial: GuideContent = {
      intro: existingContent?.intro ?? { title: `Euer ${data.regionName}`, text: "" },
      chapters: [
        ...chapters,
        // noch nicht bearbeitete Kapitel als Gerüst zeigen (Live-Füllen)
        ...data.jobs
          .filter((j) => !chapters.some((c) => c.key === j.key))
          .map((j) => {
            const old = oldChapterByKey.get(j.key);
            return {
              key: j.key,
              kind: j.kind,
              title: old?.title ?? j.workingTitle,
              introText: old?.introText ?? "",
              locality: j.locality,
              entries: j.entries.map((e) => oldEntry(e.id) ?? { id: e.id, personalText: "", reason: "" }),
            };
          }),
      ],
      daySuggestions: existingContent?.daySuggestions ?? [],
      removedIds: [...removedIds],
    };
    await prisma.guide.update({
      where: { id: guideId },
      data: { content: JSON.parse(JSON.stringify(partial)) },
    });
  };

  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
  for (const job of data.jobs) {
    const old = oldChapterByKey.get(job.key);
    const newEntries = job.entries.filter((e) => !oldEntry(e.id)?.personalText);

    let freshChapter: Awaited<ReturnType<typeof generateChapter>> | null = null;
    if (newEntries.length > 0 || !old?.introText) {
      // Nur die neuen Einträge an die KI geben (falls es welche gibt)
      const jobForAI = { ...job, entries: newEntries.length > 0 ? newEntries : job.entries };
      freshChapter = await generateChapter(q, jobForAI, usage, data.extraContext);
    }

    const freshById = new Map((freshChapter?.entries ?? []).map((e) => [e.id, e]));
    chapters.push({
      key: job.key,
      kind: job.kind,
      title: old?.edited ? old.title : old?.title || freshChapter?.title || job.workingTitle,
      introText: old?.edited ? old.introText : old?.introText || freshChapter?.introText || "",
      edited: old?.edited,
      locality: job.locality,
      entries: job.entries.map((e) => {
        const prev = oldEntry(e.id);
        if (prev?.personalText) return prev; // bestehenden (auch bearbeiteten) Text behalten
        return freshById.get(e.id) ?? { id: e.id, personalText: "", reason: "" };
      }),
    });
    await saveProgress();
  }

  // Einleitung & Tagesvorschläge nur erzeugen, wenn noch nicht vorhanden
  // (beim Feintuning bleiben sie stabil und kosten keine Tokens)
  let intro = existingContent?.intro;
  let daySuggestions = existingContent?.daySuggestions ?? [];
  if (!intro?.text || daySuggestions.length === 0) {
    const generated = await generateIntro(
      q,
      chapters.map(
        (c) =>
          `${c.title}: ${c.entries
            .map((e) => data.entryNameById.get(e.id) ?? "")
            .filter(Boolean)
            .join(", ")}`
      ),
      usage,
      data.extraContext
    );
    if (!intro?.edited) intro = intro?.text ? intro : generated.intro;
    if (daySuggestions.length === 0) daySuggestions = generated.daySuggestions;
  }

  const finalContent: GuideContent = {
    intro: intro ?? { title: `Euer ${data.regionName}`, text: "" },
    chapters,
    daySuggestions,
    removedIds: [...removedIds],
  };

  // Automatischer Faktentreue-Check: kein Inhalt ohne DB-Beleg
  const check = validateContentAgainstSelection(finalContent, data.selection);
  if (!check.ok) {
    throw new Error(
      `Faktentreue-Prüfung fehlgeschlagen, unbekannte ids: ${check.unknownIds.join(", ")}`
    );
  }

  const guide = await prisma.guide.update({
    where: { id: guideId },
    data: {
      selection: JSON.parse(JSON.stringify(data.selection)),
      content: JSON.parse(JSON.stringify(finalContent)),
      modelUsed: modelUsed(),
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      generatedAt: new Date(),
    },
  });

  // E-Mail nur senden, wenn die Nutzer:in nach der Erstellung eine Adresse
  // hinterlegt hat. Frisch nachladen, da sie evtl. WÄHREND der Generierung
  // eingegeben wurde (der oben geladene request-Snapshot wäre dann veraltet).
  const fresh = await prisma.guideRequest.findUnique({
    where: { id: requestId },
    select: { email: true },
  });
  if (fresh?.email) {
    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    const guideUrl = `${appUrl}/guide/${guide.publicToken}`;
    const isRevision = existing?.modelUsed !== undefined && existing?.modelUsed !== "skeleton";
    await sendGuideReadyEmail(fresh.email, guideUrl, q.firstNames, Boolean(isRevision));
  }

  return guide.id;
}