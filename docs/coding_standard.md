# Standar Penulisan Kode — WritingHub

Status: **Aturan tetap + hasil audit** · Disusun 25 Agustus 2026 · Baseline kode `66dfe5e`

Dokumen ini menetapkan **isi di dalam satu berkas**: apa yang boleh tinggal bersama, dan apa
yang harus pindah. Batas *antar* modul ada di `docs/design.md`.

Bagian §1–§5 adalah aturan. Bagian §6 adalah hasil audit terhadap seluruh monorepo per baseline
di atas — 414 berkas sumber, 55.700 baris.

---

## 1. Aturan inti

> **Setiap berkas punya satu alasan untuk ada.**
> Saat menambah fungsi atau method, ia harus melayani hal yang berkas itu memang tentangnya.

Ujinya satu kalimat: **coba jelaskan berkas itu tanpa mengucap "dan".** Kalau tidak bisa, ia
mengerjakan dua urusan.

### 1.1 Satuan tanggung jawabnya adalah berkas, bukan hanya class

Repo ini jauh lebih fungsional daripada berorientasi objek — dari 414 berkas sumber, hanya
sembilan yang berisi `class` di sisi TypeScript, dan sebagian besar `class` Python berupa tipe
galat atau `NamedTuple`. Karena itu:

- Modul yang mengekspor sekumpulan fungsi tak berhubungan **sama saja pelanggarannya** dengan
  class yang punya method tak berhubungan.
- Provider React, `__init__.py`, dan base class adalah *wadah* — dan wadah yang tersedia di
  mana-mana adalah tempat paling gampang jadi keranjang sampah. Lihat §6.2.

### 1.2 Ukuran tidak pernah jadi temuan

Ini bagian yang paling sering disalahpahami, jadi ditulis eksplisit:

**Berkas 1.400 baris yang seluruhnya satu urusan itu benar. Jangan "dirapikan".**

Yang dihitung **jumlah urusan**, bukan jumlah baris. Audit di §6 mengonfirmasi ini dari dua
arah sekaligus:

| Berkas | Baris | Vonis |
|---|---|---|
| `features/editor/columns.ts` | 1.449 | ✅ Mesin kolom yang kohesif — **jangan dipecah** |
| `features/editor/pagination.ts` | 1.090 | ✅ Mesin paginasi yang kohesif — **jangan dipecah** |
| `analyzers/plagiarism.py` | 313 | ✅ 200 barisnya korpus `COMMON_PHRASES`, yaitu kamus algoritmanya |
| `checker/advanced.py` | 430 | ✅ Satu keluarga aturan |
| `services/versions/service.ts` | 170 | ❌ Melanggar |
| `routes/v1/jobs.route.ts` | 67 | ❌ Melanggar |
| `features/editor/editor-polish.ts` | 82 | ❌ Melanggar — namanya sendiri mengaku "dua penghalus kecil" |

Berkas 67 baris bisa melanggar; berkas 1.449 baris bisa benar sempurna.

### 1.3 Menemukan pelanggaran bukan izin memperbaikinya

Laporkan, biar pengguna yang memutuskan — kecuali ia memang meminta perbaikannya. Pemecahan
berkas menyentuh banyak tempat dan bisa menabrak pekerjaan orang lain (§5).

---

## 2. Cara memutuskan di mana kode diletakkan

Urutan pertanyaan saat mau menambah sesuatu:

1. **Apa satu urusan kode ini?** Jawab dengan satu frasa benda. Kalau butuh "dan", kamu punya
   dua potong kode, bukan satu.
2. **Berkas mana yang namanya adalah frasa itu?** Kalau ada, taruh di sana. Kalau tidak ada,
   buat berkas baru dengan nama itu.
3. **Berkas yang sekarang terbuka bukan jawabannya**, kecuali kebetulan ia memang berkas di
   langkah 2. "Sudah ada di sini" bukan alasan.

### 2.1 Pisahkan lapisan

Tiga hal berikut **selalu** berkas berbeda:

| Lapisan | Isinya | Cirinya |
|---|---|---|
| **Perhitungan murni** | Masuk data, keluar data | Bisa diuji tanpa DOM, tanpa jaringan, tanpa React |
| **Efek samping** | Jaringan, basis data, DOM, berkas, Redis | Tidak mengambil keputusan domain |
| **State antarmuka** | Hook React, provider, komponen | Tidak menghitung, tidak mengambil data |

Fungsi yang **menghitung sekaligus menyimpan** adalah dua hal.

Pola yang sudah benar dan harus ditiru — mesin tata letak editor melakukannya persis begini,
dan itu sebabnya keduanya punya uji:

> **Ukur di plugin → hitung di fungsi murni yang diekspor → gambar dengan decoration.**

`flowColumns` menyebut dirinya *"satu-satunya bagian yang aritmetis murni"*; `computeSpacers`
menyebut dirinya *"diekspor demi pengujian: masuk daftar blok, keluar daftar spacer, tanpa DOM
sama sekali."* Keduanya punya `.test.ts`. Itu bukan kebetulan — itu hadiah dari pemisahannya.

Disiplin yang sama **berhenti begitu kode masuk berkas `.tsx`**, dan di situlah pelanggarannya
menumpuk (§6.1).

### 2.2 Aturan penamaan

**Jangan pernah membuat `utils.ts`, `helpers.py`, `misc.*`, `common.*`, atau `base.*`.**

Nama seperti itu tidak menjelaskan tanggung jawab apa pun, jadi **tidak ada isi yang bisa
dinilai salah tempat**. Ia bukan sekadar nama jelek — ia mematikan satu-satunya mekanisme yang
membuat aturan §1 bisa ditegakkan.

Beri nama berkas menurut urusannya: `page-geometry.ts`, `hmac-signing.ts`, `tokenize.py`,
`job-cancel.ts`.

Audit mengonfirmasi bahwa **nama memprediksi pelanggaran dengan akurat**:

- Setiap berkas di `features/editor` yang dinamai menurut *sebuah benda* — `section-break.ts`,
  `page-geometry.ts`, `font-catalog.ts`, `markdown.ts`, `search-replace.ts` — bersih.
- Yang namanya kabur adalah pelanggarnya: `editor-polish.ts`, `lib/utils.ts`, `table-ops.ts`,
  `base.service.ts`, `core/base_service.py`.

**Nama yang berbohong sama bahayanya dengan nama yang kabur.** `core/base_service.py` bernama
seperti base class, padahal tidak ada yang mewarisinya — ia dipakai di tiga tempat sebagai
`_svc`, dan seluruh isinya adalah pencatatan log berjangka waktu. Ia sebuah `JobLogger`. Selama
namanya "BaseService", ia adalah undangan terbuka untuk menempelkan helper DB dan Redis ke
dalamnya.

### 2.3 Dua tanda pelanggaran yang bisa langsung dilihat

Dipetik dari audit; keduanya murah diperiksa dan hampir selalu benar:

1. **Kalau komentar header berkasmu sendiri butuh kata "dan"/"plus", pecah berkasnya.**
   `editor-polish.ts` — *"Dua penghalus kecil"*. `code-block-node-view.tsx` — *"pemilih bahasa
   + tombol salin, **plus** toggle sumber/pratinjau untuk diagram Mermaid"*. `nav-menu.tsx` —
   *"Dua pertanyaan berbeda dijawab di satu tempat."* Ketiganya menuliskan temuannya sendiri.

2. **Kalau sebuah simbol punya berkas ujinya sendiri, ia seharusnya punya berkas modulnya
   sendiri.** `chat-compaction.test.ts` menguji tepat dua fungsi dari dalam provider React
   1.123 baris; `proposals.test.ts` menguji tepat lima fungsi dari provider yang sama;
   `math.test.ts` menguji hanya empat parser dari `math.ts`. Uji sudah memperlakukan mereka
   sebagai unit tersendiri — kodenya saja yang belum menyusul.

Satu tanda tambahan yang lebih keras: **impor bernama-privat lintas modul.**
`analyzers/ai_detector.py:15` menulis
`from services.analyzers.humanizer import _INSTRUCTION as _HUMANIZE_INSTRUCTION`. Garis bawah di
depan artinya "ini milik dalam berkas ini". Mengimpornya dari berkas lain adalah pengakuan
tertulis bahwa nilainya salah tempat.

---

## 3. Aturan per-wilayah

### 3.1 TypeScript — `apps/api`

`routes → services → repository`, satu arah. Rinciannya di `docs/design.md` §3.1.

- Route: baca request, validasi (zod), panggil **satu** service, bentuk response.
- Service: aturan bisnis. **Melempar galat domain (`AppError`), bukan menyusun status HTTP.**
  Kalau sebuah service tahu apa itu 404, ia sudah mengambil pekerjaan route.
- Repository: query Drizzle. Satu-satunya tempat SQL ditulis.

**Setiap tabel harus punya repository-nya.** Tabel yang tidak punya akan membuat query-nya
tumbuh di dalam service (§6.3).

### 3.2 TypeScript — `apps/web`

- `components/` merender; `features/` berpikir. Uji praktisnya: **kalau kode itu tetap masuk
  akal seandainya antarmuka diganti total, ia milik `features/`.**
- **Nama sebuah provider harus deskripsi lengkap dari apa yang ia miliki.** Kalau butuh "dan"
  untuk menjelaskannya, tambah provider — jangan tambah slice.
- Mutasi lewat `features/*/api.ts` + hook, bukan rantai `.then/.catch/.finally` di dalam
  komponen.

### 3.3 Python — `services/worker`

`workers → services → core`. Berkas di `workers/` sengaja tipis (±17 baris) — itu bentuk yang
benar.

- `core/` memiliki sumber daya bersama: konfigurasi, koneksi, logging, pembatalan, provider.
  **Service tidak boleh membuka koneksinya sendiri.**
- Analyzer memiliki *analisis*, bukan *transport*.
- Contoh terbaik di repo ini adalah paket `services/extract/`: `sources.py` (I/O),
  `detect.py` (klasifikasi), `parsers/` (per-format), `normalize.py` (murni), `errors.py`
  (galat bertipe), `pipeline.py` (komposisi saja, 62 baris). **Setiap berkas bisa dijelaskan
  tanpa "dan".** Jadikan ini cetakan untuk paket lain.

### 3.4 `packages/shared`

**Hanya kontrak: tipe, konstanta, bentuk data.** Tidak ada logika runtime, tidak ada I/O, tidak
ada ketergantungan pada React maupun Hono.

Aturan tambahan yang lahir dari audit: **konstanta yang dipakai lintas proses wajib tinggal di
sini.** Nama channel, kunci Redis, dan tata letak kunci antrean adalah kontrak — dan kontrak
yang ditulis ulang di tiap pemakainya akan menyimpang diam-diam (§6.4).

---

## 4. Pengujian

- Berkas uji menguji berkas di sebelahnya, bukan beberapa berkas tak berhubungan.
- **Logika murni yang baru diekstrak wajib datang bersama ujinya.** Itu inti alasan
  mengekstraknya.
- Uji **bentuk** keluaran, bukan keberadaannya. Bug orientasi ekspor DOCX hanya ketahuan karena
  ujinya membongkar `.docx` dan membaca `word/document.xml`.

**Ketimpangan cakupan yang harus diketahui sebelum percaya pada hijau:** seluruh 30 uji
TypeScript ada di `apps/web/features/**`. `apps/api` dan `packages/shared` **tidak punya satu
pun uji**, dan `apps/api` bahkan tidak punya skrip `test` — sehingga `bun run test` di root
terlihat hijau padahal seluruh lapisan API tidak pernah dijalankan.

---

## 5. Protokol pemecahan berkas

Kalau pemecahan memang diminta:

1. **Pindahkan kode tanpa mengubah perilaku.** Salin apa adanya, jangan sekalian dirapikan.
2. **Jadikan commit tersendiri**, terpisah dari perubahan perilaku apa pun, supaya peninjau
   bisa melihat bahwa itu murni pemindahan.
3. **Ekspor ulang dari lokasi lama** kalau ada banyak pengimpor, lalu pindahkan pengimpornya
   di commit berikutnya.
4. **Periksa kepemilikan jalur dulu** (`docs/WORKPLAN-P1-P12-DUA-JALUR.md`). Berkas milik jalur
   lain tidak boleh disentuh — minta pemiliknya.
5. **Uji ikut pindah** bersama kode yang diujinya.

Perhatikan hubungan dua arah antara SRP dan kerja paralel: **pembagian kerja menurut
kepemilikan berkas hanya bisa jalan kalau berkasnya punya tanggung jawab tunggal.** Berkas
serba-guna tidak bisa dimiliki satu jalur, karena ia menyentuh urusan dua jalur sekaligus.
Setiap pelanggaran di §6 karena itu juga calon konflik merge.

---

## 6. Hasil audit

Cakupan: seluruh monorepo — `apps/web`, `apps/api`, `packages/shared`, `services/worker`.

Kabar baiknya lebih dulu: **tidak ada satu pun class yang gemuk dan tak berbentuk.** Dari
sembilan class TypeScript, tujuh bersih (`LoggerClient`, `RedisClient`, empat subclass galat,
`AppError`). Masalahnya bukan class — masalahnya **berkas**, persis seperti yang diduga di §1.1.

Enam pola berulang di bawah lebih penting daripada berkas mana pun secara individual. Kalau
hanya sempat memperbaiki satu hal, perbaiki polanya.

### 6.1 Pola 1 — Logika murni terperangkap di dalam berkas React/DOM

Repo ini **tahu cara** memisahkan perhitungan murni; ia hanya berhenti melakukannya begitu kode
masuk berkas `.tsx`.

| Lokasi | Yang terperangkap |
|---|---|
| `components/editor/toc-block-view.tsx:229` | Penyelesai celah paginasi TOC — jenis geometri yang sama dengan `flowColumns`, tapi ditulis inline, terikat React, tak teruji. Komentarnya sendiri menyebut bahaya *"loop render sampai Maximum update depth exceeded"* |
| `components/editor/document-ruler.tsx:427,475` | Dua mesin redistribusi lebar tabel & kolom. Aritmetika murni yang dibungkus satu panggilan `editor.commands`; blok redistribusi berpasangannya ditulis **dua kali** |
| `features/chat/chat-context.tsx:167,1082` | `buildOutboundMessages` + ekstraktor proposal Markdown — **keduanya punya berkas uji sendiri** yang menunjuk ke dalam provider 1.123 baris |
| `features/editor/math.ts:147–259` | Lima parser LaTeX murni tanpa ketergantungan ProseMirror sama sekali. Tidak ada satu pun pengimpor yang memakai seluruh berkas |
| `components/panels/proofreader-panel.tsx:44` | Logika penerapan saran ke editor, termasuk aturan urutan offset tinggi→rendah. Panel sebelahnya sudah memakai hook `usePendingChanges` untuk hal yang identik |

**Aturannya:** aturan §2.1 tidak berhenti di batas komponen.

### 6.2 Pola 2 — Wadah dipakai sebagai "yang kebetulan terjangkau"

State dan helper mendarat di wadah mana pun yang sudah ter-mount cukup tinggi atau sudah
di-`import`. Tumpukan provider di `app/providers.tsx` dalamnya 11 lapis, jadi "sudah
terjangkau" hampir selalu benar — dan tekanan alami untuk membuat wadah baru pun hilang.

| Wadah | Urusan yang menumpang |
|---|---|
| `features/sessions/session-context.tsx` | **CRUD komentar lengkap** — padahal `features/comments/` ada dan justru *memanggil* fungsi-fungsi ini dari sini; plus persistensi hasil analisis; plus jembatan ke store dokumen lain |
| `features/sync/sync-context.tsx` | Rekonsiliasi judul dua arah (subsistem utuh dengan peta timer sendiri); migrasi skema localStorage sekali-jalan yang dijalankan selamanya; GC version store; cadangan komentar |
| `features/settings/settings-context.tsx` | **Registri buka/tutup lima dialog** yang bukan setelan. `export-docx-dialog.tsx` mengimpor `useSettings` *hanya* untuk membaca `docxExportOpen` |
| `features/document/document-reducer.ts` | Filter tab milik satu panel (penulisnya cuma satu berkas) + state hover sementara + antrean hasil grammar |
| `services/checker/__init__.py` | Kebijakan tier mesin, fan-out, aljabar himpunan isu, dan perakitan DTO — **ditulis tiga kali** dalam berkas yang seharusnya cuma re-export |
| `apps/api/src/services/base.service.ts:83` | Cache Redis di kelas dasar *pembentuk response*. Satu dari delapan subclass memakainya; tujuh sisanya mewarisi dependensi Redis yang tak pernah disentuh |
| `core/base_service.py` | Namanya berbohong: **tidak ada yang mewarisinya**; ia `JobLogger`. Cacat nyata sementara ini: `_job_start` per-instance sementara instance-nya singleton lintas thread, jadi durasi `log_end` **salah** saat `WORKER_CONCURRENCY > 1` |

**Aturannya:** nama wadah harus deskripsi lengkap dari isinya. Kalau butuh "dan", tambah wadah.

### 6.3 Pola 3 — Fungsi bebas menumpang di modul class

Class-nya kohesif; **modulnya** yang membawa helper yatim. Lalu pemanggil kedua muncul, dan
impor pun melintasi lapisan.

Contoh: `snapshotIntervalTab` (kebijakan snapshot versi) tinggal di `services/tabs/service.ts`;
`countWords` (penelusur ProseMirror murni) tinggal di `services/versions/service.ts`;
`pickModel`, `buildMessages`, dan `openChatStream` (160 baris penerjemah protokol SSE yang tak
pernah menyentuh `this`) tinggal di `services/chat/service.ts`.

Bocornya lapisan mengikuti dari sini:

- **Route melompati service.** `routes/v1/jobs.route.ts` berbicara langsung ke Redis dan
  membedah kunci internal BullMQ — tidak ada `services/jobs/` sama sekali. `stream.route.ts`
  merakit payload terminalnya sendiri, duplikat dari `services/pooling/service.ts`.
- **Service melompati repository.** `job-submission.service.ts:73` dan `share/service.ts:64`
  menulis SQL langsung. Ini dimungkinkan oleh `base.service.ts:18` yang menyerahkan `this.db`
  ke setiap service. Tabel `share` dan `share_snapshots` memang belum punya repository.
- **Service memanggil service menyamping**, karena tidak ada rumah untuk aturan domain
  lintas-entitas.

### 6.4 Pola 4 — Infrastruktur ditulis ulang di tiap pemakainya

Tim ini **tahu cara** memusatkan sesuatu — `core/provider.py` memusatkan *resolusi* provider
dengan bersih. Yang tidak pernah dapat perlakuan sama adalah *pemanggilannya*.

| Yang diduplikasi | Berapa kali | Bukti penyimpangannya |
|---|---|---|
| POST OpenAI-compatible (Python) | **3×** — `llm_client.py:100`, `ai_grammar.py:119`, `pos_providers.py:72` | Tiga timeout berbeda: 60 / 90 / 10 detik. Dua ekstraksi `total_tokens` mandiri. `ai_grammar.py:108` menyalin ulang `Provider.validate()` dengan tangan |
| Mekanika modal (overlay + kunci scroll + Escape) | **10×** di seluruh dialog | Tanpa primitif `Modal`, tiap berkas dialog **wajib** punya dua tanggung jawab: jadi modal, dan jadi dialog itu |
| Konversi satuan px↔cm/in | **4×** | Semuanya sudah mengimpor `INCH` dari `page-geometry.ts` tapi berhenti sebelum menaruh konversinya di sana |
| Pabrik record isu `_iss` (Python) | **6×** | Tiap modul aturan memegang salinan privat **kontrak data paketnya sendiri** |
| Morfologi Inggris | **3×** | `_to_singular_verb`/`_vbz_base`/`_to_3sg` dan kerabatnya |
| `ownerId()` (TS) | **5×** | Disalin identik ke lima service |
| Mutasi `moveToProject` | **2×** | Ditulis dua kali karena tidak ada hook mutasi bersama |

Catatan kalibrasi dari audit: **ekstraksi terjadi pada granularitas yang salah** — utilitas 40
baris (`ruler-drag.ts`) berhasil dibagikan, sementara mesin 200 baris justru disalin.

### 6.5 Pola 5 — Batas `packages/shared` terbalik

Paket kontrak justru memegang **logika runtime**, sementara **konstanta lintas proses** yang
seharusnya ia pegang tersebar sebagai string di tiap pemakainya.

Yang masuk padahal seharusnya keluar — `packages/shared/src/tools.ts` memegang
`toProviderTools` (serialisasi khusus provider) dan `fallbackToolPrompt` (perakit prosa prompt
bahasa Inggris).

Yang keluar padahal seharusnya masuk:

| Kontrak | Ditulis ulang di |
|---|---|
| `grammar:stream:{jobId}` | `lib/job-events.ts:10`, `analysis_service.py:66`, `grammar_service.py:53` — **tiga salinan** |
| `job:{id}:cancel` | `jobs.route.ts:51`, `core/cancel.py:30` |
| `bull:{queue}:wait` | `jobs.route.ts:30`, `core/queue/worker.py:60` |

Ini bukan sekadar duplikasi: kontrak lintas proses **tidak dijamin compiler** karena Python
tidak membaca `packages/shared`. String yang ditulis ulang di enam tempat akan menyimpang, dan
menyimpangnya baru ketahuan saat streaming diam-diam berhenti bekerja di produksi.

### 6.6 Pola 6 — Kode mati dan berkas hantu

| Temuan | Keterangan |
|---|---|
| `packages/shared/src/.fuse_hidden00002c8200000009` | **Terlacak git** (masuk lewat commit `e115b08`). Salinan yatim `analysis.ts` — artefak filesystem yang tak sengaja ter-commit. Satu berkas kontrak punya dua wujud di repo |
| `features/editor/editor-polish.ts` | `ImageWithMarkdown` **mati** — `extensions.ts` memakai `ResizableImage`. Satu-satunya ekspor hidup adalah `TrailingParagraph` |
| `features/sessions/ydoc.ts:660` | `readComments`/`writeComments` tidak terpakai — `session-context.tsx` membaca komentar langsung dari `TabMeta`. Dua jalur untuk data yang sama, satu mati |
| `checker/pos_providers.py:121` | Mesin registri "pilih yang pertama tersedia" me-resolve daftar berisi **satu** elemen; docstring-nya masih mengiklankan `SpacyPosProvider` yang sudah tidak ada |
| `apps/web` `package.json` | `mermaid` terpasang sebagai dependensi, tapi node view-nya belum ada |

### 6.7 Ringkasan berkas, terurut menurut keparahan

| # | Berkas | Parah | Inti yang harus tinggal | Yang harus pindah |
|---|---|---|---|---|
| 1 | `features/sessions/session-context.tsx` | 🔴 | Dokumen & tab mana yang terbuka | CRUD komentar, hasil analisis, jembatan store |
| 2 | `features/sync/sync-context.tsx` | 🔴 | Sinkronisasi konten tab ↔ baris server | Sinkronisasi judul, migrasi, GC versi, cadangan komentar |
| 3 | `features/chat/chat-context.tsx` | 🔴 | Siklus hidup satu giliran chat | Kompaksi, parser proposal, ringkasan outline, pembuat tab, linimasa langkah |
| 4 | `analyzers/llm_client.py` | 🔴 | Satu permintaan chat-completion | Metering token, tabel bahasa, 4 prompt fitur + validatornya |
| 5 | `services/chat/service.ts` | 🔴 | Validasi + otorisasi + serahkan stream | Katalog prompt, pemilih model, adapter, parser SSE 160 baris |
| 6 | `routes/v1/jobs.route.ts` | 🔴 | Deklarasi rute + delegasi | Bedah antrean BullMQ, protokol bendera batal, publikasi pub/sub |
| 7 | `services/job-submission.service.ts` | 🔴 | Pembuka baku tiap pengiriman job | Insert SQL mentah, kebijakan retensi, kosakata admin-ppe |
| 8 | `components/editor/toc-block-view.tsx` | 🔴 | Node view satu blok TOC | Penyelesai geometri celah, serialisasi, protokol event lintas modul |
| 9 | `components/editor/document-ruler.tsx` | 🔴 | Menggambar penggaris & meneruskan drag | Dua mesin redistribusi lebar |
| 10 | `features/chat/tools.ts` | 🟠 | Eksekusi panggilan tool | Semua string presentasi, konversi satuan; pisahkan tool baca vs tulis |
| 11 | `features/editor/math.ts` | 🟠 | Skema node math + node view | Lima parser LaTeX murni |
| 12 | `checker/__init__.py` | 🟠 | Re-export saja | Pipeline, aljabar isu, kebijakan tier |
| 13 | `settings-context.tsx` | 🟠 | Preferensi terpersistensi | Registri lima dialog, penerapan tema ke DOM |
| 14 | `features/editor/table-ops.ts` | 🟠 | Operasi struktural baris/kolom | Aritmetika lebar kolom, indent tabel, pembersih gaya sel |
| 15 | `document-reducer.ts` | 🟠 | Dokumen kerja: judul, teks, berkas | Filter panel, range hover, antrean saran grammar |
| 16 | `checker/ai_grammar.py` | 🟠 | Bentuk isu dari saran LLM | Transport HTTP, validasi provider, perbaikan offset |
| 17 | `share/service.ts` | 🟠 | Logika tautan berbagi | Query SQL, pembuatan token, pembuatan dokumen |
| 18 | `analysis_service.py` / `grammar_service.py` | 🟠 | Menjalankan satu job | Koneksi Redis sendiri + publisher, switch arity analyzer |
| 19 | `packages/shared/src/tools.ts` | 🟠 | Katalog & tipe tool | `toProviderTools`, `fallbackToolPrompt` |
| 20 | `analyzers/humanizer.py` | 🟠 | Humanisasi LLM + fallback | Mesin substitusi generik, leksikon, helper milik `ai_detector` |
| 21 | `base.service.ts` | 🟠 | Pembentukan response | `cacheGet`/`cacheSet`, handle `this.db` |
| 22 | `components/editor/tiptap-editor.tsx` | 🟠 | Membuat & menampung instance editor | Subsistem popover saran, jembatan range panel, migrasi legacy |
| 23 | `checker/pos_providers.py` | 🟠 | Antarmuka `PosProvider` | Tokenizer, transport, registri |
| 24 | `components/library/document-card.tsx` | 🟠 | Merender satu baris dokumen | Dialog berbagi kedua, input nama, 4 mutasi mentah |
| 25 | `features/sessions/ydoc.ts` | 🟡 | Skema Y.Doc + operasi struktural | Penyimpanan & resolusi page setup, ekstraksi pratinjau |
| 26 | `features/editor/columns.ts` | 🟡 | **Mesin kolom — jangan dipecah** | Hanya: migrasi skema legacy + helper box-model DOM |
| 27 | `features/editor/pagination.ts` | 🟡 | **Mesin paginasi — jangan dipecah** | Hanya: penyesuaian margin, `blockSections`, dua pabrik DOM |
| 28 | `features/editor/indent.ts` | 🟡 | Skema atribut indent | Hook React yang memaksa `'use client'` ke jalur headless |
| 29 | `features/editor/selection.ts` | 🟡 | Seleksi editor | `SelectionScope` — bentuk payload API, bukan urusan editor |
| 30 | `lib/utils.ts` | 🟡 | Hanya `cn` | `fingerprint` (1 pemakai), `countWords` (2 pemakai) |
| 31 | `nav-menu.tsx` | 🟡 | Menu navigasi | `ProjectsSection` + mutasi pindah-project |
| 32 | `document-canvas.tsx` | 🟡 | Menggambar kanvas lembar | Generator CSS cetak, kebijakan tinggi blok kode |
| 33 | `docx/units.ts` | 🟡 | Satuan panjang OOXML → piksel | Pemetaan warna, tinggi baris, tumpukan font |
| 34 | `version-context.tsx` | 🟡 | Mode layar riwayat versi | Daemon snapshot interval, dua jalur restore |
| 35 | `editor-polish.ts` | 🟡 | *(tidak ada — tidak ada satu urusan)* | Pecah; `ImageWithMarkdown` sudah mati |
| 36 | `lib/queue.ts` | 🟡 | Siklus hidup antrean | Helper enqueue per-fitur |
| 37 | `code-block-node-view.tsx` | 🟡 | Node view blok kode | Pipeline render Mermaid |
| 38 | `features/editor/table-handles.ts` | 🟡 | Overlay pengikut kursor | Mesin state drag, `startingCell` (aritmetika TableMap) |
| 39 | `core/queue/worker.py` | 🟡 | Konsumsi antrean | Persistensi kegagalan job, supervisi deadline |

### 6.8 Yang **bukan** pelanggaran

Ditulis eksplisit supaya tidak ada yang "merapikannya":

- `features/editor/columns.ts` dan `pagination.ts` — mesin kohesif. Hanya potongan kecil yang
  disebut di baris 26–27 tabel yang perlu pindah; **badan mesinnya jangan disentuh.**
- `analyzers/plagiarism.py` — 200 dari 313 barisnya adalah korpus `COMMON_PHRASES`, yaitu
  kamus algoritmanya sendiri.
- `checker/advanced.py` — satu keluarga aturan.
- Katalog `EDITOR_TOOLS` di `packages/shared/src/tools.ts` — data kontrak, memang sebesar itu.
- 11 dari 14 berkas route `apps/api` — delegasi dua baris. Bentuk yang benar; `jobs.route.ts`
  dan `stream.route.ts` adalah anomalinya, bukan sebaliknya.
- `services/extract/**` — paket paling bersih di repo. Jadikan cetakan.
- `components/panels/change-list-panel.tsx` — menyusun tujuh hook bertujuan tunggal dan hanya
  memegang rendering. Model untuk panel lain.
- `LoggerClient`, `RedisClient`, `AppError`, dan kelas galat `extract/errors.py`.

### 6.9 Kalau harus memilih urutan

Bukan rencana kerja — pengguna yang memutuskan. Tapi kalau ditanya dari mana:

1. **Konstanta lintas proses ke `packages/shared`** (§6.5). Murah, berisiko rendah, dan satu-
   satunya temuan yang bisa gagal **diam-diam di produksi**.
2. **`core/base_service.py` → `JobLogger`** (§6.2). Ganti nama sekarang, sebelum ada yang
   menempelkan helper DB ke dalamnya — plus perbaiki cacat `_job_start` lintas-thread yang
   membuat durasi log salah.
3. **Satukan transport LLM Python** (§6.4). Tiga timeout berbeda untuk pemanggilan yang sama
   adalah bug yang menunggu giliran.
4. **Primitif `Modal`** (§6.4). Satu berkas menghapus tanggung jawab kedua dari sepuluh dialog
   sekaligus — rasio hasil-per-risiko terbaik di seluruh daftar.
5. **Hapus berkas hantu** (§6.6). Beberapa menit.
6. Baru sesudahnya, tiga provider besar (§6.7 no. 1–3) — paling bernilai, paling berisiko,
   paling banyak pengimpor. Lakukan bertahap, dan patuhi §5.
