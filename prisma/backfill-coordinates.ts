import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import {
  resolvePlaceCoordinates,
  isRegionCenter,
  COORDINATE_SOURCE_LABELS,
  type CoordinateSource,
} from "../src/lib/coordinates";

/**
 * Koordinaten für den GESAMTEN Bestand nachtragen – ohne die Stapelgrenze der
 * Admin-Oberfläche. Für den Altbestand, der mit der Regions-Mitte als
 * Platzhalter angelegt wurde (am Comer See: mitten im Wasser).
 *
 * Idempotent: Orte mit brauchbaren Koordinaten werden übersprungen, und wenn
 * die Ermittlung nichts findet, bleibt der Eintrag unverändert stehen.
 *
 * Ausführen (auf dem Server):
 *   docker compose -f docker-compose.prod.yml exec app npm run db:backfill-coords -- --dry-run
 *   docker compose -f docker-compose.prod.yml exec app npm run db:backfill-coords
 *
 * Optionen:
 *   --dry-run        nur zeigen, was passieren würde (nichts schreiben)
 *   --region=<slug>  auf eine Region beschränken (z. B. --region=comer-see)
 *   --all            auch Orte prüfen, die nicht auf der Regions-Mitte stehen
 *   --limit=<n>      höchstens n Orte bearbeiten
 *
 * Tempo: Nominatim erlaubt eine Anfrage pro Sekunde, die Warteschlange in
 * `geocode.ts` hält das ein. Rechne mit gut zwei Sekunden pro Ort.
 */

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const checkAll = args.includes("--all");
const regionSlug = args.find((a) => a.startsWith("--region="))?.split("=")[1];
const limitArg = Number(args.find((a) => a.startsWith("--limit="))?.split("=")[1]);
const limit = Number.isFinite(limitArg) && limitArg > 0 ? limitArg : Infinity;

async function main() {
  const regions = await prisma.region.findMany({
    where: regionSlug ? { slug: regionSlug } : {},
  });
  if (regions.length === 0) {
    console.log(regionSlug ? `Region „${regionSlug}" nicht gefunden.` : "Keine Regionen.");
    return;
  }

  const counts = new Map<CoordinateSource, number>();
  let processed = 0;
  let updated = 0;

  for (const region of regions) {
    const anchor = {
      name: region.name,
      country: region.country,
      centerLat: region.centerLat,
      centerLng: region.centerLng,
    };
    const places = await prisma.place.findMany({
      where: { regionId: region.id },
      orderBy: [{ locality: "asc" }, { name: "asc" }],
    });
    const todo = checkAll ? places : places.filter((p) => isRegionCenter(p.lat, p.lng, anchor));

    console.log(
      `\n=== ${region.name}: ${todo.length} von ${places.length} Orten zu prüfen ===`
    );

    for (const place of todo) {
      if (processed >= limit) break;
      processed += 1;

      const coords = await resolvePlaceCoordinates(
        {
          name: place.name,
          locality: place.locality,
          address: place.address,
          region: anchor,
        }
      );
      counts.set(coords.source, (counts.get(coords.source) ?? 0) + 1);

      const label = COORDINATE_SOURCE_LABELS[coords.source];
      console.log(
        `  ${place.name} (${place.locality || "ohne Ort"}): ${label}` +
          (coords.source === "region-center" ? "" : ` → ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`)
      );

      // Nichts gefunden: unverändert lassen, damit der Ort in der
      // Nachtrag-Liste sichtbar bleibt statt still falsch zu sein.
      if (coords.source === "region-center") continue;
      if (dryRun) continue;

      await prisma.place.update({
        where: { id: place.id },
        data: {
          lat: coords.lat,
          lng: coords.lng,
          // Gefundene Adresse nur ergänzen, nie eine gepflegte überschreiben
          address: place.address.trim() || coords.address || place.address,
        },
      });
      updated += 1;
    }
  }

  console.log("\n--- Zusammenfassung ---");
  console.log(`geprüft: ${processed}`);
  for (const [source, n] of counts) console.log(`  ${n}× ${COORDINATE_SOURCE_LABELS[source]}`);
  console.log(dryRun ? "Probelauf – nichts geschrieben." : `geschrieben: ${updated}`);
  const unresolved = counts.get("region-center") ?? 0;
  if (unresolved > 0) {
    console.log(
      `\n${unresolved} Orte blieben ohne Treffer. Meist fehlt das Feld Ort/Stadt – ` +
        `in /admin/places per Sammelaktion nachtragen und erneut laufen lassen.`
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
