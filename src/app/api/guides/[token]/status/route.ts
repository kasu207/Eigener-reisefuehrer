import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Leichtgewichtiger Status für das Live-Polling der Guide-Seite. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const guide = await prisma.guide.findFirst({
    where: { OR: [{ publicToken: token }, { shareToken: token }] },
    include: { guideRequest: { select: { status: true } } },
  });
  if (!guide) return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });

  return NextResponse.json({
    status: guide.guideRequest.status,
    generatedAt: guide.generatedAt,
  });
}
