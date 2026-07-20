import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Startdaten: Region Comer See mit Beispiel-Einträgen zum Entwickeln und
 * Testen. Das Kurationsziel (80–120 Orte etc., Anforderung 5.4) wird
 * redaktionell über das Admin-Interface erreicht.
 */
async function main() {
  const region = await prisma.region.upsert({
    where: { slug: "comer-see" },
    update: {},
    create: {
      name: "Comer See",
      slug: "comer-see",
      country: "Italien",
      centerLat: 46.0,
      centerLng: 9.26,
      description:
        "Der Comer See in Lombardei: Dörfer am Wasser, Villen und Gärten, Bergpanoramen und eine bodenständige, gute Küche.",
    },
  });

  const places: Array<{
    type: "village" | "sight" | "viewpoint" | "beach" | "restaurant" | "bar" | "practical";
    name: string;
    lat: number;
    lng: number;
    address?: string;
    tags: string[];
    priceLevel?: number;
    openingNotes?: string;
    childFriendly?: boolean;
    access?: "car" | "public" | "foot";
    dietaryOptions?: string[];
    editorNotes?: string;
    qualityScore?: number;
  }> = [
    { type: "village", name: "Varenna", lat: 46.0106, lng: 9.2833, tags: ["dorf", "altstadt", "foto"], access: "public", editorNotes: "Ruhigeres Pendant zu Bellagio, Uferweg 'Passeggiata degli Innamorati'.", qualityScore: 5 },
    { type: "village", name: "Bellagio", lat: 45.9863, lng: 9.2618, tags: ["dorf", "altstadt", "markt"], access: "public", editorNotes: "Berühmt und entsprechend voll; früh morgens am schönsten.", qualityScore: 4 },
    { type: "village", name: "Menaggio", lat: 46.0221, lng: 9.2385, tags: ["dorf", "markt"], access: "public", qualityScore: 4 },
    { type: "village", name: "Nesso", lat: 45.9106, lng: 9.1571, tags: ["dorf", "foto", "ruhig"], access: "car", editorNotes: "Orrido di Nesso: Wasserfall-Schlucht mitten im Ort.", qualityScore: 4 },
    { type: "sight", name: "Villa del Balbianello", lat: 45.9636, lng: 9.2033, address: "Via Comoedia 5, Tremezzina", tags: ["villa", "garten", "kultur", "foto"], openingNotes: "Di & Mi geschlossen, Garten nur mit Ticket", access: "foot", qualityScore: 5, editorNotes: "Drehort (Star Wars, James Bond); Zugang zu Fuß oder per Boot." },
    { type: "sight", name: "Villa Carlotta", lat: 45.9855, lng: 9.2295, address: "Via Regina 2, Tremezzina", tags: ["villa", "garten", "kultur"], openingNotes: "Saisonal, i. d. R. tgl. geöffnet", access: "public", qualityScore: 5 },
    { type: "sight", name: "Duomo di Como", lat: 45.8114, lng: 9.0832, address: "Piazza del Duomo, Como", tags: ["kirche", "kultur", "geschichte", "altstadt"], access: "public", qualityScore: 4 },
    { type: "viewpoint", name: "Brunate (Standseilbahn)", lat: 45.8194, lng: 9.0959, tags: ["aussicht", "panorama", "foto"], openingNotes: "Funicolare fährt ca. alle 30 Minuten", access: "public", qualityScore: 5, editorNotes: "Standseilbahn ab Como, oben Leuchtturm Volta mit Weitblick." },
    { type: "viewpoint", name: "Monte San Primo Aussicht", lat: 45.9089, lng: 9.2381, tags: ["aussicht", "panorama", "berge"], access: "car", qualityScore: 4 },
    { type: "beach", name: "Lido di Lenno", lat: 45.9583, lng: 9.2094, tags: ["baden", "lido", "strand"], priceLevel: 2, openingNotes: "Saisonbetrieb Mai–September", childFriendly: true, access: "car", qualityScore: 4 },
    { type: "beach", name: "Lido di Menaggio", lat: 46.0195, lng: 9.2343, tags: ["baden", "lido"], priceLevel: 2, openingNotes: "Saisonbetrieb", childFriendly: true, access: "public", qualityScore: 4 },
    { type: "restaurant", name: "Trattoria del Porto (Beispiel)", lat: 46.012, lng: 9.284, address: "Varenna", tags: ["kulinarik", "regional"], priceLevel: 2, dietaryOptions: ["vegetarian"], access: "public", qualityScore: 4, editorNotes: "Seefisch (Missoltini), einfache Küche, Terrasse am Wasser. Beispiel-Eintrag: vor Launch verifizieren." },
    { type: "restaurant", name: "Osteria sul Lago (Beispiel)", lat: 45.987, lng: 9.259, address: "Bellagio", tags: ["kulinarik", "gehoben"], priceLevel: 3, dietaryOptions: ["vegetarian", "glutenfree"], access: "public", qualityScore: 4, editorNotes: "Beispiel-Eintrag: vor Launch verifizieren." },
    { type: "restaurant", name: "Pizzeria al Molo (Beispiel)", lat: 46.021, lng: 9.237, address: "Menaggio", tags: ["kulinarik", "unkompliziert"], priceLevel: 1, dietaryOptions: ["vegetarian", "vegan"], childFriendly: true, access: "public", qualityScore: 3, editorNotes: "Beispiel-Eintrag: vor Launch verifizieren." },
    { type: "bar", name: "Aperitivo-Bar am Ufer (Beispiel)", lat: 45.9865, lng: 9.2605, address: "Bellagio", tags: ["aperitivo", "bar"], priceLevel: 2, access: "public", qualityScore: 3, editorNotes: "Beispiel-Eintrag: vor Launch verifizieren." },
    { type: "practical", name: "Fähren auf dem Comer See", lat: 45.9863, lng: 9.2578, tags: ["faehre", "oepnv"], access: "public", editorNotes: "Navigazione Laghi verbindet Bellagio–Varenna–Menaggio im Dreieck; Autofähre vorhanden. Tickets vor Ort oder online.", qualityScore: 5 },
    { type: "practical", name: "Parken in Varenna", lat: 46.0099, lng: 9.2851, tags: ["parken"], access: "car", editorNotes: "Wenige Plätze am Bahnhof und am Ufer; früh kommen oder mit dem Zug anreisen (Strecke Lecco–Tirano).", qualityScore: 4 },
  ];

  for (const p of places) {
    const existing = await prisma.place.findFirst({ where: { name: p.name, regionId: region.id } });
    if (existing) continue;
    await prisma.place.create({
      data: {
        regionId: region.id,
        type: p.type,
        name: p.name,
        lat: p.lat,
        lng: p.lng,
        address: p.address ?? "",
        tags: p.tags,
        priceLevel: p.priceLevel ?? null,
        openingNotes: p.openingNotes ?? "",
        childFriendly: p.childFriendly ?? true,
        access: p.access ?? "car",
        dietaryOptions: p.dietaryOptions ?? [],
        editorNotes: p.editorNotes ?? "",
        qualityScore: p.qualityScore ?? 3,
        status: "verified",
        lastVerifiedAt: new Date(),
      },
    });
  }

  const hikes = [
    {
      name: "Greenway del Lago di Como",
      startLat: 45.9403, startLng: 9.1893,
      startDescription: "Colonno, Ortseingang (Bus C10 ab Como)",
      distanceKm: 10.5, durationMin: 210, elevationGainM: 250,
      difficulty: "easy" as const, childFriendly: true,
      tags: ["panorama", "doerfer", "leicht"],
      descriptionNotes: "Alter Maultierpfad oberhalb des Westufers, durch Dörfer und Olivenhaine, viele Einkehr- und Abkürzungsmöglichkeiten per Bus.",
    },
    {
      name: "Sentiero del Viandante (Etappe Varenna–Bellano)",
      startLat: 46.0106, startLng: 9.2833,
      startDescription: "Bahnhof Varenna-Esino",
      distanceKm: 6.5, durationMin: 150, elevationGainM: 300,
      difficulty: "medium" as const, childFriendly: true,
      tags: ["panorama", "geschichte"],
      descriptionNotes: "Historischer Weitwanderweg am Ostufer; Rückfahrt bequem mit dem Zug.",
    },
    {
      name: "Monte Grona ab Breglia",
      startLat: 46.0555, startLng: 9.2497,
      startDescription: "Parkplatz Breglia (oberhalb Menaggio)",
      distanceKm: 9, durationMin: 300, elevationGainM: 900,
      difficulty: "hard" as const, childFriendly: false,
      tags: ["gipfel", "panorama", "berge"],
      descriptionNotes: "Anspruchsvolle Gipfeltour mit Blick über beide Seearme; Einkehr Rifugio Menaggio.",
    },
  ];

  for (const h of hikes) {
    const existing = await prisma.hike.findFirst({ where: { name: h.name, regionId: region.id } });
    if (existing) continue;
    await prisma.hike.create({
      data: {
        regionId: region.id,
        ...h,
        status: "verified",
        lastVerifiedAt: new Date(),
      },
    });
  }

  console.log("Seed abgeschlossen: Region Comer See mit Beispiel-Orten und Wanderungen.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
