import "dotenv/config";
import { prisma } from "../src/lib/db";
import { questionnaireSchema } from "../src/lib/questionnaire";
import { selectContent } from "../src/lib/selection";
import { generatePublicToken } from "../src/lib/token";

async function main() {
  const request = await prisma.guideRequest.findFirstOrThrow();
  const q = questionnaireSchema.parse(request.questionnaire);
  const region = await prisma.region.findUniqueOrThrow({ where: { slug: q.regionSlug } });
  const places = await prisma.place.findMany({ where: { regionId: region.id, status: "verified" } });
  const hikes = await prisma.hike.findMany({ where: { regionId: region.id, status: "verified" } });

  const selection = selectContent(
    places.map((p) => ({
      id: p.id, type: p.type, name: p.name, lat: p.lat, lng: p.lng, tags: p.tags,
      priceLevel: p.priceLevel, childFriendly: p.childFriendly, access: p.access,
      dietaryOptions: p.dietaryOptions, qualityScore: p.qualityScore,
    })),
    hikes.map((h) => ({
      id: h.id, name: h.name, startLat: h.startLat, startLng: h.startLng,
      distanceKm: h.distanceKm, durationMin: h.durationMin, elevationGainM: h.elevationGainM,
      difficulty: h.difficulty, childFriendly: h.childFriendly, tags: h.tags,
    })),
    q
  );

  const nameOf = (id: string) =>
    places.find((p) => p.id === id)?.name ?? hikes.find((h) => h.id === id)?.name ?? id;

  const mkEntries = (ids: string[]) =>
    ids.map((id) => ({
      id,
      personalText: `Testtext für ${nameOf(id)} – hier stünde der personalisierte Empfehlungstext.`,
      reason: "Weil ihr gern unterwegs seid (Testbegründung).",
    }));

  const content = {
    intro: { title: "Euer Comer See", text: "Dies ist ein Test-Guide ohne KI-Texte." },
    chapters: [
      { key: "area-1", kind: "places", title: "Orte & Sehenswertes", introText: "Test.", entries: mkEntries(selection.placeIds) },
      { key: "hikes", kind: "hikes", title: "Wanderungen", introText: "Test.", entries: mkEntries(selection.hikeIds) },
      { key: "restaurants", kind: "restaurants", title: "Essen & Trinken", introText: "Test.", entries: mkEntries(selection.restaurantIds) },
      { key: "practical", kind: "practical", title: "Praktisches", introText: "Test.", entries: mkEntries(selection.practicalIds) },
    ],
    daySuggestions: [{ day: 1, title: "Ankommen", text: "Testtag." }],
  };

  const guide = await prisma.guide.create({
    data: {
      guideRequestId: request.id,
      selection: JSON.parse(JSON.stringify(selection)),
      content: JSON.parse(JSON.stringify(content)),
      publicToken: generatePublicToken(),
      modelUsed: "test-fixture",
    },
  });
  await prisma.guideRequest.update({ where: { id: request.id }, data: { status: "ready", error: null } });
  console.log(`TOKEN=${guide.publicToken}`);
  console.log(`selection: ${selection.placeIds.length} Orte, ${selection.hikeIds.length} Wanderungen, ${selection.restaurantIds.length} Restaurants, ${selection.practicalIds.length} Praktisch`);
}

main().finally(() => prisma.$disconnect());
