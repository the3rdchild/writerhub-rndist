# WritingHub — Rencana: Watermark Halaman

Status: **v1 sudah mendarat (T1–T5)** · ditulis & dikerjakan 9 September 2026
Terkait: [HEADER-FOOTER-PLAN.md](HEADER-FOOTER-PLAN.md) (L2 — perabot halaman tidak tercetak) ·
[RENDER-WORKER-PLAN.md](RENDER-WORKER-PLAN.md) (jalur PDF sisi peladen)

Menu **Sisip → Watermark…** membuka panel di rail kanan; pengguna memilih gambar dari pustaka
Aset atau mengetik teks, lalu mengatur posisi dan ukurannya di kanvas mini. Hasilnya tercetak di
bawah teks pada setiap halaman.

**Keputusan yang sudah diambil:** isi **gambar + teks** · cakupan **per tab** · pengaturan lewat
**kanvas mini di panel** (bukan seret di kertas) · gambar dari **pustaka Aset** yang sudah ada.
Ekspor DOCX dan sumbu per-bagian **di luar v1** — lihat [§6](#6-di-luar-v1).

---

## 0. Ringkasan

|                                       | Keadaan                                                                          |
| ------------------------------------- | -------------------------------------------------------------------------------- |
| Model data watermark                  | **ada** — `PageSetup.watermark`, per tab                                          |
| UI                                    | **ada** — menu Sisip → panel rail dengan kanvas mini                             |
| Lapisan cetak yang berulang per halaman | **terbukti bisa** — diukur, bukan diasumsikan ([§1](#1-temuan-yang-menentukan-bentuk-rencana-ini)) |
| Pustaka gambar                        | **sudah ada** — panel Aset, milik proyek                                          |
| Penyimpanan per tab                   | **sudah ada** — `PageSetup` per tab                                              |
| Jalur ekspor PDF                      | **sudah ada** — rute `/export/[documentId]` + worker                             |

Temuan yang paling menentukan: **watermark lolos dari sumbatan yang menahan header/footer.**
Yang menahan header/footer adalah isinya yang berubah tiap halaman (nomor); watermark isinya
sama persis di semua halaman, dan justru itulah syarat yang dipenuhi mekanisme cetak yang ada.

---

## 1. Temuan yang menentukan bentuk rencana ini

### 1.1 Jebakan yang harus dihindari

[HEADER-FOOTER-PLAN.md §L2](HEADER-FOOTER-PLAN.md) mencatat header/footer **tidak pernah
tercetak**: `SheetFurniture` dirender di dalam `.document-sheet-layer`, dan blok `@media print`
menyembunyikan elemen itu seluruhnya. Watermark yang dibangun sebagai perabot halaman biasa akan
mewarisi cacat yang sama — **cantik di layar, hilang di PDF** — dan watermark yang tidak tercetak
sama saja dengan tidak ada.

### 1.2 Yang diukur

Dua spike dijalankan di kontainer worker (Chromium + `pypdf`), dengan pemanggilan cetak yang
**sama persis dengan produksi** — `page.pdf(print_background=True, prefer_css_page_size=True)`,
[`render_service.py:219`](../services/worker/services/render_service.py). Yang dihitung: jumlah
halaman PDF, halaman yang memuat teks watermark, dan halaman yang memuat XObject gambar.

**Spike 1** — fixture berdiri sendiri, A4 margin 20mm, isi 3 halaman, lapisan `position: fixed`:

| Mode          | Halaman | Halaman ber-teks-wm | Halaman ber-gambar-wm |
| ------------- | ------- | ------------------- | --------------------- |
| tanpa wm      | 3       | 0                   | 0                     |
| teks          | 3       | **3**               | 0                     |
| gambar (data URI) | 3   | 0                   | **3**                 |
| teks + gambar | 3       | **3**               | **3**                 |

Lapisan `fixed` berulang di **tiap** halaman cetak, untuk teks maupun gambar, dan **tidak menambah
halaman** — jumlahnya tetap 3 di semua mode.

**Spike 2** — CSS `@media print` diekstrak apa adanya dari `globals.css`, kerangka DOM menyalin
`document-paper.tsx`, print root sengaja diberi `transform: scale(1.5)`:

| Letak lapisan watermark      | Halaman | Halaman ber-wm |
| ---------------------------- | ------- | -------------- |
| di dalam `.document-print-root` | 2    | **2**          |
| anak `<body>`, di luar print root | 2  | **0**          |

### 1.3 Dua aturan yang lahir dari angka itu

**(a) Lapisan cetak wajib berada DI DALAM `.document-print-root`.** Bukan preferensi gaya:
[`globals.css:2110-2116`](../apps/web/app/globals.css) menyatakan yang boleh dicetak secara
**positif** — hanya print root dan isinya; segala hal lain `display: none`. Watermark di luar itu
lenyap tanpa jejak, persis yang terbaca di baris kedua tabel.

**(b) Lapisan cetak wajib berada DI LUAR `.document-sheet-layer`.** Lapisan lembar disembunyikan
utuh saat mencetak — itulah sumbatan header/footer, dan menaruh watermark di sana berarti
mengulanginya dengan sadar.

### 1.4 Kotak acuannya kotak ISI, bukan kertas

Spike ketiga menempelkan gambar di `left: 0; top: 0` lapisan `fixed` dengan `@page` bermargin
20mm, lalu membaca matriks `cm` sebelum `Do` di aliran isinya. Hasilnya:

```
118.75 0 0 -118.75 237.5 356.25 cm  /X5 Do     →  x = 57pt = 20mm dari tepi kertas
q 237.5 237.5 2007.959 3035.498 re W* n        →  clip = 170 x 257mm = kotak margin
```

Dua hal sekaligus: lapisan `fixed` **menyusut ke kotak margin** (`left: 0` mendarat di garis
margin, bukan di tepi kertas), dan seluruh isi halaman **di-clip** ke kotak itu. Artinya
watermark tidak bisa melebar sampai tepi kertas — bukan karena kita tidak mau, tapi karena
peramban memotongnya.

Konsekuensinya masuk ke model: `scale`, `offsetX`, dan `offsetY` semuanya fraksi **kotak isi**,
dan penyaji layar memakai kotak yang sama walaupun di layar seluruh kertas tersedia. Kanvas mini
menggambar batas margin itu dengan garis putus-putus dan menyebutnya apa adanya — pengguna yang
menata watermark sampai tepi kertas akan mendapatkannya terpotong di PDF, jadi batas itu harus
terlihat sejak awal, bukan ditemukan setelah mencetak.

Watermark sampai tepi kertas menuntut `@page { margin: 0 }` dengan margin disimulasikan sebagai
padding — itu persis arah "kertas ikut kanvas" (T2 di HEADER-FOOTER-PLAN.md) yang belum
dikerjakan. Sampai itu ada, batas ini nyata dan dinyatakan.

Satu kerapuhan yang harus dijaga: `position: fixed` yang terperangkap leluhur ber-`transform`
berhenti berulang. Spike 2 selamat justru **karena** CSS cetak memaksa `transform: none !important`
pada print root. Kalau suatu hari ada `transform`, `filter`, atau `contain` baru di jalur leluhur
saat mencetak, watermark berhenti berulang **tanpa pesan error apa pun**. Karena itu penjaganya
harus PDF sungguhan, bukan uji CSS tekstual — sama alasannya dengan `print-pages.test.ts` ada.

---

## 2. Model data

```ts
export type WatermarkAnchor =
  | 'center' | 'top-left' | 'top' | 'top-right'
  | 'left' | 'right' | 'bottom-left' | 'bottom' | 'bottom-right'
  | 'tile'

export interface Watermark {
  kind: 'text' | 'image'
  /** kind: 'text' */
  text?: string
  /** kind: 'image' - aset milik proyek, bukan berkas yang menempel di dokumen. */
  assetId?: string
  anchor: WatermarkAnchor
  /** Geseran dari jangkar, sebagai fraksi lebar/tinggi KOTAK ISI (lihat §1.4). */
  offsetX: number
  offsetY: number
  /** Lebar watermark sebagai fraksi lebar KOTAK ISI. */
  scale: number
  opacity: number
  rotation: number
}
```

Disimpan sebagai `PageSetup.watermark?: Watermark`, per tab (`setPageSetup(..., 'tab')`).

Alasannya bukan kerapian melainkan ekspor: muatan ekspor sudah membawa `layout.pageSetup` per tab
([`export-document-view.tsx:48`](../apps/web/components/export/export-document-view.tsx)), jadi
menaruh watermark di sana membuat rute ekspor mewarisinya **tanpa satu baris pipa pun**. Model
terpisah berarti satu jalur data baru yang harus diingat setiap kali muatan ekspor berubah.

Cakupan per tab mengikuti model domainnya: satu dokumen adalah wadah berisi 1..n tab, dan tab lain
punya naskahnya sendiri. Label di UI menyebut **"Tab ini: ⟨judul⟩"**, bukan "seluruh dokumen".

---

## 3. Render: dua penyaji, satu model

Layar dan kertas memerlukan penyajian yang berbeda, dan itu **bukan** duplikasi yang bisa
dihindari — keduanya menjawab pertanyaan yang berbeda:

| | Layar | Cetak |
| --- | --- | --- |
| Bentuk | satu salinan **per lembar**, absolut di kotak isi lembar itu | **satu** lapisan `position: fixed` |
| Alasan | lembar di layar adalah kotak nyata yang bisa dituju | peramban yang menggandakan, bukan kita |
| Disembunyikan oleh | `@media print` (ikut aturan lembar yang sudah ada) | `@media screen` |
| Letak | di dalam `.document-sheet-layer` | anak `.document-print-root`, di luar lapisan lembar |

Penyaji layar boleh menumpang di dalam `.document-sheet` bersama `SheetFurniture`: elemen itu
sudah disembunyikan saat mencetak, jadi tidak ada risiko watermark tergambar dua kali.

Keduanya membaca `Watermark` yang sama dan memakai satu fungsi penempatan bersama
(jangkar + geseran + skala + rotasi → CSS), supaya yang terlihat di layar dan yang keluar di PDF
tidak bisa berbeda karena dua rumus yang menyimpang perlahan.

Watermark ditaruh **di bawah teks** (`z-index` di bawah `.document-page-padding`, yang sudah
`z-index: 10`) dan `pointer-events: none` — ia tidak boleh bisa diklik, diseleksi, atau tersalin.

---

## 4. UI

### 4.1 Jalan masuk

- Menu **Sisip → Watermark…** (label menunya "Sisip", bukan "Sisipkan").
- Ikon di **pulau kontekstual** rail — muncul selama panel watermark terbuka, hilang saat ditutup;
  pola yang sama dengan cari & ganti. `PanelId` baru: `'watermark'`.

### 4.2 Panel

Kanvas mini satu halaman dengan rasio `PageSetup` yang berlaku; watermark diseret dan di-resize
**di dalam miniatur itu**, bukan di kertas sungguhan. Alasannya: permukaan sunting tidak tersentuh
sama sekali, jadi tidak ada mode sunting baru, tidak ada handle yang harus hidup di atas teks
padahal watermarknya di bawah teks, dan tidak ada risiko mengganggu pengetikan.

Isi panel: pemilih gambar (dari Aset) atau kolom teks · kanvas mini · jangkar (9 titik + ubin) ·
skala, opasitas, rotasi · label cakupan "Tab ini: ⟨judul⟩" · tombol hapus watermark.

---

## 5. Aset dan ekspor

Gambar dipilih dari pustaka Aset — milik **proyek**, jadi satu logo diunggah sekali lalu dipakai
di semua dokumen proyek itu. Tombol unggah di panel watermark menaruh berkasnya ke pustaka yang
sama; tidak ada jalur unggah kedua yang harus dirawat.

Satu risiko yang harus ditangani di jalur ekspor: pratinjau aset memakai **URL bertanda tangan
berumur pendek** ([`assets-panel.tsx`](../apps/web/components/panels/assets-panel.tsx), yang
menerbitkannya [`apps/api/src/lib/signed-url.ts`](../apps/api/src/lib/signed-url.ts)). Perender PDF berjalan di peladen dan bisa saja tidak berhak, atau URL-nya
sudah kedaluwarsa saat antrean panjang. Karena itu gambar watermark **disematkan sebagai data URI
saat muatan ekspor dibangun**, dengan preseden yang sudah ada di
[`font-embed.ts`](../apps/web/features/editor/font-embed.ts). Spike 1 membuktikan gambar data URI
memang tercetak di tiap halaman.

Konsekuensinya ukuran: data URI menggelembungkan berkas ~33%, jadi gambar watermark perlu batas
ukuran (usul: 2 MB) dengan pesan yang menyebut angkanya, bukan penolakan senyap.

---

## 6. Di luar v1

- **Ekspor DOCX.** Word memakai mekanisme sendiri — bentuk VML di dalam header, bukan lapisan
  halaman. Pekerjaan terpisah; sampai itu ada, ekspor DOCX kehilangan watermarknya dan itu harus
  **dikatakan** di UI ekspor, bukan didiamkan.
- **Sumbu per bagian.** Sampul tanpa watermark, isi ber-watermark. Sumbu kedua ini sudah ada
  presedennya di penomoran halaman, tapi ia menggandakan permukaan UI dan penyimpanan.
- **Varian halaman pertama.** Bentuk yang lebih murah untuk kebutuhan yang sama dengan di atas.

---

## 7. Tahapan

| #  | Tahap                                                                                              | Bergantung pada |
| -- | -------------------------------------------------------------------------------------------------- | --------------- |
| T1 | Uji cetak watermark di harness repo (`print-pages.test.ts`): lapisan berulang per halaman, di dalam print root, di luar lapisan lembar | —               |
| T2 | Model `Watermark` di `PageSetup` + persistensi per tab                                             | —               |
| T3 | Dua penyaji (layar per lembar, cetak `fixed`) + fungsi penempatan bersama                           | T1, T2          |
| T4 | Panel rail + kanvas mini + entri menu Sisip + pulau kontekstual                                     | T2              |
| T5 | Gambar dari pustaka Aset + penyematan data URI di jalur ekspor                                      | T3              |

T1 didahulukan bukan karena tesnya sulit, melainkan karena ia satu-satunya yang bisa memberi tahu
kalau lapisannya berhenti berulang — dan kegagalan itu senyap. Spike di luar repo sudah menjawab
"bisa"; T1 yang menjaganya tetap begitu.

---

## 8. Keputusan terbuka

**Mode tanpa halaman (pageless) — diputuskan.** Kedua penyaji dimatikan di mode ini. Tanpa lembar,
tidak ada kotak isi yang bisa dijadikan acuan, dan kanvas mini akan menggambar halaman yang tidak
ada — watermark yang posisinya ditata terhadap sesuatu yang tidak ada adalah janji yang tidak bisa
ditepati. Panelnya masih terbuka dan setelannya tersimpan; ia muncul kembali begitu mode halaman
dinyalakan.

**Kerapatan ubin (tile).** Berapa salinan per halaman, dan apakah angkanya bisa diatur atau tetap.

**Tampilan baca-saja.** Berbagi dan riwayat versi merender komponen kertas yang sama, jadi
watermark akan ikut muncul di sana secara otomatis. Perlu dipastikan itu memang yang diinginkan —
untuk watermark "RAHASIA" jawabannya hampir pasti ya.
