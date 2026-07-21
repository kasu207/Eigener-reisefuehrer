import { prisma } from "./db";
import { questionnaireSchema, INTEREST_LABELS } from "./questionnaire";
import { geocodePlace } from "./geocode";
import { researchLocalityPlaces } from "./ai/research-locality";
import { rateLimit } from "./rate-limit";
import type { PlaceType } from "@prisma/client";

/**
 * Lädt EINMALIG echte Orte für die angegebenen Unterkunfts-/Wunsch-Orte in die
 * kuratierte DB – sobald ein Fragebogen einen Ort nennt, zu dem noch (fast)
 * nichts gespeichert ist. Danach werden die Orte für jeden künftigen Guide
 * wiederverwendet (kostenlos). Idempotent: hat ein Ort genug Bestand, passiert
 * nichts.
 */


export async function ensureAccommodationPlaces(requestId: string): Promise<void> {
  const request = await prisma.guideRequest.findUnique({ where: { id: requestId } });
  if (!request) return;

  const parsed = questionnaireSchema.safeParse(request.questionnaire);
  if (!parsed.success) return;
  const q = parsed.data;

  const region = await prisma.region.findUnique({ where: { slug: q.regionSlug } });
  if (!region) return;

  // Unterkunft + weitere Wunsch-Orte, einmal je Ort (Groß/Klein egal)
  const labels = [q.accommodation.label, ...(q.anchors ?? []).map((a) => a.label)]
    .map((l) => (l ?? "").trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const localities = labels.filter((l) => {
    const key = l.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const interests = q.interests.map((i) => INTEREST_LABELS[i.key]);

  for (const locality of localities) {
    try {
      const existing = await prisma.place.findMany({
        where: {
          regionId: region.id,
          status: "verified",
          locality: { equals: locality, mode: "insensitive" },
        },
        select: { name: true },
      });
      // Nur EINMAL recherchieren: sobald der Ort irgendeinen geprüften Eintrag
      // hat, nie wieder automatisch (Kostenschutz – jede Websuche kostet).
      if (existing.length > 0) continue;
      // Backstop gegen wiederholte Recherche bei erfolglosem Ergebnis (0 Treffer):
      // pro Ort höchstens einmal je 7 Tage (im Worker-Prozess).
      if (!rateLimit(`research-locality:${region.id}:${locality.toLowerCase()}`, 1, 7 * 24 * 60 * 60 * 1000)) {
        continue;
      }

      const candidates = await researchLocalityPlaces({
        regionName: region.name,
        locality,
        interests,
        priceLevelMax: q.priceLevel,
        diets: q.diets,
        excludeNames: existing.map((p) => p.name),
      });
      if (candidates.length === 0) {
        console.log(`[accommodation] Keine Orte für "${locality}" gefunden.`);
        continue;
      }

      let created = 0;
      for (const c of candidates) {
        // Koordinaten ermitteln (Fallback: Regions-Mitte), damit Umkreis-Logik greift
        const coords = await geocodePlace({
          label: `${c.name}, ${locality}`,
          regionName: region.name,
          country: region.country,
          centerLat: region.centerLat,
          centerLng: region.centerLng,
        });
        const place = await prisma.place.create({
          data: {
            regionId: region.id,
            type: c.type as PlaceType,
            name: c.name,
            locality,
            lat: coords?.lat ?? region.centerLat,
            lng: coords?.lng ?? region.centerLng,
            address: c.address ?? "",
            tags: [],
            priceLevel: c.priceLevel ?? undefined,
            editorNotes: `[Automatisch zum Unterkunfts-Ort recherchiert · Sicherheit real: ${c.confidence} · bitte gelegentlich prüfen] ${c.note}${
              c.sourceUrl ? ` (Quelle: ${c.sourceTitle || c.sourceUrl})` : ""
            }`,
            status: "verified",
            lastVerifiedAt: new Date(),
          },
        });
        if (c.sourceUrl) {
          await prisma.source.create({
            data: {
              placeId: place.id,
              url: c.sourceUrl,
              sourceType: "blog",
              excerpt: c.sourceTitle || "Recherche-Quelle",
            },
          });
        }
        created += 1;
      }
      console.log(`[accommodation] "${locality}": ${created} Orte recherchiert und gespeichert.`);
    } catch (e) {
      // Recherche darf die Generierung nie blockieren – nur loggen und weiter.
      console.error(`[accommodation] Recherche für "${locality}" fehlgeschlagen:`, e);
    }
  }
}
