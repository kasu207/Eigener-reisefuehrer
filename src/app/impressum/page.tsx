import { siteOperator, missingOperatorFields, OPERATOR_FIELD_LABELS } from "@/lib/site-config";

export const dynamic = "force-dynamic";

/**
 * Impressum nach § 5 DDG. Inhalte kommen aus der Umgebung
 * (siehe lib/site-config.ts), damit sie ohne Deployment änderbar sind.
 */
export default function ImpressumPage() {
  const op = siteOperator();
  const missing = missingOperatorFields(op);

  return (
    <main id="inhalt" className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="font-serif text-3xl">Impressum</h1>

      {missing.length > 0 && (
        <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>Noch nicht vollständig.</strong> Diese Pflichtangaben fehlen in
          der Konfiguration:
          <ul className="mt-2 list-disc pl-5">
            {missing.map((f) => (
              <li key={f}>{OPERATOR_FIELD_LABELS[f]}</li>
            ))}
          </ul>
          <p className="mt-2">
            In der <code>.env</code> setzen und die Anwendung neu starten.
          </p>
        </div>
      )}

      <div className="mt-6 space-y-4 leading-relaxed text-neutral-700">
        <section>
          <h2 className="font-serif text-xl">Angaben gemäß § 5 DDG</h2>
          <p className="mt-2">
            {op.name || "[OPERATOR_NAME]"}
            <br />
            {op.street || "[OPERATOR_STREET]"}
            <br />
            {op.city || "[OPERATOR_CITY]"}
          </p>
        </section>

        <section>
          <h2 className="font-serif text-xl">Kontakt</h2>
          <p className="mt-2">
            E-Mail:{" "}
            {op.email ? (
              <a href={`mailto:${op.email}`} className="text-(--color-accent) underline">
                {op.email}
              </a>
            ) : (
              "[OPERATOR_EMAIL]"
            )}
            {op.phone && (
              <>
                <br />
                Telefon: {op.phone}
              </>
            )}
          </p>
        </section>

        {op.vatId && (
          <section>
            <h2 className="font-serif text-xl">Umsatzsteuer-Identifikationsnummer</h2>
            <p className="mt-2">{op.vatId}</p>
          </section>
        )}

        <section>
          <h2 className="font-serif text-xl">Verantwortlich für den Inhalt</h2>
          <p className="mt-2">{op.responsible || op.name || "[OPERATOR_NAME]"}</p>
        </section>

        <section>
          <h2 className="font-serif text-xl">Kartenmaterial und Ortsdaten</h2>
          <p className="mt-2">
            Karten und Teile der Ortsdaten stammen von{" "}
            <a
              href="https://www.openstreetmap.org/copyright"
              className="text-(--color-accent) underline"
            >
              OpenStreetMap-Mitwirkenden
            </a>{" "}
            (ODbL). Bildrechte und Urheber werden am jeweiligen Bild genannt.
          </p>
        </section>
      </div>
    </main>
  );
}
