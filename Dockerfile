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

# bunfig.toml ikut SEBELUM `bun install`: ia yang menentukan tata letak
# node_modules (lihat berkasnya). Tanpa baris ini, image memasang dengan tata
# letak simlink terisolasi sementara host memakai hoisted - dua lingkungan yang
# resolusi modulnya berbeda, dan itu persis jenis selisih yang membuat "jalan di
# mesin saya" jadi jawaban yang tidak berguna.
COPY --chown=65534:65534 package.json bun.lock bunfig.toml ./
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
FROM python:${PYTHON_VERSION}-slim-bookworm AS worker-base

# PLAYWRIGHT_BROWSERS_PATH sengaja di luar $HOME dan di luar /app: $HOME milik
# root saat build tapi /tmp saat jalan, dan /app tertimpa bind mount di
# worker-dev. Keduanya berarti Chromium yang diunduh saat build tidak ketemu
# lagi saat dijalankan.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONIOENCODING=utf-8 \
    HOME=/tmp \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

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

# Chromium untuk perender berkas (services/render_service.py).
#
# Yang dipasang **hanya** chrome-headless-shell, bukan Chrome lengkap: keduanya
# mesin yang sama dan menghasilkan PDF yang identik byte-per-byte, tapi yang
# lengkap membawa UI, GPU dan ekstensi yang tidak pernah kita sentuh - 184 MB
# unduhan dan 389 MB di disk untuk jalur yang tidak ada di sini. `playwright
# install chromium` memasang keduanya plus ffmpeg (hanya untuk rekam video).
#
# Pustaka sistemnya tetap datang dari `install-deps` supaya daftarnya jadi
# tanggungan Playwright, bukan kita - lalu tumpukan GL-nya dibuang. Itu bukan
# tebakan: `ldd chrome-headless-shell` tidak menyebut libGL/libEGL/mesa-dri sama
# sekali (hanya libgbm dan libdrm), dan mencetak PDF tetap berhasil setelah
# ketiga paket ini dicabut. Ia hanya dibutuhkan mode berkepala.
#
# Emoji ikut karena flyer memakainya dan tanpa fontnya ia tercetak kotak kosong;
# sisa fontnya disematkan halaman ekspor sebagai `data:` URI, bukan dari sistem
# (docs/RENDER-WORKER-PLAN.md §9).
RUN apt-get update \
    && apt-get install -y --no-install-recommends fonts-noto-color-emoji \
    && playwright install-deps chromium \
    && apt-get remove -y --purge libgl1-mesa-dri libllvm15 libz3-4 \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/* \
    && playwright install chromium-headless-shell \
    && chmod -R a+rX ${PLAYWRIGHT_BROWSERS_PATH}
FROM worker-base AS worker

USER 65534:65534
COPY --chown=65534:65534 services/worker/ ./

ENTRYPOINT ["dumb-init", "--"]
CMD ["python", "entry.py"]
FROM worker-base AS worker-dev

RUN pip install --no-cache-dir watchdog

USER 65534:65534

ENTRYPOINT ["dumb-init", "--"]
CMD ["watchmedo", "auto-restart", "--directory=.", "--pattern=*.py", "--recursive", "--", "python", "entry.py"]
