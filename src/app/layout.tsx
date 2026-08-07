import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Euer persönlicher Reiseführer",
  description:
    "Kuratierte, persönliche Reiseführer – erstellt aus euren Antworten und einer geprüften Orte-Datenbank.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="min-h-screen antialiased">
        {/* Sprungmarke: Der Guide ist sehr lang – Tastatur- und
            Screenreader-Nutzer sollen die Navigation überspringen können. */}
        <a
          href="#inhalt"
          className="no-print sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-(--color-ink) focus:px-4 focus:py-2 focus:text-white"
        >
          Zum Inhalt springen
        </a>
        {children}
        <footer className="no-print mx-auto max-w-3xl px-6 py-10 text-sm text-neutral-500">
          <div className="flex gap-6 border-t border-neutral-200 pt-6">
            <Link href="/impressum" className="hover:text-neutral-800">Impressum</Link>
            <Link href="/datenschutz" className="hover:text-neutral-800">Datenschutz</Link>
            <Link href="/beitragen" className="hover:text-neutral-800">Quelle vorschlagen</Link>
          </div>
        </footer>
      </body>
    </html>
  );
}
