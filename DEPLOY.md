# Deployment auf einem eigenen Server (Docker)

Getestet für einen einzelnen Linux-Server mit Docker + Docker-Compose-Plugin
(z. B. Hetzner). Alle Befehle laufen **auf dem Server** (per SSH einloggen).

## 1. Code auf den Server holen

```bash
ssh root@49.12.97.244

# Variante A: privates GitHub-Repo klonen (Personal Access Token nötig)
git clone -b main https://github.com/kasu207/Eigener-reisefuehrer-.git reisefuehrer
cd reisefuehrer

# Variante B: ohne GitHub-Zugang – vom eigenen Rechner hochladen:
#   (lokal ausführen)  rsync -av --exclude node_modules --exclude .next --exclude .git . root@49.12.97.244:~/reisefuehrer/
```

## 2. Konfiguration anlegen

```bash
cat > .env <<'EOF'
# Pflicht
POSTGRES_PASSWORD=HIER-LANGES-ZUFALLSPASSWORT
ADMIN_PASSWORD=HIER-SICHERES-ADMIN-PASSWORT
APP_URL=http://49.12.97.244

# KI: erst mit "mock" testen (kostenlos), dann auf "live" stellen
AI_MODE=mock
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-6

# E-Mail-Versand (optional; ohne Key werden Guide-Links nur geloggt)
RESEND_API_KEY=
MAIL_FROM=Reiseführer <guide@deine-domain.de>

DATA_RETENTION_MONTHS=12

# Impressum (Pflicht vor gewerblichem Betrieb, § 5 DDG).
# Fehlt etwas, meldet /admin/startklar das als Blocker.
OPERATOR_NAME=
OPERATOR_STREET=
OPERATOR_CITY=
OPERATOR_EMAIL=
# Optional
OPERATOR_VAT_ID=
OPERATOR_RESPONSIBLE=
OPERATOR_PHONE=
EOF
chmod 600 .env
```

Zufallspasswörter erzeugen: `openssl rand -base64 24`

## 3. Bauen und starten

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Das startet drei Container: `db` (Postgres mit persistentem Volume),
`app` (Web auf Port 80, wendet beim Start automatisch das DB-Schema an)
und `worker` (Guide-Generierung + Quellen-Analyse).

## 4. Beispieldaten einspielen (einmalig)

```bash
docker compose -f docker-compose.prod.yml exec app npm run db:seed
```

## 5. Prüfen

```bash
docker compose -f docker-compose.prod.yml ps          # alle 3 "running"?
docker compose -f docker-compose.prod.yml logs -f app worker
```

Im Browser: `http://49.12.97.244` (Startseite), `http://49.12.97.244/admin`
(Basic Auth: admin / dein ADMIN_PASSWORD). Fragebogen absenden – ohne
RESEND_API_KEY steht der Guide-Link danach in den **worker-Logs**.

Falls Port 80 nicht erreichbar ist: Hetzner-Cloud-Firewall bzw. `ufw allow 80/tcp` prüfen.

## 6. Updates einspielen

Alle Änderungen laufen über `main` (kein Arbeiten mit mehreren Branches).

```bash
cd ~/reisefuehrer
git checkout main
git pull origin main
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps          # alle 3 "running"?
docker compose -f docker-compose.prod.yml logs -f app worker
```

## 6a. Nach dem Update prüfen: `/admin/startklar`

`http://<server>/admin/startklar` listet, was dem bezahlten Betrieb noch im
Weg steht: fehlende Impressum-Angaben, Mock-Modus, zu dünner Ortsbestand,
stehender Worker, schwaches Admin-Passwort. Das ist der schnellste Weg zu
sehen, ob ein Update sauber angekommen ist.

Schema-Änderungen und die Postgres-Extensions (`pg_trgm`, `unaccent`)
wendet der app-Container beim Start selbst an (`prisma db push`) – dafür
ist kein eigener Befehl nötig.

## 7. Auf Live-KI umstellen

In der `.env`: `AI_MODE=live` und `ANTHROPIC_API_KEY=sk-ant-...` setzen, dann:

```bash
docker compose -f docker-compose.prod.yml up -d
```

## Empfohlen vor echtem Kundenbetrieb

- **Domain + HTTPS**: Eine Domain auf die Server-IP zeigen lassen und einen
  Reverse-Proxy mit automatischem TLS davorschalten (z. B. Caddy):
  `APP_URL` dann auf `https://deine-domain.de` ändern. Ohne HTTPS gehen
  Guide-Links und Formulardaten unverschlüsselt durchs Netz – für einen
  ersten Test okay, für Kunden (DSGVO) nicht.
- **Backups**: das Docker-Volume `pgdata` regelmäßig sichern, z. B.
  `docker compose -f docker-compose.prod.yml exec db pg_dump -U reisefuehrer reisefuehrer > backup.sql`
- Impressum/Datenschutz-Platzhalter ausfüllen, Seed-Bildlizenzen prüfen.
