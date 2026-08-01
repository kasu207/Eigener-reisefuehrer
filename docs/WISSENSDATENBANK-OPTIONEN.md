# Wissensdatenbank: Technische Optionen für automatisiert gute Inhalte & Empfehlungen

Stand: August 2026 · Bezieht sich auf den aktuellen Stand des Repos (Branch-Basis: `main`).

Dieses Dokument beantwortet die Frage: **Wie müsste die Wissensdatenbank aufgebaut sein,
damit das System „automatisiert" gute Inhalte und Empfehlungen generiert?**
Es analysiert den Ist-Zustand, stellt die technischen Optionen vor und bewertet sie
für *diesen* Stack (Next.js + Postgres/Prisma + Claude API, eine Region, ein Redakteur,
kleines Budget).

---

## 1. Ist-Zustand (was heute passiert)

Die Architektur ist bereits eine RAG-Architektur – das ist die richtige Grundlage.
Konkret:

| Baustein | Heute | Datei |
|---|---|---|
| **Ingestion** | 1 Claude-Aufruf pro Quelle (PDF/URL/Text) → max. 25 paraphrasierte Notizen (`KnowledgeChunk`) mit `interests[]`- und `placeNames[]`-Tags | `src/lib/ai/analyze-document.ts` |
| **Retrieval (Fragebogen)** | Schnittmenge der Interessen-Tags, gewichtete Interessen zählen doppelt, Top 12 | `src/lib/knowledge.ts` → `matchChunksToQuestionnaire()` |
| **Retrieval (Ort)** | Substring-Vergleich `placeNames` ↔ Ortsname | `src/lib/knowledge.ts` → `chunksForPlaceName()` |
| **Empfehlungs-Engine** | Deterministische Filter + Scoring über strukturierte `places`-Felder (Tags, Qualität, Nähe, Streuung) | `src/lib/selection.ts` |

### Wo die Grenzen liegen (sobald die Datenbank wächst)

1. **Tag-Matching ist grob.** Eine Notiz „ruhige Badebucht ohne Touristen bei Lenno"
   matcht nur, wenn die KI beim Einlesen zufällig dieselben Interest-Keys vergeben hat.
   Semantik („ruhig", „abgelegen", „mit Kindern machbar") geht verloren.
2. **Ortszuordnung per Substring ist fragil.** „Madonna del Ghisallo" vs. „Ghisallo",
   Tippfehler, italienische/deutsche Varianten – alles Treffer- oder Fehltreffer-Lotterie.
3. **Max. 25 Notizen pro Quelle.** Ein 300-Seiten-Reiseführer wird auf 25 Notizen
   eingedampft – der Rest des Wissens ist verloren.
4. **Keine Duplikat-Erkennung.** 10 Blogs über die Villa del Balbianello erzeugen
   10 fast identische Notizen, die alle im Prompt landen und Kontextplatz verschwenden.
5. **Kein Frische-/Vertrauens-Konzept.** Eine Notiz von 2019 („Eintritt 10 €") ist
   gleichberechtigt mit einer von 2026.
6. **Inhalte kommen nur rein, wenn jemand aktiv füttert** (Upload, URL, Community).
   Es gibt keine Pipeline, die selbständig neues Wissen beschafft.

Die Optionen unten adressieren genau diese sechs Punkte – gruppiert in
**A) Retrieval/Matching**, **B) Datenmodell/Ingestion** und **C) automatische Beschaffung**.

---

## 2. Optionen A: Retrieval & Matching (der wichtigste Hebel)

### A1 · Status quo behalten (Interessen-Tags)

- **Wie:** Nichts ändern.
- **Bewertung:** Funktioniert bis ca. 100–300 Notizen ordentlich, weil der Redakteur
  die Datenbank kennt. Skaliert nicht mit Community-Einreichungen und Buch-Uploads.
- **Kosten:** 0. **Aufwand:** 0. **Qualitäts-Deckel: niedrig.**

### A2 · Postgres-Volltextsuche (FTS / BM25)

- **Wie:** `tsvector`-Spalte mit `german`-Konfiguration auf `KnowledgeChunk.content`
  (+ `title`), GIN-Index, Query aus Fragebogen-Interessen + Ortsnamen generieren.
  Alternativ echtes BM25-Ranking über die Extension `pg_search` (ParadeDB)
  oder VectorChord-BM25 – klassisches `ts_rank` ist schwächer, reicht aber hier.
- **Stärken:** Exakte Begriffe (Eigennamen! „Balbianello", „Greenway"), null externe
  Abhängigkeit, läuft im vorhandenen Postgres, mit Prisma via Raw-Query nutzbar.
- **Schwächen:** Kein semantisches Verständnis; deutsch/italienisch gemischte Inhalte
  brauchen zwei Konfigurationen.
- **Kosten:** 0 €. **Aufwand:** ~1 Tag. **Bewertung: sehr gutes Preis-Leistungs-Verhältnis,
  aber allein nicht ausreichend.**

### A3 · Embeddings + pgvector (semantische Suche) ⭐ Kernempfehlung

- **Wie:**
  1. Postgres-Extension `pgvector` aktivieren (Docker-Image `pgvector/pgvector:pg16`
     statt `postgres:16`; im Prisma-Schema als `Unsupported("vector(1024)")`-Spalte,
     Queries via `$queryRaw`).
  2. Beim Anlegen jedes `KnowledgeChunk` (und sinnvollerweise auch jedes `Place`
     aus Name+Tags+Redaktionsnotiz) ein Embedding erzeugen.
  3. Retrieval: Fragebogen → Suchtext („Familie mit Kindern, wandern leicht,
     vegetarisch, ruhige Orte…") → Embedding → Cosine-Top-K.
- **Embedding-Anbieter:** Anthropic bietet selbst keine Embeddings an und
  [empfiehlt Voyage AI](https://platform.claude.com/docs/en/build-with-claude/embeddings).
  `voyage-3.5` / `voyage-4-lite` sind mehrsprachig (deckt DE/IT/EN-Quellen ab,
  schlägt OpenAI-v3-large deutlich) und die ersten **200 Mio. Tokens sind gratis** –
  bei eurer Datenmenge (Tausende Notizen à ~100 Tokens) seid ihr praktisch dauerhaft
  im Gratis-Bereich. Alternative ohne API: lokales Modell via Ollama
  (z. B. `multilingual-e5`), dafür Betriebsaufwand.
- **Warum das der Kernhebel ist:** Löst Problem 1 (Semantik), Problem 2
  (Ortszuordnung via Embedding-Ähnlichkeit statt Substring) und Problem 4
  (Dedup: neue Notiz mit Cosine-Similarity > 0,92 zu bestehender → zusammenführen
  statt neu anlegen) **mit einem einzigen Mechanismus**.
- **Kosten:** ~0 € (Gratis-Kontingent). **Aufwand:** 2–4 Tage inkl. Backfill-Script.
- **Bewertung: bester Einzelschritt. Bei eurer Datenmenge (< 100k Vektoren) reicht
  sogar exakte Suche ohne Index; ein HNSW-Index ist ein Einzeiler, wenn es mehr wird.**

### A4 · Hybrid Search (A2 + A3 mit Reciprocal Rank Fusion)

- **Wie:** FTS-Top-50 und Vektor-Top-50 parallel als CTEs, mit RRF (k=60) fusionieren.
  Standard-Rezept, ~100 Zeilen SQL, alles in einer Postgres-Query
  ([ParadeDB-Guide](https://www.paradedb.com/blog/hybrid-search-in-postgresql-the-missing-manual),
  [Beispiel-Implementierung](https://dev.to/gabrielanhaia/hybrid-search-in-100-lines-bm25-pgvector-with-rrf-merge-58cn)).
- **Warum:** Vektor-Suche übersieht exakte Eigennamen, FTS übersieht Semantik –
  die Kombination deckt beide blinden Flecken ab. Messungen zeigen konsistent
  leicht bessere Trefferqualität als jede Einzelmethode.
- **Kosten:** 0 € zusätzlich. **Aufwand:** +1 Tag auf A2+A3.
- **Bewertung: empfohlener Endzustand des Retrievals. Kein neuer Dienst, keine
  neue Infrastruktur.**

### A5 · Contextual Retrieval (Anthropic-Technik) – Verfeinerung der Ingestion

- **Wie:** Beim Chunking bekommt jede Notiz vor dem Embedden einen kurzen,
  KI-generierten Kontextsatz vorangestellt („Aus dem Reiseführer X, Kapitel
  Bellagio, Thema Restaurants: …"). Reduziert Retrieval-Fehler laut
  [Anthropic-Messung](https://www.anthropic.com/engineering/contextual-retrieval)
  um 35 % (nur Embeddings) bzw. 49 % (kombiniert mit BM25).
- **Besonderheit hier:** Eure Ingestion *paraphrasiert bereits* mit Titel und Tags –
  ihr habt de facto eine Light-Version davon. Der Schritt ist: `Region + Quelle +
  Ort + Titel` systematisch in den Text einbetten, der embedded wird. Praktisch
  kostenlos, weil es nur die Prompt-/Speicherlogik ändert.
- **Bewertung: mitnehmen, sobald A3 gebaut wird. Kein eigenes Projekt.**

### A6 · Reranker (Voyage/Cohere) als zweite Stufe

- **Wie:** Top-50 aus Hybrid-Suche durch ein Rerank-Modell auf Top-10 verdichten.
- **Bewertung:** Bringt laut Anthropic nochmal deutliche Verbesserung (bis 67 %
  weniger Retrieval-Fehler), lohnt aber erst bei großen, heterogenen Korpora.
  Bei eurer Größe holt der Guide-Generierungs-Prompt (Claude sieht die Top-12
  ohnehin komplett) das selbst raus. **Zurückstellen.**

### A7 · Dedizierte Vektor-DB (Qdrant, Weaviate, Pinecone)

- **Bewertung: Overkill.** Zweites System zum Betreiben, Synchronisationsproblem
  mit Postgres (Moderations-Status, Löschungen, DSGVO), und der Nutzen beginnt
  erst bei Millionen Vektoren / hohem QPS. Bei „ein Worker generiert Guides im
  Hintergrund" ist Latenz irrelevant. **Nicht machen.**

### A8 · Knowledge Graph / GraphRAG

- **Wie:** Entitäten (Orte, Themen) + Relationen explizit modellieren, Retrieval
  über Graph-Traversierung.
- **Bewertung:** Euer relationales Schema (`Place` ↔ `locality` ↔ `Region`, Tags)
  *ist* bereits der relevante Graph, und die Auswahl-Engine nutzt ihn. Ein
  generischer GraphRAG-Aufbau (Neo4j etc.) würde viel Aufwand für wenig
  Zusatznutzen bedeuten. **Nicht machen** – stattdessen die bestehende Struktur
  schärfen (siehe B1).

### Bewertungsmatrix Retrieval

| Option | Qualitätsgewinn | Aufwand | Laufende Kosten | Betriebsrisiko | Urteil |
|---|---|---|---|---|---|
| A1 Status quo | – | – | 0 | 0 | Deckel erreicht |
| A2 Postgres-FTS | ●● | 1 Tag | 0 € | minimal | Ja, als Teil von A4 |
| A3 pgvector + Voyage | ●●●● | 2–4 Tage | ~0 € | gering | **Kernempfehlung** |
| A4 Hybrid + RRF | ●●●●● | +1 Tag | 0 € | gering | **Zielbild** |
| A5 Contextual Retrieval | ●● | ½ Tag | ~0 € | keins | Mitnehmen bei A3 |
| A6 Reranker | ● (bei eurer Größe) | 1 Tag | API-Kosten | gering | Später |
| A7 Vektor-DB | ○ | Wochen | Hosting | hoch | Nein |
| A8 GraphRAG | ○ | Wochen | Hosting | hoch | Nein |

---

## 3. Optionen B: Datenmodell & Ingestion-Qualität

Gutes Retrieval nützt wenig, wenn die Notizen selbst schwach sind. Drei Umbauten:

### B1 · Chunks an Orte binden statt an Ortsnamen ⭐

- **Wie:** Der Analyse-Prompt bekommt die Liste der bekannten Orte der Region
  (`id`, `name`, `locality`) mitgegeben und liefert `placeIds[]` statt freier
  `placeNames[]`. Nicht auflösbare Namen bleiben als Freitext + werden als
  **Ort-Kandidat** für die „Kuratieren"-Werkstatt ausgewiesen („3 Quellen erwähnen
  ‚Crotto dei Platti', dazu gibt es noch keinen Eintrag").
- **Effekt:** Ortszuordnung wird exakt (Problem 2 gelöst), und die Wissensdatenbank
  beginnt, **selbst neue Orte vorzuschlagen** – der halbautomatische Kreislauf,
  den „automatisiert gute Inhalte" eigentlich meint.
- **Aufwand:** 1–2 Tage (Prompt + Schema-Feld + Admin-Hinweis). **Sehr hoher Nutzen.**

### B2 · Metadaten je Notiz: Frische, Vertrauen, Typ

Schema-Erweiterung `KnowledgeChunk`:

```
sourceDate     DateTime?   // Publikationsdatum der Quelle, von der KI extrahiert
confidence     Int         // 1–5, KI-Einschätzung (Faktennähe, Quellenseriosität)
factType       String[]    // z. B. price, opening, tip, history, logistics
embedding      vector(1024)
supersededById String?     // Dedup: neuere/zusammengeführte Notiz
```

- Retrieval bevorzugt frische + vertrauenswürdige Notizen; preissensible Fakten
  (`factType: price/opening`) werden im Guide-Prompt automatisch mit „laut Quelle,
  Stand …" markiert – konsistent mit eurer Faktentreue-Regel.
- **Aufwand:** 1 Tag. Migration der Bestandsnotizen per Re-Analyse-Button (gibt es schon).

### B3 · Große Quellen richtig chunken (25er-Limit aufheben)

- **Wie:** Bücher/PDFs vor der Analyse lokal in Abschnitte teilen (Text ist beim
  Upload schon extrahiert, `src/lib/knowledge/extract-text.ts`), pro Abschnitt ein
  Analyse-Aufruf. Für nicht-eilige Massenverarbeitung die **Batch API (−50 %)**
  nutzen; Analyse-Modell auf **Haiku 4.5** (1 $/M Input, 5 $/M Output) statt Sonnet
  stellen – Extraktion/Paraphrase braucht kein Spitzenmodell. Der stabile
  Analyse-Systemprompt gehört zusätzlich hinter einen Prompt-Cache-Breakpoint.
- **Effekt:** Aus einem gekauften Reiseführer werden 200–400 Notizen statt 25 –
  die Wissensbasis pro Quelle vervielfacht sich bei *sinkenden* Kosten pro Notiz.
- **Aufwand:** 2–3 Tage inkl. Job-Queue-Anbindung (Worker existiert).

---

## 4. Optionen C: Automatische Inhaltsbeschaffung (Quellen-Pipelines)

Damit die Datenbank ohne manuelles Füttern wächst. Alle Pipelines münden in den
**bestehenden Moderations-Workflow** (`moderationStatus`) – Automatik beschafft,
Redaktion gibt frei. Das ist auch rechtlich der sichere Rahmen.

| Quelle | Was | Lizenz/Rechtslage | Bewertung |
|---|---|---|---|
| **Wikivoyage** (+ Wikidata-IDs) | Fertige Reise-Artikel je Ort, per [Wikimedia-API](https://api.wikimedia.org/wiki/Use_cases/Travel) abrufbar | CC BY-SA – da ihr ohnehin **paraphrasiert**, unkritisch; Quellenangabe steht schon am Dokument | ⭐ Bester erster Kandidat: strukturiert, stabil, gratis. Ein „Region seeden"-Button: Artikel je `locality` ziehen → normale Analyse-Pipeline |
| **OSM/Overpass** | POI-Rohdaten (Koordinaten, Öffnungszeiten, Kategorien) | ODbL, Attribution nötig | Bereits angebunden (`src/lib/osm-places.ts`) – ausbauen zu periodischem Abgleich (Öffnungszeiten-/Existenz-Check geprüfter Orte) |
| **Wikidata / OpenTripMap** | Kanonische IDs, verknüpft OSM ↔ Wikivoyage ↔ Wikipedia | CC0 / frei | Als Verknüpfungsschicht für B1 nützlich (ein `wikidataId`-Feld am `Place` löst Entity-Matching langfristig sauber) |
| **Blog-/RSS-Watch** | Feste Liste guter Blogs, Feed-Polling, neue Artikel → Analyse | Paraphrase + Quelllink = okay; robots.txt respektieren | Guter zweiter Schritt; URL-Import existiert schon, es fehlt nur der Scheduler |
| **Reddit-Suche** | Threads zu Orten | bereits umgesetzt (Vorschlags-Workflow) | Von manuell auf periodisch je Ort umstellen |
| **YouTube-Transkripte** | Reise-Vlogs | bereits Code vorhanden (`src/lib/youtube/transcript.ts`) | An dieselbe Pipeline hängen |
| **Claude Web Search** (Server-Tool `web_search`) | KI recherchiert gezielt Lücken („Ort X hat 0 Notizen zu Essen") | Anthropic-seitig, mit Zitaten | Als **Lückenfüller**, getriggert von der „Abdeckung je Ort"-Tabelle im Admin; teuerste Option pro Notiz, daher gezielt einsetzen |
| Instagram/kommerz. Portale | – | rechtlich heikel, API-Hürden | Bleibt manuell (wie heute dokumentiert) |

**Umsetzungsmuster für alle Pipelines:** ein Cron-fähiger Worker-Job
(`node-cron` im bestehenden Worker oder System-Cron im Container) →
`KnowledgeDocument` mit `submittedByUser=false`, `moderationStatus=pending` →
Redaktion sieht sie in der bestehenden Moderations-Box. **Kein neuer Dienst nötig.**

---

## 5. Kostenbild (Größenordnung)

| Posten | Annahme | Kosten |
|---|---|---|
| Embeddings (Voyage) | 5.000 Notizen + Queries | ~0 € (200 M Gratis-Tokens) |
| Analyse neuer Quellen | 50 Quellen/Monat à ~30k Tokens, Haiku 4.5 + Batch API | wenige € / Monat |
| Guide-Generierung | unverändert (bestehender Kostenhebel: Prompt-Caching, `ANTHROPIC_MODEL`) | wie heute |
| Infrastruktur | pgvector = Extension im vorhandenen Postgres | 0 € |

Die Automatisierung *senkt* tendenziell die Kosten pro nutzbarer Notiz, weil
Batch API und Haiku die Ingestion verbilligen, während die Datenbasis wächst.

---

## 6. Empfohlener Ausbaupfad

**Stufe 1 – Fundament (ca. 1 Woche):**
pgvector aktivieren · Voyage-Embeddings für Chunks + Places · Retrieval auf
Vektor-Suche umstellen (A3) · Kontextsatz beim Embedden (A5) · Dedup bei der
Analyse (Similarity-Check) · `placeIds` statt `placeNames` (B1).

**Stufe 2 – Qualität & Menge (ca. 1 Woche):**
Hybrid Search mit FTS + RRF (A4/A2) · Chunk-Metadaten Frische/Vertrauen (B2) ·
Abschnittsweises Chunking großer Quellen mit Batch API + Haiku (B3).

**Stufe 3 – Automatische Beschaffung (inkrementell):**
Wikivoyage-Seeder je Region → Blog-/RSS-Watch → periodischer Reddit/YouTube-Lauf →
Claude-Web-Search als gezielter Lückenfüller über die Abdeckungs-Tabelle.

**Bewusst nicht:** dedizierte Vektor-DB, GraphRAG, Reranker (vorerst),
eigenes Modelltraining (bleibt RAG, wie im README begründet).

---

## Quellen

- [Anthropic: Contextual Retrieval](https://www.anthropic.com/engineering/contextual-retrieval)
- [Claude Docs: Embeddings (Voyage-Empfehlung)](https://platform.claude.com/docs/en/build-with-claude/embeddings)
- [Voyage AI: Pricing / Gratis-Kontingente](https://docs.voyageai.com/docs/pricing)
- [Voyage AI: Text Embeddings (voyage-3.5, mehrsprachig)](https://docs.voyageai.com/docs/embeddings)
- [ParadeDB: Hybrid Search in PostgreSQL – The Missing Manual](https://www.paradedb.com/blog/hybrid-search-in-postgresql-the-missing-manual)
- [Hybrid Search in 100 Zeilen: BM25 + pgvector mit RRF](https://dev.to/gabrielanhaia/hybrid-search-in-100-lines-bm25-pgvector-with-rrf-merge-58cn)
- [TigerData: BM25 + Vector + RRF in Postgres](https://www.tigerdata.com/blog/elasticsearchs-hybrid-search-now-in-postgres-bm25-vector-rrf)
- [Wikimedia API: Travel Use Cases (Wikivoyage)](https://api.wikimedia.org/wiki/Use_cases/Travel)
- [Wikimedia Enterprise: Wikivoyage API](https://enterprise.wikimedia.com/project-data/wikivoyage-api/)
- [OpenTripMap POI API](https://medium.com/@worldindata/opentripmap-point-of-interest-api-bfe3802a5ebd)
