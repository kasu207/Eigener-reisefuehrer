import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["playwright-core", "@prisma/client"],
  experimental: {
    serverActions: {
      // Buch-/PDF-Uploads in der Wissensbibliothek
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
