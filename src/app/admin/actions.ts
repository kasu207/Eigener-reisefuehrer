"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  suggestPlaces,
  UnsafeSuggestionError,
  type SuggestPlaceType,
} from "@/lib/ai/suggest-places";
import { extractPlacesFromText, UnsafeExtractionError } from "@/lib/ai/extract-places";
import { fetchYoutubeTranscript } from "@/lib/youtube/transcript";
import { BROWSER_HEADERS } from "@/lib/http";
import type {
  PlaceType,
  Access,
  Difficulty,
  ContentStatus,
  SourceType,
  InfoFormat,
  SpotCategory,
  DocumentKind,
} from "@prisma/client";

/** Server Actions für das Admin-CRUD (Anforderung 4.5) und die
 * halbautomatische Quellen-Anreicherung (Anforderung 5.3). */

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}
function num(fd: FormData, key: string): number {
  return Number(fd.get(key) ?? 0);
}
function optNum(fd: FormData, key: string): number | null {
  const v = str(fd, key);
  return v === "" ? null : Number(v);
}
function list(fd: FormData, key: string): string[] {
  return str(fd, key)
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

// ---------- Regionen ----------

export async function upsertRegion(fd: FormData) {
  const id = str(fd, "id");
  const data = {
    name: str(fd, "name"),
    slug: str(fd, "slug"),
    country: str(fd, "country"),
    centerLat: num(fd, "centerLat"),
    centerLng: num(fd, "centerLng"),
    description: str(fd, "description"),
  };
  if (id) await prisma.region.update({ where: { id }, data });
  else await prisma.region.create({ data });
  revalidatePath("/admin/regions");
}

// ---------- Orte ----------

function placeData(fd: FormData) {
  return {
    regionId: str(fd, "regionId"),
    type: str(fd, "type") as PlaceType,
    name: str(fd, "name"),
    locality: str(fd, "locality"),
    lat: num(fd, "lat"),
    lng: num(fd, "lng"),
    address: str(fd, "address"),
    tags: list(fd, "tags"),
    priceLevel: optNum(fd, "priceLevel"),
    openingNotes: str(fd, "openingNotes"),
    childFriendly: fd.get("childFriendly") === "on",
    access: str(fd, "access") as Access,
    dietaryOptions: list(fd, "dietaryOptions"),
    editorNotes: str(fd, "editorNotes"),
    qualityScore: num(fd, "qualityScore") || 3,
    mustSee: fd.get("mustSee") === "on",
    status: str(fd, "status") as ContentStatus,
    lastVerifiedAt: str(fd, "status") === "verified" ? new Date() : undefined,
  };
}

export async function createPlace(fd: FormData) {
  const place = await prisma.place.create({ data: placeData(fd) });
  redirect(`/admin/places/${place.id}`);
}

export async function updatePlace(fd: FormData) {
  const id = str(fd, "id");
  await prisma.place.update({ where: { id }, data: placeData(fd) });
  revalidatePath(`/admin/places/${id}`);
  revalidatePath("/admin/places");
}

export async function deletePlace(fd: FormData) {
  await prisma.place.delete({ where: { id: str(fd, "id") } });
  revalidatePath("/admin/places");
  redirect("/admin/places");
}

/**
 * KI-Ortsvorschläge (Kuratierungs-Hilfe): erzeugt ENTWÜRFE (status = draft)
 * rund um einen Ort/Typ. Fakten (Koordinaten, Preise, Öffnungszeiten) müssen
 * vom Menschen geprüft werden, bevor der Eintrag auf "verified" geht. So
 * wächst die DB schnell, ohne dass unbestätigte Fakten in den Guide gelangen.
 */
export async function generatePlaceDrafts(fd: FormData) {
  const regionId = str(fd, "regionId");
  const locality = str(fd, "locality");
  const type = (str(fd, "type") || "sight") as SuggestPlaceType;
  const count = Math.max(1, Math.min(15, num(fd, "count") || 5));
  const extraHint = str(fd, "extraHint");

  const region = await prisma.region.findUnique({ where: { id: regionId } });
  if (!region) throw new Error("Region nicht gefunden");

  let result;
  try {
    result = await suggestPlaces({
      regionName: region.name,
      locality,
      type,
      count,
      extraHint,
    });
  } catch (e) {
    if (e instanceof UnsafeSuggestionError) {
      redirect(`/admin/kuratieren?error=${encodeURIComponent(e.reason)}`);
    }
    throw e;
  }

  let created = 0;
  for (const s of result.suggestions) {
    await prisma.place.create({
      data: {
        regionId,
        type: s.type as PlaceType,
        name: s.name,
        locality: s.locality || locality,
        // Platzhalter-Koordinaten (Regions-Mitte) – per Kartenklick korrigieren
        lat: region.centerLat,
        lng: region.centerLng,
        tags: s.tags.map((t) => t.toLowerCase()),
        priceLevel: s.priceLevel ?? undefined,
        editorNotes: `[KI-Vorschlag · Sicherheit real: ${s.confidence} · FAKTEN & KOORDINATEN PRÜFEN] ${s.editorNote}`,
        status: "draft",
      },
    });
    created += 1;
  }

  revalidatePath("/admin/kuratieren");
  revalidatePath("/admin/places");
  redirect(`/admin/kuratieren?created=${created}`);
}

/**
 * YouTube-Transkript-Analyzer (Kuratierungs-Hilfe): Redakteur:in fügt einen oder
 * mehrere YouTube-Links ein. Das System holt das Transkript, die KI liest die
 * genannten Orte heraus und legt sie als ENTWÜRFE (status = draft) an – jeweils
 * mit dem Video als Quelle und einem Kontext-Zitat. Fakten und Koordinaten
 * prüft/recherchiert die Redaktion, bevor der Ort auf „Geprüft" geht.
 */
export async function analyzeYoutubeForPlaces(fd: FormData) {
  const regionId = str(fd, "regionId");
  const region = await prisma.region.findUnique({ where: { id: regionId } });
  if (!region) throw new Error("Region nicht gefunden");

  const urls = str(fd, "urls")
    .split(/[\s,]+/)
    .map((u) => u.trim())
    .filter(Boolean)
    .slice(0, 10);
  if (urls.length === 0) {
    redirect(`/admin/kuratieren?error=${encodeURIComponent("Keine YouTube-Links angegeben.")}`);
  }

  let created = 0;
  let videosOk = 0;
  const problems: string[] = [];

  // Bereits vorhandene Orte (Name+Ort, kleingeschrieben) – keine Dubletten anlegen
  const existing = await prisma.place.findMany({
    where: { regionId },
    select: { name: true, locality: true },
  });
  const seen = new Set(
    existing.map((p) => `${p.name.toLowerCase()}|${(p.locality ?? "").toLowerCase()}`)
  );

  for (const raw of urls) {
    let transcript;
    try {
      transcript = await fetchYoutubeTranscript(raw);
    } catch (e) {
      problems.push(e instanceof Error ? e.message : `Abruf fehlgeschlagen: ${raw}`);
      continue;
    }

    let result;
    try {
      result = await extractPlacesFromText({
        regionName: region.name,
        text: transcript.text,
        sourceLabel: `YouTube-Video „${transcript.title}"`,
      });
    } catch (e) {
      if (e instanceof UnsafeExtractionError) {
        problems.push(`„${transcript.title}": ${e.reason}`);
        continue;
      }
      problems.push(`„${transcript.title}": Analyse fehlgeschlagen`);
      continue;
    }
    videosOk += 1;

    for (const p of result.places) {
      const key = `${p.name.toLowerCase()}|${(p.locality || "").toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const place = await prisma.place.create({
        data: {
          regionId,
          type: p.type as PlaceType,
          name: p.name,
          locality: p.locality,
          // Platzhalter-Koordinaten (Regions-Mitte) – per Kartenklick korrigieren
          lat: region.centerLat,
          lng: region.centerLng,
          tags: p.tags.map((t) => t.toLowerCase()),
          priceLevel: p.priceLevel ?? undefined,
          editorNotes: `[Aus YouTube-Video „${transcript.title}" · Sicherheit real: ${p.confidence} · FAKTEN & KOORDINATEN PRÜFEN] ${p.quote}`,
          status: "draft",
        },
      });
      await prisma.source.create({
        data: {
          placeId: place.id,
          url: transcript.url,
          sourceType: "youtube",
          excerpt: `[Video „${transcript.title}"] ${p.quote}`.slice(0, 500),
        },
      });
      created += 1;
    }
  }

  revalidatePath("/admin/kuratieren");
  revalidatePath("/admin/places");
  const params = new URLSearchParams({ created: String(created), videos: String(videosOk) });
  if (problems.length) params.set("ythint", problems.slice(0, 5).join(" · "));
  redirect(`/admin/kuratieren?${params.toString()}`);
}

// ---------- Wanderungen ----------

function hikeData(fd: FormData) {
  return {
    regionId: str(fd, "regionId"),
    name: str(fd, "name"),
    locality: str(fd, "locality"),
    externalUrl: str(fd, "externalUrl") || null,
    startLat: num(fd, "startLat"),
    startLng: num(fd, "startLng"),
    startDescription: str(fd, "startDescription"),
    distanceKm: num(fd, "distanceKm"),
    durationMin: num(fd, "durationMin"),
    elevationGainM: num(fd, "elevationGainM"),
    difficulty: str(fd, "difficulty") as Difficulty,
    childFriendly: fd.get("childFriendly") === "on",
    gpxFile: str(fd, "gpxFile") || null,
    descriptionNotes: str(fd, "descriptionNotes"),
    tags: list(fd, "tags"),
    status: str(fd, "status") as ContentStatus,
    lastVerifiedAt: str(fd, "status") === "verified" ? new Date() : undefined,
  };
}

export async function createHike(fd: FormData) {
  const hike = await prisma.hike.create({ data: hikeData(fd) });
  redirect(`/admin/hikes/${hike.id}`);
}

export async function updateHike(fd: FormData) {
  const id = str(fd, "id");
  await prisma.hike.update({ where: { id }, data: hikeData(fd) });
  revalidatePath(`/admin/hikes/${id}`);
  revalidatePath("/admin/hikes");
}

export async function deleteHike(fd: FormData) {
  await prisma.hike.delete({ where: { id: str(fd, "id") } });
  revalidatePath("/admin/hikes");
  redirect("/admin/hikes");
}

// ---------- Bilder ----------

export async function addImage(fd: FormData) {
  const placeId = str(fd, "placeId") || null;
  const hikeId = str(fd, "hikeId") || null;
  await prisma.image.create({
    data: {
      placeId,
      hikeId,
      fileUrl: str(fd, "fileUrl"),
      license: str(fd, "license"),
      author: str(fd, "author"),
      sourceUrl: str(fd, "sourceUrl"),
    },
  });
  revalidatePath(placeId ? `/admin/places/${placeId}` : `/admin/hikes/${hikeId}`);
}

export async function deleteImage(fd: FormData) {
  const img = await prisma.image.delete({ where: { id: str(fd, "id") } });
  revalidatePath(img.placeId ? `/admin/places/${img.placeId}` : `/admin/hikes/${img.hikeId}`);
}

// ---------- Quellen ----------

export async function addSource(fd: FormData) {
  const placeId = str(fd, "placeId") || null;
  const hikeId = str(fd, "hikeId") || null;
  await prisma.source.create({
    data: {
      placeId,
      hikeId,
      url: str(fd, "url"),
      sourceType: str(fd, "sourceType") as SourceType,
      excerpt: str(fd, "excerpt"),
    },
  });
  revalidatePath(placeId ? `/admin/places/${placeId}` : `/admin/hikes/${hikeId}`);
}

export async function deleteSource(fd: FormData) {
  const src = await prisma.source.delete({ where: { id: str(fd, "id") } });
  revalidatePath(src.placeId ? `/admin/places/${src.placeId}` : `/admin/hikes/${src.hikeId}`);
}

/**
 * URL-Import (Anforderung 5.3): Redakteur fügt eine URL ein, das System holt
 * Titel und Beschreibung als Quellennotiz. Kein automatisches Text-Kopieren.
 */
export async function importSourceFromUrl(fd: FormData) {
  const url = str(fd, "url");
  const placeId = str(fd, "placeId") || null;
  const hikeId = str(fd, "hikeId") || null;

  let excerpt = "";
  try {
    const res = await fetch(url, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(10_000),
    });
    const html = await res.text();
    const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? "";
    const description =
      html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1] ??
      html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i)?.[1] ??
      "";
    excerpt = [title, description].filter(Boolean).join(" – ").slice(0, 500);
  } catch {
    excerpt = "(Automatischer Abruf fehlgeschlagen – bitte Notiz manuell ergänzen)";
  }

  await prisma.source.create({
    data: {
      placeId,
      hikeId,
      url,
      sourceType: url.includes("reddit.com") ? "reddit" : "blog",
      excerpt,
    },
  });
  revalidatePath(placeId ? `/admin/places/${placeId}` : `/admin/hikes/${hikeId}`);
}

/**
 * Reddit-Import-Helfer (Anforderung 5.3): sucht zu einem Ortsnamen relevante
 * Threads und legt Exzerpte als Quellen-Vorschläge an. Nutzt das öffentliche
 * JSON-Interface; API-Limits beachten (max. 5 Vorschläge, Redakteur prüft).
 */
export async function importRedditSources(fd: FormData) {
  const placeId = str(fd, "placeId");
  const query = str(fd, "query");
  if (!placeId || !query) return;

  try {
    const res = await fetch(
      `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&limit=5&sort=relevance`,
      {
        headers: { "User-Agent": "Reisefuehrer-Import/1.0" },
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (!res.ok) throw new Error(`Reddit-API ${res.status}`);
    const data = (await res.json()) as {
      data?: { children?: { data: { title: string; permalink: string; selftext?: string } }[] };
    };
    const posts = data.data?.children ?? [];
    for (const post of posts) {
      const p = post.data;
      await prisma.source.create({
        data: {
          placeId,
          url: `https://www.reddit.com${p.permalink}`,
          sourceType: "reddit",
          excerpt: `[Vorschlag, bitte prüfen] ${p.title}${p.selftext ? ` – ${p.selftext.slice(0, 200)}` : ""}`,
        },
      });
    }
  } catch (e) {
    console.error("[admin] Reddit-Import fehlgeschlagen:", e);
  }
  revalidatePath(`/admin/places/${placeId}`);
}

// ---------- Wissensbibliothek (community-gespeist, kuratiert) ----------

// Große Bücher erlaubt (PDF/EPUB mit Bildern bis ~120 MB). Wir speichern NICHT
// die riesige Binärdatei, sondern nur den daraus extrahierten Text – das umgeht
// Claudes 32-MB/100-Seiten-PDF-Limit und hält die Datenbank schlank.
const MAX_UPLOAD_BYTES = 120 * 1024 * 1024;

/** Buch/Reiseführer als Datei hochladen (PDF, EPUB, TXT oder Markdown). */
export async function uploadKnowledgeFile(fd: FormData) {
  let successTitle = "";
  try {
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) {
      throw new Error("Keine Datei ausgewählt.");
    }
    console.log(
      `[upload] Start: name=${file.name} size=${(file.size / 1_048_576).toFixed(1)}MB type=${file.type || "?"}`
    );
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new Error("Datei zu groß (max. 120 MB).");
    }
    const regionId = str(fd, "regionId");
    if (!regionId) throw new Error("Keine Region gewählt.");

    // Text lokal extrahieren (Bilder werden ignoriert); nur der Text wird
    // gespeichert und später an die KI gegeben.
    const { extractTextFromFile } = await import("@/lib/knowledge/extract-text");
    const { text, kind } = await extractTextFromFile(file);
    console.log(`[upload] Extrahiert: kind=${kind} textLen=${text.length}`);

    successTitle = str(fd, "title") || file.name;
    await prisma.knowledgeDocument.create({
      data: {
        regionId,
        kind: str(fd, "kind") === "guidebook" ? "guidebook" : "book",
        title: successTitle,
        fileName: file.name,
        // Als reiner Text ablegen -> Worker nutzt den analyzeText-Pfad
        mimeType: "text/plain",
        fileData: Buffer.from(text, "utf8"),
        status: "uploaded",
        moderationStatus: "approved", // Redaktions-Upload ist direkt freigegeben
      },
    });
    console.log(`[upload] Gespeichert: "${successTitle}"`);
  } catch (e) {
    // Echte Ursache in die Server-Logs schreiben und dem Nutzer lesbar zeigen,
    // statt der generischen Next-Fehlerseite.
    console.error("[upload] Fehlgeschlagen:", e);
    const msg = e instanceof Error ? e.message : "Upload konnte nicht verarbeitet werden.";
    redirect("/admin/knowledge?error=" + encodeURIComponent(msg));
  }

  revalidatePath("/admin/knowledge");
  redirect("/admin/knowledge?ok=" + encodeURIComponent(`„${successTitle}" hochgeladen – Text extrahiert.`));
}

/** Blog/Artikel per URL verlinken. */
export async function addKnowledgeUrl(fd: FormData) {
  await prisma.knowledgeDocument.create({
    data: {
      regionId: str(fd, "regionId"),
      kind: str(fd, "kind") === "article" ? "article" : "blog",
      title: str(fd, "title") || str(fd, "url"),
      url: str(fd, "url"),
      status: "uploaded",
      moderationStatus: "approved",
    },
  });
  revalidatePath("/admin/knowledge");
}

/**
 * Mehrere Blogs/Artikel auf einmal anzapfen: ein Textfeld mit einer URL pro
 * Zeile. Je URL wird eine Wissensquelle angelegt; der Worker holt und
 * paraphrasiert sie anschließend (analyzeUrl). Praktisch, um schnell viele
 * Blogs einzulesen.
 */
export async function addKnowledgeUrls(fd: FormData) {
  const regionId = str(fd, "regionId");
  const kind = str(fd, "kind") === "article" ? "article" : "blog";
  const urls = str(fd, "urls")
    .split(/[\s]+/)
    .map((u) => u.trim())
    .filter((u) => /^https?:\/\//i.test(u))
    .slice(0, 30);

  const seen = new Set<string>();
  let created = 0;
  for (const url of urls) {
    if (seen.has(url)) continue;
    seen.add(url);
    const existing = await prisma.knowledgeDocument.findFirst({ where: { regionId, url } });
    if (existing) continue;
    await prisma.knowledgeDocument.create({
      data: {
        regionId,
        kind: kind as DocumentKind,
        title: url,
        url,
        status: "uploaded",
        moderationStatus: "approved",
      },
    });
    created += 1;
  }
  revalidatePath("/admin/knowledge");
  redirect(`/admin/knowledge?ok=${encodeURIComponent(`${created} Blog-Quelle(n) angelegt – werden analysiert.`)}`);
}

export async function deleteKnowledgeDocument(fd: FormData) {
  await prisma.knowledgeDocument.delete({ where: { id: str(fd, "id") } });
  revalidatePath("/admin/knowledge");
}

/** Erneut analysieren lassen (z. B. nach Modell-Update). */
export async function reanalyzeKnowledgeDocument(fd: FormData) {
  await prisma.knowledgeDocument.update({
    where: { id: str(fd, "id") },
    data: { status: "uploaded", error: null },
  });
  revalidatePath("/admin/knowledge");
}

/** Moderation: Nutzer-Einreichung freigeben (geht danach in die Analyse). */
export async function approveKnowledgeDocument(fd: FormData) {
  await prisma.knowledgeDocument.update({
    where: { id: str(fd, "id") },
    data: { moderationStatus: "approved", status: "uploaded", error: null },
  });
  revalidatePath("/admin/knowledge");
}

/** Moderation: Nutzer-Einreichung ablehnen. */
export async function rejectKnowledgeDocument(fd: FormData) {
  await prisma.knowledgeDocument.update({
    where: { id: str(fd, "id") },
    data: {
      moderationStatus: "rejected",
      moderationNote: str(fd, "note") || "Redaktionell abgelehnt",
    },
  });
  revalidatePath("/admin/knowledge");
}

export async function deleteKnowledgeChunk(fd: FormData) {
  await prisma.knowledgeChunk.delete({ where: { id: str(fd, "id") } });
  revalidatePath("/admin/knowledge");
}

// ---------- Regions-Infos ("Gut zu wissen") ----------

export async function addRegionInfo(fd: FormData) {
  const regionId = str(fd, "regionId");
  await prisma.regionInfo.create({
    data: {
      regionId,
      title: str(fd, "title"),
      content: str(fd, "content"),
      format: str(fd, "format") as InfoFormat,
      sortOrder: num(fd, "sortOrder"),
    },
  });
  revalidatePath(`/admin/regions/${regionId}`);
}

export async function updateRegionInfo(fd: FormData) {
  const info = await prisma.regionInfo.update({
    where: { id: str(fd, "id") },
    data: {
      title: str(fd, "title"),
      content: str(fd, "content"),
      format: str(fd, "format") as InfoFormat,
      sortOrder: num(fd, "sortOrder"),
    },
  });
  revalidatePath(`/admin/regions/${info.regionId}`);
}

export async function deleteRegionInfo(fd: FormData) {
  const info = await prisma.regionInfo.delete({ where: { id: str(fd, "id") } });
  revalidatePath(`/admin/regions/${info.regionId}`);
}

// ---------- Karten-Spots (Instagram-/Foto-Fundorte) ----------

function spotData(fd: FormData) {
  return {
    regionId: str(fd, "regionId"),
    name: str(fd, "name"),
    category: str(fd, "category") as SpotCategory,
    lat: num(fd, "lat"),
    lng: num(fd, "lng"),
    locality: str(fd, "locality"),
    note: str(fd, "note"),
    sourceUrl: str(fd, "sourceUrl"),
    sourceLabel: str(fd, "sourceLabel"),
    status: str(fd, "status") as ContentStatus,
  };
}

export async function createMapSpot(fd: FormData) {
  await prisma.mapSpot.create({ data: spotData(fd) });
  revalidatePath("/admin/spots");
}

export async function updateMapSpot(fd: FormData) {
  await prisma.mapSpot.update({ where: { id: str(fd, "id") }, data: spotData(fd) });
  revalidatePath("/admin/spots");
}

export async function deleteMapSpot(fd: FormData) {
  await prisma.mapSpot.delete({ where: { id: str(fd, "id") } });
  revalidatePath("/admin/spots");
}

// ---------- Guide-Requests ----------

/** Neu-Generierung anstoßen (Anforderung 4.5): Status zurück auf pending. */
export async function requeueGuideRequest(fd: FormData) {
  await prisma.guideRequest.update({
    where: { id: str(fd, "id") },
    // Fortschritt zurücksetzen, damit die Anzeige nicht den Stand des
    // abgebrochenen Laufs weiterzeigt
    data: {
      status: "pending",
      error: null,
      progressDone: 0,
      progressTotal: 0,
      progressLabel: "",
      heartbeatAt: null,
    },
  });
  revalidatePath("/admin");
}
