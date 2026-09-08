# WritingHub — Rencana: Header/Footer & Penomoran Halaman per Bagian

Status: **T3–T6 dan celah ekspor sudah mendarat; tersisa T1–T2 (paginasi)** · diperbarui 8 September 2026
Terkait: [DOCX-IMPORT-GAP-V2.md](DOCX-IMPORT-GAP-V2.md) (V1 — dua mesin paginasi) ·
[DOCX-IMPORT-GAP.md](DOCX-IMPORT-GAP.md) (D8 — isi header/footer) ·
[RENDER-WORKER-PLAN.md](RENDER-WORKER-PLAN.md) (jalur PDF sisi peladen)

Dua permintaan yang digabung karena berbagi fondasi yang sama:

1. **Header/footer beserta UI-nya**, seperti Google Docs (rujukan: dialog *Headers & footers*).
2. **Penomoran halaman per bagian** ala MS Word — halaman depan (pengesahan → daftar isi)
   memakai angka romawi, BAB 1 sampai akhir memakai angka arab mulai dari 1.

**Keputusan yang sudah diambil:** isi header/footer **seperti MS Word** (konten kaya, disunting
langsung di lembar) · satuan **cm** · sampul tanpa nomor ditangani lewat varian halaman pertama
yang **dikosongkan**. Yang masih terbuka hanya urutan pengerjaan — lihat [§6](#6-keputusan-terbuka).

---

## 0. Ringkasan

|                                      | Keadaan                                                                                        |
| ------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Model data header/footer             | **sudah ada** — varian `default/first/even`, token `{page}`, perataan, sinkron ydoc |
| UI untuk menyuntingnya               | **tidak ada sama sekali**                                                                |
| Header/footer di kertas              | **tidak pernah tercetak**                                                                |
| Isi kaya (banyak baris, tebal, logo) | belum — masih satu baris teks polos (= D8)                                                    |
| Penomoran per bagian                 | belum ada                                                                                      |

Temuan yang paling menentukan bentuk rencana ini: **konten yang berubah tiap halaman — yaitu
nomor halaman — tidak bisa dicetak oleh paginasi peramban.** Konsekuensinya dibahas di
[§2](#2-mengapa-fitur-ini-mengunci-arah-v1).

---

## 1. Keadaan sekarang

### Yang sudah ada dan bekerja

[`page-furniture/model.ts`](../apps/web/features/editor/page-furniture/model.ts) dan
`packages/shared/src/layout.ts` sudah memuat:

```ts
export type FurnitureVariant = 'default' | 'first' | 'even'
export interface PageFurnitureLine { text: string; align: 'left' | 'center' | 'right' }
export interface PageFurniture {
  header?: Partial<Record<FurnitureVariant, PageFurnitureLine>>
  footer?: Partial<Record<FurnitureVariant, PageFurnitureLine>>
}
```

- `furnitureLineFor()` sudah meniru aturan Word: halaman pertama → `first`, halaman genap →
  `even`, sisanya → `default`. **Dua kotak centang di dialog Google Docs sudah hidup di model.**
- Token `{page}` diganti nomor halaman saat render.
- Persistensi per tab di ydoc ([`page-furniture-ydoc.ts`](../apps/web/features/editor/page-furniture/page-furniture-ydoc.ts), kunci `pageFurniture`).
- Dirender per lembar oleh `SheetFurniture`, ikut ke tampilan share dan riwayat versi.
- Importer DOCX sudah mengisinya ([`docx/header-footer.ts`](../apps/web/features/document/docx/header-footer.ts)).

### Tiga lubang

**L1. Tidak ada UI.** `file-menu.tsx` hanya **membaca** `furniture` untuk diteruskan ke ekspor.
Tidak ada dialog, tidak ada jalan masuk — modelnya tak terjangkau pengguna.

**L2. Header/footer tidak pernah tercetak.** `SheetFurniture` dirender **di dalam**
`.document-sheet` ([`document-paper.tsx:210`](../apps/web/components/editor/document-paper.tsx)),
sementara blok cetak menyembunyikan elemen itu seluruhnya:

```css
@media print {
  .page-break-spacer,
  .document-sheet { display: none !important; }
}
```

Terbukti pada dua PDF pembanding: ekspor Google Docs memuat nomor halaman 1…35 di setiap
halaman; **ekspor Writer Hub tidak memuat nomor sama sekali.** Hari ini header/footer murni
hiasan layar.

**L3. Isinya masih satu baris teks polos** per varian — bukan konten kaya. Ini D8 yang belum
tertutup dari dokumen v1.

---

## 2. Mengapa fitur ini mengunci arah V1

[V1](DOCX-IMPORT-GAP-V2.md) mencatat kanvas dan kertas memakai dua mesin paginasi (47 lembar
lawan 35 halaman), dan pertanyaannya: mana yang jadi kebenaran? **Fitur ini menjawabnya secara
teknis, bukan lewat selera:**

- Nomor halaman berbeda di tiap halaman. Untuk mencetaknya, perender harus tahu ia sedang
  menggambar halaman ke berapa.
- Peramban tidak menyediakansudah aman, itu. `@page` *margin box* (`@top-center`, `@bottom-center`) dan
  `counter(page)` **tidak didukung Chromium**. `position: fixed` memang berulang di tiap
  halaman cetak, tetapi isinya **sama persis** di semua halaman — jadi bisa untuk teks tetap,
  tidak bisa untuk nomor.

**Artinya: header/footer bernomor yang benar-benar tercetak mensyaratkan paginasi kita sendiri
yang menggerakkan hasil cetak** — "kertas ikut kanvas". Itu menutup pilihan sebaliknya.

Ada satu jalan alternatif: menyerahkan PDF ke [worker render](RENDER-WORKER-PLAN.md), yang
sudah menghasilkan PDF (R1–R5 mendarat). Di sana kita mengendalikan perenderannya penuh,
sehingga persoalannya sama — perender tetap harus memakai paginator kita.

**Prasyarat yang tidak bisa dilewati:** paginator kanvas sekarang melebih-lebihkan ~34%
(47 lawan 35). Kalau cetak disambungkan ke kanvas hari ini, hasilnya PDF 47 halaman. Jadi
akurasi paginator harus dibereskan lebih dulu, dengan PDF Google Docs sebagai patokan.

---

## 3. Sasaran: "seperti MS Word"

Diterjemahkan menjadi perilaku yang bisa diuji:

1. **Isi kaya.** Banyak baris; tebal/miring; perataan per paragraf; gambar (logo kop surat);
   tabel sederhana bila memungkinkan.
2. **Disunting di tempat.** Klik ganda di area margin atas/bawah masuk ke mode sunting
   header/footer; badan naskah meredup; `Esc` atau klik ganda di badan keluar.
3. **Varian.** Halaman pertama berbeda; ganjil & genap berbeda. (Sudah ada di model.)
4. **Field.** Minimal nomor halaman dan total halaman; menyusul tanggal dan judul dokumen.
5. **Penomoran per bagian.** Format dan mulai-ulang mengikuti bagian.
6. **Margin sendiri.** Jarak header dari tepi atas dan footer dari tepi bawah, dalam **cm**.

### Batas lingkup yang diusulkan

Word menyimpan header/footer **per bagian** (dengan "link to previous"). Untuk kebutuhan karya
ilmiah, yang benar-benar berbeda antar bagian adalah **penomorannya**, bukan isinya. Usulan:

- **Isi** header/footer: satu set per dokumen, dengan varian `default/first/even`.
- **Penomoran**: per bagian.

Ini memangkas ledakan kombinasi (slot × varian × bagian) tanpa kehilangan kasus nyata.
Header per bagian bisa menyusul kalau ternyata dibutuhkan.

---

## 4. Rancangan

### 4.1 Isi header/footer sebagai fragmen dokumen

Naik dari `PageFurnitureLine { text, align }` menjadi fragmen ProseMirror tersendiri.

- Simpan sebagai `Y.XmlFragment` per slot+varian di dalam meta tab, bersebelahan dengan kunci
  `pageFurniture` yang sudah ada — maksimal 6 fragmen (2 slot × 3 varian), dibuat saat dipakai.
- Satu **editor TipTap kecil** per fragmen, memakai bagian ekstensi yang aman (paragraf, marks,
  perataan, gambar) — tanpa paginasi, tanpa TOC, tanpa section break.
- Yang aktif disunting hanya satu; salinan di lembar lain dirender statis dari fragmen yang sama.
- **Migrasi:** `PageFurnitureLine` lama dibaca sebagai satu paragraf dengan perataan itu, jadi
  dokumen yang sudah ada dan hasil impor DOCX tidak perlu disentuh.

### 4.2 Penomoran per bagian

Kita sudah punya node `sectionBreak` dan `sectionSpans` di paginator. Tambahkan atribut:

```ts
pageNumbering?: {
  format: 'decimal' | 'lower-roman' | 'upper-roman' | 'lower-alpha' | 'upper-alpha'
  restart: 'continue' | number      // lanjutkan, atau mulai ulang dari N
}
```

Bagian pertama (sebelum break mana pun) menyimpannya di layout dokumen. Render: untuk tiap
lembar, cari bagiannya lewat `sectionSpans`, lalu `format(mulai + offset)`.

Susunan untuk kasus karya ilmiah:

| Bagian | Isi                      | Format                           | Mulai           |
| ------ | ------------------------ | -------------------------------- | --------------- |
| 1      | Sampul                   | — (varian`first` dikosongkan) | —              |
| 2      | Pengesahan → Daftar Isi | `lower-roman`                  | 1 → i, ii, iii |
| 3      | BAB 1 → akhir           | `decimal`                      | 1 → 1, 2, 3    |

Token: `{page}` (sudah ada) dan `{pages}` untuk total halaman dokumen — padanan `NUMPAGES`
Word, dipakai pada "Halaman 3 dari 35".

### 4.3 Margin header/footer

Tambah dua angka ke `PageSetup` (satuan **cm** di UI, piksel dokumen di model, mengikuti
konvensi margin yang sudah ada). Dipakai `SheetFurniture` untuk menempatkan barisnya, dan
kelak oleh paginator: header/footer yang tinggi mengurangi tinggi area isi.

### 4.4 UI

Dialog seperti [`page-setup-dialog.tsx`](../apps/web/components/editor/page-setup-dialog.tsx),
ditambah bagian penomoran yang di Google Docs terpisah:

```
Header & footer
  Margin       Header dari atas   [ 1,27 cm ]
               Footer dari bawah  [ 1,27 cm ]
  Tata letak   ☐ Halaman pertama berbeda
               ☐ Ganjil & genap berbeda
  Nomor        Format  [ i, ii, iii ▾ ]
               ○ Lanjutkan dari bagian sebelumnya
               ○ Mulai ulang dari [ 1 ]
```

Jalan masuk: menu **Format**, dan klik ganda di area margin atas/bawah lembar.

### 4.5 Cetak

Bergantung penuh pada [§2](#2-mengapa-fitur-ini-mengunci-arah-v1): hasil cetak harus digerakkan
paginator kita, bukan paginasi peramban. Berarti blok cetak berhenti menyembunyikan
`.document-sheet` dan `.page-break-spacer`, dan tiap lembar menjadi satu halaman `@page`.

### 4.6 Impor & ekspor DOCX

- **Impor**: `w:hdr`/`w:ftr` sekarang diringkas jadi satu baris (D8). Dengan fragmen kaya,
  isinya bisa dibaca dengan pembaca paragraf yang sama seperti badan naskah. `w:pgNumType`
  (`w:fmt`, `w:start`) memetakan langsung ke `pageNumbering`.
- **Ekspor**: kebalikannya — fragmen menjadi `w:hdr`/`w:ftr`, `pageNumbering` menjadi
  `w:pgNumType` di `w:sectPr`. Field `PAGE`/`NUMPAGES` menggantikan token.

---

## 5. Tahapan

| #  | Tahap                                                                                       | Bergantung pada |
| -- | ------------------------------------------------------------------------------------------- | --------------- |
| T1 | Akurasi paginator kanvas (47 → ~35), diuji terhadap PDF Google Docs                        | —              |
| T2 | Cetak digerakkan paginator (V1: "kertas ikut kanvas"); header/footer & nomor mulai tercetak | T1              |
| T3 | Margin header/footer + dialog (varian & margin; isi masih satu baris)                       | —              |
| T4 | Penomoran per bagian: atribut, render, UI                                                   | T2 untuk kertas |
| T5 | Isi kaya: fragmen ydoc, editor kecil, sunting di tempat                                     | T3              |
| T6 | Impor/ekspor DOCX untuk isi kaya dan`w:pgNumType`                                         | T5, T4          |

T3 tidak bergantung pada apa pun dan sudah memberi hasil pakai (teks tetap di layar);
T1–T2 adalah yang membuatnya sampai ke kertas.

---

## 6. Keputusan terbuka

**Urutan pengerjaan.** Tiga pilihan yang pernah diajukan:

- **(a)** Selesaikan V1 (T1–T2) dulu, baru fitur ini. Paling bersih; T1 pekerjaan besar dan
  belum terdiagnosis sebabnya.
- **(b)** Kerjakan dulu yang tidak bergantung nomor: T3 — UI, margin, varian. Hasil pakai
  tercepat, tanpa menumpuk utang.
- **(c)** Kerjakan semuanya sekaligus, terima nomor layar ≠ nomor kertas untuk sementara.

Rekomendasi tetap **(b) lalu (a)**: T3 berguna sejak hari pertama dan tidak akan dibongkar,
sementara T1 dikerjakan dengan patokan yang sudah kita punya (PDF Google Docs 35 halaman).
**(c) tidak dianjurkan** — nomor halaman yang salah di kertas lebih merugikan daripada tidak
ada nomor sama sekali, karena pembaca tidak punya cara tahu ia salah.

Turunan yang belum perlu diputuskan sekarang: header/footer per bagian (bukan hanya
penomorannya), dan tabel di dalam header.

---

## 7. Risiko

- **T1 belum terdiagnosis.** Selisih 12 halaman belum ditelusuri sebabnya; dugaan awal
  mengarah ke halaman kosong dari pengganjal yang meleset (tercatat di sesi sebelumnya).
  Perlu penyelidikan tersendiri sebelum diperkirakan besarnya.
- **Header/footer tinggi mengubah geometri halaman.** Begitu isinya bisa banyak baris, tinggi
  area isi berkurang — paginator harus ikut menghitungnya, kalau tidak isinya meluber.
- **Editor kecil di dalam kanvas** menambah instans TipTap; perlu dijaga agar tidak ikut
  menerima ekstensi berat (paginasi, TOC, kolom).

---

## 8. Yang sudah mendarat

Ditulis belakangan, setelah T3–T6 dikerjakan. Urutannya menyimpang dari [§5](#5-tahapan):
T1–T2 (paginasi) **belum** dikerjakan, dan fitur-fitur di bawah tetap berguna tanpanya karena
semuanya hidup di kanvas.

| | Keadaan |
|---|---|
| Dialog **Header & footer** | margin (cm), varian halaman pertama/ganjil-genap, sunting di halaman, **hapus per slot** |
| Dialog **Page numbers** terpisah | format, mulai ulang, cakupan (tab / dari sini / halaman ini), **Show page numbers**, **Show on first page** |
| Sunting di tempat | klik ganda margin, pil berisi **perataan kiri/tengah/kanan**, sisip `{page}`/`{pages}`, "Different first page" di lembar pertama |
| Penomoran per bagian | `PageNumbering.show` opsional — inilah alur membersihkan penomoran |
| Impor DOCX | field `PAGE`/`NUMPAGES` → token; isi kaya header/footer; `w:pgNumType` |
| Ekspor DOCX | `w:hdr`/`w:ftr` kaya; bagian ber-`show: false` ditulis **tanpa** field PAGE; footer sintesis bila nomor menyala tanpa perabot pembawa |

### Lima jebakan yang ditemukan sambil jalan

**Nomor ganda.** Begitu field `PAGE` benar-benar terbawa, footer *dan* lencana sudut sama-sama
menggambar nomor. Aturannya sekarang: lencana adalah **cadangan** — ia menyingkir hanya kalau
perabotnya benar-benar membawa token nomor, bukan sekadar ada. Bedanya penting: perabot yang
ada tapi kosong (bentuk paling umum dari impor lama) sempat menelan nomornya diam-diam,
sehingga Apply di dialog tidak menghasilkan apa pun yang terlihat.

**Field ada di satu run.** Ekspor Google Docs menaruh `begin`, `instrText`, `separate`, dan
`end` dalam **satu** `w:r`. Membaca `child(run, 'fldChar')` berhenti di `begin`, fieldnya tidak
pernah ditutup, dan footer bernomor masuk sebagai paragraf kosong — satu keluarga dengan bug
TOC `\h` di dokumen v1.

**Efek samping saat render.** `ensureFurnitureFragment` dipanggil di `useMemo` dan menulis ke
Y.Doc; tulisan itu membangunkan observer komponen lain, jadi React menolak dengan *"Cannot
update a component while rendering a different component"*. Pembuatan fragmen dipindah ke efek.

**Mark asing membatalkan impor.** Diuraikan di
[DOCX-IMPORT-GAP-V2 §10](DOCX-IMPORT-GAP-V2.md#10-putaran-ketiga--impor-batal-karena-satu-mark-asing).

**Bundel perabot sekali pakai.** `furnitureExtras` dulu dibangun memakai keadaan section
pertama sebagai `hideNumbers`, jadi dokumen yang nomornya disembunyikan di sampul lalu
dinyalakan lagi di isi tidak pernah mendapat tokennya kembali — bagian isi mewarisi footer
bersih section pembuka. Kini bundelnya dua yang tetap (bernomor / tanpa nomor, termasuk
footer sintesisnya); section pertama tinggal memilih, dan tiap pergantian visibilitas
ganti bundel. Ditemukan sambil menutup celah ekspor.

### Yang masih terbuka

- **T1–T2** — akurasi paginator lalu cetak digerakkan olehnya. Tanpa ini header/footer tetap
  tidak pernah sampai ke kertas.
- **`settings.showPageNumbers`** mengatur lencana cadangan **dan** footer sintesis ekspor.
  Labelnya sudah diperjelas jadi "Nomor halaman otomatis"; nama fieldnya sengaja **tidak**
  diubah supaya preferensi pengguna yang sudah tersimpan tidak hangus.
- **Sisa yang jujur dari celah ekspor** — footer berisi teks/gambar statis tanpa token tidak
  ditempeli field `PAGE`: menempelkan nomor ke konten pengguna adalah keputusan produk
  tersendiri. Dokumen begini tetap keluar tanpa nomor di DOCX selama di layar lencanalah
  yang menggantikan.

---

## Lampiran — bukti pengukuran

Berkas: `/mnt/doc/Reacteev/Proposal_TA_Capstone_Bab1-3_v1[citasi].docx`

| Yang diukur                        | Hasil                 |
| ---------------------------------- | --------------------- |
| Lembar kanvas                      | 47 (39 pengganjal)    |
| Halaman kertas (ekspor Writer Hub) | 35                    |
| Halaman Google Docs                | 35                    |
| Nomor halaman di PDF Google Docs   | 1…35 di tiap halaman |
| Nomor halaman di PDF Writer Hub    | **tidak ada**   |

Aturan cetak yang menghapus perabot halaman ada di `apps/web/app/globals.css`, di dalam blok
`@media print`, pada aturan `.page-break-spacer, .document-sheet { display: none !important }`.
