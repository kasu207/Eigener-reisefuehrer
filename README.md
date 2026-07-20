# Persönlicher Reiseführer (MVP)

Web-Dienst, der aus einem Fragebogen einen individuellen Reiseführer erstellt.
Alle Empfehlungen stammen aus einer kuratierten, redaktionell geprüften
Orte-Datenbank; die Claude API personalisiert Auswahl-Texte, erfindet aber
keine Fakten. MVP-Region: **Comer See** – weitere Regionen sind reine
DB-Einträge, kein Code.

## Stack

- **Next.js** (App Router, TypeScript) – Fragebogen, Guide-Ansicht und Admin in einer App
- **Postgres + Prisma** – Datenmodell gemäß Anforderungsdokument (Kap. 6)
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
3. E-Mail mit nicht erratbarem Link (`/guide/<192-Bit-Token>`), kein Login.
4. PDF-Download unter `/guide/<token>/pdf` (A5, Print-CSS, Seitenzahlen,
   Inhaltsverzeichnis). Die Templates sind so aufgebaut, dass in Phase 2 ein
   Druck-Renderer (PDF/X, Beschnitt) andocken kann, ohne sie neu zu bauen.

## Kuration (Admin)

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

Deckt die Auswahl-Engine (harte Filter, Zielmengen, Determinismus) und den
Faktentreue-Check ab.

Für einen End-to-End-Test ohne Claude-API-Key (Auswahl-Engine, Guide-Ansicht,
PDF-Export mit Dummy-Texten): zuerst über `/fragebogen` einen Request anlegen,
dann `npx tsx scripts/dev-create-test-guide.ts` ausführen – das Skript gibt den
Guide-Link-Token aus.

## DSGVO

- Personendaten (E-Mail, Vornamen, Fragebogen) liegen nur in `guide_requests`;
  der Worker löscht sie nach `DATA_RETENTION_MONTHS` (Default 12) automatisch.
- Einwilligung ist Pflichtfeld und wird mit dem Request gespeichert.
- Statische Seiten `/impressum` und `/datenschutz` (Platzhalter vor Launch
  ausfüllen), Rate-Limiting am Fragebogen-Endpoint, Hosting in EU-Region wählen.

## Out of Scope (Phase 2)

Druckfertiges PDF/X mit Beschnitt, Print-on-Demand, Bezahlfunktion,
Nutzerkonten, Mehrsprachigkeit.
