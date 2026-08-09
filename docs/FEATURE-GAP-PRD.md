# WritingHub — Gap Fitur terhadap PRD & Rencana Implementasi

Dokumen ini memetakan fitur PRD (`docs/PRD - WritingHub - Premium Portal Extended & Ransel.ai.pdf`)
terhadap kondisi implementasi saat ini, lalu merinci rencana implementasi untuk fitur yang
**belum ada** atau **baru parsial**.

Audit dilakukan per Agustus 2026 terhadap `apps/web`, `apps/api`, `services/worker`, `packages/shared`,
dan referensi `ref/ferdocs` (ddoc) + `ref/google-docs-clone`.

> **Status per 9 Agustus 2026** (HEAD `9686d98`). Sejak audit awal: **A, B, dan I selesai**
> (3 dari 15 gap), **C ditunda** atas keputusan produk, 11 sisanya belum dikerjakan.
> Verifikasi terakhir: typecheck lolos di 3 paket, `bun test` 186 pass / 0 fail.

---

## 1. Ringkasan Status

### Sudah terimplementasi (fungsional end-to-end)

| Fitur PRD | Tier | Status aktual |
|---|---|---|
| Rich text editor (Tiptap) | Beta | ✅ jauh melampaui PRD (paginasi, tabel, komentar, ruler, outline, ekspor DOCX/PDF/TXT) |
| Panel switcher / tool rail | Beta | ✅ 7 panel (AI Chat, Proofreader, AI Detector, AI Rewriter, Humanizer, Plagiarism, Comments) |
| Upload document (DOCX/PDF/TXT) | Beta | ✅ DOCX diparse di browser dengan format; PDF/TXT via worker |
| Text selection scoping | Beta | ✅ menyeluruh di semua modul + selection popup |
| Undo/redo lintas modul | Beta | ✅ Yjs UndoManager |
| Markdown & LaTeX | Beta | ✅ paste markdown, KaTeX inline/block |
| Grammar & spelling checker | Beta | ✅ 3 tier (standard/advanced/ai) + inline suggestion |
| Writing quality score | Beta | ✅ ScoreRing (grammar/fluency/clarity/engagement) |
| Paraphraser apply/discard per segmen | Beta | ✅ sebagai "AI Rewriter" via ChangeListPanel |
| Unified highlight layer | Beta (cross-cutting) | ✅ ProseMirror Decoration + SuggestionHighlight |
| Tampilan daftar perubahan | Beta (cross-cutting) | ⚠️ `ChangeListPanel` (UI) dipakai Rewriter & Humanizer; `changes[]`-nya tetap dihasilkan worker/LLM, **bukan** hasil membandingkan dua teks |
| Mesin diff dua naskah | (bukan PRD) | ✅ dibangun untuk fitur I: `features/versions/diff.ts` (jsdiff word-level + pemetaan offset→ProseMirror). Baru dipakai riwayat versi; Rewriter/Humanizer belum memakainya |
| Real-time streaming result | V1 | ✅ sudah ada sejak Beta (SSE + checkpoint) |
| Pilih quality/model AI | V1 | ✅ model-selector (standard/advanced/ai) |
| AI Detector | V1 | ✅ per-sentence highlight + accept/dismiss |
| AI Chat Sidebar (konteks dok, insert ke draft) | V1 | ✅ termasuk tool calling (read tools auto, write tools butuh Apply) |
| Async job + SSE | V1 (cross-cutting) | ✅ BullMQ + Redis pub/sub |
| Sharing (link read-only) | V3 | ⚠️ sudah ada lebih awal: `shares` table + share dialog, tapi berbasis snapshot, belum role editor/commenter yang hidup |

### Status fitur gap (A–O)

Penomoran A–O dipertahankan apa adanya — dirujuk di §2, §3, §5, dan di
`docs/VERSION-HISTORY-PLAN.md`. Baris yang sudah selesai ditandai di tempat, bukan dipindah.

| # | Fitur | Tier PRD | Status | Keterangan |
|---|---|---|---|---|
| A | Autosave & draft persistence **ke backend** | Beta | ✅ **selesai** | `features/sync/sync-context.tsx` — debounce 3 dtk diam / 30 dtk maks → `PUT /documents/:id`. IndexedDB tetap sumber kebenaran lokal; last-write-wins sesuai §5.1 |
| B | Documents CRUD + File Library | Beta (Core Platform) | ✅ **selesai** | 5 endpoint `/api/v1/documents*`, halaman `/library`, `owner_id` non-nullable, snapshot share dipindah ke tabel `share_snapshots` (migrasi 0004) |
| C | File Translator | Beta | ⏸️ **ditunda** | Nol jejak di repo (`grep -i translator` → 0 hit). Ditunda atas keputusan produk; trigger `pre_translate` sudah disiapkan di enum `document_versions` |
| D | Plagiarism via Similarity Service PPE | Beta | ⚠️ parsial | Implementasi saat ini heuristik n-gram vs ~200 frasa klise; PRD mewajibkan integrasi service similarity PPE |
| E | Send to paraphraser (cross-module) | Beta | ⚠️ parsial | Ada submenu Review di selection popup, tapi belum ada routing langsung dari hasil plagiarism → paraphraser |
| F | History (riwayat sesi lintas modul) | Beta (Core) | ❌ | Riwayat sesi Grammar/Translate terpadu (beda dengan version history) |
| G | Projects | V1 | ❌ | Belum ada tabel/UI. **Tidak lagi terblokir** — tinggal `projects` + `documents.project_id` + pengelompokan di File Library yang sudah ada |
| H | AI Memory | V1 | ❌ | Personalisasi tone; relevan untuk chat & humanizer |
| I | Document version history | V2 | ✅ **selesai** | Dikerjakan lebih awal dari urutan §2 atas permintaan produk. Tabel `document_versions` + 4 endpoint, snapshot `interval`/`manual`/`pre_restore`, diff inline, restore non-destruktif, mode layar penuh. **Melebihi rencana:** versi local-first untuk tab yang belum tersimpan di cloud (IndexedDB) + pintasan Ctrl/Cmd+S. Rincian: `docs/VERSION-HISTORY-PLAN.md` |
| J | Analyze structure per paragraph | V2 | ❌ | Butuh R&D konteks dokumen penuh |
| K | Citation-aware plagiarism | V2 | ❌ | Sudah ada pencarian sitasi Crossref; belum ada parsing sitasi untuk mengecualikan kemiripan tersitasi |
| L | Glossary / terminology lock | V2 | ❌ | Bergantung pada File Translator (C) |
| M | Humanizer verify loop | V3 | ❌ | Re-check AI Detector otomatis pasca humanize |
| N | AI Chat reference grounding | V2 | ❌ | Merujuk file di File Library. **Tidak lagi terblokir** — (B) sudah selesai |
| O | Realtime collaboration | V3 | ⚠️ fondasi | Yjs + ekstensi Collaboration sudah terpasang, tapi provider hanya `y-indexeddb` lokal; nol hit `hocuspocus` di repo. **Prasyarat dokumen server-side sudah beres** lewat (A)+(B) |

Catatan: `ref/google-docs-clone` tidak bisa dijadikan referensi untuk fitur-fitur di atas
(tidak ada version history, schema-nya tidak punya tabel versi). `ref/ferdocs` (ddoc) hanya
referensi pola editor untuk **version history** (lihat §4).

---

## 2. Urutan prioritas yang disarankan

Urutan mempertimbangkan tier PRD dan dependensi antar fitur:

0. ✅ **Pemisahan `documents` ↔ snapshot share** (prasyarat A). Selesai lewat migrasi `0004`:
   snapshot share pindah ke tabel `share_snapshots`, `shares.document_id` kini menunjuk dokumen
   milik user, dan `owner_id` jadi non-nullable.
1. ✅ **A + B — Autosave backend & Documents CRUD** (Beta). Selesai. Fondasi ini yang membuka
   G, N, dan O.
2. ⏸️ **C — File Translator** (Beta). **DITUNDA (per Agustus 2026)** — butuh pekerjaan worker +
   parser DOCX baru; dilewati sementara demi versioning local-first (lihat
   `docs/VERSION-HISTORY-PLAN.md` Iterasi 2). Trigger `pre_translate` di `document_versions`
   tetap disiapkan.
3. ⬅️ **D + E — Plagiarism riil & cross-module routing** (Beta). **Kandidat berikutnya.**
   Hanya D yang menunggu pihak luar (kontrak API similarity PPE, §5.3); refactor
   `SimilarityProvider` dan E bisa dikerjakan sekarang.
4. **F — History sesi** (Beta, Core Platform). Murah setelah A+B ada.
5. **G, H — Projects & Memory** (V1). G tinggal `projects` + `documents.project_id`.
6. ✅ **I — Document version history** (V2). Selesai lebih awal dari urutan ini, atas permintaan
   produk. Detail di §4 dan `docs/VERSION-HISTORY-PLAN.md`.
7. **N — Reference grounding** (V2, prasyarat B sudah ada). **L — Glossary** (V2, masih menunggu C).
   **J, K** (V2; K menunggu D).
8. **O — Realtime collaboration** (V3). **M — Verify loop** (V3).

**Sisa antrean setelah pembaruan ini:** D, E, F, G, H, J, K, L, M, N, O (11 fitur), dengan C ditunda.

---

## 3. Rencana per fitur

### A. Autosave & draft persistence ke backend (Beta) — ✅ SELESAI

> Terimplementasi sesuai desain di bawah. Rekaman keputusan yang berbeda dari rencana awal:
> opsi (b) yang diambil untuk pemisahan tabel (`share_snapshots`), dan `saveToCloud`
> mengembalikan `boolean` supaya alur restore versi bisa membatalkan diri saat flush gagal.
> Berkas utama: `features/sync/sync-context.tsx`, `features/sync/serialize.ts`,
> `apps/api/src/services/documents/`.


**Gap:** PRD menyatakan "Draft otomatis tersimpan ke backend" dengan debounced autosave.
Saat ini persistensi murni lokal: tiap tab = fragment dalam satu `Y.Doc` yang disimpan ke
IndexedDB (`apps/web/features/sessions/session-context.tsx`, `ydoc.ts`).

**Desain:**

- Backend (`apps/api`):
  - Perluas tabel `documents`: `updated_at` **sudah ada** (`db/schemas/document.ts:14`) dan cukup dipakai
    apa adanya untuk autosave. Yang benar-benar perlu diubah: `owner_id` jadi **non-nullable** (diisi dari
    header `x-pp-user-id`) + backfill baris lama.
  - **Migrasi wajib — pemisahan dua makna tabel.** `ShareService.create()` menulis baris `documents` baru
    per share, jadi tabel ini sekarang campuran "dokumen milik user" dan "snapshot beku milik share".
    Pilih salah satu, lalu backfill: (a) tambah kolom penanda `origin` (`'user' | 'share_snapshot'`) dan
    filter semua endpoint CRUD ke `origin='user'`, atau (b) pindahkan snapshot ke tabel sendiri
    (`share_snapshots`) dan buat `shares.document_id` menunjuk dokumen milik user. **Rekomendasi: (b)** —
    sejalan dengan rencana §3.B ("share dibuat dari dokumen server") dan tidak menyisakan filter implisit
    di setiap query.
  - Endpoint baru: `PUT /api/v1/documents/:id` (debounced save, menerima Tiptap/ProseMirror JSON — kolom `content` sudah jsonb), `GET /api/v1/documents` (list milik user), `GET /api/v1/documents/:id`, `DELETE /api/v1/documents/:id`.
  - Idempoten & ringan: autosave menimpa `content`, tidak membuat entri baru (pemisahan dengan version snapshot — lihat §4).
- Frontend (`apps/web`):
  - Layer sinkronisasi di atas `session-context`: serialisasi fragment tab → JSON, debounce (mis. 2–5 detik idle / 30 detik maksimal), kirim via proxy Next (`app/api/documents/`) mengikuti pola `lib/server/upstream.ts`.
  - Strategi dual-write: IndexedDB tetap sumber kebenaran lokal (offline-first), backend sebagai cadangan/cloud. Konflik saat load: bandingkan `updatedAt` lokal vs server, pilih yang baru (sebelum V3 tidak ada multi-device live editing).
  - Metadata (judul, emoji, bahasa per tab — `features/document/language.ts`) ikut tersimpan.
- Keputusan yang harus diambil sejak fase ini: **format konten tersimpan = ProseMirror JSON**
  (bukan HTML, bukan Yjs update log), karena:
  - kolom `documents.content` sudah jsonb bertipe Tiptap JSON,
  - version history (I) dan diff engine akan mengonsumsi format yang sama,
  - migrasi ke Yjs di V3 tidak mengubah format snapshot.

### B. Documents CRUD + File Library (Beta, Core Platform) — ✅ SELESAI

> Terimplementasi: halaman `/library`, 5 endpoint `/api/v1/documents*`, dan share kini dibuat
> dari dokumen server (`documentId` dikirim balik oleh `POST /shares` supaya tab lokal yang
> dibagikan langsung tertaut, bukan melahirkan dokumen baru tiap kali). Lapisan repository
> (`apps/api/src/repository/document.ts`) dipertahankan sesuai mitigasi §5.4.


**Desain:** lanjutan langsung dari A.

- UI daftar dokumen (File Library): halaman baru di `apps/web/app/` — grid/list dokumen milik user
  (judul, emoji, updatedAt, word count), aksi buka/rename/hapus/bagikan. Sumber data: `GET /api/v1/documents`.
- Multi-tab saat ini menyimpan semua tab dalam satu Y.Doc lokal; File Library memetakan
  **1 dokumen server ↔ 1 tab/session** saat dibuka. Dokumen yang belum pernah disinkron tetap lokal
  (tandai sebagai "lokal saja" di UI).
- Integrasi share yang sudah ada (`POST /shares`) tetap berjalan; idealnya share dibuat dari
  dokumen server, bukan snapshot terpisah — sesuaikan `services/share/service.ts` untuk mereferensikan
  `documents` milik user.

### C. File Translator (Beta)

**Gap:** modul kosong total — satu-satunya modul Beta yang belum ada jejaknya.

**Desain (mengikuti pola modul yang sudah ada):**

- Shared (`packages/shared/src/analysis.ts`):
  - Tambah `translator` ke `ANALYSIS_FEATURES` + tipe hasil `TranslatorResult` di `AnalysisResultMap`.
  - Payload tambahan: `source_lang` (opsional, auto-detect), `target_lang` (wajib).
- Worker (`services/worker`):
  - Analyzer baru `services/analyzers/translator.py`, daftarkan di `_ANALYZERS`
    (`services/worker/services/analysis_service.py:27`).
  - Translate per blok/segmen via LLM (`services/analyzers/llm_client.py` — sudah punya peta bahasa
    BCP-47 `_LANGUAGE_NAMES` termasuk `id` → "Indonesian"), instruksi eksplisit mempertahankan
    markup/placeholder struktur.
  - Untuk mode file: pipeline `services/worker/services/extract/` sudah mengekstrak teks dari
    PDF/DOCX/TXT — gunakan sebagai input; **keterbatasan**: parser DOCX saat ini hanya mengambil
    paragraf (`extract/parsers/docx.py:17` — `document.paragraphs`, tabel/header hilang),
    jadi "mempertahankan struktur asli" untuk DOCX butuh peningkatan parser
    atau pendekatan translate-in-place di editor (di bawah).
- API (`apps/api`): ikut pola `POST /analyze` (field `feature=translator`) — otomatis dapat
  antrean, status, dan SSE gratis.
- Frontend (`apps/web`):
  - Panel baru `translator-panel.tsx` + entri di `panel-rail.tsx` (saat ini rail tidak punya Translator).
  - Dua mode sesuai PRD:
    1. **Translate by file**: upload file → ekstrak → hasil terjemahan masuk sebagai tab/dokumen baru.
    2. **Translate in place**: terjemahkan draft aktif sebagai versi baru — hasil menimpa konten editor
       (struktur Tiptap dipertahankan karena translasi per-node, bukan plain text).
  - **Snapshot point wajib** (persiapan fitur I): sebelum overwrite translate in place, simpan versi
    lama (manual: duplikasi tab; setelah I ada: otomatis membuat version snapshot).
  - Reuse `useAnalysis` + komponen `panel-parts`/`ChangeListPanel` untuk konsistensi UX (catatan:
    `ChangeListPanel` adalah penampil daftar perubahan, bukan diff engine — analyzer translator perlu
    mengembalikan `changes[]` sendiri seperti rewriter/humanizer bila ingin memakainya).

### D. Plagiarism via Similarity Service PPE (Beta)

**Gap:** PRD (§21) mewajibkan integrasi langsung ke service similarity PPE yang sudah ada.
Implementasi sekarang (`services/worker/services/analyzers/plagiarism.py`) adalah heuristik n-gram vs
frasa klise dan sudah berdisclaimer "not a replacement for a full plagiarism service".

**Desain:**

- Worker: ganti/imbangi analyzer plagiarism dengan klien HTTP ke similarity service PPE
  (konfigurasi via env, mis. `SIMILARITY_SERVICE_URL`). Pertahankan output shape
  (`uniqueness score + flagged phrases + offset`) agar frontend tidak berubah.
- Mapping offset → node Tiptap sudah teratasi (pola yang sama dengan grammar/highlight layer).
- Fallback: jika service PPE tidak terkonfigurasi, tetap jalankan heuristik saat ini dengan label jelas.

### E. Send to paraphraser (Beta)

**Gap kecil:** dari hasil plagiarism, tombol "Paraphrase" pada segmen flagged yang otomatis
berpindah fokus ke panel AI Rewriter dengan segmen itu sebagai scope.

**Desain:** murni frontend — `panel-context.tsx` mendukung navigasi antar panel dengan payload
(`{ panel: 'ai_rewriter', selection: { offset, length } }`); tombol di `plagiarism-panel.tsx`.
Pola yang sama nanti dipakai "Send to humanizer" (AI Detector → Humanizer, V2) dan verify loop (M).

### F. History sesi lintas modul (Beta, Core Platform)

> **Rencana implementasi: [HISTORY-PROJECTS-MEMORY-PLAN.md](HISTORY-PROJECTS-MEMORY-PLAN.md)**
> (bersama G dan H). Di UI fitur ini dinamai **"Aktivitas AI"** — "Riwayat" sudah dipakai daftar
> sesi terakhir, dan "Riwayat versi" oleh fitur I.


**Gap:** PRD menyebut "History menggabungkan sesi Grammar dan Translate". Ini **bukan** version
history dokumen — melainkan log aktivitas/hasil modul per user.

**Desain:**

- Data sudah tersedia: `pool_request` + `grammar_result` + `analysis_result` mencatat semua job.
  Yang hilang: kolom `user_id`/`document_id` di `pool_request` agar bisa difilter per user,
  dan endpoint `GET /api/v1/history?feature=...&limit=...`.
- Frontend: panel/halaman History — daftar job lampau (fitur, waktu, dokumen, skor/hasil ringkas),
  klik untuk melihat hasil lengkap atau menerapkan ulang ke dokumen aktif.

### G. Projects (V1)

> **Rencana implementasi: [HISTORY-PROJECTS-MEMORY-PLAN.md](HISTORY-PROJECTS-MEMORY-PLAN.md)**
> (bersama F dan H).


- Tabel `projects` (id, owner_id, name, timestamps) + kolom `project_id` nullable di `documents`.
- UI: pengelompokan di File Library (B). Tidak ada kebutuhan teknis khusus.

### H. AI Memory (V1)

> **Rencana implementasi: [HISTORY-PROJECTS-MEMORY-PLAN.md](HISTORY-PROJECTS-MEMORY-PLAN.md)**
> (bersama F dan G). Menyimpang dari sketsa di bawah dalam satu hal: tabelnya satu baris per user
> dengan kolom `preferences` jsonb, bukan key/value.


- PRD: personalisasi tone pengguna. Implementasi paling sederhana: tabel `user_memories`
  (owner_id, key, value) yang ditulis dari preferensi eksplisit user (bukan inferensi diam-diam),
  lalu disuntik sebagai system prompt tambahan di `POST /chat` dan analyzer humanizer/rewriter.
- Batasi scope: preferensi gaya (tone default, bahasa default, kamus istilah) — bukan memori
  percakapan penuh, agar tidak menggandakan tanggung jawab admin-ppe.

### I. Document version history (V2)

Desain rinci di §4. **Rencana implementasinya ada di dokumen terpisah:
[VERSION-HISTORY-PLAN.md](VERSION-HISTORY-PLAN.md)** — ditulis setelah fondasi A+B jadi,
jadi ia yang berlaku bila berbeda dengan §4.

> ✅ **SELESAI.** Terimplementasi termasuk Iterasi 2 (riwayat local-first untuk tab yang belum
> tersimpan di cloud, lewat IndexedDB, plus Ctrl/Cmd+S). Penyimpangan dari §4 yang perlu
> diingat: **mesin diff dibangun baru** (`features/versions/diff.ts` di atas jsdiff) — §4 sempat
> mengira `ChangeListPanel` bisa dipakai ulang, padahal ia hanya penampil. Teks tambahan
> dirender sebagai marker di titik sisip, bukan teks inline; ini batasan iterasi pertama yang
> disepakati.

### J. Analyze structure per paragraph (V2)

- Analyzer baru di worker (konteks dokumen penuh, koherensi antar paragraf). PRD sendiri menandai
  "butuh R&D" — jadwalkan spike terpisah. Output: feedback per paragraf → highlight layer yang ada.

### K. Citation-aware detection (V2)

- Worker plagiarism (versi PPE, lihat D) menerima daftar rentang tersitasi dari frontend.
  Frontend sudah punya infrastruktur sitasi (`citation-popover.tsx`, `/api/citations`) — tambahkan
  deteksi blok daftar pustaka + format sitasi inline untuk menghasilkan rentang pengecualian.

### L. Glossary / terminology lock (V2)

- UI glossary per dokumen/proyek (tabel `glossaries`: owner/project, entries jsonb).
- Disuntik sebagai bagian prompt pada analyzer translator (C). Bergantung pada C.

### M. Humanizer verify loop (V3)

- Setelah humanize diterapkan, otomatis jalankan ulang `ai_detector` pada teks hasil dan tampilkan
  skor before/after. Orkestrasi frontend saja (dua pemanggilan `useAnalysis` berurutan) — tidak perlu
  perubahan backend.

### N. AI Chat reference grounding (V2)

- Chat tool baru `read_library_file(documentId)` (read tool, auto-execute) yang mengambil konten
  dari File Library (B) via endpoint dokumen. Tambahkan definisi di `packages/shared/src/tools.ts`,
  eksekusi di `features/chat/tools.ts`.

### O. Realtime collaboration (V3)

- PRD: Yjs + Hocuspocus, perlu service sync + auth sendiri.
- Kesiapan saat ini: editor sudah Yjs-native (satu Y.Doc, fragment per tab, ekstensi Collaboration
  aktif, UndoManager Yjs). Yang dibutuhkan:
  - Service Hocuspocus terpisah (atau route di `apps/api`) dengan hook auth (validasi token/share role)
    dan persistence (simpan Yjs update/snapshot ke Postgres, tautkan ke `documents`).
  - Frontend: pasang `HocuspocusProvider` menggantikan/mendampingi `y-indexeddb`, tambah awareness
    (kursor + presence list).
  - Interaksi dengan version history (I): snapshot tetap ProseMirror JSON yang diambil berkala
    dari Y.Doc di sisi server — format tidak berubah.

---

## 4. Desain rinci: Document version history (V2)

**FR (PRD):** Sistem menyimpan riwayat versi dokumen dan memungkinkan pemulihan ke versi lampau.
**Tech note (PRD):** Tiptap Snapshot berbayar — bangun sendiri. Referensi: ddoc.

### Temuan dari referensi ddoc (`ref/ferdocs`)

- Package editor ddoc hanya menyediakan: prop `versionHistoryState` untuk me-render versi lampau
  **read-only** (`package/use-ddoc-editor.tsx`), dan util `buildVersionDiffSnapshot()`
  (`package/components/tabs/utils/version-diff-snapshot.ts`) untuk mengekstrak konten versi guna diff.
- Penyimpanan versi, daftar/timeline, dan restore **sengaja diserahkan ke host app**
  (`docs/TABS_SPEC.md:446-454`). Artinya writer-hub memang harus membangun bagian backend + UI
  daftar versi sendiri — pola editor-nya saja yang ditiru.

### Skema data

```sql
document_versions (
  id           uuid pk,
  document_id  uuid fk -> documents.id,
  content      jsonb,           -- ProseMirror JSON (format sama dengan documents.content)
  trigger      text,            -- 'manual' | 'interval' | 'pre_translate' | 'pre_restore'
  label        text nullable,   -- nama versi opsional dari user
  word_count   int,
  created_by   varchar,
  created_at   timestamptz
)
```

- **Format konten: ProseMirror JSON**, bukan Yjs encoded state (berbeda dengan ddoc) — karena
  writer-hub saat V2 belum menjalankan Yjs server-side, dan format ini sudah dipakai
  `documents.content`. Keputusan ini harus dikunci sejak fitur A (autosave backend).
- Retensi: versi `interval` dibatasi (mis. 50 terakhir per dokumen); versi `manual`,
  `pre_translate`, `pre_restore` tidak dipangkas.

### Titik snapshot

| Trigger | Kapan |
|---|---|
| `interval` | Otomatis berkala (mis. tiap 10 menit ada perubahan, atau N autosave) |
| `manual` | User klik "Simpan versi" / memberi label |
| `pre_translate` | Otomatis sebelum translate in place menimpa editor (fitur C) |
| `pre_restore` | Otomatis sebelum restore — restore **tidak pernah destructive** |

### API (`apps/api`, di bawah `/api/v1`)

- `GET /documents/:id/versions` — daftar versi (metadata saja, tanpa content).
- `GET /documents/:id/versions/:versionId` — satu versi lengkap (untuk preview/diff).
- `POST /documents/:id/versions` — buat snapshot manual `{ label?, trigger }`.
- `POST /documents/:id/versions/:versionId/restore` — buat snapshot `pre_restore` dari state
  saat ini, lalu tulis konten versi lama ke `documents.content`. Idempoten.

### Frontend (`apps/web`)

- Panel/entri baru "Riwayat Versi" (menu File atau tool rail): timeline versi (waktu, label,
  trigger, word count).
- **Preview read-only:** pola ddoc — buka versi dalam mode non-editable (di writer-hub cukup
  instance Tiptap kedua read-only, atau kunci transaction editor aktif sementara). Tidak perlu
  membeli ekstensi apa pun.
- **Diff:** ⚠️ **belum ada diff engine yang bisa direuse.** `ChangeListPanel` hanya me-*render*
  `AiRewriterResult.changes[]` / `HumanizerResult.changes[]`, dan array itu diproduksi worker/LLM —
  tidak ada perbandingan dua teks di sisi klien, dan tidak ada dependensi diff (`diff`,
  `diff-match-patch`) di `apps/web`. Jadi fitur ini butuh **komponen baru**, bukan refactor:
  - Tambah util diff (mis. `jsdiff` word-level, atau `prosemirror-changeset` kalau ingin diff
    struktural yang sadar node) yang menerima dua dokumen arbitrer dan menghasilkan `TextChange[]`.
  - Setelah util itu ada, `ChangeListPanel` bisa dipakai ulang apa adanya sebagai penampil hasilnya.
  - **Konsekuensi estimasi:** ini bagian termahal dari fitur I — jangan dijadwalkan sebagai
    "refactor kecil".
- **Restore:** konfirmasi → panggil endpoint restore → editor me-reload konten; versi pra-restore
  muncul di timeline.

### Dependensi & risiko

- Bergantung pada **A** (autosave backend + documents CRUD). Tanpa dokumen server-side, tidak ada
  yang bisa diversikan.
- Harus sejalan dengan **O** (V3): saat kolaborasi aktif, snapshot diambil server-side dari Y.Doc;
  API dan format tidak berubah.
- Ukuran jsonb: dokumen besar → pertimbangkan kompresi atau penyimpanan diff antar versi interval
  (optimasi lanjutan, tidak perlu di implementasi pertama).

---

## 5. Keputusan

Empat keputusan di bawah sudah diisi dengan posisi default agar implementasi bisa jalan.
Statusnya: **DIPUTUSKAN** = kerjakan sesuai isinya; **BLOCKING EKSTERNAL** = butuh jawaban pihak lain.

Perkembangan per 9 Agustus 2026:

- **5.1 sudah terbukti di kode** — `documents.content` dan `document_versions.content` sama-sama
  ProseMirror JSON, dan diff versi bekerja di atasnya.
- **5.2 belum diuji** — menunggu fitur C yang ditunda.
- **5.3 masih blocking** dan kini satu-satunya penghalang eksternal yang tersisa di seluruh peta.
- **5.4 sudah dijalankan untuk B** (File Library dibangun di writer-hub, di balik lapisan
  repository). Untuk F belum, karena F sendiri belum dikerjakan.

### 5.1 Format konten tersimpan — **DIPUTUSKAN: ProseMirror JSON**

Autosave (A) dan version history (I) sama-sama menyimpan ProseMirror/Tiptap JSON di kolom jsonb.
Yjs update log **tidak** dipakai sebagai format persistensi.

Alasan: kolom `documents.content` sudah jsonb bertipe Tiptap JSON; formatnya bisa dibaca/di-diff tanpa
menjalankan runtime Yjs di server (writer-hub belum punya Yjs server-side sampai V3); dan saat V3
datang, Y.Doc tetap bisa diserialisasi ke JSON yang sama sehingga skema `document_versions` tidak
berubah. Konsekuensi yang diterima: format ini tidak menyimpan riwayat operasi CRDT, jadi merge
otomatis lintas device baru mungkin setelah O — sampai saat itu berlaku strategi last-write-wins
berbasis `updated_at` (§3.A).

### 5.2 File Translator mode file — **DIPUTUSKAN: struktur minimal dulu**

Iterasi pertama menerjemahkan blok teks (heading, paragraf, list) dan **tidak** menjanjikan layout DOCX
penuh. Tabel, header/footer, dan footnote di luar scope rilis pertama, dan UI harus menyatakannya
eksplisit saat upload DOCX.

Alasan: parser DOCX sekarang hanya membaca `document.paragraphs` (`extract/parsers/docx.py:17`), jadi
"layout penuh" berarti menulis ulang parser + penulis DOCX — biaya yang tidak sebanding untuk modul
yang saat ini nol. Jalur nilai tertinggi ada di **translate in place** (dokumen sudah berbentuk node
Tiptap, strukturnya terjaga gratis), jadi prioritaskan mode itu; mode file jadi pelengkap.
Tinjau ulang setelah ada data seberapa sering pengguna menerjemahkan DOCX bertabel.

### 5.3 Similarity service PPE — **BLOCKING EKSTERNAL** (satu-satunya)

Butuh dari tim PPE: base URL + auth, skema request/response, dan apakah service mengembalikan offset
karakter terhadap teks yang dikirim. Tanpa itu integrasi (D) tidak bisa dimulai.

Rencana sementara agar tidak memblokir jalur lain: bangun analyzer plagiarism di belakang **interface
yang sudah dipisah** (`SimilarityProvider`) dengan dua implementasi — heuristik sekarang (default,
berlabel jelas di UI) dan klien HTTP PPE yang aktif bila `SIMILARITY_SERVICE_URL` terisi. Dengan begitu
D dipecah jadi refactor yang bisa dikerjakan sekarang + penyambungan yang menunggu kontrak.
Fitur K (citation-aware) tetap menunggu D karena butuh service yang beneran.

### 5.4 Scope File Library (B) & History sesi (F) — **DIPUTUSKAN: milik writer-hub**

Keduanya dibangun di writer-hub, bukan menunggu Shared Core Platform PPE.

Alasan: keduanya adalah prasyarat langsung fitur lain di roadmap ini (B menopang I, N, O; F menopang
audit hasil modul), dan menunggu platform bersama akan memblokir hampir seluruh urutan §2. Mitigasi
supaya tidak jadi pekerjaan terbuang bila Core Platform akhirnya menyediakannya: taruh akses data di
balik lapisan repository di `apps/api` (`repository/document.ts`, `repository/history.ts`) sehingga
sumber datanya bisa ditukar ke API PPE tanpa menyentuh route atau frontend, dan pakai `owner_id`
dari header `x-pp-user-id` yang sudah jadi kontrak identitas bersama.

**Perlu dikabarkan ke tim PPE** (bukan blocking): rencana ini menambah tabel `documents`,
`document_versions`, `projects`, `user_memories`, dan `glossaries` di database writer-hub.
