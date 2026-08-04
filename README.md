# WritingHub

Editor dokumen kolaboratif berbasis AI untuk **Premium Portal Extended (PPE)** dan **Ransel.ai** -
satu draf sebagai *single source of truth*, dengan modul AI (grammar, paraphrase, AI detector,
humanizer, plagiarism) bekerja di panel samping tanpa perlu berpindah aplikasi.

Spesifikasi produk: [`docs/PRD - WritingHub - Premium Portal Extended & Ransel.ai.pdf`](docs/).

---

## Struktur

```
writer-hub/
├── apps/
│   ├── api/          Bun + Hono - REST /api/v1, enqueue job ke worker
│   └── web/          Next.js 16 - Editor Shell (React 19, Tailwind v4, TanStack Query)
├── services/
│   └── worker/       Python 3.12 - konsumen antrean grammar & analysis
├── packages/
│   └── shared/       Kontrak API & tipe yang dipakai bersama api ↔ web
├── docs/             PRD dan dokumen produk
├── Dockerfile        Multi-target: api | api-migrate | web | worker (+ target dev)
└── docker-compose.yml
```

Codebase ini berasal dari `ReacteevID/ai-grammar-checker`: backend dari branch `main`
(termasuk autentikasi PPE, migrasi, dan integrasi kuota admin-ppe), frontend dari branch
`dev-ext-feature` - satu-satunya branch yang pernah memuatnya.

## Teknologi

| Bagian | Teknologi |
| --- | --- |
| Web | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, TanStack Query v5, Tiptap 3 (ProseMirror), lucide-react |
| API | Bun, Hono, Drizzle ORM, PostgreSQL, BullMQ + ioredis, Zod, Pino, AWS SDK v3 (S3-compatible) |
| Worker | Python 3.12, redis-py, psycopg2, pyspellchecker, proselint, textstat, pypdf, python-docx, langdetect |
| Infra | Docker multi-target, GitHub Actions → DigitalOcean Container Registry → Kubernetes (Helm) |
| Paket | Bun workspaces |

State di web dibagi tegas: **server state** (submit job, streaming hasil) memakai TanStack Query,
**client state** (isi dokumen, suggestion, panel aktif, pengaturan) memakai React context + reducer.

## Menjalankan secara lokal

Prasyarat: Docker. Tidak ada lagi - Bun dan Python hidup di dalam container.

```bash
docker compose up --build
```

Perintah itu menyalakan Postgres, Redis, api, worker, dan web sekaligus; skema
database disiapkan otomatis sebelum api naik. Buka http://localhost:3000.

(`bun run docker:up` melakukan hal yang sama, tapi baru bisa dipakai kalau Bun
sudah terpasang di host.)

Mode lokal berjalan **tanpa kredensial apa pun** - tanpa HMAC, tanpa
pp-extended, tanpa S3. Berkas `.env` di tiap app sudah terisi nilai yang siap
pakai (`AUTH_MODE=none`, `STORAGE_DRIVER=local`).

Kode di-bind mount, jadi mengubah berkas langsung terlihat: web memakai
`next dev`, api memakai `bun --hot`, worker di-restart otomatis oleh watchmedo.

**Setelah menambah dependensi**, `--build` saja tidak cukup. `node_modules`
tinggal di volume bernama, dan Docker hanya mengisi volume pada pemakaian
pertama - image baru akan diabaikan dan muncul `Module not found`. Buang
volumenya dulu:

```bash
docker compose down -v && docker compose up --build   # atau: bun run docker:reset
```

### Apa yang jalan tanpa API key

| Modul | Tanpa key | Catatan |
| --- | --- | --- |
| Grammar `standard` / `advanced` | ✅ | Engine pure-Python: spelling, rules, POS, confusion, collocation, structure, style |
| Plagiarism | ✅ | Heuristik, tidak memanggil LLM |
| Grammar `ai` | ❌ | Butuh `AI_API_KEY` |
| AI Detector, Humanizer, AI Rewriter | ❌ | Butuh `AI_API_KEY` |

Untuk mengaktifkan yang butuh LLM, isi `AI_API_KEY` di `services/worker/.env`
dengan key OpenRouter (atau endpoint apa pun yang OpenAI-compatible), lalu
`docker compose restart worker`. Tanpa itu, keempatnya gagal dengan pesan yang
menjelaskan penyebabnya - sisanya tetap berjalan normal.

### Menjalankan di host (opsional)

Butuh Bun ≥ 1.2 dan Python 3.12.

```bash
docker compose up -d postgres redis   # infra saja
bun install && bun run db:push
bun run dev:api                       # http://localhost:8080
bun run dev:web                       # http://localhost:3000

# venv dibuat di root repo, BUKAN di dalam services/worker - lihat catatan
python3 -m venv .venv
. .venv/bin/activate                  # fish: source .venv/bin/activate.fish
pip install -r services/worker/requirements.txt

cd services/worker && python entry.py
```

Dua jebakan:

- **Venv harus di luar `services/worker`.** Worker berjalan dengan direktori itu
  sebagai CWD; kalau venv berada di dalamnya, `site-packages` ikut terbaca
  sebagai modul dari CWD dan nltk ≥ 3.10 memblokirnya:
  `ImportError: Blocked import of regex from current working directory`.
  Menaruh venv di root repo menghilangkan masalahnya.
- **Fish butuh berkas sendiri.** `activate` ditulis untuk bash/zsh dan fish akan
  menolaknya dengan `'case' builtin not inside of switch block`. Pakai
  `activate.fish`.

Direktori venv bernama apa pun yang berakhiran `venv` sudah masuk `.gitignore`.

**Di NixOS**, `python3 -m pip` tidak tersedia - pip hidup di dalam venv, bukan di
interpreter sistem. Perintah venv di atas tetap jalan apa adanya (`ensurepip`
tersedia), dan wheel biner seperti `psycopg2-binary` dan `lxml` juga berfungsi
selama `programs.nix-ld.enable = true`.

Satu paket meleset: `proselint` menarik `google-re2` yang mencari
`libstdc++.so.6`. Kalau perlu, sediakan lewat:

```bash
export LD_LIBRARY_PATH=$(nix eval --raw nixpkgs#stdenv.cc.cc.lib)/lib
```

Membiarkannya pun tidak apa-apa - `services/checker/style.py` mengimpor proselint
di dalam `try/except`, jadi style check tetap berjalan lewat daftar curated.

### Perintah

| Perintah | Kegunaan |
| --- | --- |
| `docker compose up --build` | Stack lokal lengkap (tanpa perlu Bun di host) |
| `bun run docker:up` / `docker:down` | Sama, lewat script workspace |
| `bun run dev:web` / `dev:api` | Jalankan satu app di host dengan hot reload |
| `bun run typecheck` | Typecheck seluruh workspace |
| `bun run build` | Build produksi |
| `bun run db:generate` / `db:migrate` / `db:push` / `db:studio` | Drizzle |

## Alur sebuah permintaan

```
Browser ──▶ Next route /api/*  ──▶  apps/api  ──▶  Redis (BullMQ)  ──▶  worker
   ▲          (menandatangani            │                                  │
   │           HMAC, sisi server)        │                                  │
   └────────── SSE /api/stream/:jobId ◀──┴──── Redis pub/sub ◀───────────────┘
```

1. Web mengirim teks atau dokumen; API mengunggah dokumen ke object storage, membuat baris
   `pool_request`, lalu memasukkan job ke antrean.
2. Worker mengambil job, mengekstrak teks bila perlu, menjalankan checker/analyzer, menulis
   hasil ke database, dan mengabarkan progres lewat Redis pub/sub.
3. API meneruskan kabar itu sebagai SSE; `GET /api/v1/status/:jobId` tersedia sebagai cadangan
   bila stream terputus.

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

## Deployment

`Dockerfile` di root punya empat target - `api`, `api-migrate`, `web`, `worker` - dan selalu
memakai root repo sebagai build context, karena `apps/api` dan `apps/web` bergantung pada
`packages/shared`.

Workflow `build-push-<service>.yaml` dijalankan manual dengan nomor versi; workflow itu
membangun image, memindainya dengan Trivy, mendorongnya ke DigitalOcean Container Registry,
lalu memperbarui `values.yaml` di repo deployment. `api-migrate` dijalankan sebagai
initContainer sebelum `api` naik.

### Penyimpanan dokumen

Dikendalikan `STORAGE_DRIVER`. Keduanya menghasilkan URL unduh, jadi worker tidak perlu tahu
mana yang aktif:

- **`local`** (pengembangan) - ditulis ke `STORAGE_DIR`, disajikan lewat `GET /api/v1/files/<key>`.
- **`s3`** (produksi) - diunggah ke object storage, worker memakai presigned URL.

## Catatan yang perlu diketahui

- **Pemaksaan tier grammar.** Produksi menyetel `GRAMMAR_FORCE_MODEL=ai` karena provider LLM
  berasal dari admin-ppe. Dikosongkan (seperti pada `.env` lokal), pilihan model dari UI dipakai
  apa adanya dan `standard`/`advanced` berjalan tanpa LLM.
- **Endpoint SSE tidak berautentikasi.** `EventSource` tidak bisa mengirim header kustom, dan
  klien ekstensi berlangganan langsung ke sana; pengamanannya bertumpu pada jobId berupa UUID
  acak. Jalur web sendiri sudah lewat proxy yang terautentikasi.
- **Sorotan suggestion dihitung ulang, bukan disimpan.** Alih-alih menyimpan posisi lalu
  menggesernya tiap kali dokumen berubah, `suggestion-highlight.ts` mencari ulang tiap `original`
  di dokumen saat itu juga. Sorotan jadi tidak pernah melenceng saat pengguna mengetik, dan
  suggestion yang teksnya sudah hilang berhenti disorot dengan sendirinya. Offset dari API
  hanya dipakai sebagai petunjuk memilih kemunculan terdekat.
- **Kanvas belum berpaginasi.** Halaman dokumen memakai lebar Google Docs (816px) tapi mengalir
  menerus tanpa pemenggalan antar halaman; pagination visual perlu perhitungan tinggi manual di
  ProseMirror dan belum dikerjakan.
- **Lint worker belum blocking.** Kode Python dipindahkan apa adanya dan belum pernah diformat
  ruff, jadi di CI dua langkah ruff masih advisory. Jalankan `ruff format .` sekali lalu jadikan
  blocking.
- **Integrasi proselint sudah mati diam-diam.** `services/worker/requirements.txt` tidak memasang
  batas versi sama sekali, sehingga `pip install` kini mengambil proselint 0.16 yang menghapus
  `tools.lint()` - persis fungsi yang dipanggil `services/checker/style.py`. Panggilannya
  melempar `AttributeError`, tertangkap `try/except`, dan hasilnya kosong. Jadi paruh proselint
  dari style checker tidak pernah berkontribusi apa pun, di semua platform, termasuk di dalam
  image Docker. Perlu diputuskan: sematkan versi lama, sesuaikan ke API baru, atau lepaskan
  proselint sekalian. Memasang pin versi di seluruh `requirements.txt` juga layak dilakukan.
