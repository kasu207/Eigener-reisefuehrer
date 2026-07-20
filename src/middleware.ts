import { NextRequest, NextResponse } from "next/server";

/** Basic Auth für den Admin-Bereich (Anforderung 4.5 / 8). */
export function middleware(req: NextRequest) {
  const user = process.env.ADMIN_USER ?? "admin";
  const password = process.env.ADMIN_PASSWORD;

  if (!password) {
    return new NextResponse("Admin-Bereich nicht konfiguriert (ADMIN_PASSWORD fehlt).", {
      status: 503,
    });
  }

  const header = req.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    const [u, p] = atob(header.slice(6)).split(":");
    if (u === user && p === password) return NextResponse.next();
  }

  return new NextResponse("Authentifizierung erforderlich.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Admin"' },
  });
}

export const config = {
  matcher: ["/admin/:path*"],
};
