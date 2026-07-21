import "dotenv/config";
import { PrismaClient, type PlaceType, type Access, type Difficulty } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Startdaten Comer See – bewusst umfangreich, damit der Guide ein echtes
 * Buch-Gefühl bekommt (Ort-Kapitel mit festen Unterabschnitten).
 *
 * WICHTIG: Beschreibungen basieren auf allgemein bekanntem Reisewissen und
 * dienen der KI als Kontext (sie formuliert eigenständig). Konkrete,
 * veränderliche Fakten (Preise, Öffnungszeiten) sind bewusst vage gehalten
 * bzw. mit "vor Launch prüfen" markiert und im Admin editierbar.
 */

type SeedPlace = {
  type: PlaceType;
  name: string;
  locality: string;
  lat: number;
  lng: number;
  address?: string;
  tags: string[];
  priceLevel?: number;
  openingNotes?: string;
  childFriendly?: boolean;
  access?: Access;
  dietaryOptions?: string[];
  editorNotes?: string;
  qualityScore?: number;
};

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
        "Der Comer See in der Lombardei: Dörfer am Wasser, Villen und Gärten, Bergpanoramen und eine bodenständige, gute Küche.",
    },
  });

  const places: SeedPlace[] = [
    // ---------------- COMO ----------------
    { type: "village", name: "Como (Altstadt)", locality: "Como", lat: 45.8081, lng: 9.0852, tags: ["dorf", "altstadt", "kultur", "shopping"], access: "public", qualityScore: 5, editorNotes: "Lebhafte Stadt am Südzipfel, römischer Grundriss, Seidentradition, gute Zug- und Fährverbindungen. Idealer Startpunkt." },
    { type: "sight", name: "Duomo di Como", locality: "Como", lat: 45.8114, lng: 9.0832, address: "Piazza del Duomo, Como", tags: ["kirche", "kultur", "geschichte", "altstadt"], access: "public", qualityScore: 5, editorNotes: "Marmordom, Baubeginn 1396, mischt Gotik und Renaissance. Eintritt frei, Kuppelbesteigung möglich." },
    { type: "sight", name: "Basilica di Sant'Abbondio", locality: "Como", lat: 45.8069, lng: 9.0770, tags: ["kirche", "geschichte", "ruhig"], access: "foot", qualityScore: 4, editorNotes: "Romanische Basilika aus dem 11. Jh. mit bedeutenden Fresken, meist ruhig." },
    { type: "viewpoint", name: "Brunate (Standseilbahn)", locality: "Como", lat: 45.8194, lng: 9.0959, tags: ["aussicht", "panorama", "foto"], openingNotes: "Funicolare ca. alle 15-30 Min; vor Launch prüfen", access: "public", qualityScore: 5, editorNotes: "Standseilbahn ab Como (seit 1894), oben Faro Voltiano (Leuchtturm) mit Weitblick über See und Alpen." },
    { type: "beach", name: "Lido di Villa Olmo", locality: "Como", lat: 45.8175, lng: 9.0680, tags: ["baden", "lido"], priceLevel: 2, openingNotes: "Saison Mai-September; vor Launch prüfen", childFriendly: true, access: "public", qualityScore: 3, editorNotes: "Städtisches Freibad am See mit Pool und Liegewiese, familientauglich." },
    { type: "restaurant", name: "Trattoria im Zentrum (Beispiel)", locality: "Como", lat: 45.8090, lng: 9.0840, address: "Como Centro", tags: ["kulinarik", "regional"], priceLevel: 2, dietaryOptions: ["vegetarian"], access: "public", qualityScore: 3, editorNotes: "Platzhalter – lokale Trattoria mit lombardischer Küche (Risotto, Pizzoccheri). Vor Launch verifizieren." },
    { type: "restaurant", name: "Seeblick-Osteria (Beispiel)", locality: "Como", lat: 45.8100, lng: 9.0830, tags: ["kulinarik", "gehoben"], priceLevel: 4, dietaryOptions: ["vegetarian", "glutenfree"], access: "public", qualityScore: 3, editorNotes: "Platzhalter – gehobene Küche. Vor Launch verifizieren." },
    { type: "bar", name: "Aperitivo an der Piazza (Beispiel)", locality: "Como", lat: 45.8095, lng: 9.0845, tags: ["aperitivo", "bar"], priceLevel: 2, access: "public", qualityScore: 3, editorNotes: "Platzhalter – Aperitivo-Bar. Vor Launch verifizieren." },
    { type: "hotel", name: "Stadthotel am See (Beispiel)", locality: "Como", lat: 45.8110, lng: 9.0790, tags: ["unterkunft", "zentral"], priceLevel: 3, access: "public", qualityScore: 3, editorNotes: "Platzhalter – zentrale Unterkunft mit Seenähe. Vor Launch verifizieren." },
    { type: "hotel", name: "Pension in der Altstadt (Beispiel)", locality: "Como", lat: 45.8085, lng: 9.0855, tags: ["unterkunft", "guenstig"], priceLevel: 2, access: "public", qualityScore: 3, editorNotes: "Platzhalter – einfachere Unterkunft. Vor Launch verifizieren." },
    { type: "event", name: "Como Città dei Balocchi (Winter)", locality: "Como", lat: 45.8081, lng: 9.0852, tags: ["veranstaltung", "winter", "familie"], openingNotes: "Advent/Weihnachtszeit; Termine jährlich prüfen", access: "public", qualityScore: 4, editorNotes: "Winterliches Lichterfest mit Projektionen auf die Fassaden rund um die Piazza Duomo." },
    { type: "practical", name: "Bahnhof Como San Giovanni", locality: "Como", lat: 45.8085, lng: 9.0730, tags: ["anreise", "zug"], access: "public", qualityScore: 4, editorNotes: "Anschluss aus Mailand/Schweiz; von hier Fähren und Busse. Como Nord Lago liegt näher am See." },

    // ---------------- BELLAGIO ----------------
    { type: "village", name: "Bellagio", locality: "Bellagio", lat: 45.9863, lng: 9.2618, tags: ["dorf", "altstadt", "foto", "romantisch"], access: "public", qualityScore: 5, editorNotes: "\"Perle des Sees\" an der Spitze der Halbinsel; steile Gassen, Treppen, Seepromenade. Sehr beliebt – früh morgens am schönsten." },
    { type: "sight", name: "Villa Melzi (Gärten)", locality: "Bellagio", lat: 45.9790, lng: 9.2560, tags: ["villa", "garten", "kultur"], openingNotes: "Saisonal, Eintritt; vor Launch prüfen", access: "foot", qualityScore: 5, editorNotes: "Englischer Landschaftsgarten am Wasser mit Statuen und altem Baumbestand, ruhiger als der Ort selbst." },
    { type: "viewpoint", name: "Punta Spartivento", locality: "Bellagio", lat: 45.9905, lng: 9.2610, tags: ["aussicht", "panorama", "foto"], access: "foot", qualityScore: 5, editorNotes: "Nordspitze, wo sich der See teilt – Rundblick auf beide Seearme und die Berge. 15 Min zu Fuß vom Ort." },
    { type: "restaurant", name: "Ristorante am Hafen (Beispiel)", locality: "Bellagio", lat: 45.9860, lng: 9.2625, tags: ["kulinarik", "regional", "seefisch"], priceLevel: 4, dietaryOptions: ["vegetarian"], access: "public", qualityScore: 3, editorNotes: "Platzhalter – Seefisch (Lavarello, Missoltini). Vor Launch verifizieren." },
    { type: "restaurant", name: "Trattoria in der Gasse (Beispiel)", locality: "Bellagio", lat: 45.9868, lng: 9.2615, tags: ["kulinarik", "unkompliziert"], priceLevel: 2, dietaryOptions: ["vegetarian", "vegan"], childFriendly: true, access: "foot", qualityScore: 3, editorNotes: "Platzhalter. Vor Launch verifizieren." },
    { type: "bar", name: "Aperitivo mit Seeblick (Beispiel)", locality: "Bellagio", lat: 45.9858, lng: 9.2628, tags: ["aperitivo", "bar"], priceLevel: 3, access: "public", qualityScore: 3, editorNotes: "Platzhalter. Vor Launch verifizieren." },
    { type: "hotel", name: "Grandhotel am Wasser (Beispiel)", locality: "Bellagio", lat: 45.9850, lng: 9.2630, tags: ["unterkunft", "luxus"], priceLevel: 4, access: "public", qualityScore: 3, editorNotes: "Platzhalter – gehobenes Haus. Vor Launch verifizieren." },
    { type: "hotel", name: "B&B über dem See (Beispiel)", locality: "Bellagio", lat: 45.9872, lng: 9.2600, tags: ["unterkunft", "mittelklasse"], priceLevel: 3, access: "foot", qualityScore: 3, editorNotes: "Platzhalter. Vor Launch verifizieren." },
    { type: "event", name: "Sagra San Giovanni (Juni)", locality: "Bellagio", lat: 45.9863, lng: 9.2618, tags: ["veranstaltung", "sommer", "fest"], openingNotes: "Ende Juni; Termine jährlich prüfen", access: "public", qualityScore: 3, editorNotes: "Traditionelles Fest im Ortsteil San Giovanni mit beleuchtetem See und Feuerwerk." },
    { type: "practical", name: "Fähranleger Bellagio", locality: "Bellagio", lat: 45.9868, lng: 9.2610, tags: ["faehre", "oepnv"], access: "public", qualityScore: 4, editorNotes: "Zentraler Knoten; häufige Verbindungen im Dreieck Bellagio-Varenna-Menaggio, auch Autofähre." },

    // ---------------- VARENNA ----------------
    { type: "village", name: "Varenna", locality: "Varenna", lat: 46.0106, lng: 9.2833, tags: ["dorf", "altstadt", "foto", "ruhig"], access: "public", qualityScore: 5, editorNotes: "Ruhigeres, besonders malerisches Fischerdorf am Ostufer; direkter Bahnanschluss (Linie Lecco-Tirano)." },
    { type: "sight", name: "Passeggiata degli Innamorati", locality: "Varenna", lat: 46.0100, lng: 9.2840, tags: ["promenade", "romantisch", "foto"], access: "foot", qualityScore: 5, editorNotes: "\"Weg der Verliebten\" – schmaler Uferpfad auf Stelzen, verbindet Fähranleger und Ortskern." },
    { type: "sight", name: "Villa Monastero (Garten)", locality: "Varenna", lat: 46.0075, lng: 9.2870, tags: ["villa", "garten", "kultur"], openingNotes: "Saisonal, Eintritt; vor Launch prüfen", access: "foot", qualityScore: 5, editorNotes: "Ehemaliges Kloster mit 2 km langem botanischem Ufergarten." },
    { type: "sight", name: "Castello di Vezio", locality: "Varenna", lat: 46.0140, lng: 9.2930, tags: ["burg", "aussicht", "geschichte", "panorama"], openingNotes: "Saisonal; vor Launch prüfen", access: "foot", qualityScore: 4, editorNotes: "Mittelalterliche Burg über Varenna mit Falknerei und Weitblick; kurzer Aufstieg." },
    { type: "restaurant", name: "Osteria am Wasser (Beispiel)", locality: "Varenna", lat: 46.0108, lng: 9.2838, tags: ["kulinarik", "regional", "seefisch"], priceLevel: 2, dietaryOptions: ["vegetarian"], access: "public", qualityScore: 3, editorNotes: "Platzhalter – Missoltini (getrocknete Seesardellen). Vor Launch verifizieren." },
    { type: "restaurant", name: "Familienlokal (Beispiel)", locality: "Varenna", lat: 46.0104, lng: 9.2830, tags: ["kulinarik", "unkompliziert"], priceLevel: 2, dietaryOptions: ["vegetarian", "glutenfree"], childFriendly: true, access: "foot", qualityScore: 3, editorNotes: "Platzhalter. Vor Launch verifizieren." },
    { type: "bar", name: "Weinbar am Hafen (Beispiel)", locality: "Varenna", lat: 46.0110, lng: 9.2836, tags: ["aperitivo", "bar", "wein"], priceLevel: 2, access: "foot", qualityScore: 3, editorNotes: "Platzhalter. Vor Launch verifizieren." },
    { type: "hotel", name: "Hotel an der Promenade (Beispiel)", locality: "Varenna", lat: 46.0102, lng: 9.2842, tags: ["unterkunft", "mittelklasse"], priceLevel: 3, access: "public", qualityScore: 3, editorNotes: "Platzhalter. Vor Launch verifizieren." },
    { type: "hotel", name: "Zimmer bei Familie (Beispiel)", locality: "Varenna", lat: 46.0115, lng: 9.2825, tags: ["unterkunft", "guenstig"], priceLevel: 2, access: "foot", qualityScore: 3, editorNotes: "Platzhalter. Vor Launch verifizieren." },
    { type: "practical", name: "Bahnhof & Parken Varenna", locality: "Varenna", lat: 46.0099, lng: 9.2851, tags: ["parken", "zug", "anreise"], access: "car", qualityScore: 4, editorNotes: "Wenige Parkplätze am Bahnhof und Ufer; früh kommen oder mit dem Zug anreisen." },

    // ---------------- MENAGGIO ----------------
    { type: "village", name: "Menaggio", locality: "Menaggio", lat: 46.0221, lng: 9.2385, tags: ["dorf", "markt", "sport"], access: "public", qualityScore: 4, editorNotes: "Lebendiger Ort am Westufer mit Seepromenade, guter Ausgangspunkt für Wanderungen und Ausflüge in die Schweiz (Lugano)." },
    { type: "beach", name: "Lido di Menaggio", locality: "Menaggio", lat: 46.0195, lng: 9.2343, tags: ["baden", "lido", "strand"], priceLevel: 2, openingNotes: "Saison; vor Launch prüfen", childFriendly: true, access: "public", qualityScore: 4, editorNotes: "Freibad mit Pool, Rutsche und Seezugang – gut für Familien." },
    { type: "restaurant", name: "Ristorante am Platz (Beispiel)", locality: "Menaggio", lat: 46.0220, lng: 9.2390, tags: ["kulinarik", "regional"], priceLevel: 2, dietaryOptions: ["vegetarian", "vegan"], childFriendly: true, access: "public", qualityScore: 3, editorNotes: "Platzhalter. Vor Launch verifizieren." },
    { type: "bar", name: "Eisdiele & Bar am See (Beispiel)", locality: "Menaggio", lat: 46.0218, lng: 9.2380, tags: ["bar", "familie", "eis"], priceLevel: 1, childFriendly: true, access: "public", qualityScore: 3, editorNotes: "Platzhalter. Vor Launch verifizieren." },
    { type: "hotel", name: "Seehotel Menaggio (Beispiel)", locality: "Menaggio", lat: 46.0225, lng: 9.2388, tags: ["unterkunft", "mittelklasse"], priceLevel: 3, access: "public", qualityScore: 3, editorNotes: "Platzhalter. Vor Launch verifizieren." },
    { type: "hotel", name: "Jugendherberge Menaggio (Beispiel)", locality: "Menaggio", lat: 46.0230, lng: 9.2375, tags: ["unterkunft", "guenstig", "familie"], priceLevel: 1, access: "public", qualityScore: 3, editorNotes: "Platzhalter – günstig, familientauglich. Vor Launch verifizieren." },
    { type: "practical", name: "Fähre & Bus Menaggio", locality: "Menaggio", lat: 46.0219, lng: 9.2378, tags: ["faehre", "oepnv", "bus"], access: "public", qualityScore: 4, editorNotes: "Autofähre nach Varenna/Bellagio; Busse Richtung Como und Lugano." },

    // ---------------- TREMEZZINA (Lenno/Tremezzo) ----------------
    { type: "village", name: "Tremezzina (Lenno & Tremezzo)", locality: "Tremezzina", lat: 45.9750, lng: 9.2200, tags: ["dorf", "villa", "garten"], access: "car", qualityScore: 4, editorNotes: "Gemeinde am Westufer mit den berühmtesten Villen der Region und der Bucht von Lenno." },
    { type: "sight", name: "Villa del Balbianello", locality: "Tremezzina", lat: 45.9636, lng: 9.2033, address: "Via Comoedia 5, Lenno", tags: ["villa", "garten", "kultur", "foto"], openingNotes: "Di & Mi oft geschlossen; vor Launch prüfen", access: "foot", qualityScore: 5, editorNotes: "Filmkulisse (Star Wars, James Bond); Zugang zu Fuß über Panoramaweg oder per Taxiboot." },
    { type: "sight", name: "Villa Carlotta", locality: "Tremezzina", lat: 45.9855, lng: 9.2295, address: "Via Regina 2, Tremezzo", tags: ["villa", "garten", "kultur"], openingNotes: "Saisonal, i. d. R. tgl.; vor Launch prüfen", access: "public", qualityScore: 5, editorNotes: "Botanischer Garten mit Azaleen/Rhododendren (Blüte April/Mai), Kunstsammlung im Palast." },
    { type: "beach", name: "Lido di Lenno", locality: "Tremezzina", lat: 45.9583, lng: 9.2094, tags: ["baden", "lido", "strand"], priceLevel: 2, openingNotes: "Saison Mai-September; vor Launch prüfen", childFriendly: true, access: "car", qualityScore: 4, editorNotes: "Kiesstrand in der Bucht von Lenno, Blick Richtung Balbianello, Bar/Restaurant." },
    { type: "restaurant", name: "Trattoria in Lenno (Beispiel)", locality: "Tremezzina", lat: 45.9700, lng: 9.2130, tags: ["kulinarik", "regional"], priceLevel: 2, dietaryOptions: ["vegetarian"], access: "car", qualityScore: 3, editorNotes: "Platzhalter. Vor Launch verifizieren." },
    { type: "hotel", name: "Villa-Hotel Tremezzo (Beispiel)", locality: "Tremezzina", lat: 45.9800, lng: 9.2270, tags: ["unterkunft", "luxus"], priceLevel: 4, access: "public", qualityScore: 3, editorNotes: "Platzhalter – historisches Grandhotel. Vor Launch verifizieren." },
    { type: "hotel", name: "Agriturismo über Lenno (Beispiel)", locality: "Tremezzina", lat: 45.9660, lng: 9.2180, tags: ["unterkunft", "natur", "familie"], priceLevel: 2, access: "car", qualityScore: 3, editorNotes: "Platzhalter – ländlich, ruhig. Vor Launch verifizieren." },

    // ---------------- NESSO ----------------
    { type: "village", name: "Nesso", locality: "Nesso", lat: 45.9106, lng: 9.1571, tags: ["dorf", "foto", "ruhig", "geheimtipp"], access: "car", qualityScore: 4, editorNotes: "Steiles Dörfchen am Ostufer, bekannt für den Orrido – eine Schlucht mit Wasserfall mitten im Ort." },
    { type: "sight", name: "Orrido di Nesso", locality: "Nesso", lat: 45.9100, lng: 9.1580, tags: ["natur", "wasserfall", "foto"], access: "foot", qualityScore: 5, editorNotes: "Wasserfall in einer engen Schlucht, überspannt von der alten Bogenbrücke Ponte della Civera. Viele Treppen." },
    { type: "restaurant", name: "Lokal am Wasserfall (Beispiel)", locality: "Nesso", lat: 45.9108, lng: 9.1575, tags: ["kulinarik", "regional", "aussicht"], priceLevel: 2, dietaryOptions: ["vegetarian"], access: "car", qualityScore: 3, editorNotes: "Platzhalter. Vor Launch verifizieren." },

    // ---------------- REGIONSWEIT (Praktisches) ----------------
    { type: "practical", name: "Fähren auf dem Comer See (Navigazione Laghi)", locality: "", lat: 45.9863, lng: 9.2578, tags: ["faehre", "oepnv"], access: "public", qualityScore: 5, editorNotes: "Navigazione Laghi verbindet die Orte; Zentraldreieck Bellagio-Varenna-Menaggio mit häufigen Kurs- und Autofähren. Tages- und Einzeltickets, teils online." },
    { type: "practical", name: "Anreise mit dem Zug", locality: "", lat: 45.8085, lng: 9.0730, tags: ["zug", "anreise", "oepnv"], access: "public", qualityScore: 4, editorNotes: "Von Mailand nach Como (Linie S/Trenord) oder direkt nach Varenna (Linie Lecco-Tirano). Umweltfreundlich und staufrei." },
    { type: "practical", name: "Mit dem Auto & Parken", locality: "", lat: 46.0, lng: 9.26, tags: ["auto", "parken", "anreise"], access: "car", qualityScore: 3, editorNotes: "Uferstraßen sind eng und im Sommer voll; Parkplätze in den Orten knapp und kostenpflichtig. Auto in Unterkunftsnähe abstellen und mit Fähre/Zug weiter." },
    { type: "practical", name: "Bus & Regionalverkehr", locality: "", lat: 46.0, lng: 9.24, tags: ["bus", "oepnv"], access: "public", qualityScore: 3, editorNotes: "ASF-Autolinee-Busse entlang der Ufer (z. B. C10 Como-Menaggio-Colico); Fahrpläne saisonabhängig." },
  ];

  for (const p of places) {
    const existing = await prisma.place.findFirst({ where: { name: p.name, regionId: region.id } });
    if (existing) continue;
    await prisma.place.create({
      data: {
        regionId: region.id,
        type: p.type,
        name: p.name,
        locality: p.locality,
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

  const hikes: Array<{
    name: string;
    locality: string;
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
  }> = [
    {
      name: "Greenway del Lago di Como", locality: "Tremezzina",
      startLat: 45.9403, startLng: 9.1893, startDescription: "Colonno, Ortseingang (Bus C10 ab Como)",
      distanceKm: 10.5, durationMin: 210, elevationGainM: 250, difficulty: "easy", childFriendly: true,
      tags: ["panorama", "doerfer", "leicht"],
      externalUrl: "https://www.google.com/maps/search/?api=1&query=Greenway+del+Lago+di+Como+Colonno",
      descriptionNotes: "Alter Maultierpfad oberhalb des Westufers durch Dörfer und Olivenhaine; viele Einkehr- und Abkürzungsmöglichkeiten per Bus.",
    },
    {
      name: "Sentiero del Viandante: Varenna–Bellano", locality: "Varenna",
      startLat: 46.0106, startLng: 9.2833, startDescription: "Bahnhof Varenna-Esino",
      distanceKm: 6.5, durationMin: 150, elevationGainM: 300, difficulty: "medium", childFriendly: true,
      tags: ["panorama", "geschichte"],
      externalUrl: "https://www.google.com/maps/search/?api=1&query=Sentiero+del+Viandante+Varenna",
      descriptionNotes: "Historischer Weitwanderweg am Ostufer; Rückfahrt bequem mit dem Zug.",
    },
    {
      name: "Wanderung zur Villa del Balbianello", locality: "Tremezzina",
      startLat: 45.9600, startLng: 9.2100, startDescription: "Lido di Lenno, Parkplatz",
      distanceKm: 2.5, durationMin: 60, elevationGainM: 90, difficulty: "easy", childFriendly: true,
      tags: ["villa", "leicht", "foto", "familie"],
      externalUrl: "https://www.google.com/maps/search/?api=1&query=Villa+del+Balbianello+Lenno",
      descriptionNotes: "Kurzer Panoramaweg von Lenno zur Villa; Alternative zum Taxiboot.",
    },
    {
      name: "Monte Grona ab Breglia", locality: "Menaggio",
      startLat: 46.0555, startLng: 9.2497, startDescription: "Parkplatz Breglia (oberhalb Menaggio)",
      distanceKm: 9, durationMin: 300, elevationGainM: 900, difficulty: "hard", childFriendly: false,
      tags: ["gipfel", "panorama", "berge"],
      externalUrl: "https://www.google.com/maps/search/?api=1&query=Monte+Grona+Breglia",
      descriptionNotes: "Anspruchsvolle Gipfeltour mit Blick über beide Seearme; Einkehr Rifugio Menaggio.",
    },
    {
      name: "Wallfahrtsweg zur Madonna del Ghisallo", locality: "Bellagio",
      startLat: 45.9430, startLng: 9.2560, startDescription: "Civenna / Passo del Ghisallo",
      distanceKm: 7, durationMin: 180, elevationGainM: 400, difficulty: "medium", childFriendly: false,
      tags: ["panorama", "kultur", "rad"],
      externalUrl: "https://www.google.com/maps/search/?api=1&query=Madonna+del+Ghisallo",
      descriptionNotes: "Zur Radsport-Wallfahrtskirche über Bellagio; Kapelle ist Schutzpatronin der Radfahrer, kleines Radmuseum.",
    },
  ];

  for (const h of hikes) {
    const existing = await prisma.hike.findFirst({ where: { name: h.name, regionId: region.id } });
    if (existing) continue;
    await prisma.hike.create({
      data: { regionId: region.id, ...h, status: "verified", lastVerifiedAt: new Date() },
    });
  }

  // ---------------- "Die Region verstehen" ----------------
  const infos: Array<{ title: string; content: string; format: "prose" | "table" | "timeline"; sortOrder: number }> = [
    {
      title: "Der Comer See auf einen Blick",
      format: "prose",
      sortOrder: 5,
      content:
        "Der Comer See (ital. Lago di Como, lokal Lario) liegt in der Lombardei, rund 50 km nördlich von Mailand am Fuß der Alpen. Mit bis zu 410 m ist er einer der tiefsten Seen Europas. Seine markante umgekehrte Y-Form teilt ihn in drei Arme, die sich an der Halbinsel von Bellagio treffen. Rund um den See reihen sich historische Villen, subtropische Gärten, Fischerdörfer und steile Berghänge.",
    },
    {
      title: "Geschichte des Comer Sees",
      format: "timeline",
      sortOrder: 10,
      content: [
        "vor 15.000 J. | Gletscher der Eiszeit formen das tiefe, verzweigte Seebecken. | Der See ist stellenweise tiefer als der Meeresspiegel – sein Grund liegt unter Null.",
        "196 v. Chr. | Rom erobert die Region; aus der Keltensiedlung wird das römische Comum. |",
        "59 v. Chr. | Julius Cäsar siedelt 5.000 Kolonisten an und gründet Novum Comum. |",
        "1. Jh. n. Chr. | Plinius der Ältere und der Jüngere stammen aus Como; Plinius d. J. besitzt mehrere Seevillen. | Er nannte zwei davon scherzhaft \"Tragödie\" (hoch gelegen) und \"Komödie\" (am Ufer).",
        "12. Jh. | Como unterliegt im Zehnjährigen Krieg dem mächtigen Mailand. |",
        "1335 | Die Visconti aus Mailand übernehmen die Herrschaft. |",
        "16.-17. Jh. | Unter spanischer Herrschaft; Festungen und Seehandel prägen die Region. |",
        "18. Jh. | Blütezeit der Seidenweberei in Como – bis heute ein Markenzeichen. | Comer Seide kleidete europäische Königshäuser und beliefert noch immer Luxus-Modehäuser.",
        "1787 | Der Physiker Alessandro Volta, geboren in Como, erforscht die Elektrizität. | Nach ihm ist die Einheit \"Volt\" benannt; der Leuchtturm über Brunate heißt Faro Voltiano.",
        "1818 | Percy und Mary Shelley besuchen den See; die Romantik entdeckt den Lario. |",
        "19. Jh. | Europäischer Hochadel baut und schmückt die berühmten Villengärten (Carlotta, Melzi, Serbelloni). |",
        "1901 | Die Standseilbahn Como–Brunate wird eröffnet. |",
        "2. H. 20. Jh. | Der See wird internationales Reiseziel für Prominenz und Filmschaffende. | Szenen aus Star Wars (Episode II) und James Bond (Casino Royale) entstanden an der Villa del Balbianello.",
        "2000er | George Clooney kauft die Villa Oleandra in Laglio – der See wird endgültig weltberühmt. | Angeblich lässt Clooney Gäste per Boot ankommen, weil die Uferstraße zu eng ist.",
        "Heute | Ganzjahresziel mit Gärten, Wassersport, Wanderwegen und einer lebendigen Küche. |",
      ].join("\n"),
    },
    {
      title: "Sprachführer: Begrüßung & Verabschiedung",
      format: "table",
      sortOrder: 20,
      content: [
        "Buongiorno | Guten Morgen / Guten Tag",
        "Buon pomeriggio | Guten Nachmittag",
        "Buonasera | Guten Abend",
        "Buonanotte | Gute Nacht",
        "Ciao | Hallo / Tschüss (locker)",
        "Salve | Hallo (etwas förmlicher, neutral)",
        "Arrivederci | Auf Wiedersehen",
        "A presto | Bis bald",
        "A domani | Bis morgen",
        "A dopo | Bis später",
        "Come sta? | Wie geht es Ihnen? (förmlich)",
        "Come stai? | Wie geht es dir? (locker)",
        "Bene, grazie | Gut, danke",
        "Piacere | Freut mich (beim Kennenlernen)",
        "Mi chiamo ... | Ich heiße ...",
        "Come si chiama? | Wie heißen Sie?",
        "Sì / No | Ja / Nein",
        "Grazie (mille) | Danke (vielmals)",
        "Prego | Bitte (gern geschehen) / Bitte sehr",
        "Per favore | Bitte (um etwas bitten)",
        "Scusi | Entschuldigung (förmlich)",
        "Scusa | Entschuldigung (locker)",
        "Mi dispiace | Es tut mir leid",
        "Non c'è problema | Kein Problem",
        "Non parlo italiano | Ich spreche kein Italienisch",
        "Parla tedesco / inglese? | Sprechen Sie Deutsch / Englisch?",
        "Non capisco | Ich verstehe nicht",
        "Può ripetere, per favore? | Können Sie das bitte wiederholen?",
      ].join("\n"),
    },
    {
      title: "Sprachführer: Im Restaurant & in der Bar",
      format: "table",
      sortOrder: 21,
      content: [
        "Un tavolo per due, per favore | Einen Tisch für zwei, bitte",
        "Abbiamo prenotato | Wir haben reserviert",
        "Il menù, per favore | Die Speisekarte, bitte",
        "Cosa consiglia? | Was empfehlen Sie?",
        "La specialità della casa | Die Spezialität des Hauses",
        "Vorrei ... | Ich hätte gern ...",
        "Per me ... | Für mich ...",
        "Un caffè, per favore | Einen Espresso, bitte",
        "Un cappuccino | Ein Cappuccino",
        "Acqua naturale / frizzante | Stilles / sprudelndes Wasser",
        "Un bicchiere di vino rosso / bianco | Ein Glas Rotwein / Weißwein",
        "Una birra alla spina | Ein Bier vom Fass",
        "Uno spritz | Ein Spritz (Aperitivo)",
        "Il coperto | Das Gedeck (Tischgebühr auf der Rechnung)",
        "Buon appetito! | Guten Appetit!",
        "Cin cin! | Prost!",
        "È buonissimo | Das ist sehr lecker",
        "Sono vegetariano/a | Ich bin Vegetarier(in)",
        "Sono vegano/a | Ich bin Veganer(in)",
        "Ho un'allergia a ... | Ich habe eine Allergie gegen ...",
        "Senza glutine | Glutenfrei",
        "Il conto, per favore | Die Rechnung, bitte",
        "Possiamo pagare con carta? | Können wir mit Karte zahlen?",
        "Va bene così | Stimmt so (Rest als Trinkgeld)",
        "Dov'è il bagno? | Wo ist die Toilette?",
      ].join("\n"),
    },
    {
      title: "Sprachführer: Im Hotel",
      format: "table",
      sortOrder: 22,
      content: [
        "Ho una prenotazione | Ich habe eine Reservierung",
        "Avete camere libere? | Haben Sie freie Zimmer?",
        "Una camera singola / doppia | Ein Einzel- / Doppelzimmer",
        "Per quante notti? | Für wie viele Nächte?",
        "Per tre notti | Für drei Nächte",
        "Quanto costa a notte? | Was kostet es pro Nacht?",
        "La colazione è inclusa? | Ist das Frühstück inbegriffen?",
        "A che ora è la colazione? | Wann gibt es Frühstück?",
        "La chiave, per favore | Den Schlüssel, bitte",
        "Il wi-fi | Das WLAN",
        "Qual è la password del wi-fi? | Wie lautet das WLAN-Passwort?",
        "L'aria condizionata | Die Klimaanlage",
        "Non funziona | Es funktioniert nicht",
        "Avete un parcheggio? | Haben Sie einen Parkplatz?",
        "Posso lasciare i bagagli? | Kann ich das Gepäck dalassen?",
        "A che ora è il check-out? | Wann ist der Check-out?",
        "Vorrei fare il check-out | Ich möchte auschecken",
        "C'è vista lago? | Gibt es Seeblick?",
        "Un asciugamano in più, per favore | Ein zusätzliches Handtuch, bitte",
        "Potete chiamarmi un taxi? | Können Sie mir ein Taxi rufen?",
      ].join("\n"),
    },
    {
      title: "Sprachführer: Verkehr & unterwegs",
      format: "table",
      sortOrder: 23,
      content: [
        "Il traghetto | Die Fähre",
        "L'aliscafo | Das Tragflügelboot (Schnellfähre)",
        "Il battello | Das Kursschiff",
        "Il molo / l'imbarcadero | Der Anleger / die Schiffsanlegestelle",
        "Un biglietto per Bellagio | Eine Fahrkarte nach Bellagio",
        "Andata e ritorno | Hin- und Rückfahrt",
        "Solo andata | Nur Hinfahrt",
        "A che ora parte? | Wann fährt es ab?",
        "A che ora arriva? | Wann kommt es an?",
        "Da quale molo parte? | Von welchem Anleger fährt es?",
        "È in ritardo? | Hat es Verspätung?",
        "La stazione | Der Bahnhof",
        "Il treno per Milano | Der Zug nach Mailand",
        "Il binario | Das Gleis",
        "L'autobus | Der Bus",
        "La fermata | Die Haltestelle",
        "Dov'è ...? | Wo ist ...?",
        "Come arrivo a ...? | Wie komme ich nach ...?",
        "È lontano? | Ist es weit?",
        "A sinistra / a destra | Links / rechts",
        "Sempre dritto | Immer geradeaus",
        "Il parcheggio | Der Parkplatz",
        "Dove posso parcheggiare? | Wo kann ich parken?",
        "Il distributore di benzina | Die Tankstelle",
        "Un taxi, per favore | Ein Taxi, bitte",
      ].join("\n"),
    },
    {
      title: "Sprachführer: Weiteres (Einkauf, Notfall, Zahlen)",
      format: "table",
      sortOrder: 24,
      content: [
        "Quanto costa? | Was kostet das?",
        "È troppo caro | Das ist zu teuer",
        "Posso pagare con carta? | Kann ich mit Karte zahlen?",
        "Il contante | Das Bargeld",
        "Il bancomat | Der Geldautomat",
        "Sto solo guardando | Ich schaue mich nur um",
        "La farmacia | Die Apotheke",
        "L'ospedale | Das Krankenhaus",
        "Il medico | Der Arzt",
        "Aiuto! | Hilfe!",
        "Chiami un'ambulanza! | Rufen Sie einen Krankenwagen!",
        "Emergenza | Notfall (Notruf: 112)",
        "Mi sono perso/a | Ich habe mich verlaufen",
        "Che ore sono? | Wie spät ist es?",
        "Oggi / domani / ieri | Heute / morgen / gestern",
        "Aperto / chiuso | Geöffnet / geschlossen",
        "L'acqua potabile | Trinkwasser (öffentl. Brunnen)",
        "Uno, due, tre | Eins, zwei, drei",
        "Quattro, cinque, sei | Vier, fünf, sechs",
        "Sette, otto, nove, dieci | Sieben, acht, neun, zehn",
        "Bello / bellissimo | Schön / wunderschön",
        "Che caldo! | Was für eine Hitze!",
      ].join("\n"),
    },
    {
      title: "Essen & Trinken am Comer See",
      format: "prose",
      sortOrder: 30,
      content:
        "Die Küche ist lombardisch und seetypisch. Klassiker sind Risotto (u. a. mit Fisch), Polenta, Pizzoccheri (Buchweizennudeln mit Kohl und Käse) und vor allem Seefisch: Lavarello (Felchen), Agone und die Spezialität Missoltini – in der Sonne getrocknete, gesalzene Agone, traditionell mit Polenta serviert. Dazu regionale Weine aus der Lombardei und dem nahen Valtellina. Zur Aperitivo-Zeit (ca. 18-20 Uhr) gehören Spritz oder ein Glas Wein mit kleinen Snacks. Gelato gibt es an jeder Ecke. Tipp: Ein \"coperto\" (Gedeck, 1-3 € p. P.) auf der Rechnung ist normal; Trinkgeld ist keine Pflicht, Aufrunden gern gesehen.",
    },
    {
      title: "Wandern & Aktiv",
      format: "prose",
      sortOrder: 40,
      content:
        "Rund um den See führt ein dichtes Netz aus alten Saumpfaden und Höhenwegen. Sanft und familientauglich ist die Greenway am Westufer; der Sentiero del Viandante zieht sich als historischer Fernweg am Ostufer entlang, mit bequemer Rückfahrt per Zug. Wer höher hinaus will, findet auf Monte Grona oder rund um den Ghisallo-Pass (Radsport-Wallfahrt) Panoramatouren. Feste Schuhe, Sonnenschutz und Wasser gehören ins Gepäck; öffentliche Brunnen (\"acqua potabile\") gibt es in vielen Dörfern. Viele Touren lassen sich mit Fähre oder Zug kombinieren.",
    },
    {
      title: "Transport & Fortbewegung",
      format: "prose",
      sortOrder: 50,
      content:
        "Am entspanntesten erkundet man den See mit einer Kombination aus Fähre und Zug – so umgeht man die engen, im Sommer verstopften Uferstraßen. Die Navigazione Laghi verbindet alle größeren Orte; im Zentraldreieck Bellagio-Varenna-Menaggio fahren besonders häufig Kurs- und Autofähren. Züge verbinden Mailand mit Como und (am Ostufer) mit Varenna. Busse (ASF Autolinee) ergänzen die Strecken entlang der Ufer. Ein Auto ist für abgelegene Dörfer und Bergtouren praktisch, in den Orten aber eher Last als Nutzen – Parkplätze sind knapp und teuer. Kurz: mehrere Verkehrsmittel je nach Ziel kombinieren.",
    },
    {
      title: "Währung, Trinkgeld & Praktisches",
      format: "prose",
      sortOrder: 60,
      content:
        "Bezahlt wird in Euro; Kartenzahlung ist verbreitet, etwas Bargeld für Märkte, Parkautomaten und kleine Bars ist praktisch. Leitungswasser ist trinkbar, öffentliche Brunnen sind mit \"acqua potabile\" gekennzeichnet. Notruf: 112. Die Hauptsaison (Juli/August) ist voll und heiß; Frühling (Gartenblüte) und Frühherbst sind angenehmer. Viele Villen und Lidos haben Saisonbetrieb – Öffnungszeiten vorab prüfen.",
    },
  ];

  // Alt-Einträge aus früheren Seed-Versionen entfernen, damit sich Inhalte
  // nicht doppeln (z. B. ein zweiter Geschichts-/Währungs-/Transportblock,
  // der mitten im Sprachführer auftauchte). Die aktuellen, ausführlicheren
  // Fassungen bleiben erhalten.
  await prisma.regionInfo.deleteMany({
    where: {
      regionId: region.id,
      title: {
        in: [
          "Kleiner Sprachführer",
          "Kleine Geschichte des Comer Sees",
          "Währung & Bezahlen",
          "Trinkwasser",
          "Anreise & Verkehr",
        ],
      },
    },
  });

  for (const info of infos) {
    const existing = await prisma.regionInfo.findFirst({
      where: { regionId: region.id, title: info.title },
    });
    if (!existing) {
      await prisma.regionInfo.create({ data: { regionId: region.id, ...info } });
    }
  }

  // Frei lizenzierte Fotos (Wikimedia Commons). Special:FilePath löst stabil
  // über den Dateinamen auf. Lizenz/Urheber vor Launch auf der Quellseite prüfen.
  const commonsFile = (name: string) =>
    `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name)}?width=1280`;
  const commonsPage = (name: string) =>
    `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(name)}`;
  const seedImages: Array<{ placeName: string; file: string }> = [
    { placeName: "Varenna", file: "Varenna dal lago.jpg" },
    { placeName: "Bellagio", file: "Bellagio 2020.jpg" },
    { placeName: "Villa del Balbianello", file: "Villa del Balbianello.jpg" },
    { placeName: "Villa Carlotta", file: "VillaCarlotta.JPG" },
    { placeName: "Duomo di Como", file: "Como Cathedral.jpg" },
    { placeName: "Orrido di Nesso", file: "Nesso - Orrido.jpg" },
  ];
  for (const img of seedImages) {
    const place = await prisma.place.findFirst({ where: { regionId: region.id, name: img.placeName } });
    if (!place) continue;
    const fileUrl = commonsFile(img.file);
    const existing = await prisma.image.findFirst({ where: { placeId: place.id, fileUrl } });
    if (!existing) {
      await prisma.image.create({
        data: {
          placeId: place.id,
          fileUrl,
          license: "Wikimedia Commons – Lizenz vor Launch prüfen",
          author: "siehe Quellseite",
          sourceUrl: commonsPage(img.file),
        },
      });
    }
  }

  // Beispiel-Karten-Spots (Instagram-/Foto-Fundorte). Kein Instagram-Inhalt
  // eingebettet – nur Standort + Notiz + Quell-Link. Vor Launch prüfen/ersetzen.
  const spots: Array<{
    name: string;
    category: "photo" | "food" | "viewpoint" | "hidden_gem" | "beach" | "other";
    lat: number;
    lng: number;
    locality: string;
    note: string;
    sourceLabel: string;
  }> = [
    { name: "Fotopunkt Bootssteg Varenna", category: "photo", lat: 46.0112, lng: 9.2845, locality: "Varenna", note: "Beliebter Steg für Fotos in der Morgensonne. Beispiel-Spot – vor Launch prüfen.", sourceLabel: "@beispiel_insta" },
    { name: "Aussicht Pizzo di Cernobbio", category: "viewpoint", lat: 45.8450, lng: 9.0850, locality: "Como", note: "Weitblick über das Südbecken. Beispiel-Spot – vor Launch prüfen.", sourceLabel: "@beispiel_insta" },
    { name: "Versteckte Bucht bei Lezzeno", category: "beach", lat: 45.9500, lng: 9.2450, locality: "Lezzeno", note: "Ruhiger Seezugang abseits der Wege. Beispiel-Spot – vor Launch prüfen.", sourceLabel: "@beispiel_insta" },
  ];
  for (const s of spots) {
    const existing = await prisma.mapSpot.findFirst({ where: { regionId: region.id, name: s.name } });
    if (!existing) {
      await prisma.mapSpot.create({
        data: { regionId: region.id, ...s, sourceUrl: "https://www.instagram.com/", status: "verified" },
      });
    }
  }

  const placeCount = await prisma.place.count({ where: { regionId: region.id } });
  const hikeCount = await prisma.hike.count({ where: { regionId: region.id } });
  console.log(
    `Seed abgeschlossen: Comer See mit ${placeCount} Orten, ${hikeCount} Wanderungen, Geschichte-Timeline, Sprachführer-Tabelle und Fotos.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
