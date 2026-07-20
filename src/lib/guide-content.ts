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

export const chapterEntrySchema = z.object({
  id: z.string(),
  personalText: z.string(),
  reason: z.string(), // individuelle Empfehlungsbegründung ("Weil ihr ...")
});

export const chapterSchema = z.object({
  key: z.string(),
  kind: z.enum(["places", "hikes", "restaurants", "practical"]),
  title: z.string(),
  introText: z.string(),
  entries: z.array(chapterEntrySchema),
});

export const daySuggestionSchema = z.object({
  day: z.number().int().min(1),
  title: z.string(),
  text: z.string(),
});

export const guideContentSchema = z.object({
  intro: z.object({ title: z.string(), text: z.string() }),
  chapters: z.array(chapterSchema),
  daySuggestions: z.array(daySuggestionSchema),
});

export type GuideContent = z.infer<typeof guideContentSchema>;
export type Chapter = z.infer<typeof chapterSchema>;

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
