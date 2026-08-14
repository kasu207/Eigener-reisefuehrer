import "dotenv/config";
import { PrismaClient } from "@prisma/client";

/**
 * NUR-LESEN-Bericht über den Zustand der Koordinaten im Ortsbestand.
 *
 * Ändert nichts. Gedacht, um den Zustand der Produktions-Datenbank sichtbar zu
 * machen, ohne sie nach außen zu öffnen: ausführen, Ausgabe kopieren.
 *
 * Ausführen (auf dem Server):
 *   docker compose -f docker-compose.prod.yml exec app npm run db:report-coords
 */

const prisma = new PrismaClient();

/** Entfernung in Kilometern. */
function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

async function main() {
  const regions = await prisma.region.findMany({ orderBy: { name: "asc" } });
  if (regions.length === 0) {
    console.log("Keine Regionen in der Datenbank.");
    return;
  }

  for (const region of regions) {
    const places = await prisma.place.findMany({
      where: { regionId: region.id },
      orderBy: [{ locality: "asc" }, { name: "asc" }],
      select: {
        name: true,
        locality: true,
        address: true,
        type: true,
        status: true,
        lat: true,
        lng: true,
        addedByRequestId: true,
      },
    });

    console.log(`\n=== ${region.name} (${places.length} Orte) ===`);
    console.log(`Regions-Mitte: ${region.centerLat}, ${region.centerLng}`);

    const atCenter = places.filter(
      (p) =>
        Math.abs(p.lat - region.centerLat) < 0.0005 &&
        Math.abs(p.lng - region.centerLng) < 0.0005
    );
    const farAway = places.filter(
      (p) => distanceKm(p.lat, p.lng, region.centerLat, region.centerLng) > 60
    );
    const nullish = places.filter((p) => !p.lat || !p.lng);
    const withAddress = places.filter((p) => p.address.trim()).length;
    const withoutLocality = places.filter((p) => !p.locality.trim()).length;

    console.log(`  auf der Regions-Mitte (Platzhalter): ${atCenter.length}`);
    console.log(`  weiter als 60 km entfernt (verdächtig): ${farAway.length}`);
    console.log(`  ohne Koordinaten (0/0): ${nullish.length}`);
    console.log(`  mit gepflegter Adresse: ${withAddress}`);
    console.log(`  ohne Ort/Stadt: ${withoutLocality}`);

    // Häufungen an identischen Koordinaten deuten auf Platzhalter hin, die
    // nicht die Regions-Mitte sind (z. B. Ortsmittelpunkte aus einem Import).
    const byCoord = new Map<string, number>();
    for (const p of places) {
      const key = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
      byCoord.set(key, (byCoord.get(key) ?? 0) + 1);
    }
    const clusters = [...byCoord.entries()]
      .filter(([, n]) => n > 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    if (clusters.length > 0) {
      console.log("  mehrfach belegte Koordinaten (Top 10):");
      for (const [coord, n] of clusters) console.log(`    ${coord} → ${n}× `);
    }

    console.log("\n  Orte pro Stadt (Platzhalter in Klammern):");
    const byLocality = new Map<string, { total: number; placeholder: number }>();
    for (const p of places) {
      const key = p.locality.trim() || "(ohne Ort)";
      const e = byLocality.get(key) ?? { total: 0, placeholder: 0 };
      e.total += 1;
      if (atCenter.includes(p)) e.placeholder += 1;
      byLocality.set(key, e);
    }
    for (const [loc, e] of [...byLocality.entries()].sort((a, b) => b[1].total - a[1].total)) {
      console.log(`    ${loc}: ${e.total} (${e.placeholder} Platzhalter)`);
    }

    if (atCenter.length > 0) {
      console.log("\n  Betroffene Einträge (erste 40):");
      for (const p of atCenter.slice(0, 40)) {
        const scope = p.addedByRequestId ? " [privat]" : "";
        console.log(
          `    ${p.name} · ${p.locality || "ohne Ort"} · ${p.type} · ${p.status}` +
            `${p.address ? ` · Adresse: ${p.address}` : " · keine Adresse"}${scope}`
        );
      }
      if (atCenter.length > 40) console.log(`    … und ${atCenter.length - 40} weitere`);
    }

    if (farAway.length > 0) {
      console.log("\n  Verdächtig weit entfernt:");
      for (const p of farAway.slice(0, 20)) {
        const km = Math.round(distanceKm(p.lat, p.lng, region.centerLat, region.centerLng));
        console.log(`    ${p.name} · ${p.locality || "ohne Ort"} · ${km} km · ${p.lat}, ${p.lng}`);
      }
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
