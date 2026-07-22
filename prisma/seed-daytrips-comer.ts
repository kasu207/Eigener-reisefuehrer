import "dotenv/config";
import { PrismaClient, type DocumentKind } from "@prisma/client";

/**
 * Zusatz-Seed: TAGESAUSFLÜGE ab Comer See als Wissensdatenbank-Notizen.
 *
 * Diese Ideen dienen der KI als Hintergrund für die Tagesvorschläge/Einleitung
 * (paraphrasiert, keine wörtlichen Übernahmen). Sie erscheinen nicht als harte
 * Fakten – konkrete Fahrpläne/Preise gehören vor Ort geprüft.
 *
 * Ausführen:
 *   docker compose -f docker-compose.prod.yml exec app npx tsx prisma/seed-daytrips-comer.ts
 *   # oder lokal:  npx tsx prisma/seed-daytrips-comer.ts
 */

const prisma = new PrismaClient();
const REGION_SLUG = "comer-see";

type Chunk = { title: string; content: string; interests: string[]; placeNames: string[] };
type Doc = { title: string; url: string; kind: DocumentKind; chunks: Chunk[] };

const docs: Doc[] = [
  {
    title: "Tagesausflüge ab Comer See (Winalist)",
    url: "https://www.winalist.com/blog/italy-wine-region/lombardy/day-trips-from-lake-como",
    kind: "blog",
    chunks: [
      {
        title: "Como Stadt & Standseilbahn nach Brunate",
        content:
          "Die Stadt Como lohnt einen Tag: Dom, Seepromenade, Seidenmuseum. Mit der historischen Standseilbahn (Funicolare) geht es hinauf nach Brunate mit weitem Blick über das Südbecken; von dort kurze Wanderungen (z. B. zum Leuchtturm San Maurizio). Gut mit Zug/Fähre erreichbar.",
        interests: ["kultur_geschichte", "aussichtspunkte_fotografie", "wandern", "doerfer_maerkte"],
        placeNames: ["Como", "Brunate"],
      },
      {
        title: "Goldenes Dreieck per Fähre: Bellagio–Varenna–Menaggio",
        content:
          "Ein klassischer Tag ohne Auto: Mit der Fähre das »Goldene Dreieck« Bellagio, Varenna und Menaggio verbinden. Häufige Kurse, unterwegs Gärten, Altstadtgassen und Seeblick – ideal, um mehrere Orte entspannt an einem Tag zu erleben.",
        interests: ["doerfer_maerkte", "seen_baden", "entspannung", "kulinarik"],
        placeNames: ["Bellagio", "Varenna", "Menaggio"],
      },
      {
        title: "Bergamo Città Alta",
        content:
          "Bergamo mit seiner von venezianischen Mauern umgebenen Oberstadt (Città Alta) ist ein lohnender Tagesausflug: mittelalterliche Gassen, Piazza Vecchia, Standseilbahn hinauf und gute lombardische Küche. Per Zug/Auto erreichbar.",
        interests: ["kultur_geschichte", "doerfer_maerkte", "kulinarik"],
        placeNames: ["Bergamo"],
      },
      {
        title: "Mailand an einem Tag",
        content:
          "Von Como fährt der Zug in rund 40 Minuten nach Mailand – gut für einen Städtetag mit Dom, Galleria, Kunst (z. B. Brera) und Shopping. Am besten früh los, um die Rückfahrt am Abend entspannt zu nehmen.",
        interests: ["kultur_geschichte"],
        placeNames: ["Mailand", "Como"],
      },
    ],
  },
  {
    title: "Tagesausflüge in die Schweiz (Salt & Wind)",
    url: "https://saltandwind.com/day-trips-from-lake-como-to-switzerland/",
    kind: "blog",
    chunks: [
      {
        title: "Lugano & Lago di Lugano (Morcote, Gandria)",
        content:
          "Direkte Regionalzüge fahren von Como in gut einer Stunde (etwa alle 30 Minuten) nach Lugano in die Schweiz. Von dort per Schiff zu den Uferdörfern Morcote (eines der schönsten Dörfer der Schweiz, mit Parco Scherrer) und Gandria. Personalausweis/Reisepass und etwas Franken/Karte nicht vergessen.",
        interests: ["doerfer_maerkte", "aussichtspunkte_fotografie", "kultur_geschichte"],
        placeNames: ["Lugano", "Morcote", "Gandria"],
      },
      {
        title: "Bernina Express nach Tirano & St. Moritz",
        content:
          "Ein großer Tag für Bahn-Fans: über Tirano mit dem Bernina Express (UNESCO-Panoramastrecke) durch die Alpen nach St. Moritz. Spektakuläre Landschaft mit Gletscherblick und dem Kreisviadukt von Brusio – als Ganztagestour realistisch rund 11–13 Stunden, daher früh planen und Plätze vorab reservieren.",
        interests: ["aussichtspunkte_fotografie", "entspannung"],
        placeNames: ["Tirano", "St. Moritz", "Bernina Express"],
      },
    ],
  },
  {
    title: "Villen-Tag & Valtellina (Tripadvisor – Day Trips)",
    url: "https://www.tripadvisor.com/Attractions-g187833-Activities-c63-Lake_Como_Lombardy.html",
    kind: "article",
    chunks: [
      {
        title: "Villen-Tag: Balbianello, Carlotta, Monastero",
        content:
          "Ein Tag ganz den berühmten Gärten und Villen: Villa del Balbianello bei Lenno (spektakuläre Lage auf einer Landzunge, Filmkulisse), Villa Carlotta in Tremezzo (Kunst und Botanik, Azaleen im Frühjahr) und Villa Monastero in Varenna (langer Uferpromenaden-Garten). Per Fähre/Boot gut kombinierbar; Öffnungszeiten saisonal.",
        interests: ["kultur_geschichte", "aussichtspunkte_fotografie", "entspannung"],
        placeNames: ["Villa del Balbianello", "Villa Carlotta", "Villa Monastero", "Lenno", "Tremezzo", "Varenna"],
      },
      {
        title: "Valtellina & Val di Mello",
        content:
          "Nordöstlich schließt das Valtellina-Tal an: terrassierte Weinberge, das Städtchen Sondrio, Bergkäse und Bresaola. Das Val di Mello ist ein grünes Hochtal für leichte Wanderungen und Badegumpen – ein guter Natur- und Genusstag abseits des Sees (per Zug bis Sondrio/Morbegno, dann Bus/Auto).",
        interests: ["wandern", "kulinarik", "aussichtspunkte_fotografie", "entspannung"],
        placeNames: ["Valtellina", "Val di Mello", "Sondrio"],
      },
      {
        title: "Greenway & Isola Comacina",
        content:
          "Am Westufer lässt sich die Greenway del Lago di Como (ab Colonno) mit einem Besuch der Isola Comacina verbinden: Uferweg durch Dörfer und Olivenhaine, dazu die einzige Insel des Sees mit Kunst und Geschichte. Entspannter Wander- und Kulturtag mit Bus-/Fährabkürzungen.",
        interests: ["wandern", "kultur_geschichte", "doerfer_maerkte"],
        placeNames: ["Greenway", "Isola Comacina", "Colonno", "Ossuccio"],
      },
    ],
  },
];

async function main() {
  const region = await prisma.region.findUnique({ where: { slug: REGION_SLUG } });
  if (!region) {
    throw new Error(`Region "${REGION_SLUG}" nicht gefunden. Zuerst npm run db:seed ausführen.`);
  }

  let docsCreated = 0;
  let docsSkipped = 0;
  let chunksCreated = 0;

  for (const d of docs) {
    const existing = await prisma.knowledgeDocument.findFirst({
      where: { regionId: region.id, url: d.url },
    });
    if (existing) {
      docsSkipped += 1;
      continue;
    }
    const doc = await prisma.knowledgeDocument.create({
      data: {
        regionId: region.id,
        kind: d.kind,
        title: d.title,
        url: d.url,
        status: "analyzed",
        moderationStatus: "approved",
      },
    });
    for (const c of d.chunks) {
      await prisma.knowledgeChunk.create({
        data: {
          documentId: doc.id,
          title: c.title,
          content: c.content,
          interests: c.interests,
          placeNames: c.placeNames,
        },
      });
      chunksCreated += 1;
    }
    docsCreated += 1;
    console.log(`+ Tagesausflüge-Quelle: ${d.title} (${d.chunks.length} Ideen)`);
  }

  console.log(
    `\nTagesausflüge-Seed abgeschlossen: ${docsCreated} Quellen neu (${chunksCreated} Ideen), ${docsSkipped} bereits vorhanden.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
