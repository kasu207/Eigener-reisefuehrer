export default function DatenschutzPage() {
  return (
    <main id="inhalt" className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="font-serif text-3xl">Datenschutzerklärung</h1>
      <div className="mt-6 space-y-4 leading-relaxed text-neutral-700">
        <h2 className="font-serif text-xl">Welche Daten wir verarbeiten</h2>
        <p>
          Zur Erstellung eures persönlichen Reiseführers verarbeiten wir die im
          Fragebogen gemachten Angaben (Reisezeitraum, Unterkunftsort,
          Interessen, Vornamen) sowie eure E-Mail-Adresse für den Versand des
          Ergebnis-Links. Rechtsgrundlage ist eure Einwilligung
          (Art. 6 Abs. 1 lit. a DSGVO), die beim Absenden des Fragebogens
          protokolliert wird.
        </p>
        <h2 className="font-serif text-xl">Speicherung im Browser</h2>
        <p>
          Damit eure Antworten bei einem versehentlichen Neuladen nicht
          verloren gehen, speichert der Fragebogen den Zwischenstand lokal in
          eurem Browser (localStorage). Diese Daten verlassen euer Gerät nicht,
          werden nach spätestens 7 Tagen verworfen und beim Absenden des
          Fragebogens gelöscht. Über „Neu beginnen" könnt ihr sie jederzeit
          selbst entfernen. Es werden keine Tracking- oder Marketing-Cookies
          gesetzt.
        </p>
        <h2 className="font-serif text-xl">Speicherdauer und Löschung</h2>
        <p>
          Personenbezogene Daten (E-Mail-Adresse, Vornamen, Fragebogen) werden
          nach 12 Monaten automatisch gelöscht. Ihr könnt jederzeit die
          vorzeitige Löschung verlangen.
        </p>
        <h2 className="font-serif text-xl">Auftragsverarbeiter</h2>
        <p>
          Für die Texterstellung nutzen wir die Claude API (Anthropic), für den
          E-Mail-Versand einen Transaktionsmail-Dienst. Hosting erfolgt in der
          EU. [Vor dem Launch: konkrete Anbieter, AV-Verträge und
          Drittlandtransfers ergänzen.]
        </p>
        <h2 className="font-serif text-xl">Eure Rechte</h2>
        <p>
          Ihr habt das Recht auf Auskunft, Berichtigung, Löschung und
          Widerruf eurer Einwilligung. Kontakt: [E-Mail-Adresse].
        </p>
      </div>
    </main>
  );
}
