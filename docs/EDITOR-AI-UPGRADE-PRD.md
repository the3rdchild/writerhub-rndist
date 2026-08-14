# WritingHub - PRD: Tata Letak Halaman & AI Mastermind

Status: **Draft untuk ditinjau** · Disusun 12 Agustus 2026 · Baseline kode `d9cf567` (branch `main`).

Dokumen ini merinci delapan fitur baru: lima di sisi editor (tata letak halaman, telusuri menu,
penggaris kiri, heading 9 tingkat, setelan daftar isi) dan tiga di sisi AI Chat (progres SSE,
pengaman giliran percakapan, perluasan tools/skills).

PRD ini berdiri sendiri dan **tidak** menggantikan `docs/FEATURE-GAP-PRD.md` - fitur A–O di sana
tetap berjalan dengan penomorannya. Penomoran di sini (A1–A5, B1–B3) baru dan tidak bertabrakan.

---

## 0. Ringkasan fitur

| # | Fitur | Nomor asal permintaan | Keadaan sekarang | Ukuran |
|---|---|---|---|---|
| **A1** | Penyiapan halaman (ukuran kertas, warna halaman, margin, *apply to*, pageless) | 5 | Parsial - hanya A4/Letter, global per pemakai | Besar |
| **A2** | Telusuri menu ("cari 'ruler' di bilah menu") | 6 | Belum ada | Sedang |
| **A3** | Penggaris kiri (vertikal) | 7 | Belum ada - penggaris baru horizontal | Sedang |
| **A4** | Heading sampai 9 tingkat | 8 | Belum ada - 3 tingkat di UI, 6 di skema | Sedang |
| **A5** | Setelan daftar isi + blok TOC di naskah | 9 | Parsial - panel navigasi saja | Besar |
| **B1** | SSE bertahap untuk AI Chat (proses terlihat) | 1 | Parsial - SSE ada, prosesnya tak terlihat | Sedang |
| **B2** | Pengaman giliran percakapan | 2 | Belum ada - bug nyata | Kecil-sedang |
| **B3** | Perluasan tools & skills AI (termasuk riset web terbatas) | 3 | Parsial - 8 tools | Besar |

Prasyarat teknis yang mengikat urutan: **A1 memindahkan penyiapan halaman ke naskah**, dan A3
serta A5 (nomor halaman) membaca hasil itu. **A4 mengubah skema heading**, dan A5 (filter tingkat)
serta kerangka dokumen membaca hasil itu. **B2 memperbaiki bug** dan tidak bergantung pada apa pun.

---

## 1. Keadaan sekarang (baseline terverifikasi)

| Area | Berkas | Keadaan |
|---|---|---|
| Geometri halaman | `apps/web/features/editor/page-geometry.ts` | Satu sumber kebenaran; hanya `a4` & `letter`; margin dalam piksel 96 dpi; `clampMargins` menjaga area teks minimum |
| Tempat penyimpanan | `apps/web/features/settings/settings-context.tsx:34` | `pageSize`, `pageOrientation`, `pageMargins` hidup di `Settings` → localStorage `writer-hub-settings`. **Milik pemakai, bukan milik naskah** |
| Pemilihan kertas | `apps/web/components/layout/menu-bar.tsx:191` | Submenu "Ukuran kertas" dengan dua butir. Tidak ada dialog penyiapan halaman |
| Paginasi | `apps/web/features/editor/pagination.ts` | Plugin ProseMirror; `computeSpacers` memenggal isi memakai `contentHeight` |
| Penggaris | `apps/web/components/editor/document-ruler.tsx` | Horizontal saja: margin kiri/kanan, indentasi paragraf, lebar kolom tabel, posisi gambar. Snap 1/16 inci |
| Heading | StarterKit bawaan (`extensions.ts:78`) | Skema menerima 1–6; UI hanya 3 (`text-styles.ts:16`); pintasan terdaftar 3 (`shortcuts/registry.ts`) |
| Impor Markdown | `apps/web/features/editor/markdown.ts:178` | Pola `^#{1,6}` - tingkat 7+ tidak dikenali |
| Ekspor DOCX | `apps/web/features/document/export-docx.ts:84` | Peta `HEADING_1..HEADING_6` |
| Daftar isi | `apps/web/components/editor/toc-panel.tsx`, `features/editor/table-of-contents.ts` | Ekstensi Tiptap `TableOfContents` melapor ke storage; panel hanya untuk melompat. **Tidak ada yang disisipkan ke naskah**, tidak ada setelan |
| Kerangka heading | `apps/web/features/editor/use-outline.ts` | Sidebar; dihitung ulang tiap transaksi |
| Cari & ganti | `apps/web/components/editor/search-bar.tsx` | Mencari **isi naskah** - berbeda dari A2 yang mencari **perintah menu** |
| SSE chat | `packages/shared/src/chat.ts:45` | Event `delta` / `tool_call` / `tools_unsupported` / `done` / `error` |
| Alur giliran | `apps/web/features/chat/chat-context.tsx:138` | `runTurn` rekursif, maksimal 4 putaran alat baca; alat tulis berhenti jadi kartu aksi |
| Tools | `packages/shared/src/tools.ts:32` | 8 alat: 3 baca (`get_outline`, `read_section`, `find_text`), 5 tulis |
| Proksi LLM | `apps/api/src/services/chat/service.ts` | `POST /api/v1/chat`, stream langsung ke provider, mundur ke protokol blok teks bila `tools` ditolak |
| Model tab/dokumen | `apps/web/features/sessions/ydoc.ts:44` | `TabMeta` (id, title, emoji, language, comments, updatedAt) dan `DocMeta` (id, title, tabOrder, …) di dalam Y.Doc. Milik pemakai disimpan terpisah di `local-view.ts` |

---

## 2. Keputusan produk yang mengikat

1. **Penyiapan halaman adalah milik naskah, bukan preferensi pemakai.** Ia pindah dari
   localStorage ke Y.Doc. Alasannya sama dengan alasan komentar ada di Y.Doc: begitu dokumen
   dibagikan, dua orang tidak boleh melihat dokumen yang sama pada ukuran kertas yang berbeda.
   Zoom, mode fokus, dan tampil/sembunyi penggaris tetap milik pemakai.
2. **Cakupan "Terapkan ke"** - hanya dua nilai:
   - *Seluruh dokumen*: semua tab pada dokumen aktif.
   - *Dokumen terpilih*: tab yang sedang dibuka saja.
   **Tidak ada section break** (ukuran kertas berbeda antar-halaman dalam satu tab). Itu di luar
   cakupan (§8) dan bukan yang diminta.
3. **Heading: tampil 5, tersedia 9.** Toolbar dan menu Format menampilkan Judul 1–5; tingkat 6–9
   dijangkau lewat papan tik dan didokumentasikan di dialog "Pintasan papan tik".
4. **Daftar isi jadi dua hal berbeda**: blok TOC di dalam naskah (baru, punya setelan, ikut
   tercetak) dan panel navigasi (yang sudah ada, tetap). Keduanya membaca sumber heading yang sama.
5. **Alat tulis AI tetap butuh Apply.** Perluasan tools tidak melonggarkan aturan ini; alat yang
   mengubah tata letak dokumen (mis. ukuran kertas) diperlakukan sebagai alat tulis.
6. **Riset web dibatasi**: hanya `web_search` + `fetch_url` lewat proksi server dengan daftar
   izin, batas ukuran, dan kuota. Tidak ada peramban headless.

---

## 3. Bagian A - Editor

### A1. Penyiapan halaman

#### A1.1 Masalah

Ukuran kertas hari ini adalah pengaturan aplikasi, bukan pengaturan dokumen: membuka dua dokumen
berbeda memaksa keduanya memakai kertas yang sama, dan mengubah kertas untuk satu naskah diam-diam
mengubah semua naskah lain. Selain itu pilihannya hanya dua, margin cuma bisa diseret di penggaris
(tidak bisa diketik angkanya), warna halaman tidak ada, dan tidak ada cara menulis tanpa
pemenggalan halaman.

#### A1.2 Model data

```ts
// apps/web/features/editor/page-geometry.ts
export interface PageSetup {
  size: PageSizeId          // 'a4' | 'letter' | … | 'custom'
  /** Hanya untuk size: 'custom'. Piksel 96 dpi, seperti seluruh modul ini. */
  customWidth?: number
  customHeight?: number
  orientation: PageOrientation
  margins: PageMargins
  /** Warna lembar; null = mengikuti tema (putih di terang, abu gelap di gelap). */
  pageColor: string | null
  /** true = kanvas menerus tanpa pemenggalan halaman. */
  pageless: boolean
}
```

Penyimpanan (menyusul keputusan §2.1):

| Tingkat | Tempat | Isi |
|---|---|---|
| Dokumen | `DocMeta.pageSetup` di `ydoc.ts` | Setelan bawaan dokumen; dipakai tab yang tidak menimpanya |
| Tab | `TabMeta.pageSetup` (opsional) | Hanya terisi bila pengguna memilih "Dokumen terpilih" |
| Pemakai | `Settings.defaultPageSetup` di localStorage | Bawaan untuk dokumen **baru**; ditulis lewat tombol "Setel sebagai default" |

Resolusi saat render: `tab.pageSetup ?? doc.pageSetup ?? user.defaultPageSetup ?? DEFAULT`.
Menerapkan ke seluruh dokumen menulis `DocMeta.pageSetup` **dan menghapus** `TabMeta.pageSetup`
di semua tab - kalau tidak, tab yang pernah ditimpa akan diam-diam mengabaikan perintah pengguna.

Migrasi: saat dokumen lama dimuat pertama kali dan `DocMeta.pageSetup` kosong, nilainya diisi dari
`Settings` yang ada sekarang (`pageSize`, `pageOrientation`, `pageMargins`) supaya tidak ada
dokumen yang tiba-tiba berganti tata letak. Ketiga field lama di `Settings` disimpan sebagai
`defaultPageSetup` lalu tidak lagi dibaca oleh kanvas.

#### A1.3 Katalog ukuran kertas

`PAGE_SIZES` diperluas (piksel 96 dpi, potret):

| Id | Label | px | Asal |
|---|---|---|---|
| `letter` | Letter (8,5" × 11") | 816 × 1056 | sudah ada |
| `tabloid` | Tabloid (11" × 17") | 1056 × 1632 | baru |
| `legal` | Legal (8,5" × 14") | 816 × 1344 | baru |
| `statement` | Statement (5,5" × 8,5") | 528 × 816 | baru |
| `executive` | Executive (7,25" × 10,5") | 696 × 1008 | baru |
| `folio` | Folio (8,5" × 13") | 816 × 1248 | baru |
| `a3` | A3 (297 × 420 mm) | 1123 × 1587 | baru |
| `a4` | A4 (210 × 297 mm) | 794 × 1123 | sudah ada |
| `a5` | A5 (148 × 210 mm) | 559 × 794 | baru |
| `b4` | B4 (250 × 353 mm) | 945 × 1334 | baru |
| `b5` | B5 (176 × 250 mm) | 665 × 945 | baru |
| `custom` | Ukuran khusus | dari `customWidth/Height` | baru |

Batas ukuran khusus: 3–48 inci per sisi, tetap tunduk pada `MIN_CONTENT_WIDTH`/`MIN_CONTENT_HEIGHT`.

#### A1.4 Dialog "Penyiapan halaman"

Dibuka dari **File → Penyiapan halaman…** (menggantikan submenu "Ukuran kertas") dan dari menu
konteks penggaris. Satu dialog, satu tombol OK - bukan penerapan langsung, karena mengubah kertas
me-repaginasi seluruh naskah dan pratinjau langsung pada tiap ketukan terasa kacau.

| Kolom | Kontrol | Catatan |
|---|---|---|
| Terapkan ke | Pilihan: *Seluruh dokumen* (bawaan) / *Dokumen terpilih* | "Dokumen terpilih" = tab aktif; labelnya menyebut judul tab supaya tidak ambigu |
| Orientasi | Radio: Tegak / Mendatar | Sudah ada di `Settings`, kini per dokumen |
| Ukuran kertas | Dropdown + dua isian untuk *Ukuran khusus* | Menampilkan dimensi dalam satuan aktif |
| Warna halaman | Contoh warna + pemilih (memakai `color-picker.tsx` yang sudah ada) | Termasuk "Ikuti tema" |
| Margin | Empat isian angka: Atas, Bawah, Kiri, Kanan | Satuan cm atau inci; dua arah dengan penggaris |
| - | Tombol *Setel sebagai default* | Menulis `Settings.defaultPageSetup` |
| - | Tombol *Batal* / *OK* | |

Satuan (cm/inci) jadi preferensi pemakai baru di `Settings.measurementUnit`, dipakai bersama oleh
dialog ini, penggaris, dan indentasi TOC (A5).

#### A1.5 Mode pageless

| Aspek | Berhalaman | Pageless |
|---|---|---|
| Plugin `Pagination` | aktif | nonaktif (tanpa penyisipan spacer) |
| Lebar teks | `contentWidth` dari kertas | lebar jendela dikurangi margin kiri/kanan, dibatasi maksimum agar tetap terbaca |
| Nomor halaman | sesuai setelan | disembunyikan, kontrolnya dinonaktifkan |
| Sisipan pemisah halaman | boleh | butirnya dinonaktifkan; pemisah yang sudah ada disimpan (tidak dihapus) dan kembali berlaku saat pageless dimatikan |
| Penggaris atas/kiri | penuh | penggaris atas menampilkan margin kiri/kanan; penggaris kiri disembunyikan (tidak ada tinggi halaman untuk digambar) |
| Warna halaman | mewarnai lembar | mewarnai seluruh kanvas |
| Cetak & ekspor PDF/DOCX | apa adanya | dipaginasi ulang memakai ukuran kertas & margin yang tersimpan, dengan pemberitahuan di dialog ekspor |
| Blok TOC nomor halaman | tersedia | dimatikan otomatis (lihat A5) |

Mode ini disimpan di `PageSetup.pageless` (jadi ikut dokumen), dan bisa dijangkau cepat lewat
**Tampilan → Pageless**.

#### A1.6 Dampak lintas modul

- `document-canvas.tsx` - geometri tidak lagi dari `useSettings()`, melainkan dari hook baru
  `usePageSetup()`; menambahkan latar warna halaman dan cabang pageless.
- `pagination.ts` - opsi plugin harus bisa dimatikan tanpa membongkar editor.
- `document-ruler.tsx` - sumber margin berubah; penulisan margin masuk ke Y.Doc.
- `export-docx.ts` / `export-pdf-dialog.tsx` / `export-docx-dialog.tsx` - ekspor bertab banyak
  kini bisa punya geometri berbeda per tab; ekspor gabungan memakai geometri dokumen.
- CSS cetak - ukuran `@page` mengikuti kertas tersimpan, bukan konstanta.
- Riwayat versi & snapshot berbagi - `PageSetup` ikut dipotret supaya pemulihan versi juga
  memulihkan tata letaknya.

#### A1.7 Kriteria terima

1. Mengubah kertas di dokumen A tidak mengubah dokumen B, dan bertahan setelah muat ulang.
2. "Dokumen terpilih" hanya mengubah tab aktif; tab lain di dokumen sama tidak bergerak.
3. Margin yang diketik di dialog langsung terlihat di penggaris, dan sebaliknya, tanpa pembulatan
   yang menggeser nilai (toleransi < 0,01 cm bolak-balik).
4. Ukuran khusus di luar batas ditolak dengan pesan, bukan menghasilkan lembar tanpa area teks.
5. Pageless: tidak ada pemenggalan halaman di layar, tetapi ekspor PDF tetap berhalaman.
6. Warna halaman ikut ke ekspor PDF dan cetak; teks tetap kontras di tema gelap.
7. Dokumen lama (dibuat sebelum fitur ini) tampil persis seperti sebelumnya setelah migrasi.

---

### A2. Telusuri menu

#### A2.1 Masalah

Menu bar sekarang berisi puluhan butir yang ditulis langsung sebagai JSX di `menu-bar.tsx`
(761 baris). Pengguna yang tahu nama fitur - "ruler", "daftar isi", "pageless" - tidak punya cara
menemukannya selain membuka menu satu per satu, dan tidak ada satu pun struktur data yang bisa
dicari.

#### A2.2 Prasyarat: registri perintah

Fitur ini pada dasarnya adalah refaktor. Semua butir menu, tombol toolbar, dan perintah tanpa UI
didaftarkan di `apps/web/features/commands/registry.ts`:

```ts
export interface Command {
  id: string                    // 'view.ruler'
  label: string                 // 'Tampilkan penggaris'
  /** Jejak menu untuk ditampilkan sebagai remah: ['Tampilan'] */
  path: string[]
  keywords?: string[]           // ['ruler', 'garis', 'penggaris', 'margin']
  icon?: ReactNode
  shortcutId?: ShortcutId       // dibaca dari shortcuts/registry.ts
  run: (ctx: CommandContext) => void
  enabled?: (ctx: CommandContext) => boolean
  checked?: (ctx: CommandContext) => boolean
}
```

`MenuBar` lalu dirender **dari** registri ini, sehingga tidak mungkin ada perintah yang bisa
diklik tapi tidak bisa dicari - masalah yang sama yang dulu diselesaikan `shortcuts/registry.ts`
untuk label pintasan.

#### A2.3 Perilaku

- Pemicu: ikon kaca pembesar di bilah menu berlabel "Telusuri menu", pintasan `Alt+/`
  (`Option+/` di macOS), dan mengetik `/` di kotak pencarian membatasi ke perintah saja.
- Pencocokan: subsekuens kabur pada label, jejak menu, dan kata kunci. Kata kunci wajib berisi
  istilah bahasa Inggris yang lazim ("ruler", "table of contents", "page setup") karena pengguna
  mencari dengan istilah yang mereka kenal dari Google Docs.
- Hasil menampilkan: ikon, label, remah jejak menu, dan pintasan (dari registri pintasan).
- Enter menjalankan; perintah nonaktif tampil redup dengan alasannya (mis. "butuh teks terpilih").
- Lima perintah terakhir tampil saat kotak masih kosong (disimpan di `local-view.ts`, milik pemakai).
- Aksesibilitas: `role="combobox"` + `aria-activedescendant`, navigasi panah, Esc menutup dan
  mengembalikan fokus ke editor.

#### A2.4 Di luar cakupan A2

Mencari isi naskah (sudah ada di `search-bar.tsx`), mencari dokumen di File Library, dan
mencari bantuan/dokumentasi.

#### A2.5 Kriteria terima

1. Setiap perintah yang bisa diklik di menu bar muncul di hasil pencarian (diuji dengan tes yang
   membandingkan registri dengan menu yang dirender - bukan diperiksa manual).
2. Mengetik "ruler" menemukan "Tampilkan penggaris"; "kertas" dan "page setup" menemukan
   "Penyiapan halaman".
3. Menjalankan perintah dari pencarian memberi hasil yang identik dengan mengkliknya di menu.
4. Label pintasan di hasil pencarian selalu sama dengan yang tampil di menu.

---

### A3. Penggaris kiri (vertikal)

#### A3.1 Perilaku

Batang vertikal di sisi kiri lembar, tampil bersama penggaris atas dan tunduk pada setelan
`showRuler` yang sudah ada.

- Menggambar skala inci/cm sesuai `measurementUnit`, dengan asal (0) di tepi atas lembar.
- Dua penanda seret: **margin atas** dan **margin bawah**, dengan arsiran yang membedakan area
  teks dari margin - konsisten dengan penggaris atas.
- Seret menempel di 1/16 inci; `Shift` untuk gerak halus; panah atas/bawah menggeser saat penanda
  difokuskan (pola yang sama sudah dipakai `document-ruler.tsx`).
- Pengetatan margin dibatasi `clampMargins` + `MIN_CONTENT_HEIGHT`, jadi area teks tidak pernah
  hilang.
- Skala ikut zoom; posisi digambar dalam piksel dokumen lalu dikalikan zoom.
- Pada dokumen berhalaman, penggaris berulang mengikuti tiap halaman yang terlihat (asal skala
  kembali ke 0 di tiap lembar), sehingga angkanya tetap bermakna saat menggulir.
- Disembunyikan pada mode pageless (§A1.5).

Sasaran tambahan (tabel, gambar) **tidak** dipasang di penggaris kiri pada fase ini; sumbu
vertikal untuk gambar dicatat sebagai kelanjutan.

#### A3.2 Catatan implementasi

Logika seret, snap, dan clamp diangkat dari `document-ruler.tsx` menjadi modul bersama
(`features/editor/ruler-drag.ts`) supaya kedua penggaris tidak menyimpan dua salinan aturan yang
bisa berselisih. `PageMargins` sudah punya `top`/`bottom`, jadi tidak ada model data baru.

#### A3.3 Kriteria terima

1. Menyeret margin atas menggeser awal teks di semua halaman dan memicu paginasi ulang.
2. Nilai yang dihasilkan seret identik dengan yang diketik di dialog Penyiapan halaman.
3. Margin tidak bisa diseret sampai area teks lebih pendek dari `MIN_CONTENT_HEIGHT`.
4. Pada zoom 50% dan 200%, penanda tetap sejajar dengan batas teks sebenarnya.

---

### A4. Heading sampai 9 tingkat

#### A4.1 Masalah dan batasan HTML

Skema saat ini menerima heading 1–6 (bawaan StarterKit), UI menawarkan 3, dan HTML hanya punya
`<h1>`–`<h6>`. Tingkat 7–9 karena itu perlu keputusan rendering yang eksplisit.

**Keputusan:** node `heading` menerima `level: 1..9`. Tingkat 1–6 dirender `<h1>`–`<h6>`;
tingkat 7–9 dirender `<div class="heading" role="heading" aria-level="7|8|9" data-level="…">`.
Pembaca layar tetap membacanya sebagai judul, dan gaya visualnya tetap satu tangga di bawah
tingkat sebelumnya.

#### A4.2 Perubahan yang diperlukan

| Tempat | Perubahan |
|---|---|
| `extensions.ts` | `StarterKit.configure({ heading: { levels: [1..9] } })` + `parseHTML`/`renderHTML` khusus untuk 7–9 |
| `text-styles.ts` | `PARAGRAPH_STYLES` jadi Teks biasa + Judul 1–5 (yang tampil); daftar penuh 1–9 diekspor terpisah untuk dipakai pintasan dan TOC |
| `editor-toolbar.tsx` | Dropdown gaya paragraf menampilkan 6 butir; tanpa submenu tambahan |
| `menu-bar.tsx` (Format → Gaya paragraf) | Sama: 6 butir |
| `shortcuts/registry.ts` | `para.heading1..para.heading9`, `Mod-Alt-1` … `Mod-Alt-9`, kategori "Paragraf", owner `editor` |
| `shortcuts-dialog.tsx` | Otomatis menampilkan sembilan baris karena dibangun dari registri |
| `markdown.ts` | Impor: `#{1,6}` tetap (Markdown tidak mengenal lebih); ekspor/salin tingkat 7–9 turun ke `######` dengan teks utuh |
| `export-docx.ts` | 1–6 ke `HeadingLevel.HEADING_1..6`; 7–9 ke paragraf bergaya tebal berukuran menurun dengan level kerangka (`outlineLevel`) yang benar |
| `use-outline.ts`, `toc-panel.tsx` | Indentasi sampai sembilan tingkat; batasi lekukan agar judul dalam tidak terdorong keluar panel |
| `globals.css` | Ukuran & bobot untuk `.heading[data-level='7'..'9']` |

#### A4.3 Kriteria terima

1. `Ctrl+Alt+7` mengubah paragraf jadi Judul 7 dan `Ctrl+Alt+0`/Judul→Teks biasa mengembalikannya.
2. Dialog "Pintasan papan tik" mencantumkan Judul 1 sampai Judul 9, dengan kombinasi yang benar
   di Windows/Linux maupun macOS.
3. Toolbar dan menu Format hanya menampilkan Judul 1–5.
4. Judul 7–9 muncul di kerangka dokumen, panel TOC, dan blok TOC dengan lekukan yang benar.
5. Ekspor DOCX membuka di Word tanpa peringatan, dengan judul 7–9 berada di tingkat kerangka yang
   sesuai.
6. Dokumen lama tidak berubah tampilannya.

---

### A5. Setelan daftar isi

#### A5.1 Bentuk fitur

Dua hal, dipisah tegas:

- **Blok TOC** - node baru yang benar-benar ada di dalam naskah, ikut tercetak dan terekspor.
  Disisipkan lewat **Sisipkan → Daftar isi**, perintah garis miring (`/toc`), dan alat AI.
- **Panel TOC** - yang sudah ada; tetap sebagai alat navigasi, tidak ikut tercetak.

#### A5.2 Node dan atributnya

```ts
interface TocBlockAttrs {
  /** Tampilan: teks polos, bertitik, atau tautan biru bergaya web. */
  style: 'plain' | 'dotted' | 'link'
  showPageNumbers: boolean
  /** Pengisi antara judul dan nomor halaman. */
  tabLeader: 'none' | 'dots' | 'dashes' | 'line'
  /** Rentang tingkat heading yang ikut. */
  minLevel: number   // 1..9
  maxLevel: number   // 1..9
  /** Lekukan per tingkat, dalam satuan aktif (disimpan piksel 96 dpi). */
  indentPerLevel: number
}
```

Bawaan: `style: 'dotted'`, `showPageNumbers: true`, `tabLeader: 'dots'`, `minLevel: 1`,
`maxLevel: 3`, `indentPerLevel: 0,5 cm`.

Isi blok **dihasilkan**, bukan diketik: node view membacanya dari sumber heading yang sama dengan
kerangka dokumen (`use-outline.ts`), sehingga tidak ada dua kebenaran. Node menyimpan atribut dan
potret terakhir (untuk cetak dan ekspor), bukan teks yang bisa disunting bebas.

#### A5.3 Nomor halaman

Nomor halaman dibaca dari keadaan plugin paginasi (`paginationKey`), yang sudah menghitung
pemenggalan. Karena itu:

- Pada mode pageless, `showPageNumbers` dinonaktifkan dengan penjelasan singkat di panel setelan.
- Nomor tidak ikut berubah pada tiap ketukan; ia disegarkan saat blok disisipkan, saat pengguna
  menekan **Segarkan**, dan saat dokumen dicetak/diekspor.

#### A5.4 UI di dalam editor

Bilah kecil di sudut blok saat kursor berada di dalamnya (pola yang sama dengan
`table-controls.tsx`):

- **Segarkan** - menghitung ulang dari heading terkini.
- **Tiga titik** - menu: *Setelan daftar isi…*, *Salin sebagai teks*, *Ubah jadi teks biasa*,
  *Hapus*.

Dialog setelan berisi persis kolom di §A5.2: Format (Teks polos / Bertitik / Tautan),
Tampilkan nomor halaman, Tampilkan pengisi tab (Tidak ada / `…` / `- - -` / `---`), rentang
tingkat heading, dan lekukan per tingkat dalam cm.

#### A5.5 Kriteria terima

1. Menyisipkan blok TOC pada dokumen berisi judul 1–9 menghasilkan daftar yang menghormati filter
   tingkat dan lekukan yang disetel.
2. Mengubah judul lalu menekan Segarkan memperbarui teks dan nomor halaman; tanpa Segarkan, isi
   blok tidak berubah sendiri saat mengetik.
3. Nomor halaman cocok dengan nomor yang tampil di lembar dan dengan hasil ekspor PDF.
4. Gaya "Tautan" menghasilkan butir yang bisa diklik untuk melompat, di dalam editor maupun di
   PDF hasil ekspor.
5. Pengisi tab merentang persis sampai kolom nomor halaman pada lebar teks berapa pun.
6. Pada pageless, opsi nomor halaman mati dan daftarnya tetap benar tanpa nomor.

---

## 4. Bagian B - AI Chat

### B1. SSE bertahap: proses yang terlihat

#### B1.1 Masalah

Jalur SSE sudah ada, tetapi satu-satunya hal yang terlihat pengguna adalah teks jawaban. Saat
model memanggil alat baca, `runTurn` bisa berputar sampai empat kali (`chat-context.tsx:179`) -
selama itu layar hanya menampilkan jawaban yang berhenti, tanpa keterangan apa pun. Pada dokumen
panjang, jeda ini bisa puluhan detik dan tidak bisa dibedakan dari aplikasi yang menggantung.

#### B1.2 Protokol

`ChatStreamEvent` di `packages/shared/src/chat.ts` bertambah:

| Event | Isi | Kegunaan |
|---|---|---|
| `status` | `phase: 'connecting' \| 'thinking' \| 'reading' \| 'writing' \| 'retrying'`, `detail?: string` | Menyalakan baris langkah di UI |
| `reasoning` | `text: string` | Ringkasan penalaran bila provider mengirimkannya (`reasoning_content`); dilewati bila tidak |
| `tool_start` | `id`, `name`, `arguments` | Dikirim klien ke lini masa saat alat baca mulai dijalankan |
| `tool_result` | `id`, `summary: string`, `ok: boolean` | Ringkasan pendek, bukan isi penuh |
| `usage` | `promptTokens?`, `completionTokens?` | Ditampilkan halus di kaki giliran |
| `ping` | - | Denyut tiap 15 detik supaya proksi tidak memutus koneksi menganggur |

Event lama (`delta`, `tool_call`, `tools_unsupported`, `done`, `error`) tidak berubah bentuknya,
jadi klien lama tetap jalan. Klien mengabaikan event yang tidak dikenalnya.

#### B1.3 UI

Lini masa di atas jawaban yang sedang mengalir, satu baris per langkah, dengan ikon keadaan
(berjalan / selesai / gagal) dan durasi:

```
✓ Membaca kerangka dokumen            0,4 dtk
✓ Membaca bagian "Metodologi"         0,6 dtk
⟳ Menyusun jawaban…
```

- Langkah yang selesai menciut jadi satu baris; menekannya membuka argumen dan ringkasan hasil.
- Setelah giliran selesai, seluruh lini masa menciut jadi "3 langkah · 2,1 dtk" yang bisa dibuka.
- Putaran alat yang mentok di batas (`MAX_TOOL_ROUNDS`) muncul sebagai langkah eksplisit
  "Batas penelusuran tercapai", bukan diam-diam berhenti.
- Tombol Hentikan tetap membatalkan lewat `AbortController` yang sudah ada.

#### B1.4 Kriteria terima

1. Setiap giliran yang memanggil alat menampilkan minimal satu baris langkah sebelum teks jawaban
   muncul.
2. Tidak ada jeda lebih dari 2 detik tanpa perubahan di layar selama giliran berjalan.
3. Koneksi yang menganggur 60 detik tidak putus (denyut bekerja di balik proksi).
4. Provider yang tidak mengirim `reasoning_content` tidak menghasilkan baris kosong.
5. Menekan Hentikan menghentikan aliran dan menandai langkah berjalan sebagai dibatalkan.

---

### B2. Pengaman giliran percakapan

#### B2.1 Diagnosis

Gejala yang dilaporkan - "sudah pernah chat dan ada hasilnya, lalu chat lagi dengan prompt berbeda,
tapi AI malah meneruskan tugas sebelumnya" - punya tiga penyebab yang bisa ditunjukkan di kode:

1. **Seluruh riwayat dikirim ulang apa adanya.** `runTurn` mengirim `messages` lengkap, termasuk
   pesan `tool` dan `toolCalls` dari giliran-giliran lama. Bagi model, permintaan alat yang belum
   berbuah hasil terbaca sebagai pekerjaan yang belum selesai, dan ia melanjutkannya.
2. **Tidak ada batas tugas.** Tidak ada penanda apa pun yang memisahkan "tugas selesai" dari
   "tugas berjalan"; percakapan hanyalah satu deret pesan yang makin panjang.
3. **Kartu aksi lama tidak pernah kedaluwarsa.** Alat tulis dari giliran sebelumnya tetap
   tersimpan di `ChatTurn.actions` dan tetap bisa ditekan Apply, sehingga hasil tugas lama bisa
   masuk ke naskah di tengah tugas baru.

Ada pula bug kecil yang memperparahnya: pada `chat-context.tsx:165`, giliran yang berakhir tanpa
teks dan tanpa panggilan alat langsung `return` - pesannya tidak pernah masuk riwayat, jadi model
melihat pertanyaan pengguna tanpa jawaban dan cenderung mengulang pekerjaan.

#### B2.2 Mekanisme

| # | Mekanisme | Rincian |
|---|---|---|
| 1 | **Batas tugas eksplisit** | Setiap pesan pengguna membuka `taskId` baru. Semua giliran asisten, pesan alat, dan kartu aksi ditandai `taskId`-nya |
| 2 | **Pemadatan riwayat** | Yang dikirim ke provider: pesan pengguna & jawaban asisten dari tugas-tugas lama (dipangkas), **tanpa** pesan `tool` dan `toolCalls` lama. Rincian alat hanya utuh untuk tugas yang sedang berjalan |
| 3 | **Kedaluwarsa kartu aksi** | Saat tugas baru dibuka, kartu aksi tugas sebelumnya yang belum diterapkan berubah jadi nonaktif dengan label "Dari permintaan sebelumnya", dan butuh satu klik konfirmasi untuk tetap diterapkan |
| 4 | **Penegasan di prompt sistem** | Blok tetap: *"Bagian riwayat di bawah `--- permintaan baru ---` adalah tugas yang sedang berjalan. Jangan melanjutkan tugas sebelumnya kecuali pengguna merujuknya."* |
| 5 | **Anti-terap-ganda** | `toolCallId` yang sudah pernah diterapkan dicatat; menekan Apply untuk id yang sama tidak menulis dua kali |
| 6 | **Perbaikan giliran kosong** | Giliran tanpa isi tetap masuk riwayat sebagai penanda "tidak ada jawaban", bukan hilang tanpa jejak |
| 7 | **Kendali pengguna** | Tombol "Mulai topik baru" di kepala panel (mengosongkan konteks tugas tanpa menghapus transkrip) dan penanda visual pemisah tugas di transkrip |

#### B2.3 Kriteria terima

1. Prompt baru yang tidak berhubungan tidak pernah menghasilkan kelanjutan tugas sebelumnya -
   diuji dengan skenario: minta ringkasan, lalu minta tabel; keluarannya harus tabel saja.
2. Kartu aksi dari tugas sebelumnya tidak bisa diterapkan tanpa konfirmasi tambahan.
3. Menekan Apply dua kali pada kartu yang sama hanya mengubah naskah sekali.
4. Riwayat yang dikirim ke provider pada giliran ke-N tidak memuat pesan `tool` dari tugas lama
   (diuji langsung pada fungsi perakit pesan).
5. Transkrip di layar tetap utuh - pemadatan hanya memengaruhi apa yang dikirim, bukan apa yang
   dibaca pengguna.

---

### B3. Perluasan tools & skills

#### B3.1 Tujuan

Menjadikan AI Chat mampu mengoperasikan dokumen ini seutuhnya - termasuk tata letaknya - bukan
hanya menyisipkan teks. Aturan `read` dijalankan langsung / `write` butuh Apply
(`tools.ts:9-15`) tetap berlaku tanpa pengecualian.

#### B3.2 Alat baru

**Baca (dijalankan langsung):**

| Nama | Fungsi |
|---|---|
| `get_document_stats` | Jumlah kata, karakter, halaman, heading per tingkat, jumlah tabel/gambar/rumus |
| `get_selection` | Teks yang sedang disorot beserta posisinya |
| `get_page_setup` | Ukuran kertas, margin, orientasi, pageless yang berlaku |
| `list_tabs` | Daftar tab pada dokumen aktif |
| `read_tab` | Membaca naskah tab lain (mis. untuk menyusun ringkasan lintas bab) |
| `get_comments` | Komentar yang belum selesai, untuk ditindaklanjuti |

**Tulis (butuh Apply):**

| Nama | Fungsi |
|---|---|
| `set_page_setup` | Ukuran kertas, orientasi, margin, warna halaman, pageless - cakupan `document` atau `tab` (A1) |
| `insert_toc` | Menyisipkan blok TOC dengan setelan tertentu (A5) |
| `set_toc_options` | Mengubah setelan blok TOC yang sudah ada |
| `insert_mermaid` | Menyisipkan blok diagram Mermaid (mesinnya sudah ada: `lazy-mermaid.ts`) |
| `insert_table` | Tabel berukuran tertentu, dengan atau tanpa baris kepala |
| `apply_paragraph_style` | Menerapkan gaya paragraf/heading 1–9 pada rentang tertentu |
| `format_text` | Tebal/miring/garis bawah/sorot/warna pada rentang yang cocok persis |
| `restructure_section` | Memindahkan, menaikkan/menurunkan tingkat, atau menghapus satu bagian |
| `insert_image` | Gambar dari URL yang lolos penyaring `fetch_url` |
| `create_tab` | Tab baru berisi naskah awal (mis. lampiran) |

**Penalaran & perencanaan:**

| Nama | Kind | Fungsi |
|---|---|---|
| `plan` | read | Menuliskan rencana bertahap yang **terlihat pengguna** sebagai daftar langkah di lini masa B1; langkah dicentang saat selesai |
| `think` | read | Ruang penalaran singkat tanpa efek samping; isinya diringkas di lini masa, tidak ditempel ke naskah |

**Riset web (fase terakhir, terbatas):**

| Nama | Kind | Fungsi |
|---|---|---|
| `web_search` | read | Pencarian lewat satu penyedia yang dikonfigurasi di server; mengembalikan judul, URL, dan cuplikan |
| `fetch_url` | read | Mengambil satu halaman lewat proksi server dan mengembalikannya sebagai teks bersih |
| `cite_source` | write | Menyisipkan sitasi dari hasil riset; menyambung ke pencarian Crossref yang sudah ada |

Pengaman untuk dua alat pertama, semuanya di sisi server (`apps/api`), tidak pernah di browser:

- Hanya `http`/`https`; alamat privat/loopback/link-local ditolak setelah resolusi DNS (SSRF).
- Batas ukuran unduhan dan batas waktu; pengalihan diikuti maksimal tiga kali dan divalidasi ulang.
- Daftar izin/tolak domain yang bisa diatur, plus kuota per pengguna per hari.
- Isi halaman disisipkan ke percakapan dengan penanda **konten tak tepercaya** - instruksi di
  dalamnya tidak boleh diperlakukan sebagai perintah.
- Sakelar admin untuk mematikan riset web sepenuhnya.

#### B3.3 Skills

Skill = satu paket berisi instruksi sistem tambahan + himpunan alat yang relevan, dipilih pengguna
dari kotak chat (mis. `@susun-makalah`). Set awal:

| Skill | Isi |
|---|---|
| Susun dokumen | Merancang kerangka, membuat heading, menyisipkan blok TOC, mengatur kertas & margin |
| Buat diagram | Mengubah uraian jadi Mermaid, memilih jenis diagram yang tepat |
| Rapikan format | Menyeragamkan gaya paragraf, heading, penomoran, dan spasi |
| Riset & sitasi | `web_search` + `fetch_url` + `cite_source`, dengan kewajiban mencantumkan sumber |

Skill bersifat aditif dan tidak pernah memperluas izin: alat tulis di dalam skill tetap butuh Apply.

#### B3.4 Kriteria terima

1. "Ubah dokumen ini jadi A3 mendatar dengan margin 2 cm" menghasilkan satu kartu aksi yang, saat
   diterapkan, mengubah tata letak persis - dan bisa diurungkan dengan satu Ctrl+Z.
2. "Buatkan diagram alur proses ini" menghasilkan blok Mermaid yang benar-benar dirender.
3. "Buat daftar isi sampai judul 3, dengan titik-titik" menghasilkan blok TOC bersetelan tepat.
4. Alat tulis apa pun yang datang dari model tidak pernah menyentuh naskah tanpa Apply.
5. `fetch_url` menolak `http://localhost`, alamat 169.254.x.x, dan pengalihan menuju keduanya.
6. Instruksi yang ditanam di halaman web yang diambil tidak mengubah perilaku asisten (diuji
   dengan halaman uji berisi "abaikan instruksi sebelumnya…").

---

## 5. Perubahan lintas modul (ringkas)

| Berkas | A1 | A2 | A3 | A4 | A5 | B1 | B2 | B3 |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `features/editor/page-geometry.ts` | ● | | ○ | | | | | ○ |
| `features/sessions/ydoc.ts` | ● | | | | | | | ○ |
| `features/settings/settings-context.tsx` | ● | | ○ | | ○ | | | |
| `components/editor/document-canvas.tsx` | ● | | ○ | | ○ | | | |
| `features/editor/pagination.ts` | ● | | | | ○ | | | |
| `components/editor/document-ruler.tsx` | ● | | ● | | | | | |
| `components/layout/menu-bar.tsx` | ● | ● | ○ | ● | ● | | | |
| `components/editor/editor-toolbar.tsx` | | ● | | ● | ○ | | | |
| `features/shortcuts/registry.ts` | ○ | ● | | ● | | | | |
| `features/editor/extensions.ts` | ○ | | | ● | ● | | | ○ |
| `features/editor/markdown.ts` | | | | ● | | | | ○ |
| `features/document/export-docx.ts` | ● | | | ● | ● | | | |
| `features/editor/use-outline.ts` | | | | ● | ● | | | |
| `packages/shared/src/chat.ts` | | | | | | ● | ● | |
| `packages/shared/src/tools.ts` | ○ | | | ○ | ○ | | | ● |
| `features/chat/chat-context.tsx` | | | | | | ● | ● | ● |
| `features/chat/tools.ts` | ○ | | | ○ | ○ | | | ● |
| `apps/api/src/services/chat/service.ts` | | | | | | ● | ● | ● |
| `apps/api` - layanan riset web (baru) | | | | | | | | ● |

● perubahan utama · ○ penyesuaian ikutan

---

## 6. Urutan pengerjaan

| Fase | Isi | Alasan urutan |
|---|---|---|
| 1 | **B2** - pengaman giliran | Memperbaiki cacat yang sudah dirasakan pengguna; tidak bergantung pada apa pun; paling murah |
| 2 | **A1** - penyiapan halaman | Fondasi data (pindah ke Y.Doc) yang dipakai A3 dan A5 |
| 3 | **A4** - heading 1–9 | Mengubah skema; A5 dan kerangka membacanya |
| 4 | **A3** + **A5** - penggaris kiri & setelan TOC | Keduanya bergantung pada fase 2–3; bisa paralel |
| 5 | **B1** - SSE bertahap | Mandiri; sebaiknya mendahului B3 supaya alat baru punya tempat untuk menampilkan progresnya |
| 6 | **A2** - telusuri menu | Butuh registri perintah, dan registri paling baik dibuat setelah semua butir menu baru (A1, A5) ada |
| 7 | **B3** - tools & skills, lokal dulu | Alat dokumen dulu (butuh A1/A5 sudah jadi), riset web paling akhir |

---

## 7. Risiko

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Pemindahan penyiapan halaman ke Y.Doc merusak dokumen lama | Tinggi | Migrasi sekali jalan dengan nilai dari `Settings`; uji muat dokumen lama; `PageSetup` ikut dipotret di riwayat versi |
| Pageless bertabrakan dengan plugin paginasi | Sedang | Plugin dimatikan lewat opsi, bukan dibongkar; uji pindah bolak-balik berhalaman ↔ pageless pada dokumen panjang |
| Heading 7–9 tidak dikenali alat luar (Word, Markdown) | Sedang | Pemetaan turun yang eksplisit + `outlineLevel` di DOCX; didokumentasikan di dialog |
| Refaktor menu jadi registri menyentuh 761 baris JSX | Sedang | Dikerjakan bertahap per menu, dengan tes yang membandingkan registri dan menu terender |
| Nomor halaman TOC melenceng dari lembar | Sedang | Satu sumber dari `paginationKey`; segarkan otomatis sebelum cetak/ekspor |
| Riset web membocorkan jaringan internal (SSRF) | Tinggi | Penyaringan setelah resolusi DNS, daftar izin, hanya di server, sakelar mati |
| Injeksi prompt lewat halaman yang diambil | Tinggi | Penandaan konten tak tepercaya + alat tulis tetap butuh Apply |
| Riwayat yang dipadatkan menghilangkan konteks yang masih dibutuhkan | Sedang | Pemadatan hanya membuang rincian alat tugas lama, bukan pertanyaan/jawabannya; ada tombol "lanjutkan tugas sebelumnya" |

---

## 8. Di luar cakupan

- **Section break** - ukuran kertas/margin berbeda antar bagian di dalam satu tab.
- Header & footer, penomoran halaman kustom (angka Romawi, mulai dari N).
- Kolom teks per bagian (`columns.ts` yang ada tidak diubah).
- Peramban headless / otomasi peramban untuk AI.
- Pencarian dokumen dan bantuan lewat kotak telusuri menu.
- Watermark dan latar bergambar untuk halaman.

---

## 9. Pertanyaan terbuka

1. Warna halaman pada tema gelap: mengikuti warna yang dipilih apa adanya (WYSIWYG, tapi silau di
   malam hari) atau diredupkan di layar dan tetap asli saat dicetak?
2. Blok TOC pada dokumen bertab banyak: apakah perlu opsi "sertakan seluruh tab"?
3. Kuota riset web: per pengguna per hari, atau ikut kuota modul analisis yang sudah ada?
4. `read_tab` membuka naskah tab lain ke konteks model - perlu persetujuan pengguna sekali per
   sesi, atau cukup diperlakukan sebagai alat baca biasa?

---

## 10. Referensi

- `docs/FEATURE-GAP-PRD.md` - peta fitur PRD utama dan status A–O.
- `docs/DOCUMENT-TABS-RESTRUCTURE-PLAN.md` - model dokumen ↔ tab yang dipakai keputusan §2.1.
- `ref/google-docs-clone/src/app/documents/[documentId]/ruler.tsx` - penggaris sederhana sebagai
  pembanding; tidak punya sumbu vertikal maupun penyiapan halaman.
- `ref/ferdocs/package/components/toc/` - pola panel TOC; tidak punya blok TOC di dalam naskah.
- `ref/tiptap/packages/extension-table-of-contents/` - sumber ekstensi TOC yang sudah dipakai.
