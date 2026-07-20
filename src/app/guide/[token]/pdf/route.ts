import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { chromium } from "playwright-core";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

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

  const browser = await chromium.launch({ executablePath, args });
  try {
    const page = await browser.newPage();
    await page.goto(`${appUrl}/guide/${token}`, { waitUntil: "networkidle" });
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
        "Content-Disposition": `attachment; filename="reisefuehrer.pdf"`,
      },
    });
  } finally {
    await browser.close();
  }
}
