import "dotenv/config";
import { PrismaClient, type DocumentKind } from "@prisma/client";

/**
 * Zusatz-Seed für die WISSENSDATENBANK: recherchierte Hidden-Gems/Insider-Tipps
 * zu Dörfern rund um den Comer See, aus vielen Blogs, lokalen Portalen und
 * Reise-Communitys/Foren.
 *
 * Wichtig (Urheberrecht / Prinzip 5.1): Die Notizen sind EIGENE, paraphrasierte
 * Zusammenfassungen – keine wörtlichen Übernahmen. Sie dienen der KI als
 * Hintergrund-Kontext bei der Guide-Erstellung (Chunks werden über Interessen
 * und Ortsnamen zugeordnet). Sie erscheinen NICHT als „harte Fakten" im Guide –
 * das bleibt den geprüften Place-Einträgen vorbehalten.
 *
 * Jede Quelle wird als eigenes KnowledgeDocument (status "analyzed",
 * moderationStatus "approved") mit 1–3 Chunks angelegt. Idempotent: existiert
 * bereits ein Dokument mit derselben url, wird es übersprungen.
 *
 * Ausführen:
 *   docker compose -f docker-compose.prod.yml exec app npx tsx prisma/seed-knowledge-comer.ts
 *   # oder lokal:  npx tsx prisma/seed-knowledge-comer.ts
 */

const prisma = new PrismaClient();
const REGION_SLUG = "comer-see";

type Chunk = {
  title: string;
  content: string;
  interests: string[]; // Keys aus INTERESTS (wandern, kulinarik, ...)
  placeNames: string[];
};

type Doc = {
  title: string;
  url: string;
  kind: DocumentKind; // "blog" | "article" | ...
  chunks: Chunk[];
};

const docs: Doc[] = [
  {
    title: "Nesso – authentisches Dorf ohne Massen (Explore / Como and its lake)",
    url: "https://www.explore.com/2036627/nesso-italy-lake-como-storybook-village-crowd-free-escape/",
    kind: "blog",
    chunks: [
      {
        title: "Nesso: authentisch und wenig besucht",
        content:
          "Nesso liegt am steilen Südostufer, rund 18 km von Como. Enge Steingassen, historische Kirchen und Seeblick bewahren die Atmosphäre vergangener Zeiten – eines der authentischsten und am wenigsten überlaufenen Dörfer am See, ideal für Ruhesuchende.",
        interests: ["doerfer_maerkte", "kultur_geschichte", "entspannung"],
        placeNames: ["Nesso"],
      },
      {
        title: "Orrido di Nesso: Schlucht, Wasserfall und Badestelle",
        content:
          "Zwischen Nesso und Careno stürzt ein Wasserfall in eine dramatische Schlucht (Orrido di Nesso). Die kleine gemauerte Bogenbrücke ist ein berühmter Foto-Spot; an der Mündung zum See kann man an warmen Tagen ins Wasser springen und schwimmen.",
        interests: ["aussichtspunkte_fotografie", "seen_baden", "wandern"],
        placeNames: ["Nesso", "Orrido di Nesso", "Careno"],
      },
    ],
  },
  {
    title: "Careno – nur zu Fuß erreichbarer Weiler (Lago di Como / Explore)",
    url: "https://lagodicomo.com/lake-comos-hidden-gems-authentic-villages-off-the-beaten-path/",
    kind: "blog",
    chunks: [
      {
        title: "Careno: versteckter Weiler mit Fresken",
        content:
          "Careno ist ein winziger Uferweiler (zur Gemeinde Nesso gehörend), der nur zu Fuß über steile Treppen zum Ufer erreichbar ist. Die Kirche San Martino mit mittelalterlichen Fresken und die Lage über dem See machen ihn zu einem echten Geheimtipp.",
        interests: ["doerfer_maerkte", "kultur_geschichte", "wandern"],
        placeNames: ["Careno", "Nesso"],
      },
    ],
  },
  {
    title: "Pognana Lario – ruhig trotz Nähe zu Como (Explore Lake Como)",
    url: "https://www.explorelakecomo.com/go/pognana-lario",
    kind: "blog",
    chunks: [
      {
        title: "Pognana Lario: stiller Rückzugsort",
        content:
          "Trotz seiner Nähe zu Como ist Pognana Lario ruhig und authentisch geblieben – gut für alle, die einen stillen Rückzugsort suchen. Der höher gelegene Ortsteil heißt »Castello«, weil er im Mittelalter befestigt war.",
        interests: ["doerfer_maerkte", "entspannung"],
        placeNames: ["Pognana Lario"],
      },
    ],
  },
  {
    title: "Pescallo – Bellagios versteckte Rückseite (myLakeComo)",
    url: "https://mylakecomo.co/en/attractions/historical-hamlet-of-pescallo/",
    kind: "blog",
    chunks: [
      {
        title: "Pescallo: ruhige Fischerbucht hinter Bellagio",
        content:
          "Pescallo ist ein altes Fischerdörfchen auf derselben Landzunge wie Bellagio, aber zur Lecco-Seite hin hinter dem Hügel versteckt – nur wenige Schritte vom Trubel entfernt und doch ruhig. Starker Sonnenuntergangs-Spot und geschützte Bucht zum Paddeln/Kajak (Circolo della Vela, Bellagio Water Sports).",
        interests: ["entspannung", "doerfer_maerkte", "sport_aktivitaet", "aussichtspunkte_fotografie"],
        placeNames: ["Pescallo", "Bellagio"],
      },
    ],
  },
  {
    title: "Varenna – Fiumelatte & Castello di Vezio (myLakeComo / Wikipedia)",
    url: "https://mylakecomo.co/en/attractions/source-of-fiumelatte/",
    kind: "blog",
    chunks: [
      {
        title: "Fiumelatte: einer der kürzesten Flüsse Italiens",
        content:
          "Der Fiumelatte bei Varenna ist mit nur rund 250 m einer der kürzesten Flüsse Italiens; sein Wasser schimmert milchig-weiß. Er führt nur saisonal Wasser (etwa März bis Oktober) und wurde schon von Leonardo da Vinci beschrieben. Ein kurzer Spaziergang von Varenna führt zur Quelle.",
        interests: ["wandern", "aussichtspunkte_fotografie", "kultur_geschichte"],
        placeNames: ["Fiumelatte", "Varenna"],
      },
      {
        title: "Castello di Vezio: Burg mit Drei-Seen-Blick",
        content:
          "Hoch über Varenna wacht das mittelalterliche Castello di Vezio am Schnittpunkt der drei Seearme. Es bietet einen grandiosen Ausblick und teils Falknerei-Vorführungen; zu Fuß von Varenna in etwa 20–30 Minuten bergauf erreichbar.",
        interests: ["kultur_geschichte", "aussichtspunkte_fotografie", "wandern"],
        placeNames: ["Castello di Vezio", "Varenna", "Perledo"],
      },
    ],
  },
  {
    title: "Corenno Plinio & Dorio – mittelalterliches Nordufer (Comersee-Info)",
    url: "https://www.comersee-info.de/corenno-plinio/",
    kind: "blog",
    chunks: [
      {
        title: "Corenno Plinio: fast vollständig erhaltenes Mittelalterdorf",
        content:
          "Corenno Plinio (Teil der Gemeinde Dervio) ist ein fast vollständig erhaltenes mittelalterliches Dorf: Burg aus dem 14. Jh. und die Kirche San Tommaso di Canterbury, dazu enge, arkadengesäumte Gassen. Nirgends am See lässt sich das mittelalterliche Leben besser nachempfinden.",
        interests: ["kultur_geschichte", "doerfer_maerkte", "aussichtspunkte_fotografie"],
        placeNames: ["Corenno Plinio", "Dervio"],
      },
      {
        title: "Dorio: ruhiges Dorf am Nordzipfel",
        content:
          "Dorio ist ein kleines Dorf am Nordende des Sees mit einem netten Strand und lokalen Restaurants – entspannt und wenig überlaufen, typisch italienisch.",
        interests: ["seen_baden", "entspannung", "doerfer_maerkte"],
        placeNames: ["Dorio", "Dervio"],
      },
    ],
  },
  {
    title: "Isola Comacina – die einzige Insel des Sees (Wikipedia / Como Companion)",
    url: "https://comocompanion.com/2023/07/13/isola-comacina-a-serene-location-with-a-tragic-past/",
    kind: "article",
    chunks: [
      {
        title: "Isola Comacina: einzige Insel mit tragischer Geschichte",
        content:
          "Die Isola Comacina vor Ossuccio ist die einzige Insel des Comer Sees, gelegen in der Bucht »Zoca de l'oli«. 1169 zerstörten die Comasker die Insel als Strafe für ihr Bündnis mit Mailand. Heute ist sie ruhig, mit Kunst und Geschichte – per Boot von Sala Comacina/Ossuccio erreichbar.",
        interests: ["kultur_geschichte", "doerfer_maerkte", "entspannung"],
        placeNames: ["Isola Comacina", "Ossuccio", "Sala Comacina"],
      },
      {
        title: "Antiquarium Ossuccio: Einstieg in die Inselgeschichte",
        content:
          "Das kleine Antiquarium in Ossuccio erzählt die Geschichte der Isola Comacina mit römischen Funden und frühchristlichen Spuren – ein guter Einstieg vor dem Inselbesuch.",
        interests: ["kultur_geschichte"],
        placeNames: ["Ossuccio", "Isola Comacina"],
      },
    ],
  },
  {
    title: "Sacro Monte di Ossuccio & Greenway (myLakeComo)",
    url: "https://mylakecomo.co/en/trails/from-sala-comacina-to-sacred-mount-ossuccio/",
    kind: "blog",
    chunks: [
      {
        title: "Sacro Monte di Ossuccio: UNESCO-Kapellenweg",
        content:
          "Der Sacro Monte di Ossuccio ist ein Kapellenweg durch Olivenhaine auf Kopfsteinpflaster und Stufen, seit 2003 UNESCO-Welterbe. Er beginnt nahe dem Friedhof von Sala Comacina, wo auch die Greenway aus Colonno vorbeiführt.",
        interests: ["wandern", "kultur_geschichte", "aussichtspunkte_fotografie"],
        placeNames: ["Sacro Monte di Ossuccio", "Ossuccio", "Sala Comacina"],
      },
      {
        title: "Greenway del Lago di Como: Dörfer zu Fuß erkunden",
        content:
          "Die Greenway del Lago di Como ist ein alter Uferweg am Westufer ab Colonno, der durch Ossuccio, Sala Comacina und die Tremezzina führt – verbindet Dörfer, Olivenhaine und den Sacro Monte. Ideal für langsames Erkunden, mit bequemen Bus-Abkürzungen.",
        interests: ["wandern", "doerfer_maerkte", "kultur_geschichte"],
        placeNames: ["Colonno", "Ossuccio", "Sala Comacina", "Tremezzina"],
      },
    ],
  },
  {
    title: "Baden am Comer See – kostenlose Strände & Insider (Wonders&Waves / LakeAddicted)",
    url: "https://wondersandwaves.de/en/2025/04/11/the-best-swimming-spots-on-lake-como-free-affordable-and-exclusive-beaches-at-a-glance/",
    kind: "blog",
    chunks: [
      {
        title: "Kostenlose Strände: San Giovanni, Menaggio, Tremezzina",
        content:
          "Viele Badestellen sind gratis: Bellagios kostenloser Strand »San Giovanni« liegt rund 15 Gehminuten südlich der Fähranleger; Menaggio hat einen freien Strandbereich; der Parco Teresio Olivelli in der Tremezzina bietet kostenlosen Seezugang unter alten Bäumen mit breiten Steinstufen ins Wasser. Wichtig: meist keine Rettungsschwimmer, der See ist tief.",
        interests: ["seen_baden", "entspannung"],
        placeNames: ["Bellagio", "Menaggio", "Tremezzina"],
      },
      {
        title: "Varenna: Lido Olivedo am Anleger",
        content:
          "Nur wenige Gehminuten vom Anleger in Varenna liegt der Lido Olivedo mit Liegen, Sonnenschirmen und Duschen – ein bequemer, unkomplizierter Badeplatz.",
        interests: ["seen_baden"],
        placeNames: ["Varenna"],
      },
    ],
  },
  {
    title: "Alto Lario – Wind & Wassersport im Norden (WaterWind / lakecomo.is)",
    url: "https://www.waterwind.it/new/en/windsurfing/spots/spots-reviews/240-domaso-the-windsurf-spot-on-como-lake-best-loved-by-foreign-riders.html",
    kind: "blog",
    chunks: [
      {
        title: "Breva-Wind: Kite- & Windsurf-Reviere im Norden",
        content:
          "Im nördlichen Seebecken (Alto Lario) weht nachmittags zuverlässig die »Breva« aus Süden (etwa ab Mittag, 15–18 Knoten). Das macht Domaso, Gera Lario und Colico zu beliebten Kite- und Windsurf-Spots; Domaso ist besonders bei internationalen Surfern beliebt.",
        interests: ["sport_aktivitaet", "seen_baden"],
        placeNames: ["Domaso", "Gera Lario", "Colico", "Alto Lario"],
      },
    ],
  },
  {
    title: "Wo Italiener den Massen entkommen (AOL / Reisebericht)",
    url: "https://www.aol.com/news/charming-town-lake-como-where-094717002.html",
    kind: "article",
    chunks: [
      {
        title: "Weniger überlaufene Alternativen",
        content:
          "Als ruhigere Alternativen zu Bellagio und Varenna gelten u. a. Menaggio (autofreie Fußgängerzone mit Cafés, Gelaterie und Mini-Golf am See), die Stadt Lecco am Südostarm sowie die Nordorte Domaso und Sorico. Hier ist es entspannter, besonders in der Hochsaison.",
        interests: ["doerfer_maerkte", "entspannung", "kulinarik"],
        placeNames: ["Menaggio", "Lecco", "Domaso", "Sorico"],
      },
    ],
  },
  {
    title: "Comer See Geheimtipps (Italien-Entdecken)",
    url: "https://italien-entdecken.de/comer-see-lago-di-como/",
    kind: "blog",
    chunks: [
      {
        title: "Ostufer & Nordbecken für Ruhe",
        content:
          "Wer dem Trubel der bekannten Orte entgehen will, findet an den kleineren Ostufer-Dörfern (z. B. Torno, Nesso, Careno) und im ruhigeren Nordbecken viel Authentizität. Kleine Fährorte lassen sich gut als Tagesziele kombinieren.",
        interests: ["doerfer_maerkte", "entspannung"],
        placeNames: ["Torno", "Nesso", "Careno"],
      },
    ],
  },
  {
    title: "Insider aus Reise-Communitys & Foren (Rick Steves Forum u. a.)",
    url: "https://community.ricksteves.com/travel-forum/italy/swimming-in-lake-como",
    kind: "article",
    chunks: [
      {
        title: "Community-Konsens: Menschenmengen clever meiden",
        content:
          "Aus Reise-Foren und Communitys immer wieder empfohlen: früh morgens oder gegen Abend fotografieren und spazieren, um die Tagesmassen zu meiden; die Fähre statt des Autos nehmen (Uferstraßen sind eng, Parken teuer und knapp); und für Ruhe kleinere Ostufer-Dörfer oder das Nordbecken wählen statt der Hotspots.",
        interests: ["entspannung", "aussichtspunkte_fotografie", "doerfer_maerkte"],
        placeNames: ["Torno", "Nesso", "Bellagio", "Varenna"],
      },
    ],
  },
];

async function main() {
  const region = await prisma.region.findUnique({ where: { slug: REGION_SLUG } });
  if (!region) {
    throw new Error(
      `Region "${REGION_SLUG}" nicht gefunden. Zuerst das Basis-Seed ausführen (npm run db:seed).`
    );
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
        status: "analyzed", // direkt nutzbar (bereits redaktionell aufbereitet)
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
    console.log(`+ Dokument: ${d.title} (${d.chunks.length} Notizen)`);
  }

  console.log(
    `\nWissens-Seed abgeschlossen: ${docsCreated} Quellen neu (${chunksCreated} Notizen), ${docsSkipped} bereits vorhanden.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
