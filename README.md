# Persönlicher Reiseführer (MVP)

Web-Dienst, der aus einem Fragebogen einen individuellen Reiseführer erstellt.
Alle Empfehlungen stammen aus einer kuratierten, redaktionell geprüften
Orte-Datenbank; die Claude API personalisiert Auswahl-Texte, erfindet aber
keine Fakten. MVP-Region: **Comer See** – weitere Regionen sind reine
DB-Einträge, kein Code.

## Stack

- **Next.js** (App Router, TypeScript) – Fragebogen, Guide-Ansicht und Admin in einer App
- **Postgres + Prisma** – Datenmodell gemäß Anforderungsdokument (Kap. 6);
  **pgvector** für die semantische Suche in der Wissensdatenbank
- **Claude API** (`@anthropic-ai/sdk`) – kapitelweise Textgenerierung mit Zod-validiertem JSON-Output
- **DB-basierte Job-Queue** – Worker-Prozess generiert Guides im Hintergrund
- **Leaflet + OpenStreetMap** – Übersichtskarte und Koordinaten-Picker im Admin
- **Playwright (Headless Chromium)** – A5-PDF-Export über Print-CSS
- **Resend** – Versand des Ergebnis-Links per E-Mail
- **Tailwind CSS** – ruhiges Editorial-Design

## Setup

```bash
# 1. Abhängigkeiten
npm install

# 2. Postgres starten (lokal via Docker)
docker compose up -d db

# 3. Umgebungsvariablen
cp .env.example .env   # DATABASE_URL, ANTHROPIC_API_KEY, ADMIN_PASSWORD etc. setzen

# 4. Schema anlegen + Beispieldaten (Comer See)
npm run db:push
npm run db:seed

# 5. App und Worker starten (zwei Terminals)
npm run dev      # http://localhost:3000
npm run worker   # verarbeitet Guide-Requests aus der Queue
```

Admin-Interface: `http://localhost:3000/admin` (Basic Auth, `ADMIN_USER`/`ADMIN_PASSWORD`).

## Ablauf

1. Kunde füllt den Wizard unter `/fragebogen` aus → `POST /api/guide-requests`
   validiert serverseitig (Zod) und legt einen `GuideRequest` (Status `pending`) an.
2. Der **Worker** claimt den Request atomar (`FOR UPDATE SKIP LOCKED`):
   - **Auswahl-Engine** (`src/lib/selection.ts`): deterministische Filterung
     (Ernährung, Wanderdauer, Höhenmeter, Kindertauglichkeit, Mobilität) und
     Scoring (gewichtete Interessen, `quality_score`, Nähe zur Unterkunft,
     geografische Streuung). Ergebnis wird als JSON am Guide gespeichert.
   - **KI-Generierung** (`src/lib/ai/generate.ts`): kapitelweise Claude-Aufrufe
     mit striktem Systemprompt und strukturiertem JSON-Output; Token-Verbrauch
     wird am Guide geloggt.
   - **Faktentreue**: Fakten-Boxen (Adresse, Preise, Distanzen, Höhenmeter)
     werden zur Anzeigezeit direkt aus der DB gerendert – die KI liefert nur
     redaktionelle Texte. Zusätzlich prüft ein automatischer Check, dass jeder
     generierte Eintrag auf die gespeicherte Auswahl zurückführbar ist.
   - **Fortschritt**: Der Worker schreibt nach jedem Kapitel `progress_done`/
     `progress_total` und ein Lebenszeichen (`heartbeat_at`) an den Request.
     Die Guide-Seite zeigt daraus einen Balken („Kapitel 3 von 9 · Torno"),
     das Admin-Dashboard dieselbe Info plus Alter des Lebenszeichens. Bleibt
     das Lebenszeichen länger als `GENERATION_STALE_MINUTES` aus (abgestürzter
     Worker), setzt der nächste Worker-Durchlauf den Auftrag auf `failed` –
     statt ihn für immer auf „wird generiert" stehen zu lassen.
3. E-Mail mit nicht erratbarem Link (`/guide/<192-Bit-Token>`), kein Login.
4. PDF-Download unter `/guide/<token>/pdf` (A5, Print-CSS, Seitenzahlen,
   Inhaltsverzeichnis). Die Templates sind so aufgebaut, dass in Phase 2 ein
   Druck-Renderer (PDF/X, Beschnitt) andocken kann, ohne sie neu zu bauen.

## Was Reisende selbst am Guide ändern können

- Jeden Text anklicken und umschreiben (bleibt bei Neu-Generierung erhalten).
- Einträge über „Entfernen" aussortieren (kommen nicht zurück).
- Umfang je Bereich und je Ort über die Regler `−`/`+` steuern.
- **Eigenen Tipp ergänzen** („✎ Eigener Tipp"): Name, kurze Begründung und
  optional eine Adresse. Der Ort wird geocodiert, erscheint auf der Karte und
  bekommt einen generierten Text. Er ist an genau diesen Guide gebunden
  (`Place.addedByRequestId`) und taucht in keinem fremden Reiseführer auf.
- Ist der geprüfte Bestand für einen Ort erschöpft, lässt sich per
  „🔎 Neuen Ort recherchieren" ein echter neuer Ort mit Quelle vorschlagen.

## Vor dem ersten Verkauf: `/admin/startklar`

Eine Seite, die ehrlich sagt, was noch fehlt: Impressum-Pflichtangaben,
KI-Modus, Ortsbestand je Bereich (Ist gegen Soll), stehender Worker,
schwaches Admin-Passwort. Blocker sind Dinge, die zahlende Kunden direkt
treffen würden. Was sie **nicht** prüfen kann, steht dort ebenfalls:
Textqualität, Widerrufsbelehrung/AGB, Zahlungsabwicklung, AV-Verträge.

Die Impressum-Angaben kommen aus der Umgebung (`OPERATOR_*`, siehe
`.env.example`), damit sie ohne Deployment änderbar sind.

## Kuration (Admin)

- **Orte aus OpenStreetMap importieren** (`/admin/kuratieren`): füllt für
  einen Ort in einem Rutsch Sehenswürdigkeiten, Restaurants, Bars und
  Unterkünfte mit echten Namen, Koordinaten und Adressen – kostenlos, ohne
  KI, mit OSM-Quelllink. Alles als **Entwurf**; Preisniveau, Öffnungszeiten
  und Eignung entscheidet die Redaktion. Idempotent: bekannte Namen werden
  übersprungen.
- CRUD für Regionen, Orte, Wanderungen; Karten-Klick setzt Koordinaten.
- Prüfstatus `draft`/`verified` mit `last_verified_at` – **nur `verified`
  gelangt in Guides**.
- Bilder nur mit Lizenz, Urheber und Quelllink; Attribution wird im Guide
  automatisch gerendert. Instagram-Bilder werden nicht kopiert/eingebettet.
- Quellen-Anreicherung: URL-Import (Titel + Beschreibung als Notiz) und
  Reddit-Suche (legt bis zu 5 Thread-Vorschläge an, Redakteur bestätigt).
  Instagram bleibt manuelle Recherchequelle (Profil-Link als Quelle).

## Tests

```bash
npm test
```

Deckt die Auswahl-Engine (harte Filter, Zielmengen, Determinismus,
Anpassungs-Modifikatoren), das Wissensdatenbank-Matching, den
Faktentreue-Check, die Fragebogen-Validierung (Kalenderdaten,
Reisezeitraum), das Rate-Limiting und die Admin-Basic-Auth ab.

## Entwickeln ohne API-Kosten (Mock-Modus)

`AI_MODE="mock"` in der `.env` ersetzt alle Claude-Aufrufe durch
deterministische Platzhalter – der komplette Ablauf (Fragebogen → Queue →
Auswahl-Engine → Guide → Anpassungen → PDF, inkl. Quellen-Analyse in der
Wissensbibliothek) funktioniert dann ohne einen einzigen API-Token.

Zur Einordnung: Das System **trainiert kein Modell**, es ist eine
RAG-Architektur. Das "Wissen" liegt in der eigenen Postgres-Datenbank
(Orte, Wanderungen, Wissens-Notizen) und wächst kostenlos – Tokens kosten
nur (a) die einmalige Analyse neuer Quellen und (b) die Textgenerierung
pro Guide. Kosten-Hebel für den Live-Betrieb: kleineres Modell für die
Quellen-Analyse (`ANTHROPIC_MODEL`-Wechsel pro Lauf), Batch-API (−50 %)
für nicht-eilige Analysen, Prompt-Caching für den stabilen Systemprompt.

## Community-Wissensdatenbank

Nutzer schlagen unter `/beitragen` Quellen vor. Jede Einreichung durchläuft
zwei Stufen, bevor sie in Guides landet:

1. **Redaktionelle Moderation** im Admin (`/admin/knowledge`): freigeben
   oder ablehnen.
2. **Automatische KI-Sicherheitsprüfung** bei der Analyse: jugendgefährdende
   (FSK 18), extremistische/volksverhetzende oder strafrechtlich relevante
   Inhalte sowie Spam werden automatisch abgelehnt (`moderation_status =
   rejected`) und erzeugen keine Notizen.

Die KI legt aus freigegebenen Quellen paraphrasierte, nach Interessen
getaggte Notizen an (nie wörtliche Übernahmen, Quellenangabe am Dokument).
Passende Notizen fließen als Kontext in die Guide-Generierung ein.

### Hybrid-Suche & Dedup (reine Postgres-Bordmittel, kein externer Dienst)

Retrieval und Duplikat-Erkennung laufen komplett mit den Postgres-Extensions
`pg_trgm` und `unaccent` – beide Teil von "postgresql-contrib" und in jedem
Standard-Postgres-Image enthalten. Kein API-Key, kein zusätzlicher Dienst,
keine Downloads zur Laufzeit:

- **Matching auf den Fragebogen** ist ein Hybrid aus dem bisherigen
  Tag-Matching (strukturiertes, redaktionelles Signal) und Postgres-
  Volltextsuche (`websearch_to_tsquery`/`ts_rank_cd`, findet auch Begriffe,
  die nicht als Tag hinterlegt sind – z. B. Ortsnamen aus dem Fragebogen).
  Beide Rankings werden per Reciprocal Rank Fusion (RRF) zusammengeführt.
- **Duplikate** (z. B. zehn Blogs über dieselbe Villa) werden beim Einlesen
  per Trigram-Ähnlichkeit (`similarity()`) erkannt und übersprungen.
- **Ortszuordnung** ist exakt: Die Analyse bekommt die bekannten Orte der
  Region mit IDs und liefert `placeIds`; nicht auflösbare Ortsnamen werden
  im Admin als **Orts-Kandidaten** für neue Einträge ausgewiesen.

Setup: keines – `npm run db:push` legt die Extensions automatisch an. Für
Bestandsnotizen aus der Zeit vor der Umstellung einmalig
`npm run db:backfill-place-ids` ausführen (löst `placeNames` zu `placeIds`
auf).

## DSGVO

- Personendaten (E-Mail, Vornamen, Fragebogen) liegen nur in `guide_requests`;
  der Worker löscht sie nach `DATA_RETENTION_MONTHS` (Default 12) automatisch.
- Einwilligung ist Pflichtfeld und wird mit dem Request gespeichert.
- Statische Seiten `/impressum` und `/datenschutz` (Platzhalter vor Launch
  ausfüllen), Rate-Limiting am Fragebogen-Endpoint, Hosting in EU-Region wählen.
- Der Fragebogen legt einen Entwurf im `localStorage` ab (7 Tage, wird beim
  Absenden gelöscht), damit ein Reload nicht alle Antworten kostet. Keine
  Tracking-Cookies.
- Guide-Links sind der einzige Zugangsschutz. Deshalb halten `robots.txt`,
  `noindex`-Metadaten der Guide-Seite und ein `X-Robots-Tag` auf PDF-/
  Markdown-Export Suchmaschinen von `/guide/` fern.

## Out of Scope (Phase 2)

Druckfertiges PDF/X mit Beschnitt, Print-on-Demand, Bezahlfunktion,
Nutzerkonten, Mehrsprachigkeit.
