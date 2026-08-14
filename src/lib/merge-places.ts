import { guideContentSchema, type GuideContent } from "./guide-content";

/**
 * Referenzen umschreiben, wenn zwei Orte zusammengeführt werden.
 *
 * Bestehende Guides speichern Place-IDs in `guides.content` und
 * `guides.selection`, dazu kommen die gesetzten Einträge in
 * `guide_requests.pinned_ids`. Würde man die Dublette einfach löschen, fiele
 * der Eintrag aus jedem bestehenden Guide heraus (`renderPlaceEntry` liefert
 * für unbekannte IDs `null`) – mitsamt dem bereits generierten Text. Deshalb
 * zeigen alle Referenzen nach dem Zusammenführen auf den behaltenen Ort.
 */

export type IdMap = Map<string, string>;

function remap(id: string, map: IdMap): string {
  return map.get(id) ?? id;
}

function uniq(ids: string[]): string[] {
  return [...new Set(ids)];
}

export function remapIdList(ids: string[], map: IdMap): string[] {
  return uniq(ids.map((id) => remap(id, map)));
}

/**
 * Inhalt umschreiben. Trafen im selben Kapitel behaltener Ort und Dublette
 * aufeinander, entsteht ein Doppel-Eintrag – wir behalten den mit Text, damit
 * keine bereits generierte Beschreibung verloren geht.
 */
export function remapGuideContent(content: GuideContent, map: IdMap): GuideContent {
  return {
    ...content,
    chapters: content.chapters.map((chapter) => {
      const byId = new Map<string, GuideContent["chapters"][number]["entries"][number]>();
      for (const entry of chapter.entries) {
        const id = remap(entry.id, map);
        const existing = byId.get(id);
        if (!existing) {
          byId.set(id, { ...entry, id });
          continue;
        }
        // Bereits vorhanden: den inhaltsreicheren Eintrag behalten
        const better = existing.personalText.trim() ? existing : { ...entry, id };
        byId.set(id, better);
      }
      return { ...chapter, entries: [...byId.values()] };
    }),
    removedIds: remapIdList(content.removedIds ?? [], map),
  };
}

/** Auswahl umschreiben (die vier ID-Listen; alles andere bleibt unberührt). */
export function remapSelection(selection: unknown, map: IdMap): unknown {
  if (!selection || typeof selection !== "object") return selection;
  const s = selection as Record<string, unknown>;
  const out: Record<string, unknown> = { ...s };
  for (const key of ["placeIds", "hikeIds", "restaurantIds", "practicalIds"]) {
    const value = s[key];
    if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
      out[key] = remapIdList(value as string[], map);
    }
  }
  return out;
}

/** Guide-Inhalt aus der DB umschreiben; unlesbarer Inhalt bleibt unangetastet. */
export function remapStoredContent(raw: unknown, map: IdMap): unknown {
  const parsed = guideContentSchema.safeParse(raw);
  if (!parsed.success) return raw;
  return remapGuideContent(parsed.data, map);
}

/** Enthält der Wert überhaupt eine der zu ersetzenden IDs? */
export function referencesAnyId(raw: unknown, ids: Iterable<string>): boolean {
  const json = JSON.stringify(raw ?? null);
  for (const id of ids) if (json.includes(id)) return true;
  return false;
}

export interface MergeablePlace {
  address: string;
  openingNotes: string;
  editorNotes: string;
  locality: string;
  priceLevel: number | null;
  tags: string[];
  dietaryOptions: string[];
  qualityScore: number;
  mustSee: boolean;
  childFriendly: boolean;
  status: string;
  lastVerifiedAt: Date | null;
}

/**
 * Felder zusammenführen: Der behaltene Eintrag gewinnt, seine LÜCKEN werden
 * aus den Dubletten gefüllt. So ist das Zusammenführen nie ein Rückschritt –
 * die Redaktion verliert keine Angabe, die irgendwo schon gepflegt war.
 */
export function mergePlaceFields<T extends MergeablePlace>(keep: T, others: T[]): MergeablePlace {
  const merged: MergeablePlace = {
    address: keep.address,
    openingNotes: keep.openingNotes,
    editorNotes: keep.editorNotes,
    locality: keep.locality,
    priceLevel: keep.priceLevel,
    tags: [...keep.tags],
    dietaryOptions: [...keep.dietaryOptions],
    qualityScore: keep.qualityScore,
    mustSee: keep.mustSee,
    childFriendly: keep.childFriendly,
    status: keep.status,
    lastVerifiedAt: keep.lastVerifiedAt,
  };

  for (const other of others) {
    if (!merged.address.trim()) merged.address = other.address;
    if (!merged.openingNotes.trim()) merged.openingNotes = other.openingNotes;
    if (!merged.locality.trim()) merged.locality = other.locality;
    if (merged.priceLevel == null) merged.priceLevel = other.priceLevel;

    merged.tags = uniq([...merged.tags, ...other.tags]);
    merged.dietaryOptions = uniq([...merged.dietaryOptions, ...other.dietaryOptions]);
    merged.qualityScore = Math.max(merged.qualityScore, other.qualityScore);
    merged.mustSee = merged.mustSee || other.mustSee;
    // Kindertauglichkeit ist eine Zusicherung: Nur beibehalten, wenn KEIN
    // zusammengeführter Eintrag widerspricht.
    merged.childFriendly = merged.childFriendly && other.childFriendly;
    if (other.status === "verified") merged.status = "verified";
    if (
      other.lastVerifiedAt &&
      (!merged.lastVerifiedAt || other.lastVerifiedAt > merged.lastVerifiedAt)
    ) {
      merged.lastVerifiedAt = other.lastVerifiedAt;
    }

    // Redaktionsnotizen anhängen statt überschreiben – dort steckt die Arbeit.
    const note = other.editorNotes.trim();
    if (note && !merged.editorNotes.includes(note)) {
      merged.editorNotes = merged.editorNotes.trim()
        ? `${merged.editorNotes.trim()}\n\n[aus Dublette übernommen] ${note}`
        : note;
    }
  }

  return merged;
}
