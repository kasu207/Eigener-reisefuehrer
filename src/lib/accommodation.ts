import { prisma } from "./db";
import { questionnaireSchema, INTEREST_LABELS } from "./questionnaire";
import { geocodePlace } from "./geocode";
import { researchLocalityPlaces } from "./ai/research-locality";
import { rateLimit } from "./rate-limit";
import { localityMatchesLabel } from "./areas";
import { describeAiError } from "./ai/common";
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

  // Alle bereits vorhandenen Orte der Region EINMAL laden: Der Abgleich mit dem
  // Freitext-Ort/Adresse aus dem Fragebogen läuft tolerant (localityMatchesLabel),
  // nicht als exakter String-Vergleich – sonst würde z. B. "Via Plinio 20, Torno"
  // nie zum bereits gespeicherten Ort "Torno" passen und die (kostenpflichtige)
  // Recherche würde fälschlich für jeden Guide erneut anlaufen.
  // Läuft mit, während wir in diesem Aufruf neue Orte anlegen – so erkennt ein
  // zweiter Anker, der denselben Ort meint (andere Formulierung), sofort den
  // gerade erst angelegten Bestand statt ein zweites Mal zu recherchieren.
  const allPlaces = await prisma.place.findMany({
    where: { regionId: region.id, status: "verified" },
    select: { name: true, locality: true },
  });

  for (const locality of localities) {
    try {
      const existing = allPlaces.filter((p) => localityMatchesLabel(p.locality, locality));
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
        // Nur Kandidaten, bei denen die KI selbst zuversichtlich ist ("hoch"/
        // "mittel"), werden automatisch verifiziert und erscheinen sofort im
        // Guide. "niedrig" heißt: die KI ist sich selbst nicht sicher, dass
        // der Ort so wirklich existiert – das darf NIE automatisch als
        // geprüfte Tatsache landen (sonst genau der Fall: ein Guide-Text, der
        // einräumt, der Ort sei nicht sicher auffindbar). Solche Kandidaten
        // werden stattdessen als Entwurf abgelegt, damit ein Mensch sie im
        // Admin vor der Freigabe prüft – wie bei allen anderen KI-Vorschlägen.
        const autoVerified = c.confidence !== "niedrig";
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
            editorNotes: `[Automatisch zum Unterkunfts-Ort recherchiert · Sicherheit real: ${c.confidence}${
              autoVerified ? " · bitte gelegentlich prüfen" : " · UNSICHER, bitte vor Freigabe prüfen"
            }] ${c.note}${c.sourceUrl ? ` (Quelle: ${c.sourceTitle || c.sourceUrl})` : ""}`,
            status: autoVerified ? "verified" : "draft",
            lastVerifiedAt: autoVerified ? new Date() : null,
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
        allPlaces.push({ name: c.name, locality });
        created += 1;
      }
      console.log(`[accommodation] "${locality}": ${created} Orte recherchiert und gespeichert.`);
    } catch (e) {
      // Recherche darf die Generierung nie blockieren – nur loggen und weiter.
      console.error(
        `[accommodation] Recherche für "${locality}" fehlgeschlagen:`,
        describeAiError(e),
        e
      );
    }
  }
}
