# ------------------------------------------------------------------------------
# Dockerfile multi-target untuk monorepo writer-hub.
#
# Target produksi:
#   - api          : Bun + Hono, melayani /api/v1
#   - api-migrate  : job sekali jalan, menjalankan migrasi drizzle
#   - web          : Next.js (output standalone)
#   - worker       : Python, konsumen antrean grammar & analysis
#
# Target pengembangan (dipakai docker-compose.yml, kode di-bind mount):
#   - bun-dev      : dependensi Bun lengkap untuk api & web
#   - worker-dev   : dependensi Python + auto-restart
#
# Build context selalu root repo - apps/api dan apps/web memakai
# packages/shared, jadi konteks per-app tidak cukup.
#
#   docker build --target api -t writer-hub-api .
#
# Sengaja TANPA arahan `# syntax=docker/dockerfile:1`. Arahan itu memaksa
# BuildKit menarik image frontend dari Docker Hub sebelum build apa pun dimulai,
# sedangkan berkas ini tidak memakai satu pun fitur yang membutuhkannya (tanpa
# RUN --mount, tanpa heredoc, tanpa COPY --link). Frontend bawaan Docker sudah
# cukup, dan build jadi tetap jalan di jaringan yang tidak bisa menjangkau
# Docker Hub selama base image-nya sudah ada di lokal.
# ------------------------------------------------------------------------------

ARG BUN_VERSION=1.2
ARG PYTHON_VERSION=3.12
ARG APP_UID=65534

# ==============================================================================
# Basis Bun
# ==============================================================================
FROM oven/bun:${BUN_VERSION}-slim AS bun-base

RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends ca-certificates dumb-init wget \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app /tmp/bun-cache \
    && chown -R 65534:65534 /app /tmp/bun-cache

WORKDIR /app

ENV BUN_INSTALL_CACHE_DIR=/tmp/bun-cache \
    HOME=/tmp \
    NODE_ENV=production

USER 65534:65534

# ------------------------------------------------------------------------------
# Manifest saja - lapisan dependensi hanya dibangun ulang saat manifest berubah.
# ------------------------------------------------------------------------------
FROM bun-base AS bun-deps

COPY --chown=65534:65534 package.json bun.lock ./
# tsconfig tiap workspace meng-extends berkas ini; tanpa dia Next gagal dengan
# "extends: ../../tsconfig.base.json doesn't resolve correctly".
COPY --chown=65534:65534 tsconfig.base.json ./
COPY --chown=65534:65534 packages/shared/package.json ./packages/shared/
COPY --chown=65534:65534 apps/api/package.json ./apps/api/
COPY --chown=65534:65534 apps/web/package.json ./apps/web/

# ==============================================================================
# api
# ==============================================================================
FROM bun-deps AS api

RUN bun install --frozen-lockfile --production

COPY --chown=65534:65534 packages/shared ./packages/shared
COPY --chown=65534:65534 apps/api ./apps/api

ENV PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD sh -c 'wget -qO- http://localhost:${PORT:-8080}/api/v1/health | grep -q healthy || exit 1'

WORKDIR /app/apps/api
ENTRYPOINT ["dumb-init", "--"]
CMD ["bun", "run", "src/index.ts"]

# ==============================================================================
# api-migrate
#
# drizzle-kit adalah devDependency, jadi stage ini memasang dependensi lengkap
# (tanpa --production) sementara image `api` tetap ramping. Dipakai sebagai
# initContainer / Job sebelum api dijalankan.
# ==============================================================================
FROM bun-deps AS api-migrate

RUN bun install --frozen-lockfile

COPY --chown=65534:65534 packages/shared ./packages/shared
COPY --chown=65534:65534 apps/api ./apps/api

WORKDIR /app/apps/api
ENTRYPOINT ["dumb-init", "--"]
CMD ["bun", "run", "db:migrate"]

# ==============================================================================
# web
# ==============================================================================
FROM bun-deps AS web-builder

ENV NEXT_TELEMETRY_DISABLED=1

RUN bun install --frozen-lockfile

COPY --chown=65534:65534 packages/shared ./packages/shared
COPY --chown=65534:65534 apps/web ./apps/web

WORKDIR /app/apps/web
RUN bun run build

FROM oven/bun:${BUN_VERSION}-slim AS web

RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends ca-certificates dumb-init wget \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app && chown -R 65534:65534 /app

WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

USER 65534:65534

# Output standalone sudah memuat node_modules seperlunya beserta server.js.
COPY --from=web-builder --chown=65534:65534 /app/apps/web/.next/standalone ./
COPY --from=web-builder --chown=65534:65534 /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=web-builder --chown=65534:65534 /app/apps/web/public ./apps/web/public

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD sh -c 'wget -qO- http://localhost:${PORT:-3000}/ >/dev/null || exit 1'

ENTRYPOINT ["dumb-init", "--"]
CMD ["bun", "apps/web/server.js"]

# ==============================================================================
# Target pengembangan
#
# Berbeda dari target produksi, stage ini TIDAK menyalin kode: sumber di-bind
# mount lewat docker-compose supaya perubahan langsung terlihat tanpa rebuild.
# Yang dibawa image hanyalah dependensi lengkap (termasuk devDependencies).
# ==============================================================================
FROM bun-deps AS bun-dev

ENV NODE_ENV=development \
    NEXT_TELEMETRY_DISABLED=1

RUN bun install --frozen-lockfile

# Docker mengisi volume bernama dari isi image pada path yang sama, termasuk
# kepemilikannya. Kalau path-nya tidak ada di image, volume dibuat milik root
# dan container (UID 65534) tidak bisa menulis ke sana - `next dev` gagal dengan
# EACCES saat membuat .next/dev. Direktori-direktori berikut sengaja dibuat
# lebih dulu di sini supaya volume mewarisi kepemilikan yang benar.
RUN mkdir -p /app/apps/web/.next

ENTRYPOINT ["dumb-init", "--"]

# ==============================================================================
# worker
# ==============================================================================
FROM python:${PYTHON_VERSION}-slim-bookworm AS worker

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONIOENCODING=utf-8 \
    HOME=/tmp

RUN apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends ca-certificates dumb-init \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app && chown -R 65534:65534 /app

WORKDIR /app

COPY services/worker/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

USER 65534:65534
COPY --chown=65534:65534 services/worker/ ./

ENTRYPOINT ["dumb-init", "--"]
CMD ["python", "entry.py"]

# ==============================================================================
# worker-dev
#
# Dependensi saja; kode di-bind mount oleh compose. `watchmedo` me-restart
# proses tiap berkas .py berubah - worker tidak punya hot reload bawaan.
# ==============================================================================
FROM python:${PYTHON_VERSION}-slim-bookworm AS worker-dev

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONIOENCODING=utf-8 \
    HOME=/tmp

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates dumb-init \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app && chown -R 65534:65534 /app

WORKDIR /app

COPY services/worker/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt watchdog

USER 65534:65534

ENTRYPOINT ["dumb-init", "--"]
CMD ["watchmedo", "auto-restart", "--directory=.", "--pattern=*.py", "--recursive", "--", "python", "entry.py"]
