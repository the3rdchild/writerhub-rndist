# WritingHub — Desain Sistem & Batas Modul

Status: **Referensi tetap** · Disusun 25 Agustus 2026 · Baseline kode `66dfe5e` (branch `main`)

Dokumen ini menjelaskan **bentuk sistem**: bagian apa saja yang ada, siapa boleh memanggil
siapa, dan ke mana sepotong kode baru semestinya diletakkan.

Ia berpasangan dengan `docs/coding_standard.md`. Pembagiannya: dokumen ini menetapkan **batas
antar modul**; `coding_standard.md` menetapkan **isi di dalam satu berkas**. Keduanya
menjawab satu pertanyaan yang sama dari dua arah — *"tanggung jawab ini milik siapa?"*

---

## 1. Gambaran besar

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Browser                                                                 │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  apps/web  (Next.js 16 App Router, React 19)                       │  │
│  │  ┌──────────────────────┐   ┌───────────────────────────────────┐  │  │
│  │  │  Editor Shell        │   │  Panel modul (rail kanan)         │  │  │
│  │  │  Tiptap 3 /          │◀──┤  grammar · parafrase · plagiarisme│  │  │
│  │  │  ProseMirror         │   │  translate · detector · chat      │  │  │
│  │  │  (pemilik naskah)    │──▶│  (pengusul perubahan)             │  │  │
│  │  └──────────────────────┘   └───────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │ same-origin, tanpa secret
                                ▼
                    ┌───────────────────────────┐
                    │  app/api/*  route handler │  ← menandatangani HMAC di sisi server
                    │  (apps/web, sisi server)  │     satu-satunya pemegang PP_API_KEY
                    └───────────┬───────────────┘
                                │ x-pp-api-key
                                ▼
        ┌───────────────────────────────────────────┐
        │  apps/api  (Bun + Hono)                   │
        │  routes → services → repository           │
        └───────┬───────────────────────┬───────────┘
                │                       │
        ┌───────▼────────┐      ┌───────▼────────┐
        │  PostgreSQL 16 │      │  Redis 7       │
        │  (Drizzle ORM) │      │  BullMQ + pubsub│
        └────────────────┘      └───────┬────────┘
                                        │ antrean job
                                        ▼
                            ┌───────────────────────┐
                            │  services/worker      │
                            │  (Python 3.12)        │
                            │  workers → services   │
                            │           → core      │
                            └───────────────────────┘
```

Hasil job mengalir balik ke browser lewat **Redis pub/sub → apps/api → SSE
`/api/stream/:jobId`**. Worker tidak pernah berbicara langsung ke browser.

---

## 2. Peta workspace

Monorepo Bun. `workspaces: ["apps/*", "packages/*"]` — perhatikan `services/*` **tidak**
termasuk workspace Bun, karena isinya Python.

| Workspace | Bahasa | Tanggung jawab tunggal | Tidak boleh berisi |
|---|---|---|---|
| `apps/web` | TS / React 19 | Antarmuka: editor, panel, dan route handler penandatangan | Logika domain yang seharusnya di `apps/api`; rahasia yang sampai ke browser |
| `apps/api` | TS / Bun + Hono | Gerbang HTTP, otorisasi, persistensi, dan pengantrean job | Pemanggilan LLM; pemrosesan dokumen berat |
| `packages/shared` | TS (tipe) | Kontrak antara web, api, dan worker | Logika runtime, I/O, ketergantungan pada React atau Hono |
| `services/worker` | Python 3.12 | Pekerjaan berat: panggilan LLM, ekstraksi & analisis dokumen | Akses langsung ke antarmuka; keputusan otorisasi |

### Kenapa worker terpisah bahasa

Bukan karena selera. Ekosistem pemrosesan dokumen dan NLP — parsing DOCX/PDF, analisis
linguistik, POS tagging — hidup di Python. Memaksanya ke TypeScript berarti menulis ulang
pustaka yang sudah matang. Harga yang dibayar: satu batas proses tambahan, dan kontrak antar
keduanya jadi lewat Redis, bukan lewat pemanggilan fungsi.

Konsekuensi yang harus diingat: **`packages/shared` tidak dibaca Python.** Kontrak ke worker
karena itu tidak dijamin compiler — ia hanya konvensi bentuk JSON. Perubahan bentuk payload
job wajib diubah di kedua sisi dalam satu PR yang sama.

---

## 3. Aturan lapisan

### 3.1 `apps/api` — `routes → services → repository`

| Lapisan | Boleh | Dilarang |
|---|---|---|
| `routes/` | Membaca request, memvalidasi (zod), memanggil satu service, membentuk response | Query database langsung; aturan bisnis |
| `services/` | Aturan bisnis, orkestrasi, pengantrean job | Menyentuh objek `Context` Hono; menyusun status HTTP |
| `repository/` | Query database (Drizzle) | Aturan bisnis; membentuk response |

Arah panggilan **satu arah**: `routes` boleh memanggil `services`, `services` boleh memanggil
`repository`. Tidak pernah sebaliknya. Sebuah service yang mengimpor sesuatu dari `routes/`
adalah tanda batas ini bocor.

Pengujian yang paling cepat: **kalau sebuah service tahu apa itu kode status 404, ia sudah
mengambil pekerjaan milik route.** Service melempar galat domain (`AppError`); route yang
menerjemahkannya ke HTTP.

### 3.2 `services/worker` — `workers → services → core`

| Lapisan | Boleh | Dilarang |
|---|---|---|
| `workers/` | Berlangganan antrean, membongkar payload job, memanggil satu service | Logika analisis |
| `services/` | Analisis: checker, analyzers, extract | Pengetahuan tentang BullMQ atau bentuk antrean |
| `core/` | Sumber daya bersama: konfigurasi, koneksi DB, Redis, logging, pembatalan, provider | Logika spesifik satu fitur |

Berkas di `workers/` sengaja tipis (±400 byte) — itu bentuk yang benar. Kalau sebuah worker
mulai tumbuh, isinya hampir pasti milik `services/`.

### 3.3 `apps/web` — pemisahan yang berlaku

Web tidak punya rantai `routes → services → repository`, tapi punya pemisahan yang sama
kerasnya:

| Direktori | Tanggung jawab | Dilarang |
|---|---|---|
| `app/` | Routing Next.js + route handler API | Logika domain; komponen besar |
| `app/api/` | **Menandatangani dan meneruskan.** Satu-satunya tempat `PP_API_KEY` boleh disentuh | Aturan bisnis |
| `components/` | Rendering. Menerima data lewat props/context | Pengambilan data; transformasi domain |
| `features/` | Logika domain sisi klien: state, hook, perhitungan, kontrak API | JSX yang bisa dipakai ulang |
| `lib/` | Utilitas infrastruktur: klien HTTP, SSE, penandatangan upstream | Apa pun yang spesifik satu fitur |

Batas yang paling sering dilanggar adalah **`components/` vs `features/`**. Aturan praktisnya:
kalau kode itu tetap masuk akal seandainya antarmuka diganti total, ia milik `features/`.

---

## 4. Arsitektur editor

Editor adalah bagian tersulit di sistem ini, dan ia punya bentuknya sendiri.

```
                 ┌───────────────────────────────────┐
                 │  Naskah (ProseMirror doc)         │  ← satu-satunya kebenaran
                 └───────────────┬───────────────────┘
                                 │ hanya lewat transaction
        ┌────────────────────────┼────────────────────────┐
        │                        │                        │
┌───────▼────────┐   ┌───────────▼──────────┐   ┌─────────▼─────────┐
│ Mesin tata     │   │ Lapisan highlight    │   │ Mesin saran/diff  │
│ letak          │   │ terpadu (Decoration) │   │ (terima/tolak)    │
│ paginasi,      │   │ grammar · plagiarism │   │ semua modul lewat │
│ kolom, section │   │ · AI detector        │   │ pintu yang sama   │
└────────────────┘   └──────────────────────┘   └───────────────────┘
```

Tiga aturan yang menjaga bentuk ini tetap hidup:

1. **Naskah hanya berubah lewat transaction ProseMirror.** Inilah yang membuat undo/redo
   lintas modul jalan tanpa kode tambahan. Modul yang memanipulasi DOM langsung akan merusak
   riwayat undo — dan rusaknya tidak kelihatan sampai pengguna menekan Ctrl+Z.

2. **Highlight adalah `Decoration`, bukan mark pada naskah.** Temuan analisis bersifat
   sementara dan bukan bagian dari dokumen; menyimpannya sebagai mark akan mengotori ekspor
   dan version history. Karena semua modul memakai lapisan yang sama, aturan prioritas saat
   highlight bertumpuk diputuskan di satu tempat.

3. **Tidak ada modul yang menulis ke naskah tanpa persetujuan.** Semua usulan melewati mesin
   diff yang sama. Ini bukan sekadar konsistensi UI — ia yang membuat "sunting hasil sebelum
   apply" dan "terima per segmen" gratis untuk setiap modul baru.

**Nomor halaman hanya bisa datang dari hasil paginasi.** Ia tidak tersimpan di naskah. Blok
yang menyeberang batas halaman tercatat sekali saja, di lembar tempat ia bermula — supaya
cakupan "halaman ini" tidak pernah memotong satu blok jadi dua section.

---

## 5. Mekanisme lintas-potong

Enam mekanisme di bawah dibangun **sekali** dan dipakai bersama. Mengimplementasi ulang salah
satunya di dalam satu modul adalah pelanggaran arsitektur, bukan sekadar duplikasi kode.

| Mekanisme | Tinggal di | Aturan |
|---|---|---|
| Lapisan highlight terpadu | `features/editor` (ProseMirror `Decoration`) | Modul mendaftarkan temuan; tidak menggambar sendiri |
| Mesin saran/diff terpadu | `features/analysis` + `features/editor/apply-text.ts` | Semua usulan lewat sini |
| Streaming SSE | `lib/sse.ts` → `app/api/stream/[jobId]` → `apps/api` | Modul tidak membuka koneksi sendiri |
| Siklus hidup job | `packages/shared/src/job.ts` sebagai kontrak | Status job hanya boleh bertambah lewat kontrak ini |
| Pembatalan | `core/cancel.py` + bendera Redis + titik periksa kooperatif | Worker memeriksa pembatalan di titik periksa, bukan dibunuh paksa |
| Penandatanganan upstream | `lib/server/upstream.ts` | Satu-satunya pemegang `PP_API_KEY` |

---

## 6. Model keamanan

Satu batasan yang membentuk seluruh alur data sisi web:

> `PP_API_KEY` tidak boleh sampai ke browser.

Karena itu **`apps/web` tidak pernah memanggil `apps/api` langsung dari browser.** Browser
memanggil route handler same-origin di `/api/*`; route itulah yang menandatangani HMAC-SHA256
atas timestamp dan meneruskan permintaan.

Konsekuensinya yang mudah terlewat: **`API_URL` adalah variabel sisi server, bukan
`NEXT_PUBLIC_*`.** Mengubahnya jadi `NEXT_PUBLIC_` akan "memperbaiki" sebuah error dengan cara
membocorkan seluruh model keamanan ini.

**Mode autentikasi** dikendalikan `AUTH_MODE`, dan nilainya wajib sama di `apps/api` dan
`apps/web`:

| Mode | Perilaku |
|---|---|
| `none` | Pengembangan. Pemeriksaan dilewati, proxy tidak menandatangani, worker memakai provider LLM dari env-nya sendiri, kuota tidak dicatat |
| `pp` | Produksi. HMAC + verifikasi bearer token pengguna ke pp-extended |

Kode jalur produksi **tetap utuh di repo saat mode `none`**. Mengaktifkannya kembali cukup
dengan mengubah env. Jangan menghapus cabang kode `pp` karena "tidak terpakai di lokal".

Token pengguna diambil dari header `Authorization` bila WritingHub disematkan di shell yang
meneruskannya, atau dari cookie `AUTH_COOKIE_NAME` bila berdiri sendiri.

---

## 7. Di mana kode baru diletakkan

Tabel keputusan. Kalau ragu, mulai dari sini.

| Yang mau ditambah | Tempatnya | Bukan di |
|---|---|---|
| Perhitungan tata letak murni | `apps/web/features/editor/<konsep>.ts` | Dalam komponen |
| Perilaku editor baru (node/mark/plugin) | `apps/web/features/editor/` | `components/editor/` |
| Tampilan panel modul | `apps/web/components/panels/` | `features/` |
| State & pemanggilan API modul | `apps/web/features/<modul>/` | Dalam komponen panel |
| Endpoint HTTP baru | `apps/api/src/routes/v1/` + service pendamping | Semuanya di route |
| Query database | `apps/api/src/repository/` | Dalam service |
| Bentuk data yang dilihat ≥2 workspace | `packages/shared/src/<domain>.ts` | Diduplikasi |
| Panggilan LLM / analisis | `services/worker/services/` | `apps/api` |
| Jenis job baru | Kontrak di `packages/shared/src/job.ts`, worker tipis di `workers/`, logika di `services/` | Worker gemuk |
| Sumber daya bersama worker | `services/worker/core/` | Disalin antar service |

---

## 8. Pembagian kerja paralel

Repo ini punya konvensi yang sudah terbukti untuk dua orang (atau dua agen) bekerja
bersamaan tanpa bertabrakan: **pembagian menurut kepemilikan berkas**, bukan menurut fitur.
Rinciannya di `docs/WORKPLAN-P1-P12-DUA-JALUR.md`; ringkasnya:

| Jalur | Wilayah |
|---|---|
| **A — Tata letak** | `apps/web/features/editor/*`, `apps/web/components/editor/*` — paginasi, kolom, geometri lembar, penggaris, kanvas |
| **B — Panel & pipeline** | `apps/web/components/panels/*`, `apps/web/features/{document,analysis,grammar,memory}/*`, `apps/api/src/**`, `services/worker/**` |

Aturannya satu: **sebuah berkas hanya boleh diubah oleh satu jalur.** Kalau dua jalur butuh
berkas yang sama, ia masuk daftar berkas bersama dan ada aturan urutannya.

Rekam jejaknya: penggabungan jalur A + B pada 13 Agustus 2026 menghasilkan **nol konflik** dari
13 berkas jalur A dan 50 berkas jalur B — hanya satu berkas yang bersinggungan, persis yang
sudah diperkirakan sebelumnya.

Perhatikan hubungannya dengan tanggung jawab tunggal: **pembagian ini hanya bisa jalan kalau
berkasnya memang punya tanggung jawab tunggal.** Berkas serba-guna tidak bisa dimiliki satu
jalur, karena ia menyentuh urusan kedua jalur sekaligus. Setiap pelanggaran SRP karena itu
adalah calon konflik merge.

---

## 9. Perkakas & gerbang mutu

| Berlaku pada | Perkakas | Status |
|---|---|---|
| TypeScript | `tsc --noEmit` (strict, `noImplicitOverride`, `noFallthroughCasesInSwitch`) | Wajib lulus di CI |
| TypeScript | Build `apps/web` | Wajib lulus di CI |
| TypeScript | **Linter** | ⚠️ **Tidak ada.** Tidak ada ESLint, Prettier, maupun Biome di repo |
| TypeScript | `bun test` | Hanya ada di `apps/web`; `apps/api` & `packages/shared` tidak punya skrip `test` |
| Python | `python -m compileall` | Wajib lulus |
| Python | `ruff check --select F821` (nama tak terdefinisi) | Wajib lulus — **blocking tersendiri** |
| Python | `ruff check` & `ruff format --check` selengkapnya | Masih advisory (`continue-on-error`) |
| Python | `pytest` | Wajib lulus |

Kenapa F821 dipisah jadi blocking sendiri: nama yang tidak pernah didefinisikan **lolos dari
`compileall`** — Python baru mencarinya saat baris itu dijalankan. Sebuah
`except CancelledError:` tanpa importnya pernah lolos ke produksi begitu, mematikan seluruh
Proofreader sekaligus menyembunyikan galat aslinya.

---

## 10. Utang arsitektur yang diketahui

Dicatat supaya tidak "ditemukan ulang" tiap beberapa minggu.

1. **Tidak ada linter di sisi TypeScript.** `tsc` menangkap kesalahan tipe, bukan kesalahan
   struktur. Impor tak terpakai, dependensi hook yang keliru, dan berkas serba-guna semuanya
   lolos. Ini juga sebabnya standar di `coding_standard.md` harus ditegakkan lewat tinjauan
   manusia, bukan otomatis.

2. **Cakupan uji timpang.** Seluruh uji TypeScript ada di `apps/web/features/**`.
   `apps/api` dan `packages/shared` tidak punya satu pun uji, dan `apps/api` bahkan tidak
   punya skrip `test` — sehingga `bun run test` di root **terlihat hijau** padahal seluruh
   lapisan API tidak pernah diuji.

3. **`packages/shared` mengekspor lewat barrel sekaligus subpath, dan keduanya tidak
   sinkron.** `index.ts` mengekspor ulang ketujuh modul, tapi peta `exports` hanya menamai
   lima subpath — `chat`, `models`, dan `tools` tidak bisa diimpor per subpath. Akibatnya
   konsumen menarik seluruh paket untuk satu tipe.

4. **Kontrak ke worker tidak dijamin compiler.** `packages/shared` tidak dibaca Python.
   Perubahan bentuk payload job harus diubah manual di kedua sisi.

5. **Impor DOCX belum membaca `sectPr`.** Dokumen Word dengan orientasi campur rata jadi satu
   section saat diimpor. Ekspor sudah benar; impornya yang tertinggal.

6. **`POST /jobs/:jobId/cancel` tanpa cek kepemilikan.** Sudah di balik `authMiddleware`, tapi
   siapa pun yang login bisa membatalkan job orang lain kalau tahu jobId-nya. Diterima apa
   adanya karena jobId berupa UUID acak — kalau model ancaman berubah, di sinilah ceknya
   ditambahkan.

7. **`JOB_DEADLINE_SECONDS=300` dan `WORKER_CONCURRENCY=2` belum diukur.** Masih tebakan pada
   naskah 50 ribu karakter tier AI.

8. **Kolaborasi realtime setengah terpasang.** Yjs aktif per tab lokal; Hocuspocus, service
   sync, dan auth-nya belum ada. Bentuk sekarang bisa menyesatkan pembaca kode.
