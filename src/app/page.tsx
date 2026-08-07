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
          className="inline-block rounded-full bg-(--color-ink) px-8 py-4 text-lg text-white transition hover:bg-(--color-accent)"
        >
          Fragebogen starten
        </Link>
      </div>
      <div className="mt-16 grid gap-8 sm:grid-cols-3">
        {[
          ["Kuratierte Datenbank", "Jede Empfehlung ist redaktionell geprüft – keine erfundenen Fakten."],
          ["Wirklich persönlich", "Auswahl und Texte richten sich nach euren Interessen, eurem Tempo und eurer Küche."],
          ["Web & PDF", "Lesbar auf dem Handy, als A5-PDF zum Mitnehmen."],
        ].map(([title, text]) => (
          <div key={title}>
            <h2 className="font-serif text-xl">{title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-neutral-600">{text}</p>
          </div>
        ))}
      </div>
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
