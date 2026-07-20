import { prisma } from "./db";
import { questionnaireSchema, type Questionnaire } from "./questionnaire";
import { selectContent, type SelectablePlace, type SelectableHike } from "./selection";
import {
  generateChapter,
  generateIntro,
  modelUsed,
  type ChapterJob,
  type EntryContext,
  type TokenUsage,
} from "./ai/generate";
import { validateContentAgainstSelection, type GuideContent } from "./guide-content";
import { generatePublicToken } from "./token";
import { sendGuideReadyEmail } from "./email";
import type { Place, Hike, Source } from "@prisma/client";

/**
 * Orchestrierung der Guide-Erzeugung (läuft im Worker, nicht im Request):
 * Auswahl-Engine -> kapitelweise KI-Generierung -> Validierung -> Guide + E-Mail.
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

function sourceExcerpts(sources: Source[]): string[] {
  return sources.filter((s) => s.excerpt).map((s) => s.excerpt);
}

function toEntryContext(p: Place & { sources: Source[] }): EntryContext {
  return { id: p.id, name: p.name, facts: placeFacts(p), sourceExcerpts: sourceExcerpts(p.sources) };
}

/** Orte grob nach Lage gruppieren (Gebietskapitel), max. ~8 pro Kapitel. */
function groupByArea<T extends { lat: number }>(items: T[], chunkSize = 8): T[][] {
  const sorted = [...items].sort((a, b) => b.lat - a.lat);
  const groups: T[][] = [];
  for (let i = 0; i < sorted.length; i += chunkSize) {
    groups.push(sorted.slice(i, i + chunkSize));
  }
  return groups;
}

export async function generateGuideForRequest(requestId: string): Promise<string> {
  const request = await prisma.guideRequest.findUniqueOrThrow({ where: { id: requestId } });
  const q: Questionnaire = questionnaireSchema.parse(request.questionnaire);

  const region = await prisma.region.findUniqueOrThrow({ where: { slug: q.regionSlug } });

  // Nur verifizierte Einträge gelangen in Guides (Anforderung 4.5)
  const places = await prisma.place.findMany({
    where: { regionId: region.id, status: "verified" },
    include: { sources: true },
  });
  const hikes = await prisma.hike.findMany({
    where: { regionId: region.id, status: "verified" },
    include: { sources: true },
  });

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

  const selection = selectContent(selectablePlaces, selectableHikes, q);

  const placeById = new Map(places.map((p) => [p.id, p]));
  const hikeById = new Map(hikes.map((h) => [h.id, h]));

  // Kapitel-Jobs bauen
  const jobs: ChapterJob[] = [];

  const selectedPlaces = selection.placeIds
    .map((id) => placeById.get(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));
  groupByArea(selectedPlaces).forEach((group, i) => {
    jobs.push({
      key: `area-${i + 1}`,
      kind: "places",
      workingTitle: `Gebiet ${i + 1}: Orte & Sehenswertes`,
      instruction:
        "Diese Orte liegen geografisch beieinander. Beschreibe sie so, dass sie sich gut zu Ausflügen kombinieren lassen.",
      entries: group.map(toEntryContext),
    });
  });

  const selectedHikes = selection.hikeIds
    .map((id) => hikeById.get(id))
    .filter((h): h is NonNullable<typeof h> => Boolean(h));
  if (selectedHikes.length > 0) {
    jobs.push({
      key: "hikes",
      kind: "hikes",
      workingTitle: "Wanderungen",
      instruction:
        "Beschreibe die Wanderungen mit Charakter und Landschaftseindruck. Eckdaten (Distanz, Dauer, Höhenmeter) stehen in der Fakten-Box – nicht im Fließtext wiederholen.",
      entries: selectedHikes.map((h) => ({
        id: h.id,
        name: h.name,
        facts: hikeFacts(h),
        sourceExcerpts: sourceExcerpts(h.sources),
      })),
    });
  }

  const selectedRestaurants = selection.restaurantIds
    .map((id) => placeById.get(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));
  if (selectedRestaurants.length > 0) {
    jobs.push({
      key: "restaurants",
      kind: "restaurants",
      workingTitle: "Essen & Trinken",
      instruction:
        "Sortiere die Empfehlungen gedanklich nach den kulinarischen Vorlieben der Reisenden und mache Lust auf die Küche der Region.",
      entries: selectedRestaurants.map(toEntryContext),
    });
  }

  const practicalPlaces = selection.practicalIds
    .map((id) => placeById.get(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));
  if (practicalPlaces.length > 0) {
    jobs.push({
      key: "practical",
      kind: "practical",
      workingTitle: "Praktisches: Anreise, Fähren & Co.",
      instruction:
        "Fasse die praktischen Hinweise (Fähren/ÖPNV, Parken, regionale Besonderheiten) hilfreich und passend zur gewählten Mobilität zusammen.",
      entries: practicalPlaces.map(toEntryContext),
    });
  }

  // Kapitelweise Generierung (Anforderung 4.3)
  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
  const chapters = [];
  for (const job of jobs) {
    chapters.push(await generateChapter(q, job, usage));
  }

  const { intro, daySuggestions } = await generateIntro(
    q,
    chapters.map((c) => `${c.title}: ${c.entries.map((e) => placeById.get(e.id)?.name ?? hikeById.get(e.id)?.name ?? "").filter(Boolean).join(", ")}`),
    usage
  );

  const content: GuideContent = { intro, chapters, daySuggestions };

  // Automatischer Faktentreue-Check: kein Inhalt ohne DB-Beleg
  const check = validateContentAgainstSelection(content, selection);
  if (!check.ok) {
    throw new Error(`Faktentreue-Prüfung fehlgeschlagen, unbekannte ids: ${check.unknownIds.join(", ")}`);
  }

  const guide = await prisma.guide.create({
    data: {
      guideRequestId: request.id,
      selection: JSON.parse(JSON.stringify(selection)),
      content: JSON.parse(JSON.stringify(content)),
      publicToken: generatePublicToken(),
      modelUsed: modelUsed(),
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    },
  });

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const guideUrl = `${appUrl}/guide/${guide.publicToken}`;
  await sendGuideReadyEmail(q.email, guideUrl, q.firstNames);

  return guide.id;
}
