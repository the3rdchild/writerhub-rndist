# WritingHub — Celah Kesetiaan Dokumen v2: impor → render → cetak

Status: **V3, V4, V2-lapis-1, V5-sisa, §6.3, V6, dan V1-tahap-1 selesai 6 September 2026** ·
lihat [§8](#8-hasil-setelah-perbaikan) dan [§9](#9-putaran-kedua--v6-63-dan-v1-tahap-1) ·
V1 tahap 2 (paritas paragraf) dan V7 menunggu pekerjaan lanjutan · baseline `e38ef09` (branch `main`)
Lanjutan dari [DOCX-IMPORT-GAP.md](DOCX-IMPORT-GAP.md), yang menutup celah di sisi **impor**.

Putaran ini memakai alat ukur yang berbeda: satu berkas `.docx` diekspor ke PDF lewat **dua
jalur** — Google Docs dan Writer Hub — lalu dibandingkan halaman per halaman. Hasilnya
menggeser fokus. Impornya sudah bagus; yang belum beres ada di **render dan cetak**.

**Kesimpulan singkat: kanvas dan kertas dipaginasi oleh dua mesin yang berbeda, dan keduanya
berselisih 12 halaman pada dokumen yang sama.** Kertas (35 halaman) justru sama persis dengan
Google Docs; kanvaslah yang meleset (47 lembar). Semua perbandingan jumlah halaman yang pernah
kita lakukan sebelumnya mengukur kanvas — bukan yang benar-benar tercetak.

---

## 0. Ringkasan temuan

| Kode | Temuan | Letak | Bobot |
|---|---|---|---|
| **V1** | Kanvas & kertas memakai dua mesin paginasi; selisih 12 halaman | render + cetak | **L — akar** |
| **V2** | Nomor halaman di Daftar Isi/Gambar/Tabel tidak pernah benar | render | **M** |
| **V3** | Pegangan ukur & tombol hapus gambar ikut tercetak | cetak | **S** |
| **V4** | Gambar tinggi terpenggal di batas halaman kertas | cetak | **S** |
| **V5** | "Daftar Gambar berisi daftar bab" — cacat dokumen, bukan importer | — | catatan |
| **V6** | Garis & jarak tabel bawaan editor menimpa sumber | render | keputusan produk |
| **V8** | Mark di luar skema perabot membatalkan seluruh impor ([§10](#10-putaran-ketiga--impor-batal-karena-satu-mark-asing)) | impor | **L — selesai** |

---

## 1. Cara mengukur — dan satu pelajaran mahal

Dua PDF dari **satu** berkas sumber:

- Sumber: `/mnt/doc/Reacteev/Proposal_TA_Capstone_Bab1-3_v1[citasi].docx`
- `Proposal_TA_Capstone_Bab1-3_v1[citasi].docx.pdf` — ekspor Google Docs, 35 halaman
- `writinghubProposal_TA_Capstone_Bab1-3_v1[citasi].pdf` — ekspor Writer Hub, 35 halaman
- Kanvas Writer Hub diukur langsung lewat Playwright/Chromium di kontainer `worker`

**Pelajarannya:** percobaan pertama membandingkan dua berkas yang berbeda (versi dengan sitasi
lawan tanpa sitasi). Dua "temuan" lahir dari situ dan keduanya harus dicabut — lihat
[§5](#5-retraksi). Aturannya sekarang: **pembandingan hanya sah bila kedua PDF berasal dari
satu berkas yang sama persis.**

---

## 2. Peta halaman

| Penanda | Google Docs | Writer Hub (kertas) | Writer Hub (kanvas) |
|---|---|---|---|
| Sampul | 1 | 1 | — |
| Halaman Pengesahan | 2 | 2 | — |
| DAFTAR ISI | 3–4 | 3–4 | — |
| DAFTAR GAMBAR | 5 | 5–6 | — |
| DAFTAR TABEL | 6 | 7–8 | — |
| BAB 1 | 7 | 9 | — |
| BAB 2 | 12 | 14 | — |
| BAB 3 | 19 | 21 | — |
| Tabel 3.9 | 32 | 33 | — |
| DAFTAR PUSTAKA | 33–35 | 34–35 | — |
| **Total** | **35** | **35** | **47** |

Selisih dua halaman di badan naskah lahir seluruhnya dari dua lembar tambahan di bagian depan
(Daftar Gambar dan Daftar Tabel masing-masing memakan dua halaman, bukan satu — lihat
[V5](#v5-daftar-gambar--daftar-tabel--cacat-dokumen-bukan-importer)), lalu terkejar lagi
menjelang akhir.

---

## 3. Yang terbukti benar

- **Sitasi utuh.** `[1]`, `[2]`, `[3]` … hadir lengkap di seluruh badan naskah.
  *Catatan penting:* di berkas ini sitasinya **teks biasa**, bukan field — `w:fldSimple` = 0,
  `ADDIN` = 0. Jadi ini **belum** membuktikan apa pun tentang S8 (field sitasi
  Mendeley/Zotero); butuh berkas uji lain.
- **Daftar pustaka lengkap** — seluruh 31 entri terbawa.
- **Total halaman kertas sama persis dengan Google Docs**, 35 lawan 35.
- Seluruh tabel, gambar, diagram, dan caption hadir; tata letak badan naskah nyaris sejajar.

---

## 4. Temuan

### V1. Kanvas dan kertas memakai dua mesin paginasi — **L, ini akarnya**

Di dalam blok cetak ([`globals.css:1938`](../apps/web/app/globals.css), blok `@media print`
mulai baris 1904):

```css
.page-break-spacer,
.document-sheet {
  display: none !important;
}
```

`page-break-spacer` adalah **pengganjal milik paginator kanvas**. Begitu disembunyikan, seluruh
hasil kerja paginator lenyap dari kertas dan peramban memenggal halaman dengan aturannya
sendiri. Jadi ada dua mesin yang tidak pernah saling melihat:

| | Kanvas | Kertas |
|---|---|---|
| Mesin | `features/editor/pagination.ts` | paginasi bawaan peramban |
| Hasil pada berkas ini | **47 lembar** (39 pengganjal) | **35 halaman** |

Selisihnya 12 halaman, sekitar 34%. Yang cocok dengan Google Docs justru **kertas**.

Akibatnya berantai:

1. **Semua angka halaman yang pernah kita bandingkan sebelumnya diukur di kanvas** — Naufal
   "40 lawan 35", IEEE "17 lawan 7". Itu bukan yang tercetak, jadi perlu diukur ulang di
   kertas sebelum dijadikan dasar pekerjaan apa pun.
2. Nomor halaman daftar tidak mungkin benar (**V2**): angkanya diturunkan dari geometri kanvas.
3. Semua yang dijaga paginator kanvas — tabel tidak dipenggal sembarangan, baris judul
   diulang, gambar tidak terbelah — **tidak berlaku di kertas** (**V4**).

**Keputusan yang perlu diambil sebelum menggarapnya:** mana yang jadi kebenaran? Menyuruh
kertas memakai pengganjal kanvas, atau membuat kanvas meniru aturan penggalan peramban?
Pilihan ini menentukan bentuk V2 dan V4.

> **Pembaruan 6 September 2026 — arahnya sudah terkunci secara teknis.** Header/footer
> bernomor mensyaratkan perender tahu ia sedang menggambar halaman ke berapa, dan peramban
> tidak menyediakannya (`@page` *margin box* dan `counter(page)` tidak didukung Chromium;
> `position: fixed` berulang tapi isinya sama di semua halaman). Jadi **kertas harus ikut
> kanvas**, dan prasyaratnya paginator kanvas dibereskan dulu dari 47 ke ~35. Uraiannya di
> [HEADER-FOOTER-PLAN.md §2](HEADER-FOOTER-PLAN.md#2-mengapa-fitur-ini-mengunci-arah-v1).

### V2. Nomor halaman daftar tidak pernah benar — **M**

Diukur pada berkas ini, untuk satu judul yang sama, "BAB 1 PENDAHULUAN":

| Sumber angka | Tertulis | Sebenarnya |
|---|---|---|
| Kanvas, tepat setelah impor (ketiga daftar) | **3** | `offsetTop` 16196px (≈ lembar 14) |
| Kertas — Daftar Isi | **15** | halaman **9** |
| Kertas — Daftar Gambar | **14** | halaman **9** |
| Kertas — Daftar Tabel | **13** | halaman **9** |

Tiga daftar identik memberi tiga angka berbeda, dan tak satu pun benar.

Akarnya di [`toc-block-view.tsx:100`](../apps/web/components/editor/toc-block-view.tsx):

```ts
if (attrs.showPageNumbers) page = Math.floor(el.offsetTop / stride) + 1
```

Ada **dua lapis** masalah:

1. `offsetTop` dibaca sekali, **sebelum paginator menyisipkan pengganjalnya**, dan tidak pernah
   dihitung ulang setelah tata letak mapan. Tiap blok memotret keadaan antara yang berbeda —
   itulah asal 15/14/13.
2. Bahkan seandainya lapis pertama diperbaiki, yang dihasilkan tetap **nomor halaman kanvas**,
   sedangkan pembaca memegang **kertas**. Selama V1 belum diputuskan, angkanya tetap salah.

Dampaknya langsung terasa pembaca: menuruti daftar isi berarti mendarat di halaman yang keliru.
Ada tombol manual "Segarkan isi dan nomor halaman" sebagai penyelamat, tapi seharusnya menyatu
sendiri.

### V3. Pegangan ukur & tombol hapus gambar ikut tercetak — **S**

Di halaman 28 PDF Writer Hub terlihat garis biru, titik bulat, dan tanda **×** mengelilingi
Gambar 3.4 — itu kendali antarmuka node gambar.

Blok cetak sudah menyembunyikan bilah `html-block`, pegangan tabel (`.table-handle-layer`), dan
garis penanda page break, tetapi **tidak ada satu pun aturan yang menyentuh gambar**. Keluarga
yang sama dengan perbaikan penanda break di `e38ef09`, cuma terlewat.

### V4. Gambar tinggi terpenggal di batas halaman kertas — **S**

- Gambar 3.1 merembes ke dasar halaman 22 lalu muncul utuh di halaman 23.
- Gambar 3.4 terpenggal di halaman 28, sisanya di halaman 29.

Konsekuensi langsung dari **V1**: karena kertas dipaginasi peramban dan tidak ada
`break-inside: avoid` pada gambar, penggalan halaman jatuh di tengah gambar. Di kanvas hal ini
tidak terjadi karena paginator menjaganya. Delapan gambar di dokumen ini, dua di antaranya
kena.

### V5. Daftar Gambar & Daftar Tabel — cacat dokumen, bukan importer

Ketiga field TOC di berkas ini **identik persis**:

```
TOC \h \u \z \t "Heading 1,1,Heading 2,2,Heading 3,3,Heading 4,4,Heading 5,5,Heading 6,6,"
```

Ketiganya meminta kerangka judul lengkap tingkat 1–6. Jadi "DAFTAR GAMBAR" yang berisi daftar
bab memang **yang diminta dokumennya** — Word pun menghasilkan hal yang sama begitu di-*Update
Field*. Google Docs menampilkannya sebagai placeholder ("Klik kanan pada daftar ini lalu pilih
Update Field") semata-mata karena tidak pernah mengembangkannya. Importer kita menuruti field
apa adanya; dua halaman tambahan itu harganya.

**Sisa pekerjaan yang tetap nyata:** pada berkas `Naufal_Proposal_TA_Capstone_Bab1-3_v1.docx`
(versi tanpa sitasi) ketiga field-nya **berbeda** dan importer memang salah kelas:

```
TOC \h \u \z \t "Heading 1,1,Heading 2,2,Heading 3,3,Heading 4,4,"   → Daftar Isi   ✓
TOC \h \u \z \t "Heading 5,1,"                                       → Daftar Gambar ✗ jadi 'isi'
TOC \h \u \z \t "Heading 5,5,Heading 6,1,"                           → Daftar Tabel  ✗ jadi 'isi'
```

Importer hanya mencari switch `\c "Gambar"`/`\c "Tabel"`; ketika daftar dibangun dari gaya
(`\t`), jenisnya jatuh ke `isi`. Usulan: untuk TOC berbasis `\t`, ambil contoh teks judul pada
tingkat yang dirujuk, lalu tentukan jenisnya dari awalannya — "Gambar"/"Figure" → daftar
gambar, "Tabel"/"Table" → daftar tabel. Sinyalnya ada di dokumen, bukan tebakan.

### V6. Garis & jarak tabel bawaan editor menimpa sumber — keputusan produk

Tabel sampul ("Nama | NPM") dan blok tanda tangan tidak punya garis sama sekali di Word maupun
Docs; di Writer Hub keduanya tampil sebagai kisi penuh dengan baris judul berlatar abu-abu.

**Impornya benar** — ketiga tabel itu masuk tanpa atribut border sama sekali:

```
#14 attrs={"tableWidth":567}                                    ← tabel sampul
#37 attrs={"tableWidth":567}                                    ← blok tanda tangan
#73 attrs={"tableWidth":567,"borderColor":"#000000",...}         ← Tabel 1.1, memang bergaris
```

Yang menambahkan garis adalah gaya bawaan kanvas
([`globals.css:860`](../apps/web/app/globals.css) dan `:865`):

```css
.document-body th, .document-body td { border: 1px solid var(--border-strong); }
.document-body th { background: var(--overlay-hover); }
```

Sekaligus di sini: `.document-body table { margin: 0.75em 0 }` ([`globals.css:852`](../apps/web/app/globals.css))
menyisakan **jarak 11px terukur** di atas setiap tabel, yang di Word/Docs tidak ada.

Menghormati sumber berarti importer harus bisa membedakan "border dinyatakan nihil" dari
"border tidak disebut", lalu menuliskan `borderStyle: none` secara eksplisit — sekarang
`readBorderAttrs` mengembalikan `null` untuk keduanya.

---

## 5. Retraksi

Dicatat supaya tidak terulang:

| Klaim | Status | Sebab |
|---|---|---|
| "Daftar pustaka hilang total (3 halaman, 31 entri)" | **salah** | membandingkan dua berkas berbeda |
| "Penanda sitasi `[1], [2]` hilang dari badan naskah" | **salah** | sebab yang sama |
| "Jarak 11px di atas tabel sudah nol" (5 Sep) | **salah** | yang diukur pembungkusnya; jarak nyata tetap 11px, datang dari `table { margin }` |
| "Naufal 40 halaman lawan Docs 35" | **belum sah** | 40 itu lembar kanvas, bukan halaman kertas — lihat V1 |

---

## 6. Keputusan yang perlu diambil

1. **Kebenaran paginasi (V1):** kertas mengikuti kanvas, atau kanvas mengikuti kertas?
   Menentukan bentuk V2 dan V4.
2. **Nomor halaman daftar (V2)** mengacu ke kanvas atau ke kertas?
3. **Field TOC yang belum pernah di-update (V5):** dikembangkan apa adanya (perilaku sekarang,
   setia pada berkas) atau dibiarkan sebagai teks placeholder seperti Docs?
4. **Garis & jarak tabel (V6):** setia pada sumber, atau gaya editor yang menang?

---

## 7. Urutan yang diusulkan

1. **V3 + V4** — keduanya CSS cetak, kecil, sebabnya sudah pasti, tidak menunggu keputusan apa pun.
2. **V2 lapis pertama** — hitung ulang nomor halaman setelah paginasi mapan.
3. **V1** — pekerjaan besar, butuh keputusan 1 lebih dulu.
4. **V5 sisa** — deteksi jenis daftar dari switch `\t`, berkas ujinya sudah ada.
5. **V6** — menunggu keputusan 4.

---

## 8. Hasil setelah perbaikan

Dikerjakan 6 September 2026 sesuai urutan §7 (butir 1, 2, dan 4); V1 dan V6 ditunda menunggu
keputusan §6. Seluruh angka di bawah diukur ulang dengan berkas dan alat yang sama seperti
putaran temuan.

### V3 — pegangan & tombol hapus gambar tak lagi tercetak

Aturan cetak baru di `globals.css` (satu keluarga dengan penanda break di `e38ef09`):
`.resizable-image-handle`/`.resizable-image-delete` disembunyikan, bingkai pilihan dilepas.
Terukur pada PDF yang dibangkitkan **dengan gambar dalam keadaan terpilih** — persis kondisi
yang memunculkan artefaknya:

- Referensi (pra-perbaikan): tanda `×` terekstrak di halaman 28.
- Hasil baru: `×` tidak ada di halaman mana pun.

### V4 — gambar tidak lagi terbelah di batas halaman

`break-inside: avoid` pada pembungkus dan figure gambar. Dihitung dari `/XObject` per halaman
(gambar yang terpenggal tercantum di sumber daya dua halaman):

| | Referensi | Hasil baru |
|---|---|---|
| Sebaran gambar | h. 1, 16, 17, **22**, 23×2, 26, **28**, 29×2 | h. 1, 16, 17, 23×2, 26, 28, 29 |
| Referensi objek gambar | 10 (untuk 8 gambar — dua terbelah) | **8 (utuh semua)** |
| Total halaman | 35 | **35** (tetap) |

Gambar 3.1 dan 3.4 — yang dulu terpenggal — kini utuh masing-masing di satu halaman, tanpa
mengubah jumlah halaman kertas.

### V2 lapis 1 — nomor daftar konsisten dan sesuai geometri kanvas

`toc-block-view.tsx` kini menghitung ulang nomor setiap kali susunan pengganjal berubah
(`pageTick`), bukan sekali saat node dipasang. Terukur untuk "BAB 1 PENDAHULUAN":

| | Tertulis |
|---|---|
| Sebelum | kanvas 3 (basi); kertas 15 / 14 / 13 (tiga daftar identik, tiga angka) |
| Sesudah | **15 / 15 / 15** — sama dengan `floor(16196 / 1155) + 1`, rumus stride pada tata letak mapan |

Lapis 2 (angka mengacu ke kertas) tetap menunggu keputusan V1.

### V5 sisa — jenis daftar dari contoh teks gaya `\t`

`tocFieldOf` kini menerima contoh teks per nama gaya (`styleTextSamplerOf`; jembatan
`w:name` ↔ `w:pStyle` lewat tabel gaya). Field `\t "Heading 5,1,"` dengan isi bergaya
"Gambar …" → daftar gambar; "Tabel …" → daftar tabel; kerangka biasa → tetap daftar isi.
Daftar gambar/tabel juga kini diberi rentang tingkat **7–9** (tempat caption hidup di Writer
Hub) — angka pada `\t`/`\o` adalah tingkat tampilan Word, bukan tingkat judul kita; dulu
rentang default 1–3 membuat daftar jenis ini pasti kosong.

*Batasan yang diketahui:* pada berkas Naufal, caption-nya bergaya "Heading 5" → tingkat 5,
bukan caption tingkat 7–9, jadi daftarnya benar jenisnya tetapi kosong sampai caption
dokumen itu hidup di 7–9. Menaikkan tingkat caption saat impor adalah keputusan terpisah.

### V7 — temuan baru: emulasi media cetak meruntuhkan halaman ber-TOC

`emulate_media(media="print")` pada dokumen yang memuat blok daftar isi membuat React
melempar *Maximum update depth exceeded* dan halaman jatuh ke layar "This page couldn't
load". Terkonfirmasi **telah ada sebelum perbaikan ini** (terjadi juga pada `e38ef09` bersih)
— bukan regresi. Jalan pintasnya: `window.print()` sungguhan memblokir utas saat dialognya
terbuka dan medianya kembali setelahnya, jadi ekspor lewat tombol Ekspor PDF tidak terkena;
begitu pula `page.pdf()` tanpa emulasi media (dipakai §8 ini). Akar masalahnya satu keluarga
dengan V1 — pengganjal TOC berosilasi saat tata letak cetak mengubah ukuran — layak digarap
bersama V1.

### Regresi

- Kanvas: 47 lembar / 39 pengganjal / 8 gambar — tidak berubah.
- `bun test` 788 lulus (145 di antaranya impor DOCX, termasuk 3 uji baru untuk `\t`);
  `tsc --noEmit` bersih.

---

## 9. Putaran kedua — V6, §6.3, dan V1 tahap 1

Keputusan yang dipakai: **kanvas mengikuti kertas** (V1), V6 **setia pada sumber**, field TOC
**belum pernah di-update dibiarkan placeholder** seperti Docs (§6.3), caption **tidak**
dipromosi ke 7–9.

### §6.3 — field TOC basi jadi placeholder

Hasil tersimpan field ternyata membedakan dua dunia: `DAFTAR ISI` di berkas uji membawa entri
sungguhan (pernah di-update), sedangkan `DAFTAR GAMBAR`/`DAFTAR TABEL` berisi kalimat
placeholder buatan Google Docs ("Klik kanan pada daftar ini lalu pilih Update Field…").
Importer kini membaca hasil tersimpan selama menelan field: kalimat perintah atau kosong →
teks itu dipertahankan sebagai paragraf biasa; entri sungguhan → tetap jadi TocBlock hidup.
Efek sampingnya menyenangkan: bagian depan kertas kini sejajar halaman-per-halaman dengan
Google Docs (ISI 3–4, GAMBAR 5, TABEL 6, BAB 1 di 7).

### V6 — garis & jarak tabel setia pada sumber

Tiga lapis yang harus bekerja bersama:

1. **Impor** (`table-props.ts` DOCX): "tak disebut" dan "dinyatakan nihil" sama-sama berujung
   `borderStyle: 'none'` eksplisit; border style tabel (`w:tblStyle`) tetap menang bila ada.
2. **DOM hidup**: tabel resizable memakai TableView ProseMirror yang tidak pernah memanggil
   `renderHTML` — atribut bingkai tidak pernah sampai ke elemen hidupnya, dari dulu. Kini
   dekorasi node (`tableBorderDecoration`) yang menempelkannya: berlaku di kanvas dan kertas,
   sinkron saat atribut berubah.
3. **CSS**: `table[data-border-style='none']` meniadakan kisi sel dan latar baris judul;
   `margin: 0.75em` milik tabel dihapus (jarak 11px di atas tabel — di Word/Docs tidak ada),
   dan tabel-anak-langsung ikut pengecualian aturan `> * + *`.

Terukur: tabel sampul/tanda-tangan polos (sel 0px, latar transparan), Tabel 1.1 dst bergaris
dengan shading abu-abunya sumber, margin tabel 0px.

### V1 tahap 1 — bug paginasi, bukan geometri

Diagnosis menyingkirkan dugaan geometri: konten kanvas dan kertas sama-sama 568px lebar,
margin sama, contentHeight sama. Sumber selisihnya tiga:

1. **Regresi tersembunyi**: atribut `data-self-paginate` ada di wrapper dalam node view TOC,
   tapi `view.nodeDOM()` mengembalikan wrapper luar yang tak membawanya — self-pagination TOC
   **mati diam-diam**, blok 1422px diperlakukan sebagai blok raksasa. Koreksi: deteksi juga
   lewat keturunan (`querySelector`).
2. **Pemenggal menerima spacer sendiri**: rantai TOC-meluber → pemenggal → judul bab
   mendorong dua kali (spacer pemenggal + spacer judul) = dua lembar kosong beruntun. Kini
   pemenggal hanya menandai `forceNext`; pemenggal beruntun tetap sah mengosongkan satu
   lembar (kontrak Word, dijaga unit test).
3. **Paritas aturan**: kanvas menjaga judul dari yatim (`KEEP_WITH_NEXT`) tapi kertas tidak —
   ditambah `break-after: avoid` untuk judul di media cetak.

Hasil: kanvas **47 → 39 lembar**, bagian depan **paritas penuh** dengan kertas dan Google
Docs (BAB 1 di halaman 7 di ketiganya). Selisih badan naskah menyusut jadi +5..+6 lembar.

### Sisa V1 tahap 2 — dan mengapa ia besar

Sisa selisih itu struktural: **paginator kanvas memperlakukan paragraf sebagai blok atomik**
(`offsetTop` + `offsetHeight`, titik penggal hanya di blok/baris tabel/anak kontainer), while
**kertas memenggal paragraf per baris** dengan widows/orphans 2. Arsitektur spacer tidak bisa
menyisipkan pengganjal di antara baris-baris satu text node. Paritas penuh menuntut
fragmentasi tingkat baris di kanvas — widget inline antar baris dengan pengukuran `Range`
per baris; pekerjaan besar dengan tepi tajam (seleksi, IME, pengukuran berulang), layak
direncanakan sebagai proyek sendiri. Angka pamungkasnya: 39 lawan 33.

### V7 — masih ada, tercatat

`emulate_media(print)` masih meruntuhkan halaman ber-TOC (*Maximum update depth exceeded*),
setelah perbaikan tahap 1 sekalipun. Tombol Ekspor PDF sungguhan dan `page.pdf()` tanpa
emulasi tidak terkena. Digarap bersama V1 tahap 2 (akarnya satu keluarga: osilasi pengganjal
saat tata letak cetak).

### Regresi putaran ini

- `bun test` 794 lulus (4 uji placeholder TOC, 2 uji border tabel, 1 uji lembar kosong baru);
  `tsc --noEmit` bersih; biome bersih di berkas yang diubah.
- Kertas: 33 halaman, 8 gambar utuh (8 referensi XObject), tanpa tanda ×, margin tabel 0px.

---

## 10. Putaran ketiga — impor batal karena satu mark asing

Ditemukan saat mengejar gejala yang tampak sepele: **impor mendarat di tab kedua, tapi layar
bertahan di tab pertama.** Yang tampak seperti bug fokus ternyata gejala paling akhir dari
rantai yang jauh lebih dalam.

### V8. Mark di luar skema perabot membatalkan SELURUH impor — **L**

Paragraf header/footer hasil impor membawa mark `textStyle` (huruf, ukuran, warna), sementara
skema perabot yang ringan tidak memuatnya:

```
RangeError: There is no mark type textStyle in this schema
  at Mark.fromJSON ← Schema.markFromJSON
```

Penulisan fragmen itu terjadi **di dalam transaksi impor**. Satu mark asing membatalkan
transaksinya, jadi rantainya:

1. `createTab` sudah berjalan → tab muncul di daftar,
2. transaksi melempar → isi naskah tidak pernah ditulis,
3. `selectSession` tidak pernah tercapai → tab lama tetap aktif,
4. `loadDocx` menangkapnya dan mengubahnya jadi satu baris peringatan yang mudah terlewat.

Yang terlihat pengguna: tab baru muncul, kosong, dan layar tidak berpindah. Tidak ada satu pun
galat di konsol.

**Perbaikan dua lapis.** `TextStyleKit` masuk ke `furnitureExtensions` supaya format hurufnya
memang terbawa; dan isi perabot disaring lebih dulu terhadap skemanya
(`sanitizeFurnitureBlocks`) dengan penahan galat per fragmen — pembaca paragrafnya sama dengan
badan naskah, jadi ia bisa saja menghasilkan `link` atau `comment` yang sengaja tidak dibawa
skema ringan ini. Kehilangan format satu header jauh lebih murah daripada kehilangan
dokumennya, dan slot yang gagal dilaporkan sebagai peringatan bernama.

**Sesudah:** 39 lembar, footer halaman 1 berbunyi "1", tanpa galat — dan fokusnya berpindah
sendiri. Jaring pengaman "pilih ulang tab setelah muncul" yang sempat ditambahkan **dicabut**:
setelah akar masalahnya beres, impor tetap fokus tanpanya.

### Penanda kesiapan editor — `data-editor-ready`

Diagnosis di atas sempat tertahan berjam-jam oleh alat ukurnya sendiri: input impor ada di HTML
SSR, `set_input_files` memasang berkas sebelum React hidrasi, event `change` hilang, dan
gagalnya diam-diam. Beberapa run lebih awal "berhasil" hanya karena kebetulan mendarat sesudah
hidrasi — itulah yang membuat gejalanya tampak berubah-ubah.

`<body data-editor-ready="true">` kini dipasang setelah React hidrasi **dan** penyimpanan
dokumen selesai dimuat ([`app-shell.tsx`](../apps/web/components/layout/app-shell.tsx)),
mengikuti pola `data-export-ready` yang sudah dipakai `render_service.py`. Ia memberi harness
sinyal "aman disentuh" yang resmi, bukan menunggu-butir-DOM yang tidak resmi.

> **Worker render sengaja TIDAK memakainya.** Halaman ekspor tidak melewati `AppShell` —
> `ExportDocumentView` berdiri sendiri tanpa header maupun panel — jadi `data-editor-ready`
> tidak pernah terpasang di `/export/[id]`; mengganti `READY_SELECTOR` akan membuat setiap job
> menunggu sampai timeout lalu gagal, diam-diam. Lagipula worker hanya membuka halaman dan
> memotret; ia tidak mengemudikan UI, dan yang ia butuhkan justru lebih ketat daripada "hidrasi
> selesai" — paginasinya harus tenang lebih dulu, dan itulah yang dijanjikan
> `data-export-ready`. Kalau kelak ada job yang benar-benar menyentuh editor (tangkapan layar
> kanvas, otomasi), penanda ini dipakai sebagai pemilih **tambahan** untuk job jenis itu,
> bukan pengganti.

### Retraksi

| Klaim | Status | Sebab |
|---|---|---|
| "Impor tidak pernah berjalan di harness" | **salah** | run yang gagal belum terhidrasi; dengan penanda kesiapan, impor berjalan setiap kali |
| "Bug fokus tab berdiri sendiri" | **salah** | gejala dari V8 — `selectSession` tidak pernah tercapai karena transaksinya batal |

---

## Lampiran — cara reproduksi

> Reseps tambahan dari putaran perbaikan: untuk mengukur **kertas** lewat Playwright, pakai
> `page.pdf()` **tanpa** `emulate_media(media="print")` — `page.pdf()` merender tata letak
> cetak off-screen tanpa mengganti media halaman hidup, jadi tidak menyentuh V7. Hitung
> halaman lewat `pypdf`, dan gambar per halaman dari `/Resources` `/XObject` — gambar yang
> terpenggal di batas halaman tercantum di sumber daya dua halaman.

**Field TOC & sitasi di berkas sumber:**

```bash
python3 - <<'PY'
import zipfile, re
z = zipfile.ZipFile('/mnt/doc/Reacteev/Proposal_TA_Capstone_Bab1-3_v1[citasi].docx')
d = z.read('word/document.xml').decode('utf8')
for m in re.finditer(r'<w:instrText[^>]*>([\s\S]*?)</w:instrText>', d):
    if m.group(1).strip().upper().startswith('TOC'): print('TOC:', m.group(1).strip())
print('fldSimple:', len(re.findall(r'<w:fldSimple', d)), '| ADDIN:', len(re.findall(r'ADDIN', d)))
PY
```

**Impor sebuah berkas** (Playwright di kontainer `worker`; salin dulu berkasnya dengan
`docker compose cp <berkas> worker:/tmp/citasi.docx`):

```python
ctx = browser.new_context()          # konteks segar: IndexedDB & localStorage kosong
p = ctx.new_page()
p.goto("http://web:3000/", wait_until="domcontentloaded")
p.wait_for_selector('body[data-editor-ready="true"]', timeout=60_000)   # WAJIB
assert p.evaluate("() => document.querySelectorAll('input[type=file]').length") == 1
p.set_input_files("input[type=file]", "/tmp/citasi.docx")
p.wait_for_timeout(40_000)
p.evaluate("""() => ({
  lembarKanvas: document.querySelectorAll('.document-sheet').length,
  pengganjal:   document.querySelectorAll('.page-break-spacer').length,
  gambar:       document.querySelectorAll('.document-body img').length,
})""")
```

> ⚠️ **Jangan memasang berkas tepat setelah `goto`.** Input impor ikut terkirim di HTML SSR,
> jadi ia sudah *attached* sejak byte pertama — jauh sebelum React memasang penangannya.
> `set_input_files` hanya menunggu elemennya ada, sehingga event `change`-nya menghilang tanpa
> jejak: tidak ada galat, hanya tidak terjadi apa-apa. Resep versi lama dokumen ini memakai
> pola itu, dan run yang "berhasil" cuma kebetulan mendarat sesudah hidrasi. Penanda
> `body[data-editor-ready="true"]` ([`editor-ready.ts`](../apps/web/features/editor/editor-ready.ts))
> adalah sinyal resminya — saudara kandung `data-export-ready` milik worker render.

**Jarak nyata di atas tabel** (bukan margin pembungkusnya):

```js
const kids = [...document.querySelector('.document-body').children]
const i = kids.findIndex((el) => el.classList.contains('tableWrapper'))
Math.round(kids[i].querySelector('table').getBoundingClientRect().top
           - kids[i - 1].getBoundingClientRect().bottom)   // → 11
```

> `/tmp` di kontainer `worker` terhapus tiap kontainer dinyalakan ulang — salin ulang berkas uji
> dan skripnya sebelum tiap sesi pengukuran.
