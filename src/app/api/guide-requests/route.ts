import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { questionnaireInputSchema } from "@/lib/questionnaire";
import { checkRateLimit } from "@/lib/rate-limit";
import { createGuideSkeleton } from "@/lib/guide-generation";
import { geocodePlace } from "@/lib/geocode";

export const dynamic = "force-dynamic";

/**
 * Nimmt den Fragebogen entgegen, validiert serverseitig (Anforderung 4.1)
 * und erzeugt einen GuideRequest. Die Generierung läuft asynchron im Worker.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const limit = checkRateLimit(`guide-request:${ip}`);
  if (!limit.ok) {
    // Konkrete Wartezeit nennen statt nur "später" – sonst probieren Nutzer
    // im Minutentakt weiter und bekommen immer wieder dieselbe Absage.
    const minutes = Math.max(1, Math.ceil(limit.retryAfterMs / 60_000));
    return NextResponse.json(
      {
        error: `Zu viele Anfragen. Bitte versucht es in ca. ${minutes} Minute${minutes === 1 ? "" : "n"} erneut.`,
      },
      { status: 429, headers: { "Retry-After": String(Math.ceil(limit.retryAfterMs / 1000)) } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const parsed = questionnaireInputSchema.safeParse(body);
  if (!parsed.success) {
    // Die erste verständliche Meldung mitgeben – der Wizard zeigt nur
    // `error` an, ein blankes "Validierung fehlgeschlagen." hilft niemandem.
    const first = parsed.error.issues[0];
    const detail = first?.message && !/^(Required|Invalid)/i.test(first.message) ? first.message : "";
    return NextResponse.json(
      {
        error: detail || "Validierung fehlgeschlagen. Bitte prüft eure Eingaben.",
        issues: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  const region = await prisma.region.findUnique({ where: { slug: parsed.data.regionSlug } });
  if (!region) {
    return NextResponse.json({ error: "Unbekannte Region." }, { status: 400 });
  }

  // Unterkunft geocodieren, falls nur ein Ortsname (ohne Koordinaten) angegeben
  // wurde. Damit bevorzugt die Auswahl-Engine Orte im Umkreis und es kann ein
  // "Rund um eure Unterkunft"-Kapitel entstehen (löst z. B. den Torno-Fall).
  const questionnaire = parsed.data;
  if (
    questionnaire.accommodation.label &&
    (questionnaire.accommodation.lat == null || questionnaire.accommodation.lng == null)
  ) {
    const coords = await geocodePlace({
      label: questionnaire.accommodation.label,
      regionName: region.name,
      country: region.country,
      centerLat: region.centerLat,
      centerLng: region.centerLng,
    });
    if (coords) {
      questionnaire.accommodation.lat = coords.lat;
      questionnaire.accommodation.lng = coords.lng;
    }
  }

  // Weitere Anker-Orte (zusätzliche Unterkünfte / Must-Sees) ebenfalls geocodieren
  for (const anchor of questionnaire.anchors ?? []) {
    if (anchor.label && (anchor.lat == null || anchor.lng == null)) {
      const coords = await geocodePlace({
        label: anchor.label,
        regionName: region.name,
        country: region.country,
        centerLat: region.centerLat,
        centerLng: region.centerLng,
      });
      if (coords) {
        anchor.lat = coords.lat;
        anchor.lng = coords.lng;
      }
    }
  }

  const request = await prisma.guideRequest.create({
    data: {
      // E-Mail wird erst nach der Erstellung auf der Guide-Seite abgefragt
      email: questionnaire.email ?? "",
      questionnaire,
      status: "pending",
    },
  });

  // Sofort-Gerüst: Auswahl-Engine läuft synchron, der Nutzer wird direkt in
  // den Browser-Guide geleitet und kann blättern, während die KI-Texte im
  // Worker nachlaufen.
  try {
    const token = await createGuideSkeleton(request.id);
    return NextResponse.json({ id: request.id, guideUrl: `/guide/${token}` }, { status: 201 });
  } catch (err) {
    console.error("[guide-requests] Skeleton fehlgeschlagen:", err);
    // Fallback: klassischer Weg über E-Mail
    return NextResponse.json({ id: request.id }, { status: 201 });
  }
}
