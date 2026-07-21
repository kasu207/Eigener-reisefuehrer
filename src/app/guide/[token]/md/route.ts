import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guideContentSchema } from "@/lib/guide-content";
import { questionnaireSchema } from "@/lib/questionnaire";
import { cleanName, mapsHref } from "@/lib/names";
import type { Place, Hike } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * Markdown-Export des Guides (Debugging & einfaches Teilen). Bildet die
 * Kapitelstruktur 1:1 ab, damit sich z. B. doppelte Inhalte leicht erkennen
 * lassen. Besitzer- und Lese-Link dürfen beide exportieren.
 */

function placeFacts(p: Place): string {
  const parts = [
    p.type,
    p.locality ? `Ort: ${p.locality}` : "",
    p.priceLevel ? "€".repeat(p.priceLevel) : "",
    p.mustSee ? "★ Must-See" : "",
    p.openingNotes ? `Zeiten: ${p.openingNotes}` : "",
  ];
  return parts.filter(Boolean).join(" · ");
}

function hikeFacts(h: Hike): string {
  return [`${h.distanceKm} km`, `${h.durationMin} min`, `${h.elevationGainM} hm`, h.difficulty]
    .filter(Boolean)
    .join(" · ");
}

function renderInfo(format: string, content: string): string {
  const lines = content.split("\n").map((l) => l.trim()).filter(Boolean);
  if (format === "table") {
    const rows = lines.map((l) => l.split("|").map((c) => c.trim()));
    const head = "| Begriff | Bedeutung |\n| --- | --- |";
    const body = rows.map((r) => `| ${r[0] ?? ""} | ${r[1] ?? ""} |`).join("\n");
    return `${head}\n${body}`;
  }
  if (format === "timeline") {
    return lines
      .map((l) => {
        const [year, event, side] = l.split("|").map((c) => c.trim());
        return `- **${year}** – ${event}${side ? ` _(${side})_` : ""}`;
      })
      .join("\n");
  }
  return content.trim();
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const guide = await prisma.guide.findFirst({
    where: { OR: [{ publicToken: token }, { shareToken: token }] },
    include: { guideRequest: true },
  });
  if (!guide) return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });

  const content = guideContentSchema.parse(guide.content);
  const q = questionnaireSchema.parse(guide.guideRequest.questionnaire);
  const region = await prisma.region.findUnique({
    where: { slug: q.regionSlug },
    include: { infos: { orderBy: { sortOrder: "asc" } } },
  });

  const allEntryIds = content.chapters.flatMap((c) => c.entries.map((e) => e.id));
  const places = await prisma.place.findMany({ where: { id: { in: allEntryIds } } });
  const hikes = await prisma.hike.findMany({ where: { id: { in: allEntryIds } } });
  const placeById = new Map(places.map((p) => [p.id, p]));
  const hikeById = new Map(hikes.map((h) => [h.id, h]));

  const out: string[] = [];
  const regionName = region?.name ?? "Reiseführer";
  out.push(`# ${regionName} – Reiseführer für ${q.firstNames}`);
  out.push(`*${q.dateFrom} – ${q.dateTo} · Unterkunft: ${q.accommodation.label}*`);
  if (q.anchors?.length) {
    out.push(`*Weitere Wunsch-Orte: ${q.anchors.map((a) => a.label).join(", ")}*`);
  }
  out.push("");

  if (content.intro?.text) {
    out.push(`## ${content.intro.title || "Einleitung"}`);
    out.push(content.intro.text.trim());
    out.push("");
  }

  if (content.daySuggestions?.length) {
    out.push(`## Tagesvorschläge`);
    for (const d of content.daySuggestions) {
      out.push(`### Tag ${d.day}: ${d.title}`);
      out.push(d.text.trim());
      out.push("");
    }
  }

  for (const chapter of content.chapters) {
    out.push(`## ${chapter.title}  _(${chapter.kind})_`);
    if (chapter.introText?.trim()) out.push(chapter.introText.trim());
    out.push("");
    for (const entry of chapter.entries) {
      const place = placeById.get(entry.id);
      const hike = hikeById.get(entry.id);
      const name = cleanName(place?.name ?? hike?.name ?? entry.id);
      out.push(`### ${name}`);
      const facts = place ? placeFacts(place) : hike ? hikeFacts(hike) : "";
      if (facts) out.push(`_${facts}_`);
      if (place) {
        const query = place.address?.trim()
          ? place.address
          : `${name}${place.locality ? `, ${place.locality}` : ""}`;
        if (place.address?.trim()) out.push(`Adresse: ${place.address}`);
        out.push(`[📍 Auf Google Maps öffnen](${mapsHref(query)})`);
      } else if (hike) {
        out.push(`[📍 Startpunkt auf Google Maps](${mapsHref(`${hike.startLat},${hike.startLng}`)})`);
      }
      if (entry.personalText?.trim()) out.push(entry.personalText.trim());
      if (entry.reason?.trim()) out.push(`> ${entry.reason.trim()}`);
      out.push("");
    }
  }

  const infos = region?.infos ?? [];
  if (infos.length) {
    out.push(`## Gut zu wissen`);
    for (const info of infos) {
      out.push(`### ${info.title}  _(${info.format}, sort ${info.sortOrder})_`);
      out.push(renderInfo(info.format, info.content));
      out.push("");
    }
  }

  // Register (alphabetisch) – hilft, doppelte Einträge sofort zu sehen
  const names = content.chapters
    .flatMap((c) => c.entries.map((e) => cleanName(placeById.get(e.id)?.name ?? hikeById.get(e.id)?.name ?? e.id)))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "de"));
  out.push(`## Register (${names.length} Einträge)`);
  out.push(names.map((n) => `- ${n}`).join("\n"));
  out.push("");

  const markdown = out.join("\n");
  return new NextResponse(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="reisefuehrer.md"`,
    },
  });
}
