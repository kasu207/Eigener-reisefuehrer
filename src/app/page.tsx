import Link from "next/link";
import { LakeHero } from "@/components/illustrations";

export default function HomePage() {
  return (
    <main id="inhalt" className="mx-auto max-w-3xl px-6 py-16">
      <div className="mb-10 overflow-hidden rounded-3xl border border-neutral-200 shadow-sm">
        <LakeHero className="block w-full" />
      </div>
      <p className="mb-4 text-sm uppercase tracking-widest text-(--color-accent)">
        Comer See · Italien
      </p>
      <h1 className="font-serif text-5xl leading-tight">
        Ein Reiseführer, der nur für euch geschrieben wird.
      </h1>
      <p className="mt-6 max-w-xl text-lg leading-relaxed text-neutral-700">
        Beantwortet ein paar Fragen zu eurer Reise – wir stellen aus unserer
        kuratierten, redaktionell geprüften Orte-Datenbank euren persönlichen
        Reiseführer zusammen: mit Karte, Wanderungen, Restaurant-Tipps und
        Tagesvorschlägen. Als Web-Ansicht und PDF.
      </p>
      <div className="mt-10">
        <Link
          href="/fragebogen"
          className="inline-block rounded-full bg-(--color-ink) px-8 py-4 text-lg text-white shadow-sm transition hover:bg-(--color-accent) focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-accent) focus-visible:ring-offset-2 active:translate-y-px"
        >
          Fragebogen starten
        </Link>
      </div>
      {/* Nummerierte Liste statt drei gleich breiter Spalten: Die drei
          Aussagen bauen aufeinander auf (geprüfte Daten → persönliche
          Auswahl → Ergebnis), das zeigt eine Abfolge besser als ein Raster.
          Nebenbei verschwindet das generischste aller Layout-Muster. */}
      <ol className="mt-16 border-t border-neutral-200">
        {[
          [
            "Redaktionell geprüft",
            "Jede Empfehlung stammt aus unserer kuratierten Orte-Datenbank. Adressen, Preise und Öffnungszeiten kommen aus geprüften Einträgen – nicht aus einem Sprachmodell.",
          ],
          [
            "Auf euch zugeschnitten",
            "Auswahl und Texte richten sich nach euren Interessen, eurem Tempo, eurer Küche und eurer Unterkunft. Zwei Paare bekommen zwei verschiedene Reiseführer.",
          ],
          [
            "Zum Lesen und Mitnehmen",
            "Im Browser jederzeit anpassbar, als A5-PDF zum Ausdrucken oder Offline-Lesen unterwegs.",
          ],
        ].map(([title, text], i) => (
          <li
            key={title}
            className="grid gap-x-6 gap-y-1 border-b border-neutral-200 py-6 sm:grid-cols-[3rem_1fr]"
          >
            <span
              aria-hidden="true"
              className="font-serif text-2xl text-(--color-accent)/45 sm:text-3xl"
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <div>
              <h2 className="font-serif text-xl">{title}</h2>
              <p className="measure mt-2 text-sm leading-relaxed text-neutral-600">{text}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-14 rounded-2xl bg-(--color-accent-soft)/40 p-6">
        <h2 className="font-serif text-xl">Du kennst gute Quellen zum Comer See?</h2>
        <p className="mt-2 text-sm text-neutral-700">
          Unsere Wissensdatenbank wächst durch die Community: Schlag Blogs und
          Artikel vor – kuratiert, geprüft und mit Quellenangabe aufbereitet.
        </p>
        <Link href="/beitragen" className="mt-3 inline-block text-(--color-accent) underline">
          Quelle vorschlagen
        </Link>
      </div>
    </main>
  );
}
