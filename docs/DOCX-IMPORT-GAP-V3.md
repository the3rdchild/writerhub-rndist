# WritingHub — Celah Kesetiaan Dokumen v3: model *section* Word

Status: **temuan + perbaikan, 8 September 2026** · baseline `ff679e4` (branch `main`) ·
W1–W4 dan W8 sudah dikerjakan — hasil terukurnya di
[§8](#8-hasil-setelah-perbaikan).
Lanjutan dari [DOCX-IMPORT-GAP.md](DOCX-IMPORT-GAP.md) (celah impor) dan
[DOCX-IMPORT-GAP-V2.md](DOCX-IMPORT-GAP-V2.md) (celah render & cetak).

Putaran ini memakai berkas uji yang berbeda — templat proposal TA UNPAD, berkas terkecil dari
empat berkas uji v1 — dan menemukan sesuatu yang tidak muncul di dua putaran sebelumnya karena
berkas ujinya memang tidak memakainya: **dokumen ini mengarang tata letaknya lewat *section*
Word**. Sembilan `w:sectPr`, tiga di antaranya berkolom, empat *column break*, dan satu
`w:pgNumType`.

**Kesimpulan singkat: teks dan gambarnya masuk lengkap, tapi model `sectionBreak` di editor
terlalu tipis untuk menampung apa yang dinyatakan berkasnya.** Tiga temuan terbesar putaran ini
bukan tiga bug terpisah melainkan tiga gejala dari satu bentuk data yang sama —
lihat [§5](#5-akar-bersama--sectionbreakattrs-terlalu-tipis). Satu di antaranya tidak sekadar
hilang: nomor halamannya **salah**, dan salahnya terlihat pembaca.

---

## 0. Ringkasan temuan

| Kode | Temuan | Letak | Bobot | Status |
|---|---|---|---|---|
| **W1** | Nomor halaman mengulang di tiap section — tertulis 32,32,32,33,32,32,33,32 | impor → render | **L — keluaran salah** | ✅ 32…39 |
| **W2** | Peringatan "header/footer tidak ikut terbawa" muncul padahal footernya terbawa | impor | **S — keluaran salah** | ✅ |
| **W3** | *Column break* (`w:br w:type="column"`) diam-diam jadi ganti baris | impor | **M** | ✅ node `columnBreak` |
| **W4** | Lebar kolom tak-sama (`w:cols w:equalWidth="0"`) dibuang | impor + render | **M** | ✅ `widths` + `gaps` |
| **W5** | Tab stop tetap tak punya padanan — lanjutan S5 | impor | catatan | — masih terbuka |
| **W6** | Kotak teks: teks selamat, tata letak tidak — lanjutan D2 | impor | catatan | — masih terbuka |
| **W7** | Perenggangan huruf 652× — lanjutan S11, sudah diperingatkan jujur | impor | catatan | — tidak ada pekerjaan |
| **W8** | Hiasan sub-piksel di dalam grup ikut masuk sebagai gambar isi | impor | **S** | ✅ extent per gambar |

Pembagiannya sengaja tegas: **W1 dan W2 menghasilkan keluaran yang salah**, sisanya
kehilangan yang jujur. Dua kelas ini tidak boleh diurut dalam satu tabel prioritas — yang
pertama menipu pembaca, yang kedua "hanya" mengecewakannya.

---

## 1. Berkas uji

| | |
|---|---|
| Berkas | `/mnt/doc/Reacteev/FORMAT PROPOSAL (TA1) UNPAD.docx` |
| md5 | `e23bc751491343eec18c1b846e2457dc` (34.072 byte) |
| Isi | 9 `w:sectPr` · 3 section berkolom · 4 `w:br w:type="column"` · 1 `w:pgNumType w:start="32"` · 80 `w:tabs` · 9 kotak teks (`w:txbxContent`/`wps:txbx`) · 3 media |

Berkas ini sudah dipakai di putaran v1 dan **tidak berubah** sejak (stempel waktu 5 September,
md5 sama), jadi angka teks dan gambarnya bisa langsung dibandingkan dengan
[tabel §8 v1](DOCX-IMPORT-GAP.md#8-hasil-setelah-perbaikan).

---

## 2. Cara mengukur — dan batas kesahihannya

Dua alat, keduanya di [Lampiran](#lampiran--skrip-pengukuran):

1. **Audit importer di host** (`bun`): memanggil `readBody` dan `readDocx` apa adanya, membaca
   `context.state.skipped` utuh berikut jumlahnya, lalu menghitung selisih teks `w:t`.
2. **Ukur DOM di kontainer `worker`** (Playwright/Chromium): impor sungguhan lewat input
   berkas di `http://web:3000`, menunggu `body[data-editor-ready="true"]`, lalu mengukur
   lembar, kolom, koordinat blok, dan isi tiap kotak perabot.

**Batasnya, dinyatakan di muka.** Putaran v2 menetapkan aturan bahwa perbandingan hanya sah
bila dua PDF berasal dari satu berkas yang sama persis. Untuk berkas ini **tidak ada PDF
rujukan** dari Word maupun Google Docs, jadi putaran ini **tidak** mengklaim apa pun tentang
jumlah halaman atau paritas tata letak. Yang diklaim hanya yang bisa dibuktikan tanpa rujukan:

- apa yang **dinyatakan berkasnya** (dibaca dari `word/document.xml`),
- apa yang **dilakukan kodenya** (baris kode yang menuruni atau membuang pernyataan itu),
- apa yang **terukur di DOM** setelah impor sungguhan.

Ketika dokumen ini menyebut "seharusnya", yang dimaksud adalah semantik Word yang tertulis di
spesifikasi OOXML — mis. `w:pgNumType` berlaku pada section yang menyatakannya saja — bukan
hasil render yang pernah dilihat.

### Hasil impor (baseline putaran ini)

| | |
|---|---|
| Teks `w:t` → terimpor | 3.627 → 3.602 (selisih 25 = duplikat `mc:Choice`/`mc:Fallback`, bukan kehilangan) |
| Heading | 11 |
| Gambar | 3 |
| Tabel | 1 |
| `sectionBreak` | 9 |
| Lembar kanvas / pengganjal | 8 / 7 |
| Dilewati | `jarak-huruf=652` |
| Galat konsol | tidak ada |

---

## 3. Keluaran yang salah

### W1. Nomor halaman mengulang di tiap section — **L**

Berkas menyatakan `<w:pgNumType w:start="32"/>` **hanya di `sectPr` pertama**; delapan
`sectPr` sisanya tidak menyebut penomoran sama sekali, yang di Word berarti "lanjutkan".
Terukur di footer, satu kotak per lembar:

| Lembar | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| Tertulis | 32 | 32 | 32 | **33** | 32 | 32 | **33** | 32 |
| Seharusnya | 32 | 33 | 34 | 35 | 36 | 37 | 38 | 39 |

Rantainya utuh dan tiap mata rantainya benar sendiri-sendiri:

1. [`parse.ts:595`](../apps/web/features/document/docx/parse.ts) — PageSetup tingkat dokumen
   diambil dari `endings[0]`, yaitu section pertama. Jadi `pageNumbering.restart = 32` menjadi
   **dasar seluruh dokumen**, bukan milik satu section.
2. [`parse.ts:578`](../apps/web/features/document/docx/parse.ts) — tiap `sectionBreak` hanya
   membawa `props.pageSetup` miliknya sendiri; section tanpa `w:pgNumType` tidak menulis apa pun
   tentang penomoran.
3. [`section-break.ts:229`](../apps/web/features/editor/section-break.ts) — `sectionSpans`
   menyusun span dengan `{ ...previous.setup, ...patch }`. Karena `patch` diam soal penomoran,
   `restart: 32` **diwariskan ke setiap section**.
4. [`numbering.ts:40`](../apps/web/features/editor/page-furniture/numbering.ts) — `restart`
   berupa angka memulai ulang penghitung di **tiap pergantian section**. Perilaku ini benar
   dan memang diuji; yang salah adalah datanya.

**Usulan.** Perbaikannya di sisi impor, bukan di `numbering.ts`: section tanpa `w:pgNumType`
harus menulis `pageNumbering: { format, restart: 'continue' }` **secara eksplisit**, supaya
pewarisan `sectionSpans` tidak bisa menghidupkan kembali angka mulai section pertama. Ini
keluarga yang sama dengan keputusan V6 di v2 — importer harus bisa membedakan "tidak disebut"
dari "dinyatakan nihil", dan jawabannya sama: tulis eksplisit.

Formatnya ikut dirantai di sisi yang sama, karena ia mewaris ke arah berlawanan: section yang
tidak menyebut `w:fmt` memakai format section sebelumnya, jadi 'decimal' bukan nilai jatuhan
yang benar untuk dokumen beromawi.

> **Penemuan susulan — mata rantai kelima.** Menulis "continue" secara eksplisit ternyata belum
> cukup: nomornya berubah dari 32,32,32,33… menjadi **1,2,3…**, sama salahnya. Sebabnya di
> [`pagination.ts:404`](../apps/web/features/editor/pagination.ts) — section **menerus** tidak
> membuka lembar, jadi aturannya ditimpakan pada lembar yang sedang berjalan:
> `current.pageNumbering = rule.pageNumbering`. Berkas ini membuka dirinya dengan section
> berkolom yang menerus, jadi pembatas pertamanya mendarat di lembar 1 — lembar yang mulai-ulang
> 32-nya baru saja dipasang — dan menimpanya dengan "continue".
>
> Cacat itu **sudah ada sebelumnya**, hanya tidak terlihat: selama tiap section mewarisi
> `restart: 32`, aturan yang menimpa membawa angka yang sama. Ia baru muncul begitu importer
> jujur. Perbaikannya: section menerus yang cuma berkata "lanjutkan" tidak menyentuh
> mulai-ulang maupun identitas section lembar berjalan — format dan visibilitasnya tetap
> berlaku, karena keduanya tidak memulai ulang apa pun. Yang benar-benar meminta mulai-ulang
> tetap didengar.

> Perlu dicatat sekalian bahwa mengambil PageSetup dokumen dari section **pertama** adalah
> penyederhanaan yang tidak pernah dibahas; di Word properti halaman "dokumen" lebih dekat ke
> section terakhir. Untuk berkas ini keduanya sama (kecuali `pgNumType`), jadi tidak ada
> gejala — tapi ia layak jadi keputusan sadar, bukan efek samping.

### W2. Peringatan header/footer berbohong — **S**

Yang muncul di layar setelah impor:

```
652 perenggangan huruf belum ikut terbawa dan akan menyusul.
Header, footer, dan nomor halaman tidak punya padanan di editor ini, jadi tidak ikut terbawa.
```

Kalimat kedua **salah**. `furnitureContent.footer.default` masuk berisi token `{page}`
(Times New Roman 12,5pt), dan delapan kotak perabot benar-benar terender di kanvas — angkanya
bahkan menjadi bukti W1 di atas.

Sebabnya: footer berkas ini menaruh field PAGE **di dalam kotak teks**
(`wps:txbx` → `w:txbxContent`). `lineOf` ([`header-footer.ts:53`](../apps/web/features/document/docx/header-footer.ts))
hanya menuruni `w:r` dan lima pembungkus di `CONTAINERS` — `hyperlink`, `sdt`, `sdtContent`,
`smartTag`, `ins` — dan tidak pernah masuk ke `w:drawing`. Jadi `line` null → `furniture` null.
Lalu [`index.ts:137`](../apps/web/features/document/docx/index.ts) memutuskan peringatannya
**hanya dari `furniture`**, tanpa melihat `content` sama sekali:

```ts
if (hasHeaderFooter && !furniture) { … }
```

**Usulan.** Syaratnya diubah menjadi "tidak ada `furniture` **dan** tidak ada
`furnitureContent`". Ini sekaligus menutup jalur sebaliknya, yang belum pernah terjadi tapi
sama mungkinnya: `furniture` ada, isi kayanya gagal, dan pengguna tidak diberi tahu apa-apa.
Model baris lama (`PageFurnitureLine`) sendiri sudah bukan jalur utama sejak header/footer kaya
mendarat — lihat [§7](#7-status-yang-sudah-basi-di-dokumen-lama).

---

## 4. Kehilangan yang jujur (dan yang belum diperingatkan)

### W3. *Column break* jadi ganti baris, tanpa jejak — **M**

[`parse.ts:129`](../apps/web/features/document/docx/parse.ts):

```ts
case 'br':
    if (val(node) === 'page' || attr(node, 'type') === 'page') pageBreak = true
    else text += '\n'
    break
```

Hanya `type="page"` yang dikenali. `type="column"` — dan `type="textWrapping"` — sama-sama
jatuh ke `\n`. Berkas ini punya **4**, dan keempatnya justru yang menyusun tata letaknya:

| Posisi | Section | Kiri dari break | Kanan dari break |
|---|---|---|---|
| 1.652 | 2 kolom | "Halaman Sampul" | judul proposal + logo |
| 15.285 | 2 kolom | "Halaman Pengesahan" | "HALAMAN PENGESAHAN PROPOSAL…" |
| 28.361 | 3 kolom | "Nama NIP" (Pembimbing 1) | "Pembimbing 2" |
| 30.802 | 3 kolom | "Nama NIP." (Ketua Prodi) | "Pembimbing 3" |

Dua yang pertama adalah pola templat Indonesia yang lazim: label penanda halaman di kolom kiri
yang sempit, isinya di kolom kanan yang lebar. Terukur di DOM, blok tanda tangan tiga kolom itu
mendarat begini:

| Blok | x | y |
|---|---|---|
| Pembimbing 1 | 431 | 2424 |
| Pembimbing 2 | 500 | **2518** |
| Pembimbing 3 | 857 | 2424 |

Pembimbing 2 turun satu baris alih-alih berdiri di kolom tengah. Tidak ada peringatan apa pun —
`case 'br'` tidak pernah memanggil `skip`.

**Usulan.** Editor sudah punya `PAGE_BREAK_NODE`; padanan kolom belum ada. Dua tingkat:

1. **Murah dan jujur** — hitung `w:br w:type="column"`, keluarkan peringatan bernama
   ("pindah kolom"), teksnya tetap masuk. Menghentikan kehilangan senyap hari ini.
2. **Sesungguhnya** — node `columnBreak` yang dihormati `flowColumns`
   ([`columns.ts`](../apps/web/features/editor/columns.ts)) sebagai titik pindah kolom paksa.
   Terikat W4: tanpa lebar kolom yang benar, pindah kolom yang benar pun mendarat di tempat
   yang salah.

### W4. Lebar kolom tak-sama dibuang — **M**

[`sections.ts:101`](../apps/web/features/document/docx/sections.ts) hanya membaca `w:num` dan
atribut `space` **pada `w:cols`**. `w:equalWidth` dan seluruh anak `w:col` tidak pernah
dilihat. Ketiga section berkolom di berkas ini menyatakan lebar per kolom, dan tidak satu pun
memakai `space` di tingkat `w:cols` — jadi bahkan jaraknya pun hilang:

```
sect#0  <w:cols w:num="2" w:equalWidth="0"><w:col w:w="1953" w:space="538"/><w:col w:w="6727"/></w:cols>
sect#2  <w:cols w:num="2" w:equalWidth="0"><w:col w:w="2310" w:space="180"/><w:col w:w="6728"/></w:cols>
sect#4  <w:cols w:num="3" w:equalWidth="0"><w:col w:w="1724" w:space="258"/><w:col w:w="3846" w:space="188"/><w:col w:w="3202"/></w:cols>
```

Lebar isi halaman = 11910 − 1275 − 1417 = **9218 twip**, dan tiap baris di atas berjumlah persis
segitu. Kolom "Halaman Sampul" seharusnya memakan 21% lebar; yang dirender 50%.

Yang membuat ini terasa mahal: **node `columns` sudah mendukung lebar tak-sama.**
`parseWidthsAttribute`, `setColumnsLayout({ widths })`, dan `clampColumnWidths` semuanya ada di
[`columns.ts`](../apps/web/features/editor/columns.ts). Yang tidak punya tempat untuk lebar itu
adalah `SectionBreakAttrs.columns`, yang bentuknya `{ count: number; gap?: number }`
([`section-break.ts:9`](../apps/web/features/editor/section-break.ts)). Kemampuannya ada di
satu ujung dan tidak ada di ujung lainnya.

### W5. Tab stop — lanjutan S5, tetap tak punya padanan

80 definisi `w:tabs`, 84 `w:tab`. Importer menuliskannya sebagai karakter `\t`, yang di HTML
runtuh jadi satu spasi. Terukur, dua paragraf masuk sebagai:

```
"Nama\tNIM"
```

— judul tabel anggota tim di sampul dan di halaman pengesahan, yang di Word berdiri sebagai dua
kolom rapi lewat tab stop. Barisnya sendiri ("Nama Mahasiswa 1 XXXXXXXX Nama Mahasiswa 2 …")
masuk sebagai satu paragraf panjang.

S5 di v1 menutup pola "teks—tab—nomor halaman" menjadi `TocBlock`; pola "tabel yang digambar
dengan tab" tidak tertangkap dan memang tidak diklaim tertangkap. Dicatat di sini sebagai
konfirmasi lapangan, bukan temuan baru.

### W6. Kotak teks — lanjutan D2, teks selamat, tata letak tidak

Tabel perbandingan "Alternatif / Kelebihan / Kekurangan" digambar dengan kotak teks (9 kejadian
`w:txbxContent`/`wps:txbx`). D2 di v1 menyelamatkan teksnya; tata letaknya memang tidak pernah dijanjikan.
Terukur, ketiga judul kolomnya menumpuk di x yang sama:

| Blok | x | y |
|---|---|---|
| Alternatif | 413 | 6424 |
| Kelebihan | 413 | 6442 |
| Kekurangan | 413 | 6460 |

### W7. Perenggangan huruf — lanjutan S11, sudah jujur

652 `w:spacing` di dalam `w:rPr`, dilewati dan diperingatkan dengan kalimatnya sendiri. Berkas
ini memakainya di hampir tiap run (nilai −10 sampai +1) karena dibuat lewat konverter yang
mengunci lebar tiap kata. Tidak ada yang perlu dikerjakan; dicatat supaya angka 652 di
peringatan tidak terbaca sebagai kerusakan.

### W8. Hiasan sub-piksel ikut masuk sebagai gambar isi — **S**

Tiga gambar masuk, dan hanya satu di antaranya gambar sungguhan:

| Media | Ukuran terender | Sebenarnya |
|---|---|---|
| `image1.jpeg` | 117 × 127 | logo Unpad — benar |
| `image2.png` (188 byte) | 549 × 23 | garis hiasan, lebar aslinya **0,7 px** |
| `image3.png` (171 byte) | 3 × 67 | garis hiasan kedua |

> **Koreksi diagnosis.** Putaran temuan menuliskan keduanya sebagai "pratinjau `mc:Fallback`".
> Pembongkaran ulang `word/document.xml` menunjukkan sebaliknya: keduanya `pic:pic` **asli di
> cabang `mc:Choice`**, anggota satu grup `wpg:wgp`, masing-masing dengan
> `pic:spPr/a:xfrm/a:ext` sendiri — `rId7` menyatakan `cx="9142"` EMU, yaitu **0,7 px**.
> Cabang `mc:Fallback` memang juga memuat keduanya sebagai `v:imagedata`, tapi jalur itu tidak
> pernah dibaca sebagai gambar: `mediaElement` hanya mengambil kotak teks dari `Fallback`.

Yang salah bukan cabang yang dibaca melainkan **ukuran yang dipasangkan**.
[`media.ts`](../apps/web/features/document/docx/media.ts) memberi `wp:extent` bingkai kepada
blip PERTAMA dan tidak memberi ukuran apa pun kepada sisanya. Di dalam grup, `wp:extent`
menggambarkan bingkai seluruh grup — 411,55 × 17,3 pt, yaitu **549 × 23 px** — jadi garis
selebar 0,7 px itu justru mewarisi ukuran grupnya, dan tetangganya dirender pada ukuran natural
PNG-nya. Angka 549 × 23 yang terukur di DOM adalah bingkai grup, bukan ukuran gambarnya.

Karena itu ambang yang dikira-kira tidak diperlukan. Tiap `pic:pic` anggota grup memakai
extent miliknya sendiri, dan yang salah satu sisinya membulat di bawah 2 px dilewati sebagai
hiasan — ia memang tidak bisa membawa isi apa pun. Gambar yang **bukan** anggota grup tidak
pernah dilewati sekecil apa pun ukurannya: di sana `wp:extent` memang miliknya, dan gambar
1 × 1 px yang dipasang penulis tetap isi dokumen.

---

## 5. Akar bersama — `SectionBreakAttrs` terlalu tipis

W1, W3, dan W4 tampak seperti tiga bug di tiga berkas berbeda. Ketiganya bermuara ke satu
bentuk data:

```ts
export interface SectionBreakAttrs {
    pageSetup: Partial<PageSetup> | null
    columns: { count: number; gap?: number } | null
    continuous?: boolean
}
```

| Yang dinyatakan Word | Tempatnya sebelum | Tempatnya sekarang |
|---|---|---|
| `w:cols/w:col/@w:w` (lebar per kolom) | tidak ada → **W4** | `SectionColumns.widths` |
| `w:cols/w:col/@w:space` (jarak per celah) | hanya satu `gap` global, dan itu pun dibaca dari tempat yang salah → **W4** | `SectionColumns.gaps`, `gap` tetap sebagai jatuhan |
| `w:br w:type="column"` (pindah kolom) | tidak ada → **W3** | node `columnBreak` |
| `w:pgNumType` absen = "lanjutkan" | tidak terbedakan dari "tidak disebut" → **W1** | ditulis eksplisit tiap section |

Menambalnya satu per satu berarti menyentuh `sections.ts`, `section-break.ts`, `columns.ts`,
dan ekspor DOCX sebanyak tiga kali. Menggarapnya sebagai **satu revisi bentuk** — `columns`
menerima `widths` (dan `gaps`), `pageNumbering` selalu dinyatakan eksplisit per section, plus
satu node `columnBreak` — menyentuh berkas yang sama satu kali, dan ekspor DOCX-nya ikut
lurus dalam sekali jalan.

Itulah yang dikerjakan. Yang tidak terduga: sisi render sudah lebih siap daripada sisi
datanya. `resolveColumnSlots` sudah tahu lebar tak-sama, dan `flowColumns` sudah punya
jalur pemenggal — pindah kolom hanya perlu satu cabang yang **tidak** memanggil `advance()`
dua kali. Yang mahal justru mata rantai kelima W1 yang tidak terlihat dari pembacaan kode
saja (lihat kotak di §3).

Ekspor memang bagian dari ongkosnya, dan itu argumen untuk mengerjakannya sekarang: selama
bentuknya belum lengkap, tiap dokumen berkolom yang masuk lalu diekspor kembali kehilangan
lebar kolomnya untuk kedua kalinya.

---

## 6. Urutan yang diusulkan

| # | Pekerjaan | Ongkos | Alasan | Status |
|---|---|---|---|---|
| 1 | **W1** penomoran per section eksplisit | S | Keluaran salah yang terlihat pembaca; sebabnya sudah pasti; tidak menunggu keputusan apa pun | ✅ |
| 2 | **W2** syarat peringatan header/footer | S | Peringatan yang berbohong lebih merusak kepercayaan daripada celah yang diakui | ✅ |
| 3 | **W3** peringatan "pindah kolom" | S | Menghentikan kehilangan senyap hari ini, tanpa menunggu revisi bentuk | ✅ dilewati — langsung ke tingkat 2 |
| 4 | **W4 + W3 penuh** revisi `SectionBreakAttrs` | M–L | Satu perubahan bentuk, tiga gejala; ikut merapikan ekspor DOCX | ✅ |
| 5 | **W8** ambang hiasan | S | Butuh kalibrasi empat berkas uji dulu | ✅ tanpa ambang — lihat koreksi §W8 |
| — | **W5, W6, W7** | — | Tidak ada pekerjaan; tercatat sebagai konfirmasi lapangan | — |

Butir 3 tidak dikerjakan sebagai peringatan. Begitu revisi bentuk (butir 4) tetap harus
dikerjakan, "pindah kolom yang diakui hilang" menjadi setengah langkah yang harus dibongkar
lagi seminggu kemudian; node `columnBreak` sungguhan berongkos hampir sama.

---

## 7. Status yang sudah basi di dokumen lama

[Tabel §8 v1](DOCX-IMPORT-GAP.md#8-hasil-setelah-perbaikan) masih menandai **D8 (header/footer
kaya)** sebagai ⏳ "menunggu keputusan produk", dan [§7 v1](DOCX-IMPORT-GAP.md#7-keputusan-produk-yang-perlu-diambil)
masih menanyakannya sebagai keputusan terbuka. Keduanya sudah terjawab: `997cfbc` melandaskan
[HEADER-FOOTER-PLAN.md](HEADER-FOOTER-PLAN.md) T3–T6 — header/footer kaya disunting di tempat,
`FurnitureContent` membawa paragraf lengkap berikut token `{page}`/`{pages}`, dan ekspor
menulis `w:hdr`/`w:ftr` beserta `w:pgNumType` kembali.

Terverifikasi di putaran ini: berkas UNPAD menghasilkan `furnitureContent.footer.default` dan
delapan kotak footer terender. Yang tersisa dari model lama justru **W2** — satu syarat
peringatan yang belum ikut pindah.

Yang **masih** benar-benar terbuka dari dua dokumen sebelumnya: S8 (metadata sitasi CSL),
V1 tahap 2 (paritas paginasi tingkat baris, 39 lawan 33), dan V7 (`emulate_media(print)`
meruntuhkan halaman ber-TOC).

---

## 8. Hasil setelah perbaikan

Diukur dengan kedua alat [§2](#2-cara-mengukur--dan-batas-kesahihannya) pada berkas dan
baseline yang sama. Batas kesahihan yang sama pula: **tidak ada PDF rujukan** untuk berkas ini,
jadi tidak ada klaim tentang paritas tata letak — yang diklaim hanya apa yang dinyatakan
berkasnya, apa yang dilakukan kodenya, dan apa yang terukur di DOM.

### Nomor halaman (W1)

| Lembar | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| Sebelum | 32 | 32 | 32 | **33** | 32 | 32 | **33** | 32 |
| Seharusnya | 32 | 33 | 34 | 35 | 36 | 37 | 38 | 39 |
| **Sesudah** | **32** | **33** | **34** | **35** | **36** | **37** | **38** | **39** |

### Blok tanda tangan tiga kolom (W3 + W4)

| Blok | x sebelum | y sebelum | x sesudah | y sesudah |
|---|---|---|---|---|
| Pembimbing 1 | 431 | 2424 | 431 | 2250 |
| Pembimbing 2 | 500 | **2518** | 632 | **2250** |
| Pembimbing 3 | 857 | 2424 | 833 | 2250 |

Ketiganya kini berdiri sebaris. Pola "label sempit di kiri, isi lebar di kanan" ikut hidup:
"Halaman Sampul" mendarat di x=424 selebar 119 px, judul proposalnya di x=590 — persis
`424 + 130 + 36`, yaitu lebar kolom pertama plus jaraknya, dua-duanya dibaca dari `w:col`.

### Sisanya

| | Sebelum | Sesudah |
|---|---|---|
| `columnBreak` | — (tidak ada nodenya; 4 ganti baris senyap) | **4** · `sectionBreak` tetap 9 |
| Gambar terender | 3 (satu isi, dua hiasan) | 1 — hanya logo Unpad, 117 × 127 |
| Peringatan | perenggangan huruf 652 + *"header/footer tidak ikut terbawa"* (**bohong**) | perenggangan huruf 652 + "2 garis hiasan … tidak ikut terbawa; gambar isi tidak terpengaruh" |
| Teks `w:t` | 3.627 → 3.602 | tidak berubah |
| Lembar / pengganjal | 8 / 7 | tidak berubah |

### Putar-balik dan interop

Diuji dengan LibreOffice di mesin pengembang (`soffice --convert-to fodt`, membaca kembali
bagaimana LibreOffice menafsirkan `w:cols`):

- **Lebar kolom** pulang utuh. `w:equalWidth="false"` beserta anak `w:col` terbaca sebagai
  `style:columns` dengan `style:rel-width` per kolom; ketiga section berkolom UNPAD kembali
  dengan perbandingan aslinya. (Pustaka `docx` menulis ST_OnOff sebagai `"false"`, bukan `"0"`
  — keduanya sah dan Word maupun LibreOffice membaca keduanya.)
- **Keempat pindah kolom** pulang sebagai `w:br w:type="column"` dan terbaca LibreOffice
  sebagai `fo:break-before="column"`.
- **Penomoran** pulang benar: hanya section pembuka yang menulis `w:pgNumType w:start="32"`,
  sisanya `<w:pgNumType/>` kosong yang terbaca kembali sebagai `restart: 'continue'`.
- Impor → ekspor → impor mempertahankan perbandingan kolom (130:448 → 127:439).

### Regresi

Tiga berkas uji lain (`Proposal_TA_Capstone_Bab1-3_v1[citasi]`, `Untitled document`,
`writinghub gen`) diaudit ulang: jumlah gambar, teks, node, dan peringatannya **tidak berubah**
sama sekali. Ambang hiasan tidak menyentuh satu pun gambar mereka — semuanya bukan anggota grup.

Suite: 869 tes lulus, typecheck bersih.

---

## Lampiran — skrip pengukuran

Keduanya sengaja tidak dikomit sebagai berkas sumber.

### A. Audit importer (host)

Salin ke `apps/web/docx-audit.ts`, jalankan `bun run docx-audit.ts <berkas.docx>` dari
`apps/web`, lalu hapus. Ia memanggil `readBody` **dan** `readDocx`: yang pertama supaya
`context.state.skipped` terbaca utuh berikut jumlahnya, yang kedua supaya peringatan dan
perabot halaman ikut terlihat.

```ts
import { readFileSync } from 'node:fs'
import { readDocx } from '@/features/document/docx'
import { createParseState, type ParseContext, readRelationships, readTheme } from '@/features/document/docx/context'
import { createNumberer, readNumbering } from '@/features/document/docx/numbering'
import { bodyOf, readBody } from '@/features/document/docx/parse'
import { readStyles } from '@/features/document/docx/properties'
import { createXmlParser, type XmlParser } from '@/features/document/docx/xml'
import { type DocxArchive, openDocx, resolvePath } from '@/features/document/docx/zip'

const relsPathOf = (part: string) =>
	part.includes('/') ? `${part.slice(0, part.lastIndexOf('/'))}/_rels/${part.slice(part.lastIndexOf('/') + 1)}.rels` : `_rels/${part}.rels`

function partByType(archive: DocxArchive, parse: XmlParser, main: string, suffix: string) {
	const source = archive.text(relsPathOf(main))
	if (!source) return null
	for (const [, rel] of readRelationships(parse(source))) {
		if (rel.external || !rel.type.endsWith(`/${suffix}`)) continue
		const content = archive.text(resolvePath(main, rel.target))
		if (content) return parse(content)
	}
	return null
}

const textOf = (node: any): string =>
	node?.type === 'text' ? (node.text ?? '') : (node?.content ?? []).map(textOf).join('')
const walk = (nodes: any[], visit: (n: any) => void) => {
	for (const n of nodes ?? []) { visit(n); if (n?.content) walk(n.content, visit) }
}

const parse = await createXmlParser()
for (const path of process.argv.slice(2)) {
	const bytes = new Uint8Array(readFileSync(path))
	const archive = openDocx(bytes)
	const main = 'word/document.xml'
	const source = archive.text(main) ?? ''
	const rels = archive.text(relsPathOf(main))
	const context: ParseContext = {
		styles: readStyles(partByType(archive, parse, main, 'styles')),
		theme: readTheme(partByType(archive, parse, main, 'theme')),
		numberer: createNumberer(readNumbering(partByType(archive, parse, main, 'numbering'))),
		relationships: rels ? readRelationships(parse(rels)) : new Map(),
		archive,
		mainPart: main,
		footnotes: new Map(),
		commentMeta: new Map(),
		state: createParseState(),
	}
	const { blocks, pageSetup } = readBody(bodyOf(parse(source))!, context)
	const full = await readDocx(bytes)

	const norm = (s: string) => s.replace(/\s+/g, '').length
	const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
	const want = [...source.matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>/g)]
		.map((m) => m[1].replace(/&(amp|lt|gt|quot|apos);/g, (_, name: string) => entities[name] as string))
		.join('')

	const kinds = new Map<string, number>()
	walk(blocks as any[], (n) => { if (n?.type) kinds.set(n.type, (kinds.get(n.type) ?? 0) + 1) })

	console.log(`\n=== ${path}`)
	console.log('  dilewati :', [...context.state.skipped].map(([k, v]) => `${k}=${v}`).join(', ') || '-')
	console.log('  teks     :', norm(want), '→', norm(blocks.map(textOf).join('')))
	console.log('  node     :', [...kinds].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(', '))
	console.log('  pageSetup:', JSON.stringify(pageSetup))
	for (const b of blocks as any[]) if (b.type === 'sectionBreak') console.log('  section  :', JSON.stringify(b.attrs))
	console.log('  furniture:', JSON.stringify(full.furniture), '| isi kaya:', Object.keys(full.furnitureContent ?? {}))
	for (const w of full.warnings) console.log('     peringatan:', w.message)
}
```

### B. Ukur DOM setelah impor (kontainer `worker`)

```bash
docker compose cp "<berkas.docx>" worker:/tmp/uji.docx
docker compose cp probe.py worker:/tmp/probe.py
docker compose exec -T worker python3 /tmp/probe.py
```

```python
from playwright.sync_api import sync_playwright
import json

with sync_playwright() as pw:
    b = pw.chromium.launch(); ctx = b.new_context(); p = ctx.new_page()
    p.goto("http://web:3000/", wait_until="domcontentloaded")
    p.wait_for_selector('body[data-editor-ready="true"]', timeout=60_000)   # WAJIB
    p.set_input_files("input[type=file]", "/tmp/uji.docx")
    p.wait_for_timeout(35_000)
    print(json.dumps(p.evaluate("""() => {
      const body = document.querySelector('.document-body')
      const at = (sel, re) => [...body.querySelectorAll(sel)]
        .filter((e) => re.test((e.innerText || '').trim()))
        .map((e) => { const r = e.getBoundingClientRect()
                      return { t: e.innerText.trim().slice(0, 30), x: Math.round(r.left), y: Math.round(r.top) } })
      return {
        sheets:    document.querySelectorAll('.document-sheet').length,
        spacers:   document.querySelectorAll('.page-break-spacer').length,
        // satu kotak per lembar; isinya sudah melewati penggantian token {page}
        furniture: [...document.querySelectorAll('.furniture-box')].map((e) => e.textContent.trim()),
        // kolom sungguhan, bukan pengganjal region
        multiColumn: [...body.querySelectorAll('*')]
          .filter((e) => { const cc = getComputedStyle(e).columnCount; return cc && cc !== 'auto' && Number(cc) > 1 })
          .map((e) => ({ cc: getComputedStyle(e).columnCount, w: Math.round(e.getBoundingClientRect().width) })),
        blok: at('p, h1, h2, h3', /^(Pembimbing|Alternatif|Kelebihan|Kekurangan)/),
        imgs: [...body.querySelectorAll('img')].map((e) => {
          const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) } }),
      }
    }"""), indent=1, ensure_ascii=False))
    b.close()
```

> ⚠️ Dua jebakan yang sudah pernah memakan waktu berjam-jam, keduanya diwarisi dari
> [lampiran v2](DOCX-IMPORT-GAP-V2.md#lampiran--cara-reproduksi): **jangan** memasang berkas
> tepat setelah `goto` — input impor ada di HTML SSR, jadi `set_input_files` berhasil sebelum
> React memasang penangannya dan event `change`-nya hilang tanpa galat; dan `/tmp` di kontainer
> `worker` terhapus tiap kontainer dinyalakan ulang.
>
> Catatan pengukuran kolom: `columnCount > 1` **tidak** terpasang pada elemen mana pun meski
> kolomnya terender — tata letak kolom di editor ini dikerjakan `flowColumns` lewat pengganjal
> region (`.columns-region-space`), bukan properti CSS `column-count`. Untuk membuktikan kolom
> benar-benar hidup, ukur koordinat blok (dua blok pada `y` yang sama dengan `x` berbeda),
> jangan mengandalkan `getComputedStyle`.
