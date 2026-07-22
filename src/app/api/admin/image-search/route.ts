import { NextRequest, NextResponse } from "next/server";
import { searchImages } from "@/lib/images/search";

export const dynamic = "force-dynamic";

/**
 * Bildersuche für die Redaktion (Wikimedia Commons). Durch die Middleware
 * per Basic Auth geschützt (Matcher deckt /api/admin ab).
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json({ error: "Suchbegriff fehlt." }, { status: 400 });
  }
  try {
    const results = await searchImages(q, 10);
    return NextResponse.json({ results });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Bildersuche fehlgeschlagen: ${message}` }, { status: 502 });
  }
}
