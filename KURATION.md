# Anleitung: Inhalte einpflegen & kuratieren

Diese Anleitung erklärt Schritt für Schritt, wie du den Reiseführer mit
Inhalten füllst und pflegst. Alles läuft über das **Admin-Interface**.

## 0. In den Admin-Bereich einloggen

Öffne `https://DEINE-ADRESSE/admin` (lokal: `http://localhost:3000/admin`).
Es erscheint eine Passwortabfrage (Basic Auth) – Benutzer und Passwort stehen
in deiner `.env` (`ADMIN_USER`, `ADMIN_PASSWORD`).

Oben siehst du die Reiter: **Guide-Requests · Kuratieren · Orte · Wanderungen ·
Regionen · Karten-Spots · Wissensbibliothek**.

---

## 0.5 Die „Kuratieren"-Werkstatt (Schnellstart)

Der Reiter **Kuratieren** bündelt alles zum schnellen Nachpflegen:

- **KI-Einstellung:** zeigt das aktive Modell und den Modus. Das Modell setzt
  du in der `.env` über `ANTHROPIC_MODEL` (Standard `claude-sonnet-4-6` –
  deutlich günstiger als Opus). Nach Änderung Container neu starten.
- **KI-Ortsvorschläge:** Ort/Stadt + Typ + Anzahl eingeben → die KI legt
  **Entwürfe** an (Name, Tags, Redaktionsnotiz). Wichtig: Das sind Vorschläge,
  **keine** geprüften Fakten. Koordinaten (Regions-Mitte als Platzhalter),
  Preise und Öffnungszeiten prüfst/ergänzt du, dann auf „Geprüft" stellen.
- **Reiseführer einlesen:** Link zur Wissensbibliothek (deine gekauften
  Bücher als PDF hochladen).
- **Abdeckung je Ort:** Tabelle, die zeigt, wo Inhalte fehlen (rote `0`).
  So siehst du auf einen Blick, welcher Ort noch dünn ist.

---

## 1. Grundprinzip (wichtig zum Verständnis)

Der Guide erfindet **keine** Fakten. Alles, was ein Gast im Reiseführer sieht,
stammt aus deiner Datenbank. Die KI schreibt nur die *Texte* rund um die von
dir gepflegten, geprüften Einträge.

Zwei Statusstufen steuern das:

- **Entwurf (`draft`)** – in Arbeit, erscheint **nicht** im Guide.
- **Geprüft (`verified`)** – freigegeben, **nur diese** Einträge landen im Guide.

Faustregel: Erst alles sauber eintragen, dann auf „Geprüft" stellen.

---

## 2. Region prüfen

Unter **Regionen** ist „Comer See" bereits angelegt (Zentrum-Koordinaten,
Land). Neue Regionen brauchen keinen Code – einfach hier anlegen. Über den
Link **„Gut zu wissen"-Kapitel pflegen** kommst du zu den Standard-Infos
(siehe Abschnitt 6).

---

## 3. Einen Ort anlegen (Herzstück)

**Orte → + Neuer Ort.** Ein „Ort" ist jeder Eintrag im Buch: Sehenswürdigkeit,
Restaurant, Bar, Hotel, Aussichtspunkt, Strand, Veranstaltung, Praktisches.

Felder:

| Feld | Bedeutung |
|---|---|
| **Region** | Comer See |
| **Typ** | Bestimmt den Abschnitt im Buch (siehe Tabelle unten) |
| **Name** | Anzeigename |
| **Ort/Stadt** | Die Stadt, zu der der Eintrag gehört (z. B. `Varenna`). **Wichtig** – daraus entstehen die Ort-Kapitel. Leer lassen nur für regionsweite Dinge (z. B. „Fähren am Comer See"). |
| **Koordinaten** | Auf die Karte klicken → Pin setzt Lat/Lng automatisch |
| **Adresse** | optional |
| **Tags** | kommagetrennt, klein (z. B. `villa, garten, foto`) – helfen dem Matching auf Interessen |
| **Preisniveau** | 1–4 (nur Gastro). **Steuert die Preisklasse** (siehe unten) |
| **Öffnungszeiten-Hinweise** | Freitext, erscheint in der Fakten-Box |
| **Erreichbarkeit** | Auto / ÖPNV / zu Fuß |
| **Qualität** | 1–5 – höhere Werte werden bevorzugt ausgewählt |
| **Must-See** | Pflicht-Highlight: Ort erscheint **immer** im Guide, unabhängig vom Matching (respektiert nur harte Filter wie Ernährung/Kindertauglichkeit). Sparsam einsetzen. |
| **Ernährung** | `vegetarian, vegan, glutenfree` (nur Gastro, für harte Filter) |
| **Redaktionsnotizen** | Interner Kontext **für die KI** – hier ruhig ausführlich schreiben, was den Ort ausmacht. Die KI formuliert daraus eigenständig. |
| **Prüfstatus** | Erst `Geprüft`, wenn fertig |

**Typ → Buch-Abschnitt:**

| Typ | Erscheint im Ort-Kapitel unter |
|---|---|
| `village`, `sight`, `viewpoint` | Sehenswürdigkeiten & Ausblicke |
| `beach` | Baden & Seezugang |
| `restaurant` | Essen & Trinken (nach Preis: gehoben/mittel/günstig) |
| `bar` | Ausgehen & Aperitivo |
| `hotel` | Unterkunft |
| `event` | Veranstaltungen |
| `practical` | Praktisches vor Ort |

### Preisklassen bei Essen & Trinken

Das **Preisniveau** eines Restaurants bestimmt sein Band im Buch:

- **4 = Gehoben** (bewusst nur 1–2 im Guide)
- **3 = Mittelklasse**
- **1–2 = Günstig & Cafés**

Für eine gute Mischung also: wenige Restaurants mit Preisniveau 4, viele mit
2–3. Kleine Cafés bekommen Preisniveau 1.

### Bilder & Quellen (rechts auf der Ort-Seite)

- **Bilder:** Am einfachsten über **„Bilder suchen (Wikimedia Commons)"** auf
  der Ort-Seite: Begriff eingeben, passendes Bild mit einem Klick
  **„Übernehmen"** – Lizenz, Urheber und Quelllink werden automatisch
  übernommen. Alternativ manuell mit klarer Lizenz (Unsplash, Pexels,
  Openverse oder eigene Fotos). Pflichtangaben: Bild-URL, Lizenz, Urheber,
  Quelllink – die Attribution wird im Guide automatisch gerendert.
- **Quellen:** Recherche-Belege (Blog, Reddit, Portal, eigene Recherche,
  Instagram-Profil). „URL-Import" holt Titel + Kernaussagen automatisch;
  „Reddit-Suche" schlägt bis zu 5 Threads vor. Instagram nur als Notiz +
  Profil-Link (kein Einbetten).

---

## 4. Wanderungen anlegen

**Wanderungen → + Neue Wanderung.** Zusätzlich zu den Ort-Feldern:

- **Ort/Stadt** – optional, ordnet die Tour einem Ort zu.
- **Startpunkt** per Kartenklick.
- **Distanz, Dauer, Höhenmeter, Schwierigkeit** – erscheinen in der Fakten-Box.
- **Link zur Tour** (Komoot/Outdooractive) – wird im Guide als **QR-Code**
  abgebildet.
- **GPX-Datei-URL** – optional zum Download.

---

## 5. Karten-Spots (Instagram-/Foto-Fundorte)

**Karten-Spots.** Für zusätzliche Pins, die *keine* vollen Orte sind – z. B.
auf Instagram entdeckte Fotopunkte. Nur Standort + eigene Notiz + Quell-Link.
Es wird **kein** Instagram-Inhalt eingebettet. Nur „Geprüft"-Spots erscheinen
(violett) auf der Guide-Karte und im Abschnitt „Foto-Spots & Fundorte".

---

## 6. „Gut zu wissen" pflegen (Regions-Infos)

**Regionen → „Gut zu wissen"-Kapitel pflegen.** Diese Abschnitte erscheinen in
jedem Guide der Region. Drei Formate:

- **Fließtext** – normaler Absatz (z. B. Währung, Transport).
- **Tabelle** – pro Zeile `Begriff | Übersetzung` (z. B. Sprachführer).
- **Zeitleiste** – pro Zeile `Jahr | Ereignis | optionaler Side-Fact`
  (z. B. Geschichte mit witzigen Fakten).

`Sortierung` legt die Reihenfolge fest.

---

## 7. Wissensbibliothek (Blogs & Bücher)

**Wissensbibliothek.** Hier fütterst du die KI mit Recherchequellen:

- **Buch/Reiseführer hochladen** (PDF, EPUB, TXT, MD – bis 120 MB) oder
  **Blog/Artikel verlinken**. Der Text wird beim Upload lokal extrahiert
  (Bilder werden ignoriert), sodass auch große, bebilderte Bücher problemlos
  gehen. Reine Scan-PDFs ohne Textebene funktionieren nicht.
- Die KI liest die Quelle ein und legt **paraphrasierte, getaggte Notizen** an
  (nie wörtliche Übernahme). Passende Notizen fließen automatisch als
  Hintergrund in die Guide-Texte ein.
- **Community-Einreichungen** (von der öffentlichen Seite `/beitragen`)
  erscheinen oben in der **Moderations-Box** und müssen mit
  „Freigeben & analysieren" bestätigt werden. Die KI prüft zusätzlich
  automatisch auf unzulässige Inhalte und lehnt sie ggf. ab.
- Status je Quelle: `wartet → wird analysiert → analysiert`. Erst dann sind
  die Notizen nutzbar (aufklappen zum Prüfen).

> Damit die Analyse echte Ergebnisse liefert, muss die Live-KI aktiv sein
> (`AI_MODE=live` + gültiger `ANTHROPIC_API_KEY`). Im Mock-Modus entstehen nur
> Platzhalter-Notizen.

---

## 8. Ergebnis prüfen & steuern

- **Guide-Requests** (Startseite des Admin): Liste aller erzeugten Guides mit
  Status, **Fortschritt** (Kapitel x von y plus Alter des letzten
  Lebenszeichens), Vorschau-Link und „Neu generieren". Die Seite aktualisiert
  sich alle 5 Sekunden selbst; ein hängengebliebener Auftrag wird rot als
  „hängt – kein Lebenszeichen" markiert und nach `GENERATION_STALE_MINUTES`
  automatisch auf „fehlgeschlagen" gesetzt.
- Im Guide selbst (als Besitzer) kannst du zusätzlich **jeden Text inline
  bearbeiten**, Einträge **entfernen** und den Umfang **je Bereich** über
  „Feintuning" (mehr/weniger) anpassen – z. B. mehr günstige Cafés.
- **Essen nach Preisklasse:** „+" bei günstig/mittel/gehoben sucht jetzt
  wirklich getrennt. OpenStreetMap wird nach Preisklasse gefiltert (Betriebsart,
  `price_range`, Michelin-Tag, Reservierungspflicht, Küche); Orte ohne
  erkennbare Preisangabe gelten als günstig/mittel plausibel, für **gehoben**
  aber nicht – dort übernimmt automatisch die KI-Websuche, die Preisniveaus
  belegen kann. Ein Ort, den es im Guide-Ort schon gibt, wird in **keiner**
  Preisklasse erneut vorgeschlagen, und „🔄 Anderer" merkt sich die bereits
  gezeigten Vorschläge.
- Ein per „🔎 Neuen Ort recherchieren" gefundener und mit **„❤️ In den Guide"**
  übernommener Ort wird **gesetzt** (gepinnt): Er erscheint im nächsten
  Generierungslauf garantiert – auch wenn ihm noch Tags, Ernährungs- oder
  Erreichbarkeitsangaben fehlen, die ihn sonst durch die harten Filter fallen
  ließen. Ergänze diese Angaben anschließend im Admin; entfernst du den
  Eintrag im Guide, bleibt er entfernt.

---

## Empfohlene Reihenfolge für einen neuen Ort (Kurz-Checkliste)

1. Region prüfen/anlegen.
2. Pro Stadt: Sehenswürdigkeiten, 3–6 Restaurants (Preis mischen!), 1–2 Bars,
   2–3 Hotels, ggf. Veranstaltung, Praktisches (Parken/Fähre) anlegen.
3. Je Eintrag: Koordinaten setzen, Redaktionsnotiz schreiben, mind. 1
   lizenziertes Bild, Quelle(n) ergänzen.
4. Wanderungen mit Link/QR anlegen.
5. „Gut zu wissen" und Wissensbibliothek füllen.
6. Alles auf **Geprüft** stellen.
7. Test-Fragebogen ausfüllen und den erzeugten Guide kontrollieren.
