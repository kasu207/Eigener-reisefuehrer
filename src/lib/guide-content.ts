import { z } from "zod";
import type { Selection } from "./selection";

/**
 * Struktur des generierten Guide-Inhalts (`guides.content`).
 *
 * Wichtig für die Faktentreue (Anforderung 8): Die KI liefert ausschließlich
 * redaktionelle Texte (Einleitungen, personalisierte Empfehlungstexte,
 * Begründungen). Fakten-Boxen (Adresse, Preise, Distanzen, Höhenmeter,
 * Öffnungszeiten) werden zur Anzeigezeit direkt aus der Datenbank gerendert
 * und können daher konstruktionsbedingt nicht erfunden werden.
 */

/** `edited: true` markiert manuelle Nutzer-Änderungen – sie werden bei
 * KI-Neugenerierungen bewahrt (siehe mergeGuideContent). */
export const chapterEntrySchema = z.object({
  id: z.string(),
  personalText: z.string(),
  reason: z.string(), // individuelle Empfehlungsbegründung ("Weil ihr ...")
  edited: z.boolean().optional(),
});

export const chapterSchema = z.object({
  key: z.string(),
  // "town" = Ort-Kapitel mit festen Unterabschnitten (Sehenswürdigkeiten,
  // Essen & Trinken, Ausgehen, Unterkunft, Veranstaltungen, Praktisches);
  // die übrigen Werte sind regionsweite Kapitel (Wanderungen etc.).
  kind: z.enum(["town", "places", "hikes", "restaurants", "practical"]),
  title: z.string(),
  introText: z.string(),
  entries: z.array(chapterEntrySchema),
  edited: z.boolean().optional(), // Titel/Einleitung manuell geändert
  /** Ort-Bezug des Kapitels (für das per-Ort-Feintuning „+"), z. B. "Torno". */
  locality: z.string().optional(),
});

export const daySuggestionSchema = z.object({
  day: z.number().int().min(1),
  title: z.string(),
  text: z.string(),
  edited: z.boolean().optional(),
});

export const guideContentSchema = z.object({
  intro: z.object({
    title: z.string(),
    text: z.string(),
    edited: z.boolean().optional(),
  }),
  chapters: z.array(chapterSchema),
  daySuggestions: z.array(daySuggestionSchema),
  /** Vom Nutzer entfernte Einträge – werden bei Neugenerierung nicht wieder aufgenommen. */
  removedIds: z.array(z.string()).optional().default([]),
});

export type GuideContent = z.infer<typeof guideContentSchema>;
export type Chapter = z.infer<typeof chapterSchema>;

/**
 * Frisch generierten Inhalt mit dem bestehenden Guide zusammenführen:
 * - vom Nutzer entfernte Einträge bleiben entfernt
 * - manuell bearbeitete Texte (edited) überschreiben die neue KI-Fassung
 */
export function mergeGuideContent(fresh: GuideContent, old: GuideContent): GuideContent {
  const removed = new Set(old.removedIds ?? []);
  const oldEntryById = new Map(
    old.chapters.flatMap((c) => c.entries.map((e) => [e.id, e] as const))
  );
  const oldChapterByKey = new Map(old.chapters.map((c) => [c.key, c]));
  const oldDayByNumber = new Map(old.daySuggestions.map((d) => [d.day, d]));

  return {
    intro: old.intro.edited ? old.intro : fresh.intro,
    chapters: fresh.chapters.map((chapter) => {
      const oldChapter = oldChapterByKey.get(chapter.key);
      return {
        ...chapter,
        ...(oldChapter?.edited
          ? { title: oldChapter.title, introText: oldChapter.introText, edited: true }
          : {}),
        entries: chapter.entries
          .filter((e) => !removed.has(e.id))
          .map((entry) => {
            const oldEntry = oldEntryById.get(entry.id);
            return oldEntry?.edited ? oldEntry : entry;
          }),
      };
    }),
    daySuggestions: fresh.daySuggestions.map((day) => {
      const oldDay = oldDayByNumber.get(day.day);
      return oldDay?.edited ? oldDay : day;
    }),
    removedIds: [...removed],
  };
}

/**
 * Automatische Prüfung (Anforderung 8, Faktentreue): Jeder Eintrag im
 * generierten Guide muss auf einen Eintrag der gespeicherten Auswahl
 * zurückführbar sein – kein Guide-Inhalt ohne DB-Beleg.
 */
export function validateContentAgainstSelection(
  content: GuideContent,
  selection: Selection
): { ok: boolean; unknownIds: string[] } {
  const allowed = new Set([
    ...selection.placeIds,
    ...selection.hikeIds,
    ...selection.restaurantIds,
    ...selection.practicalIds,
  ]);
  const unknownIds: string[] = [];
  for (const chapter of content.chapters) {
    for (const entry of chapter.entries) {
      if (!allowed.has(entry.id)) unknownIds.push(entry.id);
    }
  }
  return { ok: unknownIds.length === 0, unknownIds };
}
