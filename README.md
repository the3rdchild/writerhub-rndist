# WritingHub

Editor dokumen kolaboratif berbasis AI untuk **Premium Portal Extended (PPE)** dan **Ransel.ai** -
satu draf sebagai *single source of truth*, dengan modul AI (grammar, paraphrase, AI detector,
humanizer, plagiarism) bekerja di panel samping tanpa perlu berpindah aplikasi.

### run

Butuh Bun ≥ 1.2 dan Python 3.12.

```bash
docker compose up -d postgres redis
bun install && bun run db:push
bun run dev:api                       # http://localhost:8080
bun run dev:web                       # http://localhost:3000

python3 -m venv .venv                 # di luar `services/worker`
. .venv/bin/activate
pip install -r services/worker/requirements.txt

cd services/worker && python entry.py
```

### docker

| Perintah                                                               |
| ---------------------------------------------------------------------- |
| `docker compose up --build`                                          |
| `bun run docker:up` / `docker:down`                                |
| `bun run dev:web` / `dev:api`                                      |
| `bun run typecheck`                                                  |
| `bun run test`                                                       |
| `bun run build`                                                      |
| `bun run db:generate` / `db:migrate` / `db:push` / `db:studio` |

aUji worker Python berdiri sendiri - ia tidak menyentuh Redis maupun basis data, jadi tidak
perlu stack yang menyala:

```bash
cd services/worker
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt -r requirements-dev.txt
pytest
```

## Alur sebuah permintaan

```
Browser ──▶ Next route /api/*  ──▶  apps/api  ──▶  Redis (BullMQ)  ──▶  worker
   ▲          (menandatangani            │                                  │
   │           HMAC, sisi server)        │                                  │
   └────────── SSE /api/stream/:jobId ◀──┴──── Redis pub/sub ◀───────────────┘
```

### Autentikasi

Dikendalikan `AUTH_MODE`, dan nilainya harus sama di `apps/api` dan `apps/web`:

- **`none`** (pengembangan) - seluruh pemeriksaan dilewati, proxy tidak menandatangani apa pun,
  provider LLM diambil worker dari env-nya sendiri, kuota tidak dicatat.
- **`pp`** (produksi) - jalur di bawah ini aktif.

Kode jalur produksi tetap utuh di repo pada mode `none`; mengaktifkannya kembali cukup dengan
mengubah env, tanpa menulis ulang apa pun.

`apps/api` melindungi endpoint dengan tanda tangan HMAC (`x-pp-api-key` = HMAC-SHA256 atas
timestamp memakai `PP_API_KEY`) plus verifikasi bearer token user ke pp-extended.

Secret itu **tidak boleh sampai ke browser**. Karena itu `apps/web` tidak pernah memanggil
`apps/api` secara langsung: browser memanggil route handler same-origin di `/api/*`, dan route
itulah yang menandatangani serta meneruskan permintaan
(lihat [`apps/web/lib/server/upstream.ts`](apps/web/lib/server/upstream.ts)).
Konsekuensinya `API_URL` adalah variabel sisi server - bukan `NEXT_PUBLIC_*`.

Token user diambil dari header `Authorization` bila WritingHub disematkan di shell yang sudah
meneruskannya, atau dari cookie `AUTH_COOKIE_NAME` bila berdiri sendiri.
