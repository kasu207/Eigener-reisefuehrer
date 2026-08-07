import { NextRequest, NextResponse } from "next/server";
import { basicAuthMatches } from "@/lib/basic-auth";

/** Basic Auth für den Admin-Bereich (Anforderung 4.5 / 8). */
function unauthorized(): NextResponse {
  return new NextResponse("Authentifizierung erforderlich.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Admin", charset="UTF-8"' },
  });
}

export function middleware(req: NextRequest) {
  const user = process.env.ADMIN_USER ?? "admin";
  const password = process.env.ADMIN_PASSWORD;

  if (!password) {
    return new NextResponse("Admin-Bereich nicht konfiguriert (ADMIN_PASSWORD fehlt).", {
      status: 503,
    });
  }

  if (basicAuthMatches(req.headers.get("authorization"), user, password)) {
    return NextResponse.next();
  }
  return unauthorized();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
