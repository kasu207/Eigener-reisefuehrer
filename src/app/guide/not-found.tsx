import Link from "next/link";

/**
 * Ein Guide-Link, zu dem es keinen Guide (mehr) gibt. Häufigste Ursachen:
 * beim Kopieren abgeschnitten oder nach der DSGVO-Frist gelöscht. Beides
 * hier benennen – eine nackte 404 lässt Nutzer im Dunkeln, ob ihr
 * Reiseführer weg ist oder nur der Link kaputt.
 */
export default function GuideNotFound() {
  return (
    <main id="inhalt" className="mx-auto max-w-2xl px-6 py-24 text-center">
      <p className="text-sm uppercase tracking-widest text-(--color-accent)">Link ungültig</p>
      <h1 className="mt-4 font-serif text-4xl">Dieser Reiseführer ist nicht erreichbar</h1>
      <div className="mt-6 space-y-3 text-left leading-relaxed text-neutral-700">
        <p>Dafür gibt es meist zwei Gründe:</p>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            Der Link wurde beim Kopieren <strong>abgeschnitten</strong> – er ist
            recht lang. Prüft, ob am Ende etwas fehlt, oder öffnet ihn direkt
            aus eurer E-Mail.
          </li>
          <li>
            Der Reiseführer wurde nach Ablauf der <strong>Löschfrist</strong>{" "}
            entfernt. Personenbezogene Daten löschen wir automatisch (siehe{" "}
            <Link href="/datenschutz" className="text-(--color-accent) underline">
              Datenschutz
            </Link>
            ).
          </li>
        </ul>
      </div>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link
          href="/fragebogen"
          className="rounded-full bg-(--color-ink) px-6 py-3 text-sm text-white transition hover:bg-(--color-accent)"
        >
          Neuen Reiseführer erstellen
        </Link>
        <Link
          href="/"
          className="rounded-full border border-neutral-400 px-6 py-3 text-sm text-neutral-700 transition hover:bg-neutral-100"
        >
          Zur Startseite
        </Link>
      </div>
    </main>
  );
}
