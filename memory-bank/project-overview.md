# Projekt-Überblick

## Was das Projekt ist

Ein Web-Dienst, der aus einem Fragebogen einen **individuellen, gedruckt
wirkenden Reiseführer** erzeugt. Die Reisenden beantworten Fragen zu Zeitraum,
Unterkunft, Interessen, Fitness, Ernährung und Budget; daraus entsteht binnen
Minuten ein persönlicher Guide mit Kapiteln je Ort, Fakten-Boxen, Karte und
A5-PDF-Export – erreichbar über einen nicht erratbaren Link, ohne Login.

MVP-Region ist der **Comer See**. Weitere Regionen sind reine Datenbank-
Einträge, kein neuer Code.

## Das Ziel

**Ein Reiseführer, der sich anfühlt, als hätte ihn ein ortskundiger Freund
geschrieben – und der trotzdem stimmt.**

Daraus folgen die beiden Leitplanken, die das ganze System prägen:

1. **Faktentreue vor Textmenge.** Alle Empfehlungen stammen aus einer
   kuratierten, redaktionell geprüften Orte-Datenbank. Die Claude API
   personalisiert nur die Auswahl-Texte; Adressen, Preise, Distanzen und
   Höhenmeter werden zur Anzeigezeit direkt aus der DB gerendert. Ein
   automatischer Check lehnt jeden generierten Eintrag ab, der nicht auf die
   gespeicherte Auswahl zurückführbar ist. Das System **trainiert kein Modell**
   – es ist eine RAG-Architektur, das Wissen liegt in der eigenen Postgres-DB.

2. **Kosten bleiben klein und vorhersagbar.** Die Wissensbasis wächst kostenlos
   (Kuration, OpenStreetMap, Nominatim, Wikimedia). Tokens kosten nur die
   einmalige Analyse neuer Quellen und die Textgenerierung pro Guide.
   Kostenpflichtige KI-Websuche läuft immer nur als Fallback, wenn die freien
   Quellen nichts hergeben.

## Wer damit arbeitet

- **Reisende** füllen `/fragebogen` aus und bekommen sofort ein durchblätter-
  bares Gerüst; die Texte füllen sich live nach. Sie können jeden Text inline
  bearbeiten, Einträge entfernen und den Umfang je Bereich und Ort feintunen
  („mehr günstige Cafés in Bellagio"). Ist der Bestand erschöpft, recherchiert
  das System auf Wunsch einen neuen, echten Ort mit Quelle.
- **Die Redaktion** pflegt unter `/admin` Regionen, Orte, Wanderungen, Bilder,
  Quellen und die Wissensbibliothek. Nur `verified`-Einträge gelangen in Guides.
- **Community**: Nutzer schlagen unter `/beitragen` Quellen vor; sie durchlaufen
  redaktionelle Moderation **und** eine automatische KI-Sicherheitsprüfung.

## Ablauf in Kürze

1. Fragebogen → `POST /api/guide-requests` (Zod-validiert) legt einen
   `GuideRequest` an und erzeugt sofort ein Guide-Gerüst.
2. Der **Worker** (`npm run worker`) claimt den Request atomar und füllt ihn:
   deterministische Auswahl-Engine (harte Filter + Scoring), dann kapitelweise
   KI-Texte, nach jedem Kapitel gespeichert.
3. Ergebnis unter `/guide/<token>`, optional per E-Mail, PDF unter
   `/guide/<token>/pdf`.

## Stack

Next.js (App Router, TypeScript) · Postgres + Prisma · Claude API
(`@anthropic-ai/sdk`) · DB-basierte Job-Queue · Leaflet/OpenStreetMap ·
Playwright (A5-PDF) · Resend (Mail) · Tailwind CSS · Vitest.

## Ausdrücklich nicht im MVP

Druckfertiges PDF/X mit Beschnitt, Print-on-Demand, Bezahlfunktion,
Nutzerkonten, Mehrsprachigkeit.

## Weiterführend

`README.md` (Setup, Ablauf, DSGVO) · `KURATION.md` (redaktionelles Handbuch) ·
`DEPLOY.md` (Betrieb) · `CLAUDE.md` (Regeln für Coding-Agenten).
