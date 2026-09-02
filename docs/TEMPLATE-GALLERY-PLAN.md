# Galeri Template — Rencana

Status: **P0–P4 terimplementasi** (branch `feat/template-gallery`) · P5 belum · Disusun 2 September 2026 · Baseline kode `5cefce6`
(branch `main`)

Dokumen ini merancang **template dokumen**: katalog format siap pakai (skripsi, tesis, paper
IEEE/APA, laporan, flyer) yang dipilih pengguna saat membuat dokumen baru — dan yang sekaligus
memberi tahu AI Chat aturan format apa yang berlaku di dokumen itu.

Dua tujuan yang harus dilayani sekaligus, dan keduanya tidak bisa dipisah:

1. **Manusia** memilih template dari galeri seperti di Google Docs, lalu menyuntingnya bebas.
2. **AI** tahu format yang sedang dipakai, menulis sesuai aturannya, dan bisa diminta memeriksa
   apakah naskah yang ada sudah patuh.

Kalau hanya (1), template cuma kerangka teks yang segera dilupakan begitu penulis mulai
mengetik. Kalau hanya (2), aturannya tidak pernah terlihat sebagai bentuk dokumen. Yang membuat
fitur ini bernilai adalah **satu definisi template yang dibaca dua-duanya**.

---

## 1. Apa yang sudah ada, apa yang belum

Dirangkum dari pemeriksaan kode, bukan dari dokumen lain — beberapa baris di
`docs/GOOGLE-DOCS-GAP-EDITOR-SHELL.md` sudah tertinggal dari kode.

### Sudah ada dan langsung bisa dipakai template

| Kemampuan | Di mana |
|---|---|
| Ukuran kertas (11 preset + kustom), orientasi, margin, warna halaman, mode pageless | `features/editor/page-geometry.ts` |
| Section break dengan tata letak sendiri (kertas, orientasi, margin, **jumlah kolom**) | `features/editor/section-break.ts` |
| Kolom mengalir beserta perhitungan potongannya | `features/editor/columns.ts` |
| Header/footer per varian (`default`/`first`/`even`) dengan token `{page}` | `features/editor/page-furniture/` |
| Footnote, TOC block, tabel penuh atribut, math, callout, code block | `features/editor/` |
| Heading 1–9, indent, spasi baris & antar-paragraf, font & ukuran | `features/editor/` |
| Impor/ekspor DOCX termasuk header/footer & section | `features/document/docx/` |
| 34 tool editor yang bisa dipanggil model (`set_page_setup`, `set_columns`, `insert_toc`, `apply_paragraph_style`, …) | `packages/shared/src/tools.ts` |
| Konverter Markdown → ProseMirror **di sisi server** | `apps/api/src/services/drafts/markdown-doc.ts` |
| Tipografi per template: huruf badan + gaya judul 1-9, berlaku di kanvas dan ikut ke DOCX | `packages/shared/src/typography.ts`, `features/editor/typography-css.ts`, `features/document/docx/typography-styles.ts` |
| Judul yang selalu membuka lembar baru (BAB, Abstrak, Daftar Pustaka) — kanvas, cetak, dan DOCX | `typography.ts` (`pageBreakBefore`, `headingBreakLevels`), `features/editor/pagination.ts` |
| Alat `apply_template_format` — model menerapkan format template ke dokumen yang **sudah ada** | `packages/shared/src/tools.ts`, `features/chat/tools.ts` |
| Blok rancangan HTML terkurung, dua mode: `page` (satu lembar penuh, full-bleed) dan `embed` (sisipan) + tool `insert_html_block` | `features/editor/html-block.ts`, `html-sandbox.ts`, `html-raster.ts` |

Yang terakhir penting: kerangka template bisa ditulis sebagai Markdown biasa lalu dikompilasi
menjadi konten dokumen di server — tidak perlu menulis JSON ProseMirror dengan tangan, dan tidak
perlu konverter kedua.

### Belum ada — dan menentukan seberapa setia template bisa dibuat

| Kekurangan | Template yang terdampak | Akibatnya |
|---|---|---|
| **Tata letak tidak tersinkron ke server** | Semua | `PageSetup` dan perabot header/footer hanya hidup di Y.Doc lokal (`features/sessions/ydoc.ts:155`, `page-furniture-ydoc.ts`). Tabel `document_tabs` cuma punya `content`. Template dua kolom yang dibuat di satu peramban akan kembali polos di peramban lain — dan endpoint draf tidak bisa membuatnya sama sekali. **Ini penghalang utama.** |
| Nomor halaman per section (romawi di bagian awal, arab di isi, mulai ulang) | Skripsi, tesis, disertasi | Halaman awal tidak bisa bernomor `i, ii, iii`. Token `{page}` hanya satu deret lurus. |
| Mesin gaya sitasi (APA/IEEE/ACM) | Semua akademik & paper | `citation-popover` mencari Crossref tapi belum memformat entri. Untuk sekarang gaya sitasi hanya bisa ditegakkan lewat aturan prompt + contoh di kerangka. |
| Custom paragraph style | Semua | Tidak bisa mendefinisikan "Caption Tabel" atau "Kutipan Blok" sebagai gaya bernama; hanya heading 1–9. |
| Hanging indent per blok | APA (daftar pustaka) | Tipografi template sudah bisa menggantungkan satu tingkat judul (`firstLinePt` negatif); yang belum ada adalah menggantungkan blok satuan dari toolbar. |
| Caption otomatis & cross-reference | Akademik, paper | "Tabel 1", "Gambar 2", "lihat Bab 3" harus diketik manual. |
| Nomor baris di margin | Manuskrip Elsevier | Tidak tersedia. |
| TOC dengan nomor halaman otomatis | Skripsi, tesis, laporan | TOC block ada, nomor halamannya belum ikut. |

Blok HTML punya batasnya sendiri, dan itu memang harganya: saat diekspor ia
diratakan menjadi gambar, jadi teks di dalamnya tidak bisa dicari atau disunting
di Word. Ia untuk cetakan promosi — flyer, pamflet, poster — bukan untuk badan
naskah.

Dua modenya berbeda urusan. **`page`** mengisi satu lembar penuh sampai tepi
kertas: tinggi pembungkusnya dikunci ke kotak konten halaman, jadi aturan luapan
yang sudah ada di `pagination.ts` menaruhnya sendirian di satu lembar tanpa
mekanisme pemenggal baru, sementara bingkainya digeser keluar sebesar margin
supaya warnanya sampai tepi. Di DOCX ia menjadi gambar berjangkar ke *kertas*
(`relativeFrom="page"`, offset 0), bukan ke kolom teks — kalau tidak, hasil
ekspornya menyusut ke dalam margin dan tidak lagi serupa dengan kanvas. Isi yang
lebih tinggi dari lembar **dipotong**, tidak dikecilkan, dan editor menandainya.
**`embed`** adalah sisipan yang mengalir bersama naskah; tingginya bisa ditarik
tapi dijepit setinggi satu halaman, karena blok yang melewatinya tidak bisa lagi
diselamatkan paginasi.

Isinya dirender di `<iframe>` berasal unik dengan CSP `default-src 'none'`, jadi
gambar dan font harus tertanam sebagai URI `data:`. Bingkainya diberi
`allow-scripts` **hanya** supaya ia bisa melaporkan tinggi isinya sendiri —
tanpa itu penanda "terpotong" mustahil, sebab asal unik membuat
`contentDocument` tak terbaca dari luar. Yang menahan skrip milik HTML tetap
mati adalah `script-src` yang cuma menerima satu nonce acak per render;
`allow-same-origin` tidak pernah diberikan.

Kekurangan ini **tidak menghalangi rilis** — ia menentukan cara menulis catatan di kartu
template ("nomor halaman romawi di bagian awal belum otomatis") dan mengisi daftar pekerjaan
lanjutan di §8.

---

## 2. Keputusan yang sudah diambil

| Pertanyaan | Keputusan | Konsekuensinya |
|---|---|---|
| Dokumen mengingat template & tata letaknya di mana? | **Kolom baru di database** | Butuh migrasi → **persetujuan terpisah** (`docs/agents.md` §8) sebelum P0 dikerjakan |
| Katalog template disimpan di mana? | **Tabel database sejak awal** | Ada tabel `templates` + endpoint; template bawaan di-seed, template pengguna menyusul di tabel yang sama |
| Galeri muncul sebagai apa? | **Halaman `/new` penuh** | Bisa ditautkan dari mana saja, termasuk dari AI Chat PPE |
| Isi katalog rilis pertama? | **Keempat kategori** | Akademik Indonesia, paper internasional, bisnis & laporan, marketing & cetak |

Satu penyesuaian yang saya usulkan di dalam keputusan "tabel database": **definisi template
bawaan tetap ditulis sebagai kode** (Markdown + spec di `apps/api/src/services/templates/catalog/`),
lalu di-*upsert* ke tabel saat boot berdasarkan `slug`. Alasannya bukan preferensi gaya:
aturan format ikut masuk ke prompt AI dan ke uji, jadi ia harus ikut ter-review di PR yang sama
dengan kodenya. Tabel tetap menjadi satu-satunya tempat runtime membaca template — bawaan dan
buatan pengguna hidup berdampingan dan bisa dikueri bersama.

---

## 3. Bentuk data

### 3.1 Tabel `templates`

```
id          uuid pk
slug        varchar(64) unique      -- 'skripsi-s1', 'ieee-conference'
name        text                    -- "Skripsi (S1)"
description text                    -- satu kalimat untuk kartu galeri
category    varchar(32)             -- academic_id | paper | business | marketing
locale      varchar(8)              -- 'id' | 'en'
spec        jsonb                   -- TemplateSpec (§3.3)
content     jsonb                   -- kerangka ProseMirror hasil kompilasi Markdown
builtin     boolean                 -- true untuk yang di-seed
owner_id    uuid null → identity    -- null untuk bawaan/global
position    integer                 -- urutan di dalam kategori
updated_at, created_at
```

Indeks: `(category, position)` untuk galeri, `(owner_id)` untuk "Template saya".

### 3.2 Kolom baru pada tabel yang sudah ada

```
documents.template_slug   varchar(64) null   -- dokumen lahir dari template mana
documents.layout          jsonb null         -- tata letak dasar dokumen
document_tabs.layout      jsonb null         -- penimpa per tab (mengikuti model ydoc yang ada)
```

Bentuk `layout` sengaja meniru persis apa yang hari ini tersimpan di Y.Doc, supaya sinkronisasi
di P1 hanya memindahkan nilai, bukan menerjemahkan model:

```ts
interface TabLayout {
	pageSetup: PageSetup          // features/editor/page-geometry.ts
	furniture?: PageFurniture     // features/editor/page-furniture/model.ts
}
```

Kolom section (`{ count, gap }`) **tidak** perlu kolom baru: ia sudah menjadi atribut node
`sectionBreak` di dalam konten, jadi sudah ikut tersinkron hari ini.

### 3.3 `TemplateSpec`

Tipe hidup di `packages/shared/src/template.ts` — dibaca `apps/api` (seed, prompt, pemeriksa)
dan `apps/web` (galeri, penerapan).

```ts
interface TemplateSpec {
	layout: {
		pageSetup: PageSetup
		furniture?: PageFurniture
		/** Kolom untuk seluruh badan naskah; diterapkan lewat section break. */
		columns?: { count: number; gap?: number }
		/** Rupa huruf badan dan tiap tingkat judul; ikut ke `documents.layout`. */
		typography?: DocumentTypography
	}
	format: {
		citationStyle: 'apa7' | 'ieee' | 'acm' | 'vancouver' | 'none'
		/** Penomoran judul: "BAB I" (bab-romawi), "1.1" (decimal), "I." (roman-section), atau tanpa nomor. */
		headingScheme: 'bab-romawi' | 'decimal' | 'roman-section' | 'plain'
		abstractWords?: [number, number]
		language: 'id' | 'en'
	}
	/** Bagian yang membentuk kerangka; `required` dipakai pemeriksa kepatuhan (P5). */
	structure: Array<{ heading: string; level: number; required: boolean; hint?: string }>
	/** Instruksi bahasa Inggris yang disuntik ke system prompt AI Chat. */
	aiRules: string[]
	/** Catatan jujur untuk kartu galeri: bagian format yang belum otomatis. */
	caveats?: string[]
}
```

`DocumentTypography` hidup terpisah di `packages/shared/src/typography.ts`, dan
template hanya menuliskan yang ia pedulikan — `resolveHeadingStyle` melengkapi
sisanya. Satu penyelesai dipakai dua pembaca sekaligus: lembar gaya kanvas
(`features/editor/typography-css.ts`) dan gaya DOCX
(`features/document/docx/typography-styles.ts`), supaya layar dan berkas ekspor
tidak bisa berbeda diam-diam.

```ts
interface DocumentTypography {
	baseFont: { family: string; sizePt: number }
	/** Spasi dokumen (1 / 1,5 / 2), bukan `line-height` CSS. */
	lineHeight: number
	paragraph?: BlockStyleOverride
	headings?: Partial<Record<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9, BlockStyleOverride>>
}
```

Ukurannya dalam pt — satuan yang sama dengan kotak ukuran font di toolbar dan
dengan `w:sz` di DOCX, jadi angka yang ditulis template adalah angka yang dibaca
pengguna dan angka yang diekspor.

`aiRules` adalah jantung tujuan (2). Contoh untuk IEEE:

```ts
aiRules: [
	'This document follows the IEEE conference format: two columns, 10pt body.',
	'Number top-level sections with Roman numerals (I. INTRODUCTION), subsections with A., B.',
	'Cite as bracketed numbers in order of first appearance: [1], [2]. Never use author-year.',
	'The reference list is numbered in citation order, not alphabetical.',
	'Keep the abstract to one paragraph of 150-250 words, followed by Index Terms.',
]
```

---

## 4. Katalog rilis pertama

30 template, empat kategori. Kolom "Tata letak" adalah yang diterapkan otomatis; kolom
"Catatan" menyebut bagian yang masih manual karena keterbatasan di §1.

### 4.1 Akademik Indonesia (`academic_id`)

| Template | Tata letak | Struktur inti | Sitasi | Catatan |
|---|---|---|---|---|
| **Skripsi (S1)** | A4, margin 4/3/3/3 cm, TNR 12, spasi 1,5 | Judul · Pengesahan · Pernyataan orisinalitas · Abstrak ID+EN · Kata pengantar · Daftar isi/tabel/gambar · BAB I Pendahuluan (Latar belakang, Rumusan, Tujuan, Manfaat, Batasan) · BAB II Tinjauan Pustaka · BAB III Metodologi · BAB IV Hasil dan Pembahasan · BAB V Penutup · Daftar Pustaka · Lampiran | APA 7 | Nomor halaman romawi di bagian awal belum otomatis |
| **Tesis (S2)** | sama | Skripsi + Kerangka teori terpisah, abstrak lebih panjang | APA 7 | idem |
| **Disertasi (S3)** | sama, spasi 2 | Tesis + Novelty/kontribusi, ringkasan disertasi | APA 7 | idem |
| **Proposal penelitian** | A4, margin 4/3/3/3 cm | BAB I–III + Jadwal penelitian (tabel) + Daftar Pustaka | APA 7 | — |
| **Laporan kerja praktik / magang** | A4, margin 4/3/3/3 cm | Profil instansi · Pelaksanaan · Pembahasan · Penutup · Lampiran (logbook) | APA 7 | — |
| **Laporan praktikum** | A4, margin 3 cm | Tujuan · Dasar teori · Alat & bahan · Prosedur · Data pengamatan (tabel) · Pembahasan · Kesimpulan | Vancouver | — |
| **Makalah kuliah** | A4, margin 3 cm | Cover · Pendahuluan · Pembahasan · Penutup · Daftar Pustaka | APA 7 | — |
| **Artikel jurnal nasional** | A4, margin 2,5 cm, satu kolom | Judul · Abstrak ID+EN + kata kunci · Pendahuluan · Metode · Hasil dan Pembahasan · Simpulan · Ucapan terima kasih · Daftar Pustaka | APA 7 | Format tiap jurnal berbeda; ini bentuk umum |

### 4.2 Paper internasional (`paper`)

| Template | Tata letak | Struktur inti | Sitasi | Catatan |
|---|---|---|---|---|
| **IEEE conference** | Letter, margin atas 1,9 cm / bawah 2,54 / kiri-kanan 1,59, **2 kolom** gap 0,5 cm, TNR 10pt | Title · Authors · Abstract · Index Terms · I. Introduction · II. Related Work · III. Method · IV. Results · V. Conclusion · References | IEEE `[1]` | — |
| **IEEE journal (Transactions)** | sama, badan 10pt | + Nomenclature, Appendix, Biography | IEEE | — |
| **APA 7 — student paper** | A4/Letter, margin 1 inci, spasi ganda, TNR 12 | Title page (judul, penulis, afiliasi, mata kuliah, dosen, tanggal) · Abstract · Body (5 tingkat heading) · References | APA 7 | Hanging indent daftar pustaka masih manual |
| **APA 7 — professional paper** | sama + running head di header | Title page + Author Note · Abstract · Body · References | APA 7 | idem |
| **ACM (sigconf)** | Letter, 2 kolom, 9pt | Title · Authors · Abstract · CCS Concepts · Keywords · Body · References | ACM Ref | — |
| **Springer LNCS** | A4, satu kolom, margin lebar | Title · Authors & affiliations · Abstract · Keywords · Body bernomor · References | Springer | — |
| **Manuskrip jurnal (Elsevier)** | A4, satu kolom, spasi ganda | Title page · Highlights · Abstract · Keywords · Introduction · Methods · Results · Discussion · References | Vancouver | Nomor baris di margin belum ada |
| **Extended abstract** | A4, satu kolom, 2 halaman | Title · Abstract · Motivation · Approach · Preliminary results · References | IEEE | — |

### 4.3 Bisnis & laporan (`business`)

| Template | Tata letak | Struktur inti | Catatan |
|---|---|---|---|
| **Proposal proyek** | A4, margin 2,5 cm | Ringkasan eksekutif · Latar belakang · Ruang lingkup · Pendekatan · Jadwal (tabel) · Anggaran (tabel) · Tim · Syarat & ketentuan | — |
| **Laporan bulanan** | A4, margin 2,5 cm | Ringkasan · Pencapaian vs target (tabel) · Metrik utama · Kendala · Rencana bulan depan | — |
| **Laporan kuartalan** | A4 | Ringkasan eksekutif · Kinerja per lini · Analisis · Risiko · Rekomendasi | — |
| **Notulen rapat** | A4, margin 2 cm | Info rapat (tanggal, tempat, peserta) · Agenda · Pembahasan · Keputusan · Tindak lanjut (tabel: item, PIC, tenggat) | — |
| **Memo internal** | A4 | Kepada / Dari / Tanggal / Perihal · Isi · Tindakan yang diminta | — |
| **Surat resmi** | A4, margin 3 cm | Kop · Nomor, Lampiran, Perihal · Alamat tujuan · Salam pembuka · Isi · Salam penutup · Tanda tangan & tembusan | Kop surat sebagai header halaman |
| **Surat lamaran kerja** | A4, margin 2,5 cm | Data pelamar · Tujuan · Isi (posisi, alasan, ringkasan pengalaman) · Lampiran berkas | — |
| **CV / Resume (ATS)** | A4, satu kolom, margin 1,5 cm | Nama & kontak · Ringkasan · Pengalaman · Pendidikan · Keahlian · Sertifikasi | Sengaja satu kolom agar terbaca ATS |
| **SOP** | A4, margin 2,5 cm | Tujuan · Ruang lingkup · Definisi · Tanggung jawab · Prosedur (langkah bernomor) · Referensi · Riwayat revisi (tabel) | — |
| **Rencana bisnis ringkas** | A4 | Ringkasan · Masalah & solusi · Pasar · Model bisnis · Kompetisi · Proyeksi keuangan · Tim | — |

### 4.4 Marketing & cetak (`marketing`)

| Template | Tata letak | Struktur inti | Catatan |
|---|---|---|---|
| **Flyer A5** | A5 potret, margin 1 cm, satu kolom | Headline · Subheadline · 3 manfaat · Ajakan bertindak · Kontak | — |
| **Flyer A4** | A4 potret, margin 1,5 cm | idem, dengan ruang gambar besar | — |
| **Brosur lipat tiga** | A4 **lanskap**, 3 kolom gap 1 cm, 2 halaman | Sisi luar: sampul, kontak, penutup · Sisi dalam: masalah, solusi, paket harga | Lipatan hanya diwakili kolom |
| **Poster A3** | A3 potret, margin 2 cm | Judul besar · Visual · Detail acara · QR/kontak | — |
| **One-pager produk** | A4, 2 kolom | Nama produk · Ringkasan · Fitur utama · Spesifikasi (tabel) · Harga · CTA | — |
| **Newsletter** | A4, 2 kolom, margin 2 cm | Kepala terbitan (edisi & tanggal di header) · Artikel utama · Berita singkat · Agenda | — |
| **Press release** | A4, satu kolom, spasi 1,5 | "UNTUK SIARAN SEGERA" · Judul · Kota, tanggal · Isi · Kutipan narasumber · Boilerplate · Kontak media | — |
| **Company profile ringkas** | A4, margin 2 cm | Tentang kami · Visi & misi · Layanan · Klien · Kontak | — |

Ditambah satu kartu **"Dokumen kosong"** yang selalu berada di posisi pertama — jalur cepat ke
perilaku "Dokumen baru" yang ada sekarang.

---

## 5. Alur

### 5.1 Membuat dari galeri

```
/new  ─pilih template─▶  POST /api/v1/documents { templateSlug }
                                │  server menyalin content + layout + template_slug
                                ▼
                         /d/<documentId>  ─tarik ke sesi lokal─▶  editor
```

Halaman `/d/<documentId>` yang dibangun untuk serah-terima draf dipakai ulang apa adanya: ia
sudah tahu cara menarik dokumen server ke sesi lokal lalu membuka editornya.

### 5.2 Membuat dari AI Chat PPE

`POST /api/v1/drafts` menerima `templateSlug`. Dokumen lahir dengan tata letak dan kerangka
template, lalu naskahnya ditulis di latar belakang **dengan `aiRules` template ikut di prompt** —
bukan prompt umum. Satu permintaan "buatkan skripsi bab 1 tentang X" karena itu menghasilkan
dokumen yang sudah berformat skripsi, bukan teks polos yang perlu dirapikan sesudahnya.

### 5.3 AI mengetahui format dokumen yang sedang dibuka

1. `documents.template_slug` ikut terbaca saat dokumen dimuat.
2. `apps/web` mengirimkannya di badan permintaan chat.
3. `apps/api` memuat `spec.aiRules` dan menyisipkannya ke system prompt, sesudah blok memori
   gaya dan sebelum panduan tool — jadi aturan template menang atas preferensi umum pengguna,
   tapi tetap tunduk pada permintaan eksplisit di pesan.
4. Tool baca baru `get_template_rules` supaya model bisa menanyakan aturan lengkapnya saat
   perlu memeriksa sesuatu, tanpa seluruh spec dijejalkan ke setiap giliran.

---

## 6. Halaman `/new`

Mengikuti bentuk yang sudah dikenal dari Google Docs, dengan kosakata visual WritingHub:

- **Kepala halaman**: judul "Mulai dokumen baru", kolom pencarian, tombol kembali.
- **Sidebar kategori**: Semua · Akademik · Paper · Bisnis · Marketing · Template saya (P5).
- **Grid kartu**: pratinjau halaman pertama, nama, satu baris keterangan. Kartu pertama selalu
  "Dokumen kosong".
- **Pratinjau kartu dirender langsung dari `content` template** dengan skala kecil, bukan aset
  gambar. Alasannya: aset gambar akan basi diam-diam setiap kali kerangka template disunting,
  dan tidak ada yang akan menyadarinya sampai pengguna mengeluh.
- **Detail sebelum membuat**: klik kartu membuka panel samping berisi pratinjau besar, struktur
  bab, gaya sitasi, dan `caveats` — barulah tombol "Pakai template ini".

Catatan jujur di kartu (`caveats`) bukan hiasan: template skripsi yang tidak menyebut bahwa
nomor halaman romawi masih manual akan menghasilkan laporan bug, bukan kepuasan.

---

## 7. Rencana bertahap

| Fase | Isi | Berkas utama | Prasyarat |
|---|---|---|---|
| **P0** | Migrasi: tabel `templates`, kolom `documents.template_slug`, `documents.layout`, `document_tabs.layout` | `apps/api/src/db/schemas/template.ts`, migrasi drizzle | **Persetujuan migrasi** |
| **P1** | Sinkronisasi tata letak lokal ↔ server: `PageSetup` + perabot ikut disimpan dan ditarik | `features/sync/sync-context.tsx`, `features/sessions/ydoc.ts`, `services/tabs/*`, `services/documents/*` | P0 |
| **P2** | Katalog + seed + API: `GET /templates`, `GET /templates/:slug`, `POST /documents { templateSlug }` | `services/templates/{catalog,service,dto,seed}.ts`, `routes/v1/templates.route.ts`, `repository/template.ts` | P0 |
| **P3** | Halaman `/new` + kartu pratinjau + panel detail | `app/new/page.tsx`, `components/templates/*`, `features/templates/*`, proxy `app/api/templates/*` | P2 |
| **P4** | AI sadar template: `aiRules` ke system prompt, `templateSlug` di endpoint draf, tool `get_template_rules` | `services/chat/prompts.ts`, `services/drafts/*`, `packages/shared/src/tools.ts` | P2 |
| **P5** | Pemeriksa kepatuhan format (panel) + "Simpan sebagai template" | `components/panels/format-panel.tsx`, `services/templates/check.ts` | P4 |
| **P6** | Tipografi per template: `DocumentTypography` ikut `documents.layout`, lembar gaya kanvas dibangkitkan darinya, dan gaya DOCX ikut diekspor | `packages/shared/src/typography.ts`, `features/editor/typography-css.ts`, `features/document/docx/typography-styles.ts` | P1 |

P1 adalah pekerjaan yang paling mudah diremehkan dan paling menentukan: **tanpa itu, template
apa pun yang mengatur kertas, margin, atau header hanya hidup di satu peramban.** Kalau
dijadwalkan setelah galeri, galerinya akan terlihat jadi padahal hasilnya tidak bertahan.

## 8. Yang tetap manual sesudah P5

Bukan kegagalan rencana ini, melainkan pekerjaan editor yang berdiri sendiri dan sebaiknya
diprioritaskan terpisah: penomoran halaman per section (romawi → arab), mesin gaya sitasi,
gaya paragraf **bernama** buatan pengguna, hanging indent per blok dari toolbar, caption
otomatis & cross-reference, TOC dengan nomor halaman, serta nomor baris di margin. Sebagian
besar ada di `docs/GOOGLE-DOCS-GAP-EDITOR-SHELL.md`; template hanya membuat kebutuhannya jadi
kentara.

Satu lubang yang baru tertutup: format template dulu **hanya** bisa datang saat
dokumen dilahirkan (dari `/new` atau endpoint draf). Penulis yang membuka
dokumen kosong lalu meminta AI menulis skripsi mendapat naskah berformat benar
di atas halaman berformat salah — margin 1 inci bawaan, bukan 4-3-3-3 — karena
tidak ada satu pun jalan menerapkan format ke dokumen yang sudah ada. Alat
`apply_template_format` menutup itu: satu panggilan menerapkan kertas, margin,
tipografi, dan hentian bab sekaligus dari katalog. Prompt sistem menyuruh model
memanggilnya lebih dulu, sebelum menulis isi.

Satu hal yang **keluar** dari daftar ini: judul yang membuka lembar baru. Ia
kini bagian dari tipografi template (`BlockStyle.pageBreakBefore`), dinyalakan
di seluruh template akademik dan di template bisnis yang berbentuk laporan
panjang — bukan di memo, surat, notulen, dan CV, yang justru rusak kalau tiap
bagiannya dipaksa berhalaman sendiri. Aturannya berlaku per **tingkat** judul,
jadi bab yang ditambahkan penulis besok ikut terkena tanpa perlu membawa
atribut apa pun.

**Penomoran judul (`format.headingScheme`) masih ikut daftar ini.** Nilainya sudah tercatat di
tiap template — `bab-romawi`, `decimal` — tapi belum ada yang menomori judulnya; "BAB I" masih
bagian dari teks di kerangka Markdown, bukan nomor yang dibangkitkan. Ia bersaudara dengan
penomoran halaman per section dan sebaiknya dikerjakan bersamanya.

## 9. Uji

- `packages/shared` — bentuk `TemplateSpec` yang tidak sah ditolak sejak kompilasi; katalog
  bawaan punya uji yang memastikan setiap `slug` unik dan setiap `structure` punya minimal satu
  bagian `required`.
- `apps/api` — seed idempoten (dijalankan dua kali tidak menggandakan baris); kompilasi Markdown
  → ProseMirror tiap template bawaan menghasilkan dokumen yang sah; `POST /documents` dengan
  `templateSlug` yang tidak dikenal membalas 400, bukan membuat dokumen kosong.
- `apps/web` — penerapan `TabLayout` ke Y.Doc menghasilkan `PageSetup` yang sama persis dengan
  spec; pratinjau kartu tidak melempar untuk seluruh katalog.
- P1 punya ujinya sendiri: putar-balik `layout` (simpan → tarik → bandingkan) untuk dokumen dan
  tab, termasuk perabot header/footer bervarian.

## 10. Keputusan yang masih terbuka

1. **Gaya sitasi** — cukup aturan prompt + contoh di kerangka (murah, tidak menjamin), atau
   mesin format sungguhan berbasis CSL (mahal, menjamin)? Ini menentukan apakah template APA/IEEE
   boleh mengklaim "sesuai format" atau hanya "kerangka sesuai format".
2. **Template organisasi** — siapa yang boleh membuat template global untuk seluruh tenant PPE?
   Sekarang `owner_id` hanya membedakan bawaan vs milik pengguna.
3. **Bahasa antarmuka template** — nama dan kerangka dwibahasa (skripsi ID, IEEE EN) sudah
   ditetapkan lewat `locale`, tapi galeri belum memutuskan apakah menyaring menurut bahasa
   pengguna atau menampilkan semuanya.
4. **Batas jumlah template pengguna** per akun, kalau P5 jadi dikerjakan.
