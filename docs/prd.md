# WritingHub — PRD Induk

Status: **Referensi tetap** · Disusun 25 Agustus 2026 · Baseline kode `66dfe5e` (branch `main`)

Dokumen ini adalah **PRD tingkat produk**: apa yang WritingHub coba jadi, untuk siapa, dan
fitur apa saja yang termasuk di dalamnya beserta tier dan status implementasinya.

Ia **tidak menggantikan** PRD per-fitur yang sudah ada di `docs/`. PRD per-fitur menjawab
*"bagaimana fitur X dibangun"*; dokumen ini menjawab *"fitur apa saja yang ada, kenapa, dan
di mana posisinya sekarang"*. Kalau keduanya berbeda soal detail teknis, **PRD per-fitur yang
menang** — ia lebih dekat ke kode. Indeksnya ada di §8.

---

## 1. Ringkasan produk

WritingHub adalah editor dokumen berbasis AI untuk **Premium Portal Extended (PPE)** dan
**Ransel.ai**.

Masalah yang dipecahkan: hari ini PPE punya beberapa perkakas menulis yang berdiri sendiri —
grammar checker, parafraser, penerjemah berkas, pemeriksa kemiripan. Tiap perkakas punya
kotak teksnya sendiri. Pengguna yang menulis satu naskah harus menyalin naskah itu bolak-balik
antar aplikasi, dan tiap penyalinan membuang format, membuang riwayat, dan membuang konteks.

Jawaban WritingHub: **satu draf sebagai *single source of truth***. Naskahnya tinggal diam di
satu editor; modul-modul AI yang datang menghampiri lewat panel di samping. Parafrase tidak
memindahkan naskah ke aplikasi lain — ia mengusulkan perubahan pada draf yang sedang dibuka,
dan pengguna menerima atau menolaknya per segmen.

Konsekuensi yang paling bernilai dari bentuk ini adalah **aksi lintas modul**: kalimat yang
ditandai mirip oleh pemeriksa plagiarisme bisa dikirim langsung ke parafraser; kalimat yang
terdeteksi tulisan AI bisa dikirim langsung ke humanizer. Tanpa satu draf bersama, fitur
seperti ini tidak mungkin ada.

### Prinsip produk

1. **Satu draf, banyak modul.** Modul tidak pernah memiliki naskah; ia hanya mengusulkan
   perubahan padanya.
2. **Usulan, bukan penimpaan.** Setiap keluaran AI melewati mekanisme terima/tolak yang sama.
   Tidak ada modul yang boleh menulis ke naskah tanpa persetujuan pengguna.
3. **Editor dulu, baru modul.** Editor adalah fondasi; semua modul bersandar padanya. Karena
   itu ia matang lebih dulu, dan fitur yang dulu terhalang ketiadaan editor kini bisa naik tier.
4. **Satu mekanisme untuk satu masalah.** Highlight, diff, streaming, dan pembatalan job
   dibangun sekali sebagai lapisan bersama — bukan diulang di tiap modul.

---

## 2. Pengguna & konteks pemakaian

| Pengguna | Yang ia kerjakan | Yang paling ia butuhkan |
|---|---|---|
| Mahasiswa / peneliti | Skripsi, tesis, paper | Plagiarisme, sitasi, grammar, ekspor DOCX/PDF rapi |
| Penulis konten & pemasaran | Artikel, salinan pemasaran | Parafrase, tone, humanizer, terjemahan |
| Profesional kantor | Laporan, proposal, memo | Tata letak halaman, tabel, ekspor, kolaborasi |
| Penerjemah / editor | Naskah dwibahasa | Terjemahan yang menjaga format, glosarium, tampilan berdampingan |

Konteks penyematan: WritingHub bisa berdiri sendiri **atau** disematkan di dalam shell PPE
yang sudah meneruskan token pengguna. Keduanya harus jalan — lihat §6.

---

## 3. Definisi tier

Tier di bawah ini sudah **di-rebaseline khusus untuk WritingHub**, bukan salinan dev map lama.
Alasannya: di peta lama, rich text editor masih berstatus V1, sehingga banyak fitur ikut
terhalang dan terlempar ke tier atas. Di hub ini editor adalah fondasi dan **wajib ada di
Beta**, jadi fitur yang dulu terhalang — saran inline, sunting hasil parafrase, highlight
plagiarisme — bisa naik ke Beta.

| Tier | Definisi |
|---|---|
| **Beta** | Satu editor + 4 modul utama jalan end-to-end: grammar, parafrase, plagiarisme, terjemahan |
| **V1** | Kedalaman & kendali: mode, tier kualitas, streaming, AI Detector, format & bahasa tambahan |
| **V2** | Analisis tingkat lanjut, Humanizer, dan editor matang |
| **V3** | Kolaborasi, versioning lanjutan, dan perluasan platform |

**Catatan biaya lisensi.** Tiga fitur sengaja ditaruh di tier atas bukan karena sulit secara
konsep, melainkan karena versi bawaan Tiptap-nya **berbayar**: inline comments, version
history, dan track changes. Ketiganya harus dibangun sendiri di atas ProseMirror. Ini alasan
struktural, bukan tebakan effort — perlakukan sebagai batasan tetap saat menjadwalkan.

---

## 4. Cakupan fitur per modul

Kolom **Status** mengikuti `docs/WRITERHUB-POC-STATUS.md` (baseline 14 Agustus 2026):
✅ jalan end-to-end · 🟡 ada tapi belum sesuai visi / masih ada batasan · ⬜ belum ada.

> Status adalah **potret**, bukan kebenaran abadi. Sebelum bersandar pada satu baris,
> periksa ulang `docs/WRITERHUB-POC-STATUS.md` dan `git log`.

### 4.1 Editor Shell (fondasi)

Basis dokumen tunggal yang dipakai semua modul.

| Fitur | Tier | Status | Catatan |
|---|---|---|---|
| Rich text editor | Beta | ✅ | Tiptap 3 + StarterKit, heading 1–9, align, highlight, sub/superscript, list, task list, link |
| Panel switcher / tool rail | Beta | ✅ | 9 modul di rail kanan. Kerja kustom terbesar — inti proposisi nilai hub |
| Input / paste teks | Beta | ✅ | Termasuk paste Markdown otomatis |
| Unggah dokumen | Beta | ✅ | DOCX berformat, PDF teks via worker, TXT; multi-berkas → dokumen baru |
| Autosave & persistensi draf | Beta | ✅ | Snapshot periodik + versi bernama manual |
| Pelingkupan seleksi teks | Beta | ✅ | Aksi modul berlaku ke seleksi atau seluruh dokumen |
| Salin hasil ke clipboard | Beta | ✅ | |
| Pemilih bahasa | Beta | ✅ | Non-Inggris dipaksa ke tier AI |
| Undo / redo lintas modul | Beta | ✅ | Gratis dari ekstensi `history`, asalkan semua modul menulis lewat transaction |
| Markdown & LaTeX | Beta | ✅ | Math inline & blok |
| Dark mode & theming | Beta | ✅ | |
| Ekspor / unduh draf | Beta | 🟡 | DOCX per-section sudah benar. **PDF via cetak browser masih ikut mencetak chrome/panel** (E1, lihat `EXPORT-COLUMNS-PRD.md`) |
| Table of Contents | Beta | ✅ | Nomor halaman belum auto-update saat isi berubah |
| Page setup & section break | Beta | ✅ | Cakupan *This point forward* & *This page only* |
| Footnote | Beta | ✅ | Endnote belum |
| Search & Replace | Beta | ✅ | Dalam satu dokumen |
| Callout / info box | Beta | ✅ | |
| Kanvas halaman + penggaris | Beta | ✅ | |
| Tabel & gambar yang bisa diubah ukurannya | Beta | ✅ | Merge/split sel belum |
| Slash commands | Beta | ✅ | |
| Tab dokumen / multi-tab | Beta | ✅ | Lihat `DOCUMENT-TABS-RESTRUCTURE-PLAN.md` |
| Diagram Mermaid | V1 | ⬜ | Dependensi `mermaid` sudah terpasang; node view belum ada |
| Inline comments | V2 | ✅ | Dibangun sendiri (Tiptap Comments berbayar). Resolve/unresolve + gutter |
| Document version history | V2 | ✅ | Dibangun sendiri (Tiptap Snapshot berbayar). Diff & restore |
| Realtime collaboration | V3 | 🟡 | Yjs aktif per-tab lokal; **sinkronisasi multi-pengguna Hocuspocus belum terpasang** |

### 4.2 Grammar & Spelling Checker

| Fitur | Tier | Status | Catatan |
|---|---|---|---|
| Pemeriksa grammar & ejaan | Beta | ✅ | Standard/Advanced berbasis aturan + tier AI (LLM) |
| Skor kualitas tulisan | Beta | ✅ | grammar / fluency / clarity / engagement |
| Hover untuk terima saran | Beta | ✅ | |
| Kategorisasi kesalahan | V1 | ✅ | All / Grammar / Style / Spelling |
| Hasil streaming real-time | V1 | ✅ | SSE + checkpoint |
| Terima massal per kategori | V1 | ⬜ | Baru ada Accept All, belum per kategori |
| Analisis struktur per paragraf | V2 | ⬜ | Butuh pemahaman konteks seluruh dokumen |
| Analisis tone & keterbacaan | V2 | ⬜ | AI Memory punya preferensi tone, tapi bukan analisis otomatis |

### 4.3 Paraphraser

| Fitur | Tier | Status |
|---|---|---|
| Parafrase teks | Beta | ✅ |
| Parafrase bagian terseleksi | Beta | ✅ |
| Retry / parafrase ulang | Beta | ✅ |
| Sunting hasil sebelum diterapkan | Beta | ✅ |
| Terima / tolak per segmen (diff) | Beta | ✅ |
| Pilih mode parafrase | V1 | ✅ |
| Pilih tier kualitas / model | V1 | ✅ |
| Hasil streaming SSE | V1 | ✅ |
| Beberapa varian saran sekaligus | V2 | ⬜ |

### 4.4 Plagiarism / Similarity Checker

Modul yang paling tertinggal dari janji Beta-nya. **Panel masih heuristik lokal dan belum
tersambung ke service similarity PPE** — tanpa itu, seluruh baris "sumber" di bawah tidak
punya data untuk ditampilkan.

| Fitur | Tier | Status | Catatan |
|---|---|---|---|
| Pemeriksaan kemiripan | Beta | 🟡 | **Belum terintegrasi service similarity PPE** — ini penghalang utama modul ini |
| Highlight kalimat terdeteksi | Beta | ✅ | Intensitas warna sesuai tingkat kemiripan |
| Skor kemiripan keseluruhan | Beta | ✅ | |
| Daftar sumber & cuplikan yang cocok | Beta | ⬜ | Terhalang integrasi service |
| Klik highlight → lompat ke sumber | Beta | ⬜ | Terhalang integrasi service |
| Kirim ke parafraser | Beta | ⬜ | Perutean lintas panel belum ada |
| Ekspor laporan | V1 | ⬜ | |
| Aturan pengecualian (kutipan, pustaka) | V1 | ⬜ | |
| Deteksi sadar sitasi | V2 | ⬜ | Footnote & popover sitasi ada; pembedaannya belum |
| Kemiripan lintas bahasa | V2 | ⬜ | RnD |
| Deteksi plagiarisme terparafrase | V2 | ⬜ | RnD |

### 4.5 File Translator

Cakupan di hub: **dokumen + teks saja**. Lihat §7 untuk yang dikecualikan.

| Fitur | Tier | Status | Catatan |
|---|---|---|---|
| Terjemahan teks | Beta | ✅ | Per seleksi / seluruh dokumen, menjaga format |
| Deteksi bahasa | Beta | 🟡 | Ada di worker; UI masih pemilih manual |
| Daftar bahasa lebih lengkap | Beta | ✅ | `LANGUAGE_OPTIONS` |
| Terjemahan di tempat → tab baru | Beta | ✅ | Hasil jadi versi/tab baru, draf asli utuh |
| Terjemahkan berkas (DOCX/PDF/PPTX) | Beta | ⬜ | Belum bisa unggah berkas untuk diterjemahkan |
| Tombol tukar bahasa | Beta | ⬜ | |
| Riwayat terjemahan | Beta | ⬜ | Riwayat umum ada; riwayat khusus terjemahan belum |
| Mode penerjemah lanjutan | V1 | ✅ | Lewat pemilihan model AI |
| Format dokumen tambahan | V1 | ⬜ | DOC, XLS, XLSX, PPT |
| Tampilan berdampingan | V1 | ⬜ | |
| Glosarium / kunci terminologi | V2 | ⬜ | Lihat `GLOSSARY-MAKER-PLAN.md` |

### 4.6 AI Detector & Humanizer

| Fitur | Tier | Status | Catatan |
|---|---|---|---|
| Skor deteksi AI | V1 | ✅ | Keseluruhan + per kalimat |
| Highlight per kalimat | V1 | ✅ | Memakai ulang lapisan highlight plagiarisme |
| Humanizer | V1/V2 | ✅ | Saran per kalimat |
| Kirim ke humanizer | V2 | ⬜ | Perutean lintas modul belum ada |
| Ekspor laporan deteksi | V2 | ⬜ | |
| Humanizer banyak gaya | V3 | ⬜ | |
| Verify loop dengan AI Detector | V3 | ⬜ | Re-check otomatis setelah humanize |

### 4.7 AI Chat Sidebar

| Fitur | Tier | Status |
|---|---|---|
| Chat dengan konteks dokumen | V1 | ✅ |
| Chat atas seleksi teks | V1 | ✅ |
| Sisipkan hasil chat ke draf | V1 | ✅ (kartu Apply + auto-apply) |
| Pemilih model | V1 | ✅ |
| Preset perintah menulis | V2 | ✅ (tools/commands + slash command) |
| Linimasa langkah AI / visibilitas penalaran | — | ✅ (di luar rencana awal) |
| Rujukan ke File Library / Project | V2 | ⬜ |

### 4.8 Core Platform (dipakai bersama seluruh PPE)

| Fitur | Tier | Status | Catatan |
|---|---|---|---|
| History | Beta | ✅ | Activity log + version history |
| File Library | Beta | 🟡 | `/library` ada, tapi belum jadi pusat aset — masih dokumen per project |
| Cari berdasarkan judul | Beta | ✅ | |
| Projects | V1 | ✅ | CRUD + penetapan dokumen |
| Cari berdasarkan isi | V1 | 🟡 | Search & Replace dalam dokumen ada; pencarian lintas dokumen belum |
| Memory | V1 | ✅ | Tone, bahasa keluaran, glosarium, catatan gaya |
| Berbagi dokumen | V3 | ✅ | Tautan + peran viewer/commenter/editor |

### 4.9 Perhatian lintas-potong

Bukan fitur per modul, melainkan mekanisme bersama. Kalau ini diimplementasi ulang per modul,
itu pelanggaran arsitektur — lihat `docs/design.md` §5 dan `docs/coding_standard.md`.

| Mekanisme | Tier | Status | Catatan |
|---|---|---|---|
| Lapisan highlight terpadu | Beta | ✅ | ProseMirror `Decoration`, dipakai grammar + plagiarisme + AI detector |
| Mesin saran/diff terpadu | Beta | ✅ | Terima/tolak per segmen, satu komponen untuk semua modul |
| Streaming SSE di semua modul | V1 | ✅ | |
| Perutean aksi lintas modul | Beta | 🟡 | AI Chat punya Apply tool actions; **perutean antar panel (mis. plagiarisme → parafraser) belum ada** |
| Pemilih tier kualitas/biaya | V1 | 🟡 | Ada di AI Chat & Proofreader; belum universal |
| Job asinkron + notifikasi | V1 | 🟡 | BullMQ + Redis + cancel + status SSE jalan; notifikasi UI belum dipoles |

---

## 5. Peta user story

`Writer_Hub_User_Stories.docx` (di direktori induk repo) memuat **81 user story**, US-1…US-81,
yang dipetakan satu-satu ke baris fitur di §4. Ia tidak diulang di sini karena akan langsung
usang begitu §4 berubah.

Aturan pemakaian: **§4 adalah daftar fitur yang mengikat; user story adalah rumusan
penerimaannya.** Kalau menulis PR untuk sebuah fitur, sebut nomor US-nya di deskripsi PR,
persis seperti PR yang menyebut nomor bagian PRD (lihat `docs/agents.md`).

---

## 6. Persyaratan non-fungsional

| Aspek | Persyaratan | Status |
|---|---|---|
| **Autentikasi** | Dikendalikan `AUTH_MODE`; `none` untuk pengembangan, `pp` untuk produksi. Jalur produksi tetap utuh di repo saat mode `none` — mengaktifkannya cukup ubah env | ✅ |
| **Kerahasiaan secret** | `PP_API_KEY` tidak boleh sampai ke browser. Browser hanya memanggil route same-origin `/api/*`; route itu yang menandatangani HMAC dan meneruskan | ✅ |
| **Penyematan** | Harus jalan berdiri sendiri (cookie) maupun disemat di shell PPE (header `Authorization`) | ✅ |
| **Proses panjang** | Tidak boleh memblokir UI. Job berat masuk antrean; hasilnya mengalir lewat SSE; harus bisa dibatalkan | ✅ (notifikasi UI 🟡) |
| **Batas waktu job** | `JOB_DEADLINE_SECONDS=300`, `WORKER_CONCURRENCY=2` | ⚠️ **masih tebakan, belum diukur** pada naskah 50 ribu karakter tier AI |
| **Kesetiaan ekspor** | DOCX harus menjaga section, orientasi, dan kolom | ✅ DOCX · 🟡 PDF |
| **Kesetiaan impor** | DOCX harus menjaga format | 🟡 `sectPr` belum dibaca — dokumen Word beda orientasi rata jadi satu section |

---

## 7. Di luar cakupan

Fitur yang ada di sheet `File Translator` tapi **tidak** dibawa ke WritingHub, karena use
case-nya di luar konteks menulis dokumen. Tetap dipegang service File Translator standalone.

| Fitur | Alasan |
|---|---|
| Voice Translation | Masukan suara, bukan alur menyunting dokumen |
| Website Translation | Menerjemahkan halaman web live, bukan draf pengguna |
| Image Translator (OCR) | Kandidat masuk lewat pipeline unggah nanti, tapi bukan bagian roadmap hub |
| On-screen Keyboard | Utilitas masukan, lebih cocok di aplikasi translator |

---

## 8. Indeks dokumen terkait

Dokumen di bawah lebih rinci dan lebih dekat ke kode. **Kalau berbeda dengan dokumen ini soal
detail teknis, mereka yang menang.**

| Dokumen | Isi |
|---|---|
| `PRD - WritingHub - Premium Portal Extended & Ransel.ai.pdf` | PRD asal dari pemangku kepentingan |
| `FEATURE-GAP-PRD.md` | Pemetaan gap fitur terhadap PRD asal + rencana implementasi |
| `WRITERHUB-POC-STATUS.md` | Status POC: 64 jalan / 9 polish / 20 belum |
| `GOOGLE-DOCS-GAP-EDITOR-SHELL.md` | Gap Editor Shell terhadap Google Docs + 8 prioritas teratas |
| `EDITOR-AI-UPGRADE-PRD.md` | Tata letak halaman & AI Mastermind |
| `COLUMNS-PROOFREADER-TOOLS-PRD.md` | Kolom, proofreader, bendera bahasa, perluasan tools (P1–P12) |
| `EXPORT-COLUMNS-PRD.md` | Sisa masalah ekspor & kolom (E1–E6) |
| `DOCUMENT-TABS-RESTRUCTURE-PLAN.md` | Pemodelan Project ▸ Dokumen ▸ Tab |
| `VERSION-HISTORY-PLAN.md` | Version history (fitur I) |
| `HISTORY-PROJECTS-MEMORY-PLAN.md` | History sesi (F), Projects (G), AI Memory (H) |
| `GLOSSARY-MAKER-PLAN.md` | Glosarium Maker (fitur L) |
| `WORKPLAN-P1-P12-DUA-JALUR.md` | Pembagian kerja dua jalur berdasarkan kepemilikan berkas |
| `design.md` | Arsitektur sistem & batas modul |
| `coding_standard.md` | Standar penulisan kode + hasil audit tanggung jawab tunggal |
| `agents.md` | Aturan kerja untuk agen AI di repo ini |

---

## 9. Risiko produk yang terbuka

1. **Plagiarisme adalah janji Beta yang belum ditepati.** Modul ini terhitung Beta, tapi
   intinya — kecocokan terhadap sumber eksternal — belum tersambung ke service similarity PPE.
   Enam fitur turunannya (daftar sumber, klik ke sumber, kirim ke parafraser, ekspor laporan,
   aturan pengecualian, deteksi sadar sitasi) semuanya menunggu integrasi yang sama. Ini
   ketergantungan tunggal dengan dampak terbesar di seluruh papan.

2. **"Terjemahkan berkas" tidak ada, padahal ia fitur utama modulnya.** Terjemahan teks jalan,
   tapi janji "unggah DOCX/PDF/PPTX lalu terjemahkan" belum ada sama sekali.

3. **Perutean lintas modul belum ada, padahal ia proposisi nilai hub.** Alasan utama produk ini
   berbentuk hub adalah kemampuan mengirim segmen antar modul. Sampai "kirim ke parafraser" dan
   "kirim ke humanizer" ada, hub ini masih berupa beberapa perkakas yang kebetulan berbagi
   editor.

4. **Kolaborasi realtime setengah jalan.** Yjs aktif tapi hanya lokal per tab. Bentuk ini bisa
   menyesatkan: kelihatan seperti fondasi kolaborasi sudah ada, padahal service sync + auth-nya
   belum ditulis sama sekali.

5. **Angka batas waktu job belum diukur.** `JOB_DEADLINE_SECONDS=300` dan
   `WORKER_CONCURRENCY=2` masih tebakan. Naskah panjang di tier AI berpotensi kena timeout
   secara diam-diam di produksi.

6. **Ekspor PDF masih mencetak antarmuka.** Untuk produk yang keluarannya dokumen, ekspor yang
   ikut membawa panel dan chrome browser adalah cacat yang terlihat langsung oleh pengguna.
