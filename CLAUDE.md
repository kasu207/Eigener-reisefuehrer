# CLAUDE.md

Leitfaden für Coding-Agenten in diesem Repository.

## Zuerst lesen

Vor jeder Aufgabe die **Memory Bank** lesen, sie ist der Wissensstand des
Projekts:

- `memory-bank/project-overview.md` – was das Projekt ist und will
- `memory-bank/progress.md` – Ticket-System und Wissensdatenbank: erledigt,
  offen, gemachte Fehler und ihre Behebung

**Nach jeder abgeschlossenen Aufgabe `memory-bank/progress.md` aktualisieren.**
Das ist kein optionaler Schritt: Der nächste Agent startet ohne dein Kontext-
fenster und wiederholt sonst deine Fehler. Eintragen gehören erledigte Arbeit,
neu entdeckte Fallstricke und was als Nächstes ansteht.

## Befehle

```bash
npm install
npm run dev            # Next.js auf :3000
npm run worker         # Guide-Worker (Queue) – für Generierung ZWINGEND nötig
npm test               # vitest, alle Tests
npx tsc --noEmit       # Typprüfung
npm run db:push        # Schema anwenden (es gibt KEINE Migrations-Dateien)
npm run db:seed        # Beispieldaten Comer See
```

`npm run lint` ist im Repo nicht eingerichtet (`next lint` fragt interaktiv
nach einem Setup) – nicht darauf verlassen, stattdessen `tsc` + `npm test`.

## Architektur in drei Sätzen

Next.js (App Router) mit Fragebogen, Guide-Ansicht und Admin in einer App;
Postgres über Prisma; ein separater Worker-Prozess erzeugt die Guides aus einer
DB-Queue. Alle Guide-Inhalte stammen aus der kuratierten Orte-Datenbank – die
Claude API schreibt nur die redaktionellen Texte, **niemals Fakten**. Fakten-
Boxen werden zur Anzeigezeit direkt aus der DB gerendert.

## Regeln, die nicht verhandelbar sind

1. **Keine erfundenen Fakten.** Adressen, Preise, Distanzen, Höhenmeter kommen
   aus der DB. Der Faktentreue-Check (`validateContentAgainstSelection`) muss
   grün bleiben: Jede ID im Guide-Inhalt muss in der gespeicherten Auswahl
   stehen.
2. **Nur `verified` gelangt in Guides.** Entwürfe bleiben draußen.
3. **Bilder nur mit Lizenz, Urheber und Quelllink.**
4. **Personendaten** liegen ausschließlich in `guide_requests` und werden vom
   Worker nach `DATA_RETENTION_MONTHS` gelöscht.
5. **Kosten im Blick:** Erst kostenlose Quellen (OpenStreetMap, Nominatim,
   Wikimedia), KI-Websuche nur als Fallback. `AI_MODE="mock"` erlaubt den
   kompletten Ablauf ohne einen einzigen API-Token – zum Entwickeln benutzen.

## Code-Konventionen

- **Kommentare und UI-Texte auf Deutsch**, Bezeichner auf Englisch.
- Kommentare erklären das **Warum**, nicht das Was – gern mit dem konkreten
  Fehlverhalten, das die Zeile verhindert. Der Bestand ist so geschrieben;
  bitte den Ton treffen, nicht Zeile für Zeile kommentieren.
- Geschäftslogik in `src/lib/*` als **reine Funktionen** halten (ohne Prisma),
  damit sie ohne Datenbank testbar ist. Die Tests in `tests/` machen genau das.
- Server-Komponenten holen Daten, Client-Komponenten (`"use client"`) machen
  Interaktion. Mutationen laufen über Server Actions in
  `src/app/admin/actions.ts`.

## Fallstricke (teuer gelernt)

- **Der Worker muss laufen**, sonst bleibt jeder Request auf `pending` und im
  Browser passiert scheinbar nichts.
- **Harte Filter sind unerbittlich:** Ein Restaurant ohne `dietaryOptions`
  verschwindet für jeden Gast mit Ernährungsweise; `access: "car"` verschwindet
  für reine Fußgänger. Frisch angelegte Orte haben diese Felder leer.
- **Schema-Änderungen** brauchen `npm run db:push` – es gibt keine Migrationen.
- **`localityMatchesLabel`** statt String-Vergleich benutzen: Der Unterkunfts-
  Ort ist Freitext („Via Plinio 20, Torno"), `Place.locality` ein kanonischer
  Name („Torno").
- **Guide-Inhalte referenzieren Place-IDs** in `guides.content` und
  `guides.selection` sowie in `guide_requests.pinned_ids`. Wer Orte löscht oder
  zusammenführt, muss diese Referenzen mitziehen – sonst verschwinden Einträge
  aus bestehenden Guides.

## Git

Auf dem zugewiesenen Feature-Branch entwickeln, aussagekräftig committen.
Commit-Nachrichten auf Deutsch, im Ton des Bestands: erst das Problem, dann die
Lösung.
