import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { chromium } from "playwright-core";
import { guideContentSchema } from "@/lib/guide-content";
import { downloadFileName } from "@/lib/filename";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Sprechender Dateiname statt immer „reisefuehrer.pdf" – wer mehrere Guides
 * herunterlädt, hat sonst reisefuehrer(1).pdf, (2)… im Download-Ordner.
 */
function pdfFileName(content: unknown): string {
  const parsed = guideContentSchema.safeParse(content);
  return downloadFileName(parsed.success ? parsed.data.intro.title : "", "pdf", "reisefuehrer");
}

/** Lesbare Fehlerseite statt eines nackten 500ers im Download-Dialog. */
function pdfError(message: string): NextResponse {
  return new NextResponse(message, {
    status: 503,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "120" },
  });
}

/**
 * A5-PDF-Export (Anforderung 4.4): rendert die Web-Ansicht mit Print-CSS
 * über Headless Chromium. Kein Druckstandard nötig; kontrollierte
 * Seitenumbrüche, Inhaltsverzeichnis und Seitenzahlen.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  // Besitzer- und Lese-Link dürfen beide das PDF laden
  const guide = await prisma.guide.findFirst({
    where: { OR: [{ publicToken: token }, { shareToken: token }] },
  });
  if (!guide) {
    return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
  }

  // Im Container rendert Chromium die eigene App über die interne URL;
  // APP_URL bleibt die öffentliche Adresse für E-Mail-Links.
  const appUrl =
    process.env.PDF_INTERNAL_URL ?? process.env.APP_URL ?? "http://localhost:3000";
  const executablePath = process.env.CHROMIUM_PATH || undefined;
  // z. B. "--no-sandbox --disable-dev-shm-usage" beim Betrieb als Root im Container
  const args = (process.env.CHROMIUM_ARGS ?? "").split(" ").filter(Boolean);

  let browser;
  try {
    browser = await chromium.launch({ executablePath, args });
  } catch (err) {
    console.error("[pdf] Chromium konnte nicht gestartet werden:", err);
    return pdfError(
      "Der PDF-Export ist auf diesem Server nicht verfügbar (Chromium fehlt). Nutzt so lange die Web-Ansicht oder den Markdown-Export."
    );
  }

  try {
    const page = await browser.newPage();
    // `networkidle` allein kann hängen bleiben: Die Guide-Seite pollt während
    // der Generierung ihren Status und lädt Kartenkacheln nach. Ein eigenes
    // Zeitbudget sorgt dafür, dass wir notfalls mit dem drucken, was da ist,
    // statt in einen unbehandelten 500er zu laufen.
    await page.goto(`${appUrl}/guide/${token}`, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    await page
      .waitForLoadState("networkidle", { timeout: 20_000 })
      .catch(() => console.warn("[pdf] networkidle nicht erreicht – drucke aktuellen Stand."));
    await page.emulateMedia({ media: "print" });

    const pdf = await page.pdf({
      format: "A5",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: `
        <div style="width:100%;font-size:8px;color:#8a8378;text-align:center;font-family:Georgia,serif;">
          <span class="pageNumber"></span>
        </div>`,
      margin: { top: "14mm", bottom: "14mm", left: "12mm", right: "12mm" },
    });

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${pdfFileName(guide.content)}"`,
        // Guides sind privat – weder Suchmaschinen noch Zwischenspeicher.
        "X-Robots-Tag": "noindex, nofollow",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    console.error("[pdf] Rendern fehlgeschlagen:", err);
    return pdfError(
      "Das PDF konnte gerade nicht erzeugt werden. Bitte versucht es in ein paar Minuten erneut – die Web-Ansicht bleibt nutzbar."
    );
  } finally {
    await browser.close().catch(() => {});
  }
}
