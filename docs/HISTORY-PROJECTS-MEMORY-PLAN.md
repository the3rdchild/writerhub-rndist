# Rencana Implementasi - History Sesi (F), Projects (G), AI Memory (H)

Merinci §3.F, §3.G, dan §3.H `docs/FEATURE-GAP-PRD.md` menjadi langkah implementasi.
Ketiganya digarap bersama karena berbagi fondasi yang sama (A+B sudah selesai) dan saling
bersinggungan di UI: menu WritingHub dan modal Pengaturan.

## Keputusan yang sudah dikonfirmasi

1. **F - entri history bisa dilihat *dan* diterapkan ulang** ke dokumen aktif.
2. **G - Projects muncul sebagai entri di menu WritingHub**, isinya pengelompokan di dalam
   File Library yang sudah ada (bukan halaman daftar proyek terpisah).
3. **H - disimpan di tabel server `user_memories`**, bukan localStorage.
4. **H - disuntikkan ke AI Chat + AI Rewriter + Humanizer** (modul yang menulis ulang naskah).
   Proofreader dan AI Detector tidak: keduanya menilai, bukan menulis.
5. UI Pengaturan AI Memory masuk sebagai tab baru di modal **Pengaturan** global.

## Prasyarat - sudah terpenuhi

| Yang dibutuhkan | Kondisi |
|---|---|
| Dokumen server-side + kepemilikan | ✅ `documents.owner_id` non-null, CRUD lengkap |
| Identitas user di request | ✅ `authMiddleware` mengisi `c.get('userId')` di kedua mode (`auth.ts:37` lokal, `auth.ts:69` produksi) |
| Titik tunggal pembuatan job | ✅ `JobSubmissionService.createPoolRequest()` - dilewati grammar **dan** analysis |
| File Library | ✅ `/library` + `useDocuments` |
| Modal Pengaturan bertab | ✅ `settings-dialog.tsx`, `TABS` |

---

# F. History sesi lintas modul (Beta, Core Platform)

## F.1 Masalah penamaan yang harus dibereskan lebih dulu

Kata "Riwayat" sudah dipakai dua kali di produk:

| Yang sudah ada | Artinya |
|---|---|
| **Riwayat** di menu WritingHub | daftar tab/sesi terakhir yang dibuka (lokal, dari Y.Doc) |
| **Riwayat versi** | snapshot naskah per waktu (fitur I) |

Menambahkan "History" ketiga dengan nama serupa akan membingungkan. **Keputusan: fitur ini
dinamai "Aktivitas AI"** - ia memang bukan riwayat naskah, melainkan catatan pemakaian modul AI.
Entri baru di menu WritingHub, di bawah "Library", membuka halaman `/activity` (pola halaman
berdiri sendiri seperti `/library`).

## F.2 Backend

### Migrasi 0006 - kolom baru di `pool_request`

```sql
ALTER TABLE pool_request ADD COLUMN user_id     varchar(255);
ALTER TABLE pool_request ADD COLUMN document_id uuid REFERENCES documents(id) ON DELETE SET NULL;
ALTER TABLE pool_request ADD COLUMN feature     varchar(50);
CREATE INDEX pool_request_user_created_idx ON pool_request (user_id, created_at DESC);
```

- `feature` sengaja didenormalisasi (`'grammar'`, `'ai_rewriter'`, …) supaya daftar aktivitas bisa
  difilter tanpa menjoin `grammar_result`/`analysis_result` dua-duanya.
- **Baris lama dibiarkan `user_id IS NULL` dan tidak pernah muncul di daftar.** Jangan di-backfill
  ke user mana pun - kita tidak tahu siapa pemiliknya, dan menebak berarti membocorkan naskah
  orang lain. Konsekuensi yang diterima: aktivitas sebelum rilis ini tidak terlihat.
- `ON DELETE SET NULL`, bukan cascade: menghapus dokumen tidak boleh menghapus jejak kuota/token
  yang sudah tercatat. Entri kehilangan tautannya, itu saja.

### Perubahan `createPoolRequest`

Satu titik, dua pemanggil ikut kebagian:

```ts
protected async createPoolRequest(
  jobId: string,
  provider: ResolvedProvider | null,
  params: Record<string, unknown>,
  meta?: { documentId?: string | null; feature?: string },
)
```

`user_id` diambil dari `this.context.get('userId')` - **bukan** dari `provider.userId`. Alasannya:
`provider` bernilai null pada `AUTH_MODE=none`, sedangkan `authMiddleware` selalu mengisi userId di
kedua mode. Memakai provider berarti aktivitas tidak tercatat sama sekali di dev lokal.

### `document_id` dikirim dari frontend

`runAnalysis()` (`features/analysis/api.ts:13`) dan padanannya di grammar perlu meneruskan
`documentId` opsional, diambil dari `useSync().linkage[activeId]?.serverId`. Tab lokal-saja
mengirim `undefined` - aktivitasnya tetap tercatat, hanya tanpa tautan dokumen.

### Endpoint

| Method | Path | Guna |
|---|---|---|
| `GET` | `/api/v1/history` | Daftar aktivitas user; query `feature`, `documentId`, `limit`, `cursor` (keyset `created_at`) |
| `GET` | `/api/v1/history/:jobId` | Satu entri lengkap dengan hasilnya |
| `DELETE` | `/api/v1/history/:jobId` | Hapus satu entri |

Daftar mengembalikan **ringkasan saja** - `{ jobId, feature, status, documentId, documentTitle,
createdAt, summary }` - bukan hasil penuh. Alasan yang sama dengan daftar versi di fitur I: hasil
grammar satu dokumen panjang bisa ratusan kilobita, dan daftar 50 entri akan meledak.

`summary` dirakit per fitur di service: skor untuk grammar, jumlah perubahan untuk
rewriter/humanizer, label untuk detector/plagiarism.

Semua endpoint memfilter `user_id = c.get('userId')`. Lapisan repository baru
`repository/history.ts`, sesuai mitigasi §5.4 dokumen gap (sumber data bisa ditukar ke Core
Platform PPE tanpa menyentuh route).

## F.3 Frontend

- `features/history/` - `types.ts`, `api.ts`, `use-history.ts` (TanStack Query, pola
  `use-documents.ts`).
- Proxy Next: `app/api/history/route.ts` + `app/api/history/[jobId]/route.ts`.
- Halaman `/activity`: daftar berkelompok per hari (pakai ulang `groupOf()` dari
  `version-history-view.tsx` - **angkat ke `lib/` supaya tidak diduplikasi**), filter fitur di
  kepala halaman, entri menampilkan ikon modul, waktu, judul dokumen, dan ringkasan.
- Entri diklik → panel detail di kanan: hasil lengkap dibaca lewat `GET /history/:jobId`.

## F.4 "Terapkan ulang" - bagian yang paling mudah salah

Ini keputusan yang Anda ambil, dan ia membawa satu masalah nyata: **hasil lama memuat offset
terhadap naskah lama.** Dokumen hampir pasti sudah berubah sejak job itu jalan.

Untungnya polanya sudah ada di repo dan tidak perlu diciptakan:
`resolveSpan(text, original, hint)` di `features/document/suggestions.ts:17` mencari ulang teks
`original` di naskah sekarang, memakai offset lama hanya sebagai petunjuk, dan mengembalikan
`null` bila teksnya sudah hilang. `SuggestionHighlight` memakai jalur ini setiap kali dokumen
berubah. Terapkan-ulang cukup memakai fungsi yang sama.

**Konsekuensi yang harus tampak di UI:** perubahan yang teks aslinya sudah tidak ada tidak bisa
diterapkan. Tampilkan sebagai entri nonaktif berlabel "teks sudah berubah", jangan diam-diam
dilewati.

**Tidak semua modul dapat tombol ini.** Hanya yang hasilnya berupa usulan penggantian:

| Modul | Terapkan ulang | Alasan |
|---|---|---|
| Proofreader (grammar) | ✅ | `suggestions[]` punya `original` + `replacement` |
| AI Rewriter, Humanizer | ✅ | `changes[]` punya `original` + `replacement` |
| AI Detector, Plagiarism | ❌ hanya "Buka di panel" | hasilnya penilaian/sorotan, tidak ada yang bisa "diterapkan" |

Alur teknisnya: entri → muat hasil → dorong ke `panel-context` sebagai `lastRun` fitur itu →
buka panelnya. Dari situ pengguna memakai alur apply yang sudah ada (`ChangeListPanel`,
`apply-text.ts`), bukan jalur baru. Ini juga yang membuat fitur E ("send to paraphraser") jadi
lebih murah nanti - mekanisme navigasi antar panel dengan payload akhirnya ada.

**Prasyarat:** dokumen tujuan harus tab yang sedang aktif. Kalau `documentId` entri berbeda dari
dokumen aktif, tawarkan membuka dokumennya dulu (`openFromLibrary`), jangan menerapkan lintas
dokumen.

## F.5 Retensi & privasi

`grammar_result.original_text` menyimpan **naskah utuh** yang dikirim pengguna. Begitu
`pool_request.user_id` terisi, tabel-tabel ini berubah sifat: dari log job anonim menjadi arsip
tulisan per orang. Itu perubahan yang layak disadari, bukan efek samping diam-diam.

- Retensi default **90 hari**, dijalankan saat menulis entri baru (pola `pruneIntervalVersions`).
- `DELETE /history/:jobId` untuk hapus manual, plus "Hapus semua aktivitas" di halaman `/activity`.
- Kalau Core Platform PPE punya kebijakan retensi sendiri, angka 90 hari ini yang harus mengalah.

---

# G. Projects (V1)

## G.1 Backend

### Migrasi 0007

```sql
CREATE TABLE projects (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   varchar(255) NOT NULL,
  name       varchar(255) NOT NULL,
  color      varchar(32),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX projects_owner_idx ON projects (owner_id, updated_at DESC);

ALTER TABLE documents ADD COLUMN project_id uuid REFERENCES projects(id) ON DELETE SET NULL;
```

`ON DELETE SET NULL`: menghapus proyek **tidak** menghapus dokumen di dalamnya - dokumennya
kembali ke "Tanpa proyek". Menghapus folder tidak boleh menghapus isinya.

### Endpoint

`GET/POST /api/v1/projects`, `PUT/DELETE /api/v1/projects/:id` - pola `services/documents/`
persis, termasuk `repository/project.ts` dan skoping `owner_id`.

Perubahan pada dokumen yang sudah ada:
- `updateDocumentBodySchema` menerima `projectId?: string | null` (null = keluarkan dari proyek).
- `GET /documents` menerima query `projectId` (`'none'` untuk yang belum berproyek) dan
  mengembalikan `projectId` di `DocumentSummary`.

## G.2 Frontend

- Menu WritingHub: entri **"Projects"** dengan ikon `FolderOpen`, di bawah "Library".
  Catatan: item **"Disematkan"** di `nav-menu.tsx:89` saat ini mati (tanpa `onSelect`) - biarkan
  apa adanya, jangan sekalian dipakai untuk Projects; dua fitur berbeda tidak boleh berbagi
  satu entri hanya karena salah satunya kebetulan kosong.
- `/library` mendapat **sidebar kiri**: "Semua dokumen", "Tanpa proyek", lalu daftar proyek.
  Entri nav "Projects" mengarah ke `/library?project=all` dan menyorot sidebar itu.
  Filter tersimpan di query string supaya bisa di-bookmark dan tombol Kembali bekerja.
- CRUD proyek: tombol "+ Proyek baru" di kaki sidebar; rename/hapus lewat menu ⋮ per proyek
  (pakai `ConfirmDialog` yang sudah ada, dengan penjelasan bahwa dokumennya tidak ikut terhapus).
- `DocumentCard` mendapat item menu **"Pindahkan ke proyek"** → submenu daftar proyek + "Tanpa
  proyek".

**Batasan yang harus tampak:** tab lokal-saja tidak bisa masuk proyek - proyek hidup di server,
dokumen lokal belum punya baris di sana. Di UI, tawarkan "Simpan ke cloud" lebih dulu, jangan
menampilkan opsi proyek yang tidak akan bekerja.

---

# H. AI Memory (V1)

## H.1 Lingkup

Sesuai §3.H dokumen gap: **preferensi gaya yang ditulis pengguna secara eksplisit**, bukan
inferensi diam-diam dari tulisannya. Batasan ini bukan soal teknis melainkan kepercayaan - sistem
yang diam-diam menyimpulkan gaya seseorang lalu memakainya sulit dijelaskan dan sulit dikoreksi.

Isi yang didukung iterasi pertama:

| Field | Contoh |
|---|---|
| `tone` | formal / santai / akademik / bebas (teks) |
| `language` | bahasa default keluaran AI |
| `glossary` | daftar istilah yang tidak boleh diterjemahkan/diubah |
| `notes` | catatan gaya bebas, maks ~500 karakter |

## H.2 Backend

### Migrasi 0008

```sql
CREATE TABLE user_memories (
  owner_id    varchar(255) PRIMARY KEY,
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now()
);
```

**Satu baris per user dengan jsonb**, bukan tabel key/value seperti sketsa awal §3.H. Lingkupnya
sudah dibatasi ke empat field di atas, dan key/value hanya menambah query serta menggeser validasi
ke runtime tanpa keuntungan nyata. Kalau kelak memory berkembang jadi banyak entri lepas, tabel
key/value bisa dibuat berdampingan.

Endpoint: `GET /api/v1/memory`, `PUT /api/v1/memory`. Keduanya terskop `owner_id`; `GET`
mengembalikan objek kosong (bukan 404) bila belum pernah diisi.

### Penyuntikan - server-side, bukan dari klien

Memory dibaca di server dari `userId`, **tidak** dikirim klien. Klien yang mengirim berarti
preferensi bisa dipalsukan per request dan setiap pemanggil harus ingat menyertakannya.

- **AI Chat** - `buildMessages()` (`chat/service.ts:166`) merakit `system` dari `SYSTEM_PROMPT`
  plus panduan tool. Tambahkan blok memory sesudahnya. Perlu `buildMessages` menerima memory
  sebagai argumen; ia fungsi murni sekarang, jadi pengambilan dari DB terjadi di pemanggilnya.
- **AI Rewriter & Humanizer** - memory harus sampai ke worker. `AnalysisService.submit()` membaca
  memory lalu menaruhnya di payload job (bukan di `params` pool_request, yang untuk audit).
  - `packages/shared`: payload analisis mendapat `style_memory?: { tone?, language?, glossary?, notes? }`.
  - Worker: `run_ai_rewriter()` dan `run_humanizer()` (`services/analyzers/`) menerima argumen baru
    dan menempelkannya ke prompt. Keduanya bersignature `(text, provider, language)` sekarang, jadi
    perubahannya kecil dan terlokalisir.
  - Analyzer lain tidak disentuh.

## H.3 Frontend - dan satu jebakan di modal Pengaturan

Tab baru **"AI Memory"** di `TABS` (`settings-dialog.tsx:8`), ikon `Brain`, sesudah "Editor".

**Perhatian:** seluruh isi modal Pengaturan saat ini hidup di `usePersistentState` →
**localStorage** (`SETTINGS_STORAGE_KEY`), dan `update()` bersifat sinkron tanpa status apa pun.
Tab ini adalah yang pertama berbicara ke server. Jadi ia **tidak boleh** menumpang `useSettings()`:

- pakai `features/memory/use-memory.ts` (TanStack Query) dengan state memuat/menyimpan/gagal
  sendiri,
- tombol "Simpan" eksplisit - bukan autosave per ketukan seperti setting lain,
- tampilkan galat bila penyimpanan gagal; preferensi yang dikira tersimpan padahal tidak jauh
  lebih buruk daripada tombol simpan yang membosankan.

Beri satu kalimat di kepala tab bahwa preferensi ini dipakai AI Chat, AI Rewriter, dan Humanizer -
pengguna berhak tahu ke mana tulisannya pergi.

---

# Urutan & verifikasi

## Urutan yang disarankan

1. **G - Projects.** Paling kecil, paling terisolasi, dan pola CRUD-nya sudah ada. Cocok jadi
   pemanasan sekaligus memastikan sidebar Library tidak bentrok dengan pekerjaan lain.
2. **H - AI Memory.** Backend sederhana; pekerjaan sebenarnya di worker + shared.
3. **F - Aktivitas AI.** Paling besar dan satu-satunya yang menyentuh jalur job. Ditaruh terakhir
   supaya "terapkan ulang" bisa memakai navigasi antar panel dalam keadaan tenang.

F dan G tidak saling bergantung; H berdiri sendiri sepenuhnya. Bisa diparalelkan kalau perlu,
dengan catatan F dan G sama-sama menyentuh `/library`.

## Verifikasi

1. `bun run typecheck` (3 paket) + `bun test`.
2. `bun run db:generate` → migrasi 0006–0008 → `db:migrate`.
3. Smoke E2E lewat proxy, per fitur:
   - **F:** jalankan grammar + rewriter → keduanya muncul di `GET /history` dengan `user_id` dan
     `document_id` terisi; job dari dokumen lain tidak bocor; hapus dokumen → entri tetap ada
     dengan `document_id` null; `DELETE /history/:jobId`.
   - **G:** buat proyek → pindahkan dokumen → `GET /documents?projectId=` terfilter → hapus proyek
     → dokumen selamat dengan `project_id` null.
   - **H:** `PUT /memory` → `GET /memory` → jalankan rewriter dan pastikan `style_memory` ikut di
     payload job yang diterima worker.
4. Manual di browser: sidebar proyek, tab AI Memory, halaman Aktivitas AI termasuk entri yang
   teks aslinya sudah berubah (harus nonaktif, bukan hilang).

## Estimasi risiko

| Bagian | Risiko |
|---|---|
| G - Projects (tabel, CRUD, sidebar) | **Rendah** - pola persis fitur B |
| H - tabel + endpoint + tab Pengaturan | **Rendah** - asal tab-nya tidak menumpang `useSettings()` (§H.3) |
| H - penyuntikan ke worker | **Sedang** - menyentuh `packages/shared` dan dua analyzer Python; ujungnya di luar TypeScript sehingga tidak terjaring typecheck |
| F - kolom baru + endpoint daftar | **Rendah-sedang** - satu titik ubah, tapi migrasinya menyentuh tabel yang dipakai jalur job produksi |
| F - terapkan ulang | **Tertinggi** - offset basi, batas per modul, dan dokumen tujuan yang mungkin bukan tab aktif. Mitigasi: pakai `resolveSpan` yang sudah terbukti, dan alirkan lewat panel yang ada, bukan jalur apply baru |

## Yang tidak berubah

- Fitur C (File Translator) tetap ditunda; F hanya mencatat modul yang ada sekarang. PRD menyebut
  "History menggabungkan sesi Grammar dan Translate" - bagian Translate menyusul sendiri saat C
  dikerjakan, tanpa perubahan skema.
- Fitur I (riwayat versi) tidak disentuh. Keduanya sengaja terpisah: I tentang naskah, F tentang
  pemakaian modul.
- `docs/FEATURE-GAP-PRD.md` §5.4 tetap berlaku - F dan G dibangun di writer-hub di balik lapisan
  repository, siap ditukar ke Core Platform PPE bila kelak tersedia.
