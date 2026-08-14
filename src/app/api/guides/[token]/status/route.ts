import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isStale, progressPercent } from "@/lib/generation-progress";

export const dynamic = "force-dynamic";

/**
 * Leichtgewichtiger Status für das Live-Polling der Guide-Seite.
 * Liefert neben dem Status auch den Kapitel-Fortschritt – nur damit ändert
 * sich zwischen zwei Kapiteln überhaupt etwas, an dem der Client merkt, dass
 * er neu laden soll (`generatedAt` wird erst ganz am Ende gesetzt).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const guide = await prisma.guide.findFirst({
    where: { OR: [{ publicToken: token }, { shareToken: token }] },
    include: {
      guideRequest: {
        select: {
          status: true,
          progressDone: true,
          progressTotal: true,
          progressLabel: true,
          heartbeatAt: true,
          createdAt: true,
        },
      },
    },
  });
  if (!guide) return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });

  const r = guide.guideRequest;
  return NextResponse.json({
    status: r.status,
    generatedAt: guide.generatedAt,
    progress: {
      done: r.progressDone,
      total: r.progressTotal,
      label: r.progressLabel,
      percent: progressPercent(r.progressDone, r.progressTotal),
    },
    heartbeatAt: r.heartbeatAt,
    stale: isStale(r),
  });
}
