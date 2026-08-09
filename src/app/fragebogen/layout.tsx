import type { Metadata } from "next";

/** Nur für die Metadaten: Die Seite selbst ist eine Client-Komponente und
 *  kann `metadata` nicht selbst exportieren. */
export const metadata: Metadata = {
  title: "Fragebogen",
  description: "Beantwortet ein paar Fragen – wir stellen euren persönlichen Reiseführer zusammen.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
