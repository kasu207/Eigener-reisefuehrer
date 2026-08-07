export default function ImpressumPage() {
  return (
    <main id="inhalt" className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="font-serif text-3xl">Impressum</h1>
      <div className="prose mt-6 space-y-4 text-neutral-700">
        <p>
          Angaben gemäß § 5 TMG / DDG.
          <br />
          <strong>[Name / Firma eintragen]</strong>
          <br />
          [Straße, Hausnummer]
          <br />
          [PLZ, Ort]
        </p>
        <p>
          Kontakt: [E-Mail-Adresse]
        </p>
        <p className="text-sm text-neutral-500">
          Hinweis: Platzhalter vor dem Launch durch die echten Angaben ersetzen.
        </p>
      </div>
    </main>
  );
}
