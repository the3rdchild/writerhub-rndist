ARG BUN_VERSION=1.3
ARG PYTHON_VERSION=3.12
ARG APP_UID=65534
FROM oven/bun:${BUN_VERSION}-slim AS bun-base

# deb.debian.org 403s some packages over plain HTTP; switch to HTTPS and
# bootstrap ca-certificates without peer verification (slim image has no CA
# store yet), then run apt normally with verification enabled.
RUN sed -i 's|http://|https://|g' /etc/apt/sources.list.d/debian.sources \
    && apt-get update -o Acquire::https::Verify-Peer=false -o Acquire::https::Verify-Host=false \
    && apt-get install -y --no-install-recommends -o Acquire::https::Verify-Peer=false -o Acquire::https::Verify-Host=false ca-certificates \
    && apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends dumb-init wget \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app /tmp/bun-cache \
    && chown -R 65534:65534 /app /tmp/bun-cache

WORKDIR /app

ENV BUN_INSTALL_CACHE_DIR=/tmp/bun-cache \
    HOME=/tmp \
    NODE_ENV=production

USER 65534:65534
FROM bun-base AS bun-deps

COPY --chown=65534:65534 package.json bun.lock ./
COPY --chown=65534:65534 tsconfig.base.json ./
COPY --chown=65534:65534 packages/shared/package.json ./packages/shared/
COPY --chown=65534:65534 apps/api/package.json ./apps/api/
COPY --chown=65534:65534 apps/web/package.json ./apps/web/
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
FROM bun-deps AS api-migrate

RUN bun install --frozen-lockfile

COPY --chown=65534:65534 packages/shared ./packages/shared
COPY --chown=65534:65534 apps/api ./apps/api

WORKDIR /app/apps/api
ENTRYPOINT ["dumb-init", "--"]
CMD ["bun", "run", "db:migrate"]
FROM bun-deps AS web-builder

ENV NEXT_TELEMETRY_DISABLED=1

RUN bun install --frozen-lockfile

COPY --chown=65534:65534 packages/shared ./packages/shared
COPY --chown=65534:65534 apps/web ./apps/web

WORKDIR /app/apps/web
RUN bun run build

FROM oven/bun:${BUN_VERSION}-slim AS web

RUN sed -i 's|http://|https://|g' /etc/apt/sources.list.d/debian.sources \
    && apt-get update -o Acquire::https::Verify-Peer=false -o Acquire::https::Verify-Host=false \
    && apt-get install -y --no-install-recommends -o Acquire::https::Verify-Peer=false -o Acquire::https::Verify-Host=false ca-certificates \
    && apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends dumb-init wget \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app && chown -R 65534:65534 /app

WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

USER 65534:65534
COPY --from=web-builder --chown=65534:65534 /app/apps/web/.next/standalone ./
COPY --from=web-builder --chown=65534:65534 /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=web-builder --chown=65534:65534 /app/apps/web/public ./apps/web/public

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD sh -c 'wget -qO- http://localhost:${PORT:-3000}/ >/dev/null || exit 1'

ENTRYPOINT ["dumb-init", "--"]
CMD ["bun", "apps/web/server.js"]
FROM bun-deps AS bun-dev

ENV NODE_ENV=development \
    NEXT_TELEMETRY_DISABLED=1

RUN bun install --frozen-lockfile
RUN mkdir -p /app/apps/web/.next

ENTRYPOINT ["dumb-init", "--"]
FROM python:${PYTHON_VERSION}-slim-bookworm AS worker

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONIOENCODING=utf-8 \
    HOME=/tmp

RUN sed -i 's|http://|https://|g' /etc/apt/sources.list.d/debian.sources \
    && apt-get update -o Acquire::https::Verify-Peer=false -o Acquire::https::Verify-Host=false \
    && apt-get install -y --no-install-recommends -o Acquire::https::Verify-Peer=false -o Acquire::https::Verify-Host=false ca-certificates \
    && apt-get update \
    && apt-get upgrade -y \
    && apt-get install -y --no-install-recommends dumb-init \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app && chown -R 65534:65534 /app

WORKDIR /app

COPY services/worker/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

USER 65534:65534
COPY --chown=65534:65534 services/worker/ ./

ENTRYPOINT ["dumb-init", "--"]
CMD ["python", "entry.py"]
FROM python:${PYTHON_VERSION}-slim-bookworm AS worker-dev

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONIOENCODING=utf-8 \
    HOME=/tmp

RUN sed -i 's|http://|https://|g' /etc/apt/sources.list.d/debian.sources \
    && apt-get update -o Acquire::https::Verify-Peer=false -o Acquire::https::Verify-Host=false \
    && apt-get install -y --no-install-recommends -o Acquire::https::Verify-Peer=false -o Acquire::https::Verify-Host=false ca-certificates \
    && apt-get update \
    && apt-get install -y --no-install-recommends dumb-init \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app && chown -R 65534:65534 /app

WORKDIR /app

COPY services/worker/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt watchdog

USER 65534:65534

ENTRYPOINT ["dumb-init", "--"]
CMD ["watchmedo", "auto-restart", "--directory=.", "--pattern=*.py", "--recursive", "--", "python", "entry.py"]
