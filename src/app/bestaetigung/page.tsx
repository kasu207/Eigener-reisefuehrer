import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Bestätigung",
  description: "Euer Reiseführer wird erstellt.",
};

import Link from "next/link";

export default function BestaetigungPage() {
  return (
    <main id="inhalt" className="mx-auto max-w-2xl px-6 py-24 text-center">
      <p className="mb-4 text-sm uppercase tracking-widest text-(--color-accent)">Danke!</p>
      <h1 className="font-serif text-4xl">Euer Reiseführer wird geschrieben.</h1>
      <p className="mx-auto mt-6 max-w-md leading-relaxed text-neutral-700">
        Wir stellen jetzt eure persönliche Auswahl zusammen und schreiben die
        Texte. Das dauert in der Regel <strong>unter 10 Minuten</strong>. Sobald
        alles fertig ist, bekommt ihr den Link per E-Mail – ihr müsst nicht
        warten.
      </p>
      <Link href="/" className="mt-10 inline-block text-(--color-accent) underline">
        Zurück zur Startseite
      </Link>
    </main>
  );
}
