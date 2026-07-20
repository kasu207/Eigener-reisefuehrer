# Produktions-Image für App UND Worker (gleiches Image, anderes Kommando).
# Enthält Chromium für den A5-PDF-Export.

FROM node:22-bookworm-slim AS build
WORKDIR /app
# openssl, damit prisma generate die richtige Engine-Plattform erkennt
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
# Prisma braucht das Schema schon beim postinstall (prisma generate)
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
# Chromium + Fonts für den PDF-Export
RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium fonts-liberation fonts-dejavu-core openssl \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV CHROMIUM_PATH=/usr/bin/chromium
# Chromium läuft im Container als Root => Sandbox deaktivieren
ENV CHROMIUM_ARGS="--no-sandbox --disable-dev-shm-usage"

COPY --from=build /app ./

EXPOSE 3000
CMD ["npm", "start"]
