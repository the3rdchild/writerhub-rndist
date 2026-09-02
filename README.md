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

## Serah-terima draf dari klien eksternal

Satu permintaan "buatkan …" dari luar - misalnya AI Chat PPE - ditukar dengan sebuah dokumen
WritingHub beserta tautannya. Endpointnya memakai autentikasi yang sama dengan endpoint lain
(`x-client` + HMAC untuk `pp-extended`, API key untuk `ransel-ai`); dokumen yang lahir dari
sana dimiliki identitas pengguna yang dikirim di `x-pp-user-id` / `x-ransel-user-id`, jadi ia
langsung muncul di Library pengguna itu.

```
POST /api/v1/drafts
{ "prompt": "buatkan draf akademik tentang X", "tone": "academic", "language": "Indonesian" }

202 { "documentId": "…", "tabId": "…", "title": "…", "status": "generating",
      "url": "https://…/d/<documentId>", "statusUrl": "https://…/api/v1/drafts/<documentId>" }
```

Yang perlu diketahui pemanggil:

- **Tautannya dibalas seketika**, sebelum naskahnya ada. Dokumen dibuat lebih dulu supaya
  balasan tidak menunggu LLM; naskahnya menyusul di latar belakang
  (`apps/api/src/services/drafts/runner.ts`).
- **`GET /api/v1/drafts/:documentId`** memberi status yang sama sampai ia `ready` atau
  `failed`. Halaman `/d/<documentId>` di `apps/web` menunggunya sendiri, jadi pengguna boleh
  membuka tautannya seketika. Selama `generating` ia membawa `progress`:

  ```json
  { "phase": "writing", "percent": 62, "characters": 1120, "targetCharacters": 1800 }
  ```

  `percent` adalah **taksiran** - panjang karakter yang sudah diterima dibagi panjang yang
  diminta ke model - dan sengaja berhenti di 95% selama naskahnya masih mengalir. Model tidak
  tahu panjang keluarannya sendiri, jadi tidak ada angka yang lebih pasti dari itu. Kirim
  `words` supaya pembaginya adalah panjang yang memang diminta, bukan bawaan.
- **Kegagalan selalu punya sebab yang bisa diperiksa program.** Status `failed` membawa
  `errorCode` (`provider_unreachable`, `provider_rejected`, `quota_exceeded`, `timeout`,
  `empty_response`, `save_failed`, `unknown`) di samping `error` yang bisa dibaca manusia.
  Penulisan yang prosesnya mati di tengah jalan - deployment yang restart, misalnya - tidak
  menggantung sebagai `generating` selamanya: catatan statusnya bertenggat, dan sesudah lewat
  ia terbaca sebagai `timeout`.
- **`POST /api/v1/drafts/:documentId/retry`** menulis ulang draf yang gagal ke dokumen yang
  sama, memakai permintaan asli yang tersimpan (24 jam). Tanpa badan permintaan - tombol
  "tulis ulang" di halaman `/d/<documentId>` memakainya, dan halaman itu tidak pernah melihat
  prompt aslinya. Draf yang masih ditulis membalas 409; permintaan yang sudah kedaluwarsa
  membalas 422.
- **Kirim `content` (Markdown) alih-alih `prompt`** kalau naskahnya sudah jadi di sisi
  pemanggil. Dokumen langsung `ready` (201) dan tidak ada panggilan LLM sama sekali.
- **`title` opsional.** Tanpa itu judul diambil dari heading pertama naskah, dengan potongan
  prompt sebagai penambal selama draf masih ditulis.
- `tone` memakai daftar yang sama dengan Paraphraser (`academic`, `formal`, `casual`,
  `natural`); `projectId` opsional, bawaannya proyek default pengguna.

`WEB_URL` di `apps/api` menentukan asal tautan yang dikembalikan - ia harus alamat `apps/web`
sebagaimana dibuka pengguna, bukan alamat internal antar-container.
