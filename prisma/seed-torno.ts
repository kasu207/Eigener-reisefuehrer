import "dotenv/config";
import { PrismaClient, type PlaceType, type Access, type Difficulty } from "@prisma/client";
import { geocodePlace } from "../src/lib/geocode";

/**
 * Zusatz-Seed: kuratierte, RECHERCHIERTE Orte für Torno (Ostufer, Comer See).
 *
 * Quellen (Websuche, Reddit/Blogs/lokale Portale) sind je Eintrag als Source
 * hinterlegt. Bewusst idempotent: Bereits vorhandene Orte (gleicher Name in der
 * Region) werden übersprungen – das Skript kann gefahrlos mehrfach laufen und
 * überschreibt keine anderen Daten.
 *
 * Ausführen (z. B. im Prod-Container):
 *   docker compose -f docker-compose.prod.yml exec app npx tsx prisma/seed-torno.ts
 * oder lokal:
 *   npx tsx prisma/seed-torno.ts
 *
 * Koordinaten werden zur Laufzeit per Nominatim ermittelt (mit Fallback auf die
 * hinterlegten Näherungswerte), damit die Kartenpins möglichst genau sitzen.
 */

const prisma = new PrismaClient();

const REGION_SLUG = "comer-see";
const LOCALITY = "Torno";

type SeedPlace = {
  type: PlaceType;
  name: string;
  lat: number; // Näherung/Fallback
  lng: number;
  address?: string;
  tags: string[];
  priceLevel?: number;
  access?: Access;
  dietaryOptions?: string[];
  childFriendly?: boolean;
  qualityScore?: number;
  editorNotes: string;
  source: { url: string; excerpt: string };
  /** Für das Geocoding genutzter Suchbegriff (Fallback: name). */
  geoQuery?: string;
};

const places: SeedPlace[] = [
  {
    type: "sight",
    name: "Chiesa di San Giovanni Battista",
    lat: 45.8672, lng: 9.1119,
    tags: ["kultur", "geschichte", "kirche"],
    access: "foot", qualityScore: 4,
    editorNotes:
      "Gotische Kirche aus dem 14. Jh. im Ortskern, eines der schönsten Kirchengebäude am Comer See ('del Chiodo' – der Überlieferung nach mit einem Reliquiennagel). Reich an Malereien und Skulpturen. [Recherchiert – Öffnungszeiten vor Ort prüfen]",
    source: { url: "https://www.comoeilsuolago.it/torno.htm", excerpt: "San Giovanni: 14th-century church, among the most beautiful Christian monuments of Lake Como ('del Chiodo')." },
  },
  {
    type: "sight",
    name: "Chiesa di Santa Tecla",
    lat: 45.8659, lng: 9.1129,
    tags: ["kultur", "kirche", "see"],
    access: "foot", qualityScore: 3,
    editorNotes:
      "Kleine Kirche direkt am Seeufer, neben der historischen Anlegestelle und dem Ristorante Vapore – schöner Blick über den See. [Recherchiert – vor Ort prüfen]",
    source: { url: "https://hotelvapore.it/ristorante/", excerpt: "Direkt am See neben der historischen Kirche Santa Tecla an der Uferpromenade von Torno." },
  },
  {
    type: "sight",
    name: "Villa Pliniana",
    lat: 45.8760, lng: 9.1180,
    tags: ["villa", "geschichte", "natur"],
    access: "public", qualityScore: 4,
    editorNotes:
      "Historische Villa aus dem 16. Jh. mit berühmter intermittierender Quelle (schon von Leonardo da Vinci und Plinius beschrieben). Gäste wie Byron, Rossini, Stendhal. Heute privater Event-Ort – am besten vom See/Boot aus zu bewundern, nicht frei zugänglich. [Recherchiert – Zugang prüfen]",
    source: { url: "https://comoeilsuolago.it/villapliniana.htm", excerpt: "Villa Pliniana (16. Jh.) mit intermittierender Quelle; berühmte Gäste Byron, Rossini, Stendhal, Napoleon." },
  },
  {
    type: "viewpoint",
    name: "Pietra Pendula (Montepiatto)",
    lat: 45.8710, lng: 9.1010,
    tags: ["aussicht", "natur", "wandern", "foto"],
    access: "foot", qualityScore: 4,
    editorNotes:
      "Pilzförmiger Granitfelsen, der scheinbar frei balanciert – oberhalb von Torno bei Montepiatto. Vom nahen Kirchlein Santa Elisabetta grandioser Blick über den Comer See. Zu Fuß von Torno in ca. 45–60 Min. erreichbar. [Recherchiert]",
    source: { url: "https://comocity.it/montepiatto-pietra-pendula-torno/", excerpt: "Pietra Pendula: mushroom-shaped granite rock above Torno near Montepiatto; panorama at Santa Elisabetta church." },
    geoQuery: "Pietra Pendula Montepiatto Torno",
  },
  {
    type: "viewpoint",
    name: "Chiesa di Santa Elisabetta (Montepiatto)",
    lat: 45.8712, lng: 9.1018,
    tags: ["aussicht", "kirche", "wandern"],
    access: "foot", qualityScore: 3,
    editorNotes:
      "Kleines Bergkirchlein im Weiler Montepiatto mit weitem Panoramablick auf den See – lohnendes Ziel der Rundwanderung ab Torno. [Recherchiert]",
    source: { url: "https://giteinlombardia.it/passeggiata-lungo-lanello-torno-montepiatto-e-pietra-pendula/", excerpt: "Chiesa di Santa Elisabetta a Montepiatto con magnifico panorama sul lago di Como." },
    geoQuery: "Chiesa Sant'Elisabetta Montepiatto Torno",
  },
  {
    type: "sight",
    name: "Piazza Casartelli & Imbarcadero",
    lat: 45.8664, lng: 9.1123,
    tags: ["foto", "dorf", "see"],
    access: "public", qualityScore: 4,
    editorNotes:
      "Der kleine Platz direkt am Fähranleger ist das Herz von Torno: Cafés, Steinstufen zum Wasser, Blick über den See – der klassische Foto-Spot des Dorfs. [Recherchiert]",
    source: { url: "https://www.tripadvisor.com/Restaurant_Review-g262050-d4831794-Reviews-Bar_Italia-Torno_Lake_Como_Lombardy.html", excerpt: "Piazza Casartelli am Imbarcadero (Fähranleger) von Torno – Herz des Ortes." },
    geoQuery: "Piazza Casartelli Torno",
  },
  {
    type: "sight",
    name: "Massi Avelli di Montepiatto",
    lat: 45.8695, lng: 9.1045,
    tags: ["geschichte", "natur", "wandern"],
    access: "foot", qualityScore: 3,
    editorNotes:
      "In den Fels gehauene antike Grabmäler (Massi Avelli) entlang des Rundwegs Torno–Piazzaga–Montepiatto – ein stimmungsvolles archäologisches Detail im Wald. [Recherchiert]",
    source: { url: "https://comoeilsuolago.it/anello-torno-pietrapendula.htm", excerpt: "Anello Torno–Piazzaga–Montepiatto: Trovanti, Massi Avelli (Felsgräber) und Pietra Pendula." },
    geoQuery: "Montepiatto Torno",
  },
  {
    type: "restaurant",
    name: "Albergo Ristorante Vapore",
    lat: 45.8660, lng: 9.1128,
    address: "Via Plinio 20, 22020 Torno CO",
    tags: ["kulinarik", "regional", "seefisch", "aussicht"],
    priceLevel: 3, dietaryOptions: ["vegetarian"], access: "public", qualityScore: 4,
    editorNotes:
      "Traditionshaus direkt am See neben der Kirche Santa Tecla; Terrasse mit Bootsanleger. Seefisch-Klassiker: Risotto mit Barsch (persico), Missoltini, gegrillter Lavarello, hausgemachte Pasta. Auf Tripadvisor #2 von 12 in Torno. Hinweis: nach Renovierung Wiedereröffnung im April 2026 – Öffnung prüfen. [Recherchiert]",
    source: { url: "https://www.storienogastronomiche.it/i-piatti-tradizionali-del-ristorante-vapore-a-torno-locale-sulle-rive-del-lago-di-como/", excerpt: "Ristorante Vapore am Ufer von Torno; risotto al pesce persico, missoltini, lavarello alla griglia. Tripadvisor #2/12." },
  },
  {
    type: "restaurant",
    name: "Il Sereno Al Lago",
    lat: 45.8590, lng: 9.1140,
    address: "Via Torrazza 10, 22020 Torno CO",
    tags: ["kulinarik", "gehoben", "aussicht", "aperitivo"],
    priceLevel: 4, dietaryOptions: ["vegetarian"], access: "car", qualityScore: 4,
    editorNotes:
      "Gehobene Küche im Design-Hotel Il Sereno, mit Loggia/Panorama-Terrasse über dem See. Auch für einen besonderen 'Aperitivo Gourmet' mit Signature-Cocktails. Reservierung nötig, gehobenes Preisniveau. [Recherchiert]",
    source: { url: "https://www.opentable.com/r/il-sereno-al-lago-como", excerpt: "Il Sereno Al Lago, Torno: gehobene Küche auf der Loggia über dem See; Aperitivo Gourmet mit Signature-Cocktails." },
  },
  {
    type: "bar",
    name: "Bar Italia",
    lat: 45.8664, lng: 9.1123,
    address: "Piazza Casartelli 2, 22020 Torno CO",
    tags: ["aperitivo", "bar", "cafe", "see"],
    priceLevel: 2, access: "public", qualityScore: 4,
    editorNotes:
      "Traditionelles Café/Bar direkt am Fähranleger (Piazza Casartelli). Freundlich, fair bepreist – ideal für Kaffee, Eis oder einen Aperitivo mit Blick aufs Wasser. [Recherchiert]",
    source: { url: "https://www.yelp.com/biz/bar-italia-torno", excerpt: "Bar Italia, Piazza Casartelli 2, Torno – traditionelles Café/Bar am Imbarcadero, freundlich und preiswert." },
  },
  {
    type: "restaurant",
    name: "Ristorante Pizzeria Marialia",
    lat: 45.8666, lng: 9.1120,
    tags: ["kulinarik", "pizza", "unkompliziert"],
    priceLevel: 2, dietaryOptions: ["vegetarian"], access: "public", qualityScore: 3,
    editorNotes:
      "Unkomplizierte, günstigere Option (Pizza/italienische Küche) in Torno – gut für einen entspannten Abend. [Recherchiert aus Restaurant-Portalen – bitte Adresse & Öffnungszeiten vor Ort verifizieren]",
    source: { url: "https://www.ilborghista.it/mangiare-a-torno-co-1522", excerpt: "Unter den Restaurants/Pizzerien in Torno gelistet (u. a. Ristorante Pizzeria Marialia)." },
    geoQuery: "Ristorante Pizzeria Marialia Torno",
  },
];

type SeedHike = {
  name: string;
  startLat: number;
  startLng: number;
  startDescription: string;
  distanceKm: number;
  durationMin: number;
  elevationGainM: number;
  difficulty: Difficulty;
  childFriendly: boolean;
  tags: string[];
  externalUrl: string;
  descriptionNotes: string;
  source: { url: string; excerpt: string };
};

const hikes: SeedHike[] = [
  {
    name: "Anello Torno – Montepiatto – Pietra Pendula",
    startLat: 45.8664, startLng: 9.1123,
    startDescription: "Ortskern Torno, an der Kirche San Giovanni die Steinstufen (gradoni) bergauf Richtung Montepiatto",
    distanceKm: 6.35, durationMin: 150, elevationGainM: 300, difficulty: "medium", childFriendly: true,
    tags: ["panorama", "natur", "geschichte", "foto"],
    externalUrl: "https://www.komoot.com/it-it/smarttour/1132524",
    descriptionNotes:
      "Beliebte Rundwanderung ab Torno über Steinstufen zu den Bergweilern Piazzaga und Montepiatto: unterwegs die antiken Felsgräber (Massi Avelli), der pilzförmige Balancierfelsen Pietra Pendula und das Kirchlein Santa Elisabetta mit weitem Seeblick. Kürzere Variante ~6,35 km / 2,5 Std / 300 Hm; großer Anello bis ~4,5 Std / 400 Hm. [Recherchiert]",
    source: { url: "https://comocity.it/montepiatto-pietra-pendula-torno/", excerpt: "Anello Torno–Montepiatto–Pietra Pendula: ~6,35 km, ~2h25, ~300 m Höhenmeter (großer Anello ~4h30, ~400 m)." },
  },
];

/** Geocodiert per Nominatim mit Fallback auf die hinterlegten Näherungswerte. */
async function coordsFor(query: string, fallback: { lat: number; lng: number }) {
  try {
    const hit = await geocodePlace({
      label: query,
      regionName: "Comer See",
      country: "Italien",
      centerLat: 45.87,
      centerLng: 9.11,
    });
    // Nominatim-Politeness: min. 1 Anfrage/Sekunde
    await new Promise((r) => setTimeout(r, 1200));
    return hit ?? fallback;
  } catch {
    return fallback;
  }
}

async function main() {
  const region = await prisma.region.findUnique({ where: { slug: REGION_SLUG } });
  if (!region) {
    throw new Error(
      `Region "${REGION_SLUG}" nicht gefunden. Zuerst das Basis-Seed ausführen (npm run db:seed).`
    );
  }

  let created = 0;
  let skipped = 0;

  for (const p of places) {
    const existing = await prisma.place.findFirst({
      where: { name: p.name, regionId: region.id },
    });
    if (existing) {
      skipped += 1;
      continue;
    }
    const coords = await coordsFor(p.geoQuery ?? `${p.name}, ${LOCALITY}`, { lat: p.lat, lng: p.lng });
    const place = await prisma.place.create({
      data: {
        regionId: region.id,
        type: p.type,
        name: p.name,
        locality: LOCALITY,
        lat: coords.lat,
        lng: coords.lng,
        address: p.address ?? "",
        tags: p.tags,
        priceLevel: p.priceLevel ?? null,
        childFriendly: p.childFriendly ?? true,
        access: p.access ?? "foot",
        dietaryOptions: p.dietaryOptions ?? [],
        editorNotes: p.editorNotes,
        qualityScore: p.qualityScore ?? 3,
        status: "verified",
        lastVerifiedAt: new Date(),
      },
    });
    await prisma.source.create({
      data: {
        placeId: place.id,
        url: p.source.url,
        sourceType: "blog",
        excerpt: p.source.excerpt.slice(0, 500),
      },
    });
    created += 1;
    console.log(`+ Ort: ${p.name}`);
  }

  for (const h of hikes) {
    const existing = await prisma.hike.findFirst({
      where: { name: h.name, regionId: region.id },
    });
    if (existing) {
      skipped += 1;
      continue;
    }
    const { source, ...hikeData } = h;
    const hike = await prisma.hike.create({
      data: {
        regionId: region.id,
        locality: LOCALITY,
        ...hikeData,
        status: "verified",
        lastVerifiedAt: new Date(),
      },
    });
    await prisma.source.create({
      data: {
        hikeId: hike.id,
        url: source.url,
        sourceType: "blog",
        excerpt: source.excerpt.slice(0, 500),
      },
    });
    created += 1;
    console.log(`+ Wanderung: ${h.name}`);
  }

  console.log(`\nTorno-Seed abgeschlossen: ${created} neu angelegt, ${skipped} bereits vorhanden (übersprungen).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
