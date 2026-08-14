# Gap Editor Shell vs Google Docs (yang belum ada di WriterHub POC)

Sumber perbandingan: fitur standar Google Docs web + pemeriksaan codebase `apps/web`.

Daftar ini khusus **Editor Shell** (fungsi dokumen/tata letak), bukan modul AI.

---

## 1. Header, Footer & Nomor Halaman

| Fitur | Status | Catatan |
|-------|--------|---------|
| Header per section | Belum | Editor belum punya model header/footer. |
| Footer per section | Belum | Termasuk footer teks, gambar, atau tabel kecil. |
| Nomor halaman | Belum | Tidak ada field `{page}` / `{numpages}`. |
| Format nomor halaman | Belum | Mulai dari angka tertentu, romawi, atau tanpa nomor di halaman pertama. |
| Different first page | Belum | Header/footer berbeda untuk halaman pertama. |
| Different odd/even | Belum | Header/footer berbeda untuk halaman ganjil/genap. |
| Header/footer image | Belum | Logo atau gambar di header/footer. |

---

## 2. Struktur & Navigasi Dokumen

| Fitur | Status | Catatan |
|-------|--------|---------|
| Custom paragraph styles | Belum | Hanya heading 1–9; belum bisa buat style sendiri (mis. "Caption Tabel"). |
| Outline / navigation pane | Belum | Sidebar navigasi berdasarkan heading yang bisa drag-drop section. |
| Collapse/expand heading | Belum | Menyembunyikan isi heading di outline/editor. |
| Cross-reference | Belum | Insert "Lihat Bab 3" yang update otomatis. |
| Bookmark internal | Belum | Link ke posisi lain dalam dokumen yang sama. |
| Field codes | Belum | Tanggal otomatis, nama file, page count, dsb. |
| TOC dengan page number | Partial | TOC block ada, tapi belum auto-update page number saat konten berubah. |
| Leader dots TOC | Belum | Titik-titik penghubung judul ke nomor halaman. |

---

## 3. Tabel Lanjutan

| Fitur | Status | Catatan |
|-------|--------|---------|
| Merge cells (horizontal/vertical) | Belum | Import DOCX sudah mendeteksi `gridSpan`/`vMerge` tapi belum bisa dirender/di-edit. |
| Split cells | Belum | Membagi satu sel jadi beberapa. |
| Table styles / template | Belum | Preset gaya tabel (grid, light, dark). |
| Borders & shading per cell | Partial | Warna latar cell/header ada; border style (solid/dashed, ketebalan) belum lengkap. |
| Sort table rows | Belum | Urutkan baris berdasarkan kolom. |
| Table formulas | Belum | `=SUM(A1:A5)` di dalam sel. |
| Convert text to table | Belum | Dan sebaliknya. |
| Distribute rows/columns evenly | Belum | Meratakan tinggi baris / lebar kolom. |
| Table caption | Belum | Label otomatis "Tabel 1", "Tabel 2". |

---

## 4. Gambar, Media & Objek

| Fitur | Status | Catatan |
|-------|--------|---------|
| Text wrap / image wrapping | Belum | Gambar mengambang dengan teks mengalir di sampingnya. |
| Image caption | Belum | Caption yang terhubung ke gambar. |
| Image crop / rotate | Belum | Hanya resize yang tersedia. |
| Drawing / shapes | Belum | Kotak, panah, garis, bentuk bebas. |
| Text box | Belum | Kotak teks bebas posisi. |
| Charts | Belum | Grafik dari data (bar, line, pie). |
| Video / audio embed | Belum | YouTube atau file media. |
| Equation editor | Partial | Math block/inline via TeX ada; UI equation builder belum. |
| Special characters / symbol picker | Belum | Dialog sisip simbol. |
| Date/time field auto-update | Belum | Tanggal yang ikut berubah saat dokumen dibuka. |
| Smart chips / mention | Belum | `@nama` yang merujuk orang/file/tanggal. |

---

## 5. Paragraf & Tipografi

| Fitur | Status | Catatan |
|-------|--------|---------|
| Drop cap | Belum | Huruf pertama besar di awal paragraf. |
| Paragraph borders & shading | Belum | Bingkai dan warna latar per paragraf. |
| Keep with next / keep lines together | Belum | Kontrol pagination per paragraf. |
| Widow/orphan control | Belum | Pengaturan baris yatim/piatu. |
| Line numbering | Belum | Nomor baris di margin. |
| Tab stops (left/center/right/decimal) | Belum | Penggaris hanya untuk indent; tab stop belum. |
| Hyphenation | Belum | Pemenggalan kata otomatis. |
| Language per paragraph/selection | Belum | Untuk spellcheck multilingual. |

---

## 6. Referensi & Sitasi

| Fitur | Status | Catatan |
|-------|--------|---------|
| Footnote / endnote | Partial | Footnote ada; endnote (catatan akhir dokumen) belum. |
| Citation manager | Belum | Sitasi APA/MLA/Chicago dengan daftar pustaka otomatis. |
| Bibliography / daftar pustaka | Belum | Generate dari citation. |
| Cross-reference ke heading/figure/table | Belum | "Seperti terlihat pada Gambar 2". |

---

## 7. Kolaborasi & Review

| Fitur | Status | Catatan |
|-------|--------|---------|
| Suggesting mode / track changes | Belum | Perubahan ditandai untuk direview, bukan langsung menimpa. |
| Comment @mention | Belum | Tag orang di komentar. |
| Assign comment | Belum | Menugaskan komentar ke seseorang. |
| Approval workflow | Belum | Minta persetujuan dokumen. |
| Lock / restrict editing | Belum | Dokumen read-only untuk sebagian user. |
| Presence (cursor orang lain) | Belum | Yjs collaboration aktif, tapi belum wired ke multi-user. |

---

## 8. Automasi & Bantuan Menulis

| Fitur | Status | Catatan |
|-------|--------|---------|
| Auto-correct / smart quotes | Belum | Mengganti `"` jadi kutip lengkung otomatis. |
| Auto-link detection | Partial | Link extension ada, tapi auto-deteksi URL saat ketik belum. |
| Auto-list detection | Partial | StarterKit punya input rules; belum sekaya Google Docs. |
| Dictionary / thesaurus | Belum | Klik kanan → definisi / sinonim. |
| Word count per selection | Partial | Word count global ada; per seleksi belum. |
| Accessibility checker | Belum | Peringatan alt text, contrast, heading order. |
| Voice typing | Belum | Input suara. |
| Smart compose / autocomplete | Belum | Saran kata berikutnya. |

---

## 9. Import / Export & Integrasi

| Fitur | Status | Catatan |
|-------|--------|---------|
| Import PDF dengan layout | Belum | PDF hanya ekstrak teks polos via worker. |
| Insert PDF as image | Belum | Preview halaman PDF di dokumen. |
| OCR gambar | Belum | Ekstrak teks dari gambar. |
| Mail merge | Belum | Cetak surat massal dari data. |
| Compare documents | Belum | Diff dua dokumen. |
| Linked objects (Sheet/Slide) | Belum | Embed dan sinkron dari aplikasi lain. |
| Add-ons / plugin | Belum | Sistem ekstensi pihak ketiga. |

---

## 10. Tampilan & Mode

| Fitur | Status | Catatan |
|-------|--------|---------|
| Focus / distraction-free mode | Belum | Mode menulis tanpa UI. |
| Typewriter mode | Belum | Kursor selalu di tengah layar. |
| Split view | Belum | Dua bagian dokumen side-by-side. |
| Zoom presets | Belum | Fit to width, fit to page, dsb. |
| Pageless format | Sudah | Ada di page setup. |
| Print layout | Sudah | Paged canvas + page setup. |

---

## Prioritas yang Paling Terasa (untuk kemiripan Google Docs)

Kalau hanya bisa memilih sedikit untuk dikerjakan dulu:

1. **Header, footer, nomor halaman** — paling sering ditanya untuk dokumen resmi.
2. **Merge/split cells** — tabel kompleks tidak bisa dibuat tanpa ini.
3. **Suggesting mode / track changes** — inti kolaborasi Google Docs.
4. **Custom styles** — supaya dokumen kampus/kantor bisa konsisten.
5. **Cross-reference & field codes** — untuk dokumen akademik/panjang.
6. **Text wrap image** — layout majalah/laporan.
7. **Image caption + table caption** — wajib untuk tugas akhir/paper.
8. **Navigation pane** — dokumen panjang butuh ini.

---

## Catatan untuk Tim Desain

- Slide gap ini paling baik ditampilkan sebagai **tabel 3 kolom** (Fitur | Status | Dampak) atau **heatmap**.
- Prioritas 8 butir di atas bisa dijadikan **roadmap V1 Editor Shell**.
