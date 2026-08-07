import Link from "next/link";

/** Deutschsprachige 404-Seite statt der generischen Next-Vorgabe. */
export default function NotFound() {
  return (
    <main id="inhalt" className="mx-auto max-w-2xl px-6 py-24 text-center">
      <p className="text-sm uppercase tracking-widest text-(--color-accent)">Fehler 404</p>
      <h1 className="mt-4 font-serif text-4xl">Diese Seite gibt es nicht</h1>
      <p className="mt-4 leading-relaxed text-neutral-700">
        Vielleicht hat sich ein Tippfehler in die Adresse geschlichen, oder die
        Seite ist umgezogen.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="rounded-full bg-(--color-ink) px-6 py-3 text-sm text-white transition hover:bg-(--color-accent)"
        >
          Zur Startseite
        </Link>
        <Link
          href="/fragebogen"
          className="rounded-full border border-neutral-400 px-6 py-3 text-sm text-neutral-700 transition hover:bg-neutral-100"
        >
          Reiseführer erstellen
        </Link>
      </div>
    </main>
  );
}
