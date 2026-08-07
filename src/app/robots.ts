import type { MetadataRoute } from "next";

/**
 * Guide-Links sind "unguessable URLs" statt Login (Anforderung 8) – ihr
 * einziger Schutz ist, dass niemand sie kennt. Landet ein solcher Link
 * einmal in einer Suchmaschine (geteilter Screenshot, Referrer, Toolbar),
 * ist der komplette Reiseführer mit Vornamen, Reisedaten und Unterkunft
 * öffentlich auffindbar. Deshalb: Crawler halten sich von `/guide/` fern,
 * ergänzend setzt die Guide-Seite selbst `noindex`.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/guide/", "/admin/", "/api/"],
      },
    ],
  };
}
