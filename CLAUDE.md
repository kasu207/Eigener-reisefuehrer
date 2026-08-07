# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Die Codebasis ist durchgehend **deutschsprachig**: Kommentare, Doc-Blöcke,
Commit-Messages, UI-Texte und Fehlermeldungen. Neuer Code hält das ein.

## Befehle

```bash
npm run dev            # Next-App (http://localhost:3000)
npm run worker         # Job-Worker – MUSS parallel laufen, sonst bleiben Guides ohne KI-Texte
npm test               # Vitest (tests/), keine DB nötig
npx vitest run tests/selection.test.ts   # einzelne Datei
npx vitest run -t "Zielmengen"           # einzelner Testname
npx tsc --noEmit       # Typecheck
npm run build          # Next-Build (prüft auch Server-Komponenten und Routen)
```

- **`npm run lint` nicht ausführen.** ESLint ist weder installiert noch
  konfiguriert; `next lint` startet stattdessen einen interaktiven
  Setup-Dialog und bleibt in einer Agent-Session hängen. Zum Absichern
  `npx tsc --noEmit` **und** `npm run build` verwenden.
- Datenbank: `docker compose up -d db`, dann `npm run db:push` und
  `npm run db:seed` (weitere Seeds: `db:seed:torno`, `db:seed:knowledge`,
  `db:seed:daytrips` – alle idempotent).
- **`AI_MODE="mock"` in der `.env`** ersetzt alle Claude-Aufrufe durch
  deterministische Platzhalter. Der komplette Ablauf (Fragebogen → Queue →
  Auswahl-Engine → Guide → Feintuning → PDF) läuft damit ohne einen einzigen
  API-Token. Für Entwicklung und manuelles Testen ist das der Normalfall.

## Architektur

### Der zentrale Regelkreis

Alles dreht sich um `guide_requests.status`. Jede Nutzeraktion, die den Guide
inhaltlich ändert, setzt den Status zurück auf `pending`; der Worker pollt
`pending` und generiert nach.

```
Fragebogen  → POST /api/guide-requests → GuideRequest(status=pending)
                                       → createGuideSkeleton()  [synchron]
                                       → Redirect auf /guide/<publicToken>
Worker      → claimt pending (FOR UPDATE SKIP LOCKED) → generateGuideForRequest()
                                       → status=ready | failed
Nutzer „+"  → POST .../area  ─┐
Nutzer-Wunsch → POST .../adjust ┴→ status=pending → Worker generiert nach
```

Die Guide-Seite pollt `/api/guides/<token>/status` (`GuideProgress`) und
lädt sich neu, während der Worker schreibt.

### Zweistufige Guide-Erzeugung (`src/lib/guide-generation.ts`)

1. **`createGuideSkeleton`** läuft *synchron* im POST-Request: Auswahl-Engine
   + Kapitelstruktur, Textfelder leer. Der Nutzer landet sofort in einem
   durchblätterbaren Guide mit Orten, Fakten, Bildern und Karte.
2. **`generateGuideForRequest`** läuft im Worker: KI-Texte kapitelweise, nach
   *jedem* Kapitel wird gespeichert, damit sich die Seite live füllt.
   Bestehende Texte werden wiederverwendet – nur NEUE Einträge gehen an die
   KI. Das ist der Grund, warum ein „+" beim Feintuning kaum Tokens kostet.

### Faktentreue – die wichtigste Invariante

Die KI liefert **ausschließlich redaktionelle Texte** (Einleitungen,
Empfehlungstexte, Begründungen). Alle Fakten – Adresse, Preisniveau,
Öffnungszeiten, Distanz, Höhenmeter, Koordinaten – werden zur Anzeigezeit
direkt aus der DB gerendert (`src/app/guide/[token]/page.tsx`) und können
konstruktionsbedingt nicht erfunden werden. Zusätzlich prüft
`validateContentAgainstSelection` (`src/lib/guide-content.ts`), dass jeder
Eintrag auf die gespeicherte Auswahl zurückführbar ist.

Zweite Invariante: **nur `status = "verified"`** gelangt aus Places/Hikes in
Guides. `draft` ist Redaktionsbestand.

### Auswahl-Engine (`src/lib/selection.ts`)

Rein deterministisch, ohne DB und ohne KI – arbeitet auf schlanken Typen
(`SelectablePlace`/`SelectableHike`), damit sie ohne Postgres testbar bleibt.
Zwei Phasen: harte Filter (Ernährung, Kindertauglichkeit, Wanderdauer,
Höhenmeter, Preis, Mobilität) und gewichtetes Scoring (Interessen,
`qualityScore`, Nähe zum nächsten Anker, geografische Streuung über
`pickWithSpread`). `mustSee`-Orte umgehen die Zielmengen, nicht die harten
Filter.

Zielmengen kommen aus drei Quellen, die sich addieren (`computeTargets`):
Reisedauer/Tempo aus dem Fragebogen, `SelectionModifiers` aus den
Freitext-/Preset-Anpassungen (`src/lib/adjustments.ts`) und die
Pro-Bereich-Deltas `areaCounts` bzw. Pro-Ort-Deltas `localityCounts`
(`src/lib/areas.ts`).

### Nutzer-Änderungen überleben Neugenerierungen

`mergeGuideContent` (`src/lib/guide-content.ts`): Texte mit `edited: true`
gewinnen gegen frische KI-Fassungen, `removedIds` bleiben dauerhaft entfernt.
Wer an der Generierung arbeitet, muss diesen Merge mitdenken.

### Zwei Tokens pro Guide

`publicToken` = Besitzer (bearbeiten, Feintuning, E-Mail), `shareToken` =
Lesezugriff für Mitreisende. Lese-Routen akzeptieren beide
(`findFirst` mit `OR`), Schreib-Routen ausschließlich `publicToken`
(`findUnique` auf `publicToken`) – dieses Muster beim Anlegen neuer Routen
beibehalten.

Die Links sind der **einzige** Zugangsschutz (kein Login). Deshalb halten
`src/app/robots.ts`, die `noindex`-Metadaten der Guide-Seite und
`X-Robots-Tag` auf PDF-/Markdown-Export Suchmaschinen von `/guide/` fern.

### Wissensdatenbank (RAG, kein Training)

Community-Quellen (`/beitragen`) durchlaufen zwei Stufen: redaktionelle
Moderation im Admin und eine automatische KI-Sicherheitsprüfung bei der
Analyse (`UnsafeContentError` in `src/lib/ai/common.ts`). Aus freigegebenen
Quellen legt die KI paraphrasierte, nach Interessen getaggte Notizen an; über
`matchChunksToQuestionnaire` fließen passende Notizen als Kontext in die
Generierung. Der Worker verarbeitet diese Dokumente in derselben Schleife wie
die Guides.

## Gotchas

- **Zwei Zod-Versionen im selben Projekt.** Die KI-Module unter `src/lib/ai/`
  importieren `zod/v4` (für die strukturierten Ausgaben des Anthropic-SDK),
  der ganze Rest `zod` (v3-API). Beim Kopieren von Schema-Code zwischen beiden
  Bereichen aufpassen.
- **`questionnaireSchema` vs. `questionnaireInputSchema`**
  (`src/lib/questionnaire.ts`). Das Basis-Schema liest auch *gespeicherte*
  Fragebögen und bleibt deshalb bewusst nachsichtig – strengere Regeln würden
  rückwirkend auf Altdaten greifen und bestehende Guides beim Öffnen scheitern
  lassen. Neue Eingabe-Validierung gehört ins Input-Schema.
- **Rate-Limiting ist In-Memory** (`src/lib/rate-limit.ts`) und damit
  pro Prozess. Bei Multi-Instanz-Deployment durch Redis o. Ä. ersetzen.
- Die Middleware (`src/middleware.ts`) läuft in der **Edge-Runtime** – kein
  `node:crypto`. Die Basic-Auth-Logik liegt deshalb Node-frei in
  `src/lib/basic-auth.ts`.
- Der Worker ist ein eigener Prozess (`tsx src/worker/index.ts`), keine
  Next-Route. Ohne ihn bleiben Guides im Skeleton-Zustand.
- **Kein `loading.tsx` unter `src/app/guide/[token]/`.** Das setzt die Seite
  in eine Suspense-Grenze und streamt die Antwort – der 200er-Header ist
  dann längst raus, wenn `notFound()` greift. Ein nicht existierender
  Reiseführer antwortete damit mit Status 200 („Soft 404"). Nachgemessen im
  Produktions-Build; die Guide-spezifische 404-Seite liegt in
  `src/app/guide/not-found.tsx`.

## Weiterführende Dokumente

- `README.md` – Setup, Ablauf, DSGVO, Kostenhebel
- `KURATION.md` – Redaktionsanleitung für den Admin-Bereich (Orte, Wanderungen,
  Preisklassen, Bildlizenzen, Wissensbibliothek)
- `DEPLOY.md` – Docker-Deployment auf eigenem Server
