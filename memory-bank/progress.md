# Progress

Arbeitsstand, offene Punkte und gemachte Fehler. **Nach jeder Aufgabe
fortschreiben** – der nächste Agent startet ohne dein Kontextfenster.

Format: neueste Einträge oben.

---

## Erledigt

### 2026-08-14 · Karten-Links auf Koordinaten + Nachtrag-Skripte

- **Google-Maps-Link zeigte nie auf die Koordinaten.** `renderPlaceEntry` baute
  ihn aus Adresse oder „Name, Ort" – eine Suche, die Google bei kleinen Lokalen
  oft nicht auflöst. Neu: `placeMapsHref` nimmt zuerst die Koordinaten aus der
  DB, Adresse und Name sind nur noch Rückfall für Platzhalter-Koordinaten.
  Betrifft Guide-Seite UND Markdown-/PDF-Export.
- `npm run db:report-coords` – reiner Lesebericht über den Koordinaten-Zustand
  (Platzhalter, Ausreißer >60 km, Häufungen, Verteilung je Stadt).
- `npm run db:backfill-coords` – Nachtrag für den gesamten Bestand mit
  `--dry-run`, `--region=`, `--all`, `--limit=`. Ohne Stapelgrenze der Admin-UI.

### 2026-08-14 · Koordinaten automatisch ermitteln + Kategorie „Tagesausflüge"

- `src/lib/coordinates.ts`: `resolvePlaceCoordinates` als Kaskade
  Adresse → OSM-POI (Namenssuche im Umkreis) → Freitext-Namenssuche →
  Ortsmittelpunkt → Regions-Mitte. Treffer weit außerhalb der Region werden
  verworfen (`isPlausible`, 60 km).
- Eingebaut in KI-Ortsvorschläge und YouTube-Auswertung – beide setzten vorher
  hart die Regions-Mitte.
- `findOsmPoiByName` in `osm-places.ts` (Overpass-Namenssuche mit
  Ähnlichkeitsschwelle 0,6).
- Nominatim-Aufrufe laufen jetzt durch eine Warteschlange (1 Anfrage/Sekunde),
  sonst sperrt ein Stapellauf die IP.
- Neue Seite `/admin/places/coordinates`: listet Orte auf der Regions-Mitte,
  verortet sie in Stapeln zu 25, einzeln oder gesammelt.
- Neuer `PlaceType` **`daytrip`** samt AreaKey `daytrips`: eigener Abschnitt je
  Ort-Kapitel im Guide (mit „+"-Regler), eigene Zielmenge (etwa jeder dritte
  Reisetag, 1–6), eigener Mindestbestand in der Startklar-Prüfung, eigener
  Prompt-Hinweis (Anfahrt, Zeitbedarf). `locality` ist der **Ausgangsort**,
  nicht das Ziel.
- Tests: 17 neue Fälle (205 gesamt).

### 2026-08-14 · Zusammenführung auf `main`

Die drei Arbeitspakete unten entstanden auf einem Branch, der am **alten**
Default-Branch (`claude/mvp-anforderungen-lahn6c`) hing. `origin/main` war zu
dem Zeitpunkt bereits 15 Commits weiter (Design-Umbau, private Nutzer-Tipps,
Wissensdatenbank auf pg_trgm, Startklar-Prüfung). Alles wurde nach `main`
gemerged; sechs Konflikte von Hand aufgelöst (`.env.example`, `CLAUDE.md`,
`DEPLOY.md`, `actions.ts`, `AreaControl.tsx`, `GuideProgress.tsx`). Ab jetzt
läuft alles über `main`.

### 2026-08-14 · Orte-Verwaltung für schnellere Kuration

- **Arbeitsliste `/admin/places`**: Filter (Suche, Region, Typ, Status, Lücke,
  Sortierung) in der URL; Spalte „Fehlt noch" mit Lücken je Eintrag;
  Mehrfachauswahl mit Sammelaktionen (geprüft/Entwurf/Must-See/Ort
  setzen/löschen); Vorschaubild je Zeile.
- **`/admin/places/duplicates`**: Dubletten über Namensähnlichkeit +
  Entfernung, gruppiert; Zusammenführen mit Referenz-Umschreibung; „kein
  Duplikat"-Markierung (Tabelle `duplicate_dismissals`) inkl. Rücknahme.
- **`/admin/places/images`**: alle Orte ohne Bild mit vorbelegter Bildersuche
  auf einer Seite.
- Neue reine Libs: `src/lib/duplicates.ts`, `src/lib/place-quality.ts`,
  `src/lib/merge-places.ts`. Neue Actions: `bulkUpdatePlaces`, `mergePlaces`,
  `dismissDuplicate`, `restoreDuplicatePair`.
- Tests: 39 neue Fälle (132 gesamt).

### 2026-08-14 · Gastro-Recherche trennt Preisklassen

„+" bei günstig/mittel/gehoben lieferte immer dasselbe Lokal.
`priceTierFromTags` leitet die Klasse aus OSM-Tags ab; OSM filtert und reiht
danach; für „gehoben" ohne Preissignal übernimmt die KI-Websuche mit
Preisklasse im Prompt. Ausschluss vorhandener Orte jetzt bereichsübergreifend,
Client schickt bereits gezeigte Vorschläge mit.

### 2026-08-14 · Generierungs-Fortschritt + gesetzte Einträge

Fortschritt (`progress_done`/`progress_total`/`progress_label`) und
Lebenszeichen (`heartbeat_at`) am Request; Balken auf der Guide-Seite und im
Admin; hängende Aufträge werden nach `GENERATION_STALE_MINUTES` auf `failed`
gesetzt. Recherchierte Orte werden über `pinned_ids` gesetzt statt über Zähler
erhofft.

---

## Fehler und Fallstricke (teuer gelernt)

### „Live-Füllen" füllte nie live

**Symptom:** Der Guide sollte sich kapitelweise füllen, tat es aber nicht.
**Ursache:** Der Poll verglich `status:generatedAt`; `generatedAt` wird erst
ganz am Ende gesetzt, der Stempel änderte sich also während des ganzen Laufs
nicht. **Behebung:** Fortschritt in den Status-Endpoint und in den Stempel
aufnehmen. **Lehre:** Ein Polling-Vergleichswert muss sich genau dann ändern,
wenn sich das Angezeigte ändert – sonst ist das Polling wirkungslos, ohne dass
je ein Fehler auftritt.

### Zähler statt gesetzter Einträge

**Symptom:** Ein recherchierter Ort tauchte nach „❤️ In den Guide" nicht auf.
**Ursache:** Drei Dinge gleichzeitig: der „+1"-Zähler wählt den *bestbewerteten*
Kandidaten (nie der frische Ort mit Standard-Score), die harten Filter warfen
ihn ohnehin raus (`dietaryOptions: []` bei gewählter Ernährung), und im
Unterkunfts-Kapitel schnitt `.slice(0, 15)` ausgerechnet den neuesten Eintrag
ab. **Behebung:** `pinned_ids` – gesetzt statt erhofft, an Filtern und
Obergrenze vorbei. **Lehre:** Wenn der Nutzer etwas ausdrücklich auswählt,
darf keine Heuristik dazwischenstehen.

### Drei Preisklassen, eine Abfrage

**Symptom:** günstig/mittel/gehoben zeigten dasselbe Restaurant.
**Ursache:** `foodFancy` und `foodMid` hatten identische Overpass-Filter;
sortiert wurde nur nach Entfernung. **Behebung:** Preisklasse aus Tags ableiten
und filtern. **Lehre:** „unbekannt" darf nicht als Standardklasse gelten –
sonst passt jeder Eintrag überall hinein, und der Filter ist wirkungslos.

### Harte Filter sind unsichtbar

Ein Restaurant ohne `dietaryOptions` verschwindet für jeden Gast mit
Ernährungsweise – ohne Fehlermeldung, ohne Log. Dasselbe gilt für
`access: "car"` bei reinen Fußgängern und `childFriendly: false` bei kleinen
Kindern. Deshalb zeigt die Orte-Liste diese Lücken jetzt rot an. **Bei jeder
neuen Datenquelle prüfen, ob die angelegten Felder die harten Filter
überstehen.**

### Referenzen auf Place-IDs

`guides.content`, `guides.selection` und `guide_requests.pinned_ids` enthalten
Place-IDs. `renderPlaceEntry` liefert für unbekannte IDs `null` – ein gelöschter
Ort verschwindet also **stillschweigend** aus bestehenden Guides, samt Text.
Wer Orte löscht oder zusammenführt, muss diese drei Stellen mitziehen
(`src/lib/merge-places.ts`).

### Branch hing am alten Default-Branch

**Symptom:** Beim Umstellen auf `main` zeigte sich, dass `origin/main` 15
Commits enthielt, die im Arbeitsbranch fehlten. **Ursache:** Der Branch wurde
vom damaligen Default-Branch abgezweigt; das Repo hatte inzwischen auf `main`
umgestellt. **Lehre:** Vor Arbeitsbeginn `git fetch origin && git log --oneline
origin/main -1` prüfen und darauf aufsetzen – nicht auf `HEAD` des Klons
vertrauen.

### Private Nutzer-Orte sind ein eigener Topf

`Place.addedByRequestId` markiert Orte, die eine Kundin im eigenen Guide
ergänzt hat; sie gehören **nur** in deren Reiseführer (`placeScopeFilter`).
Beim Bau der Dubletten-Funktion wäre das fast zum Datenleck geworden:
Redaktioneller Ort + privater Tipp mit gleichem Namen hätten
zusammengeführt werden können, der private Tipp wäre damit im allgemeinen
Bestand gelandet und in fremden Guides aufgetaucht. `ratePair` und
`mergePlaces` trennen die Töpfe jetzt ausdrücklich. **Lehre:** Bei jeder neuen
Funktion, die Orte übergreifend liest oder verändert, zuerst fragen, ob
`addedByRequestId` mitgedacht ist.

### Platzhalter-Koordinaten sahen aus wie echte Daten

**Symptom:** Kuratierte Orte lagen alle mitten im See.
**Ursache:** `generatePlaceDrafts` und die YouTube-Auswertung setzten bewusst
`region.centerLat/centerLng` als Platzhalter. Das ist ein gültiger Wert, kein
`null` – also meldete nichts einen Fehler, und die Umkreis-Suche der
Auswahl-Engine fand die Einträge einfach nicht. **Behebung:** Kaskade in
`coordinates.ts`; wenn nichts gefunden wird, bleibt der Ort auf der Mitte
stehen UND taucht in `/admin/places/coordinates` auf. **Lehre:** Ein
Platzhalter, der wie ein echter Wert aussieht, versteckt das Problem, statt es
zu melden – entweder als Lücke sichtbar machen oder gar nicht erst setzen.

### Karten-Link ignorierte die vorhandenen Koordinaten

**Symptom:** „Auf Google Maps öffnen" landete nirgends, obwohl der Ort in der
DB Koordinaten hatte. **Ursache:** Der Link wurde aus Adresse bzw. „Name, Ort"
als Google-**Suchbegriff** gebaut. Kleine Lokale sind dort nicht unter dem
redaktionell vergebenen Namen verzeichnet – die Suche läuft ins Leere. Die
Wanderungen machten es von Anfang an richtig (`startLat,startLng`), die Orte
nicht. **Behebung:** `placeMapsHref` – Koordinaten zuerst. **Lehre:** Wenn
exakte Daten vorliegen, keine Suche daraus bauen.

### Nominatim sperrt bei Stapelläufen

Ein Nachtrag über hunderte Orte darf nicht parallel laufen: Nominatim erlaubt
eine Anfrage pro Sekunde. `geocode.ts` serialisiert deshalb alle Aufrufe. Wer
neue Massenoperationen baut, muss das mitdenken – die Stapelgröße im Admin ist
bewusst auf 25 begrenzt.

### Freitext vs. kanonischer Ortsname

Der Unterkunfts-Ort ist Freitext („Via Plinio 20, Torno"), `Place.locality` ein
kanonischer Name („Torno"). Exakter Vergleich findet nie etwas – immer
`localityMatchesLabel` benutzen.

---

## Offen / als Nächstes

- **Prisma-Client nach jedem Merge neu generieren** (`npx prisma generate`),
  sonst meldet `tsc` Felder als nicht existent, die im Schema längst stehen.
- **Nicht gegen eine echte Datenbank getestet.** In der Entwicklungsumgebung
  war kein Postgres verfügbar; alle Tests laufen gegen reine Funktionen. Beim
  ersten Lauf auf dem Server prüfen: Fortschrittsbalken, Zusammenführen von
  Dubletten (bestehende Guides!), Sammelaktionen.
- **Dubletten-Schwellen** (`ratePair`: 0.65 / 0.85, 1 km / 2 km) sind an
  konstruierten Beispielen kalibriert, nicht an echten Comer-See-Daten. Wenn zu
  viele Fehltreffer erscheinen: Schwellen anheben statt Sonderfälle einbauen.
- **Preisklassen-Heuristik** (`priceTierFromTags`) ebenfalls nur gegen
  konstruierte Overpass-Antworten geprüft.
- **Tagesausflüge brauchen Bestand.** Der neue Typ `daytrip` ist im Code fertig,
  aber die Datenbank enthält noch keine Einträge – bis welche angelegt sind,
  bleibt der Abschnitt im Guide leer. Es gibt bereits
  `prisma/seed-daytrips-comer.ts`, das legt aber nur Wissens-Notizen an, keine
  Orte. Ein Seed mit echten `daytrip`-Orten wäre der nächste Schritt.
- **Wanderungen** haben keine Dubletten-Ansicht – dieselbe Logik ließe sich
  anwenden, falls dort Doppel-Einträge auftauchen.
- **Kein ESLint** im Repo (`next lint` fragt interaktiv nach Setup). Wenn
  Linting gewünscht ist, ESLint-Flat-Config nachrüsten.
- **Bilder werden nicht gespiegelt**: Es werden Fremd-URLs gespeichert. Bricht
  eine Quelle weg, fehlt das Bild im Guide.
