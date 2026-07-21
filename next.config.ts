import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["playwright-core", "@prisma/client", "pdf-parse"],
  experimental: {
    serverActions: {
      // Buch-Uploads in der Wissensbibliothek (große PDFs/EPUBs mit Bildern);
      // der Text wird beim Upload extrahiert, nur er wird gespeichert.
      bodySizeLimit: "120mb",
    },
  },
};

export default nextConfig;
