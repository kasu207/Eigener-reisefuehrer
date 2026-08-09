import type { Metadata } from "next";

/** Nur für die Metadaten: Die Seite selbst ist eine Client-Komponente und
 *  kann `metadata` nicht selbst exportieren. */
export const metadata: Metadata = {
  title: "Quelle vorschlagen",
  description: "Schlagt Blogs und Artikel für unsere Wissensdatenbank vor.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
