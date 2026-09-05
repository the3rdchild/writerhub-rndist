# WritingHub — Celah Import DOCX & Rencana Perbaikan

Status: **Butir S/M selesai diimplementasi 5 September 2026; modul dipecah ulang di hari yang sama —
tersisa D8 & S8 (keputusan produk)** ·
Audit awal & baseline kode `e81162b` (branch `main`); hasil verifikasi ulang ada di [§8](#8-hasil-setelah-perbaikan).

Dokumen ini mendata konten DOCX yang **belum** terbawa ke editor, diverifikasi dengan
menjalankan importer yang sebenarnya (`apps/web/features/document/docx/`) terhadap empat
berkas uji nyata, bukan dari membaca kode saja.

**Kesimpulan singkat: teksnya aman, objek dan strukturnya yang jatuh.** Selisih karakter
antara `w:t` di berkas dan teks yang sampai di editor hanya 0–54 karakter untuk keempat
berkas. Yang hilang adalah gambar mengambang, kotak teks, objek tertanam, catatan kaki,
komentar — dan yang paling merusak: **heading yang tidak terdeteksi**, karena satu berkas
kehilangan seluruh kerangkanya.

---

## 0. Peta ringkas

| Kategori | Isi | Bagian |
|---|---|---|
| **A. Hilang total** | Isinya tidak sampai ke editor sama sekali | [§3](#3-celah-a--hilang-total) (D1–D8) |
| **B. Turun kelas** | Masuk, tapi kehilangan struktur atau formatnya | [§4](#4-celah-b--masuk-tapi-turun-kelas) (S1–S12) |
| **C. Sudah aman** | Terbawa dengan benar — jangan dirusak saat memperbaiki A/B | [§5](#5-yang-sudah-aman) |
| **D. Hasil perbaikan** | Status tiap celah setelah implementasi + audit ulang | [§8](#8-hasil-setelah-perbaikan) |
| **E. Sampul dua halaman** | Font tema, spasi tunggal, dan jarak media — diverifikasi di aplikasi | [§9](#9-sampul-yang-meluber-ke-halaman-kedua-5-september-2026) |

Ongkos ditulis **S** (di bawah satu jam), **M** (setengah hari), **L** (lebih dari sehari,
perlu keputusan produk dulu).

---

## 1. Cara mengukur

Importer dipanggil apa adanya lewat `readBody`, lalu tiga angka diambil per berkas:

1. **`context.skipped`** — peta tag yang dilewati importer beserta jumlahnya. Inilah yang
   nantinya menjadi peringatan di `warningsFor` ([`docx/index.ts:82`](../apps/web/features/document/docx/index.ts)).
2. **Selisih teks** — jumlah karakter `<w:t>` di `word/document.xml` dibanding jumlah
   karakter di node hasil. Selisih negatif berarti importer *menambah* teks (penanda list).
3. **Audit XML mentah** — hitung langsung fitur OOXML di berkas (`wp:anchor`, `w:object`,
   `w:footnoteReference`, …), supaya fitur yang importer bahkan tidak sadari pun ikut
   terdata.

Skrip audit ada di [Lampiran](#lampiran--skrip-audit). Ia sengaja tidak dikomit sebagai
berkas sumber; salin ke `apps/web/docx-audit.ts` saat mau mengukur ulang, lalu hapus.

### Berkas uji

| Berkas | Jenis | Kenapa dipilih |
|---|---|---|
| `FORMAT PROPOSAL (TA1) UNPAD.docx` | Templat proposal TA | Banyak kotak teks, logo mengambang, kolom |
| `Naufal_Proposal_TA_Capstone_Bab1-3_v1.docx` | Proposal TA berisi | Panjang (47k karakter), 15 tabel, TOC, referensi silang |
| `69565-277381-1-RV.docx` | Makalah IEEE | 110 rumus OMML, sitasi Mendeley, dua kolom |
| `IJMT_2-WHEEL DRIVE 02F Galley.docx` | Galley jurnal | Style kustom, diagram Visio, header multi-baris |

---

## 2. Hasil per berkas uji

| | UNPAD | Naufal | 69565 (IEEE) | IJMT Galley |
|---|---|---|---|---|
| Teks `w:t` → terimpor | 3.627 → 3.573 | 46.976 → 47.196 | 17.568 → 17.602 | 21.824 → 21.825 |
| Heading terdeteksi | 11 | 67 | 17 | **0** |
| Tabel | 1 | 15 | 5 | 0 |
| Gambar masuk / media di berkas | **0 / 3** | 8 / 8 | 2 / 2 | **18 / 22** |
| Rumus (blok + inline) | 0 | 0 | 82 + 28 | 0 |
| Dilewati importer | `drawing`×2, `AlternateContent`×2, kolom section pertama | — | — | `object`×4 |
| Kerusakan utama | Logo & 9 kotak teks hilang, kolom hilang | TOC jadi statis, semua sel jadi header | Superscript & sitasi jadi teks mati | **Seluruh kerangka hilang**, 4 diagram Visio hilang |

Angka teks yang *bertambah* (Naufal, 69565) berasal dari penanda list yang ditulis importer
ke dalam teks — bukan kebocoran.

---

## 3. Celah A — hilang total

### D1. Gambar mengambang (`wp:anchor`) — **M**

- **Gejala** — gambar yang di Word "mengambang" (wrap square/tight/behind text) tidak muncul.
- **Penyebab** — [`parse.ts:231`](../apps/web/features/document/docx/parse.ts) `readInlineImage`
  hanya menuruni `wp:inline`; `wp:anchor` tidak pernah dilihat, lalu `findImage` mencatatnya
  sebagai `drawing` yang dilewati.
- **Bukti** — UNPAD: 3 gambar mengambang (logo Unpad `.jpeg`, `Group 3`, `Graphic 10`) hilang
  padahal ketiga berkasnya ada di `word/media/`. Hasil import: **0 gambar**.
- **Usulan** — baca `wp:anchor` dengan jalur yang sama (`graphic/graphicData/pic/blipFill/blip`),
  ambil ukuran dari `wp:extent`, dan sisipkan sebagai gambar sebaris. Wrapping-nya memang
  tidak punya padanan di editor, tapi gambar yang ada di tempat yang kira-kira benar jauh
  lebih baik daripada tidak ada gambar.
- **Catatan** — sudah ada peringatan ("gambar belum ikut terbawa"), jadi pengguna tidak
  tertipu diam-diam. Ini menurunkan urgensinya, bukan menghapusnya.

### D2. Kotak teks, bentuk, dan VML (`w:pict`, `v:shape`, `mc:AlternateContent`) — **M**

- **Gejala** — teks di dalam kotak teks lenyap tanpa bekas yang bisa dikenali.
- **Penyebab** — `findImage` melewatkan `pict`; `mc:AlternateContent` jatuh ke `default:` di
  `walkInline` sehingga hanya tercatat sebagai nama tak dikenal.
- **Bukti** — UNPAD: 9 `w:txbxContent` (tabel "Alternatif / Kelebihan / Kekurangan" yang
  digambar dengan kotak teks) hilang — inilah 54 karakter yang lenyap di berkas itu.
- **Usulan** — untuk `mc:AlternateContent`, turuni `mc:Fallback` → `w:pict` → `v:textbox` →
  `w:txbxContent` dan perlakukan isinya sebagai paragraf biasa di posisi jangkarnya. Isi
  teksnya jauh lebih berharga daripada posisi kotaknya.
- **Peringatannya masih kasar** — muncul sebagai "Bagian yang tidak dikenali dilewati:
  AlternateContent". Tambahkan labelnya ke `SKIPPED_LABELS`
  ([`index.ts:75`](../apps/web/features/document/docx/index.ts)) supaya berbunyi "kotak teks",
  itu perbaikan **S** yang berdiri sendiri.

### D3. Objek tertanam (`w:object`) berikut gambar pratinjaunya — **M**

- **Gejala** — diagram Visio, bagan, dan persamaan MathType lama hilang seluruhnya.
- **Penyebab** — `w:object` dilewati di `walkInline`. Padahal hampir semua `w:object` membawa
  `v:shape` + `v:imagedata` berisi PNG/EMF pratinjau yang sudah ada di `word/media/`.
- **Bukti** — IJMT: 4 objek `Visio.Drawing.11`; berkasnya punya 22 media, hanya 18 yang masuk
  — empat yang hilang persis adalah pratinjau diagram itu.
- **Usulan** — saat menemui `w:object`, ambil `v:imagedata/@r:id` dan sisipkan pratinjaunya
  sebagai gambar. Objeknya sendiri memang tidak bisa dihidupkan di editor, tapi gambarnya
  membuat dokumen tetap terbaca.

### D4. Catatan kaki & catatan akhir — **M**

- **Gejala** — teks catatan kaki tidak ikut sama sekali; penanda supernya juga hilang.
- **Penyebab** — `word/footnotes.xml` dan `endnotes.xml` tidak pernah dibuka
  ([`index.ts:128`](../apps/web/features/document/docx/index.ts) hanya mengambil part
  `styles`, `theme`, `numbering`), dan `w:footnoteReference` jatuh ke `default:` di `runText`
  ([`parse.ts:146`](../apps/web/features/document/docx/parse.ts)).
- **Bukti** — keempat berkas uji tidak memakainya (0 referensi), jadi ini celah struktural,
  bukan temuan lapangan. Dua berkas *punya* `footnotes.xml`, isinya hanya separator bawaan.
- **Kenapa tetap penting** — editor sudah punya node `Footnote` + `FootnoteRef`
  ([`features/editor/footnote.ts`](../apps/web/features/editor/footnote.ts)) dan tool
  `insert_footnote`. Padanannya ada; yang belum ada cuma jembatannya. Skripsi Indonesia
  memakai catatan kaki dengan rutin.
- **Usulan** — baca part `footnotes`, petakan `w:footnoteReference/@w:id` → node `footnote`
  mengikuti pola yang dipakai `insert_footnote` (penanda di tempat, isi catatan di akhir).

### D5. Komentar Word — **M**

- **Gejala** — komentar dan balasannya hilang saat import.
- **Penyebab** — `word/comments.xml` tidak dibaca; `w:commentRangeStart`/`End` diabaikan
  diam-diam dan `w:commentReference` dilewati sebagai tag tak dikenal.
- **Kenapa penting** — editor punya sistem komentar sendiri (`CommentMark`, `CommentThread`),
  jadi ini pemetaan yang lurus: rentang → `CommentMark`, isi → thread.
- **Catatan** — impor komentar berarti impor identitas penulisnya juga; putuskan dulu apakah
  komentar Word masuk sebagai thread milik pengimpor atau membawa nama aslinya.

### D6. Isi tabel bersarang — **S**

- **Gejala** — tabel di dalam sel tabel hilang **beserta seluruh teksnya**, tanpa peringatan.
- **Penyebab** — [`parse.ts:600`](../apps/web/features/document/docx/parse.ts) `cellContent`
  hanya mengumpulkan anak bertag `p`; `w:tbl` di dalam `w:tc` tidak pernah disentuh.
- **Bukti** — tidak ada di empat berkas uji. Ini bom waktu, bukan temuan.
- **Usulan** — minimal: ratakan tabel bersarang menjadi paragraf di dalam sel induknya
  supaya teksnya selamat. Editor mendukung tabel bersarang atau tidak adalah pertanyaan
  terpisah; kehilangan teks tanpa jejak tidak boleh dibiarkan apa pun jawabannya.

### D7. Revisi terlacak dibuang tanpa pemberitahuan — **S**

- **Gejala** — `w:del` dibuang, `w:ins` diterima. Import diam-diam sama dengan "Accept All
  Changes".
- **Penyebab** — keduanya ditangani sebagai kasus di `walkInline`: `ins` dituruni, `del`
  di-`break`.
- **Usulan** — perilakunya sudah benar (editor tidak punya track changes), yang kurang
  peringatannya. Hitung `w:ins`/`w:del`, lalu beri tahu: "N revisi terlacak diterima
  otomatis." Ongkosnya kecil, dan mencegah salah paham yang mahal.

### D8. Isi header/footer di luar satu baris pertama — **L**

- **Gejala** — logo di footer hilang; header dua baris jadi satu baris.
- **Penyebab** — [`header-footer.ts:38`](../apps/web/features/document/docx/header-footer.ts)
  `lineOf` mengembalikan **paragraf pertama yang tidak kosong** sebagai satu baris teks polos.
  Modelnya sendiri (`PageFurnitureLine` = `{ text, align }`) memang hanya sanggup itu.
- **Bukti** — UNPAD: `footer1.xml` berisi 2 gambar (logo) → hilang. IJMT: `header1.xml`
  berisi 2 paragraf → paragraf kedua hilang.
- **Usulan** — ini butuh keputusan produk lebih dulu, lihat [§7](#7-keputusan-produk-yang-perlu-diambil).

---

## 4. Celah B — masuk tapi turun kelas

### S1. Heading dari style bernama sendiri tidak terdeteksi — **M, prioritas tertinggi**

- **Gejala** — dokumen masuk sebagai paragraf rata tanpa satu pun heading: kerangka, daftar
  isi, navigasi, dan aturan format per-level semuanya mati.
- **Penyebab** — [`parse.ts:81`](../apps/web/features/document/docx/parse.ts) `headingLevel`
  hanya mengenali tiga hal: `w:outlineLvl`, nama style yang cocok `/^heading\s*([1-9])$/i`,
  serta `Title`/`Subtitle`.
- **Bukti** — IJMT: **0 heading dari 222 blok**. Style yang dipakai bernama `SectionTitle`
  (40×) dan `SubHeading` (7×), tanpa `w:outlineLvl` sama sekali. Berkas itu juga memuat style
  warisan bernama `제목1` — nama heading yang dilokalkan tidak akan pernah cocok dengan pola
  bahasa Inggris.
- **Usulan**, berurutan dari yang paling aman:
  1. Telusuri rantai `basedOn`: style yang berbasis `Heading N` mewarisi levelnya.
  2. Cocokkan nama heading terlokalisasi (`Judul N`, `Overskrift`, `제목N`, …) — daftar
     pendek sudah cukup jauh.
  3. Terakhir, heuristik: paragraf pendek, tebal atau berukuran di atas badan naskah, tanpa
     titik di akhir, muncul berulang dengan style yang sama → kandidat heading. Heuristik
     ini harus dipagari ketat supaya tidak menaikkan caption menjadi heading.

### S2. Heading level 7–9 dipangkas ke 6 — **S**

`Math.min(6, …)` di dua tempat pada `headingLevel`. Editor justru memakai level 7–9 untuk
caption gambar/tabel — itulah yang dibaca `insert_toc` saat membangun Daftar Gambar dan
Daftar Tabel. Selama dipangkas, daftar gambar/tabel tidak bisa dibangun ulang setelah import.

### S3. Daftar isi Word jadi paragraf statis — **M**

Field `TOC` menyisakan teks hasilnya, jadi yang masuk adalah paragraf mati berisi nomor
halaman yang langsung basi. Naufal punya 3 field TOC. Editor punya `TocBlock` yang membangun
entrinya sendiri — deteksi `instrText` yang diawali `TOC` lalu ganti seluruh hasil field itu
dengan satu node `TocBlock` (`listKind` ditebak dari argumen `\c "Gambar"` / `\c "Tabel"`).
Bergantung pada S1: TOC block tidak berguna kalau headingnya tidak terdeteksi.

### S4. Superscript & subscript dibuang di tengah jalan — **S, paling murah**

`w:vertAlign` **sudah** diparsing ke `RunProps.vertAlign`
([`properties.ts:142`](../apps/web/features/document/docx/properties.ts)), tapi `marksOf`
([`parse.ts:107`](../apps/web/features/document/docx/parse.ts)) tidak pernah memakainya —
padahal ekstensi `Superscript` dan `Subscript` aktif di editor. Nasib yang sama menimpa
`caps` dan `smallCaps` yang juga sudah diparsing lalu dibuang. Ada di 69565 dan IJMT.
Perbaikannya beberapa baris di satu fungsi.

### S5. Tab stop diabaikan — **M**

`w:tab` menjadi karakter `\t` dan definisi `w:tabs` diabaikan seluruhnya (UNPAD 80 definisi,
69565 476). Akibatnya daftar isi manual, blok tanda tangan, dan kop yang disusun dengan tab
kehilangan perataannya — sisa nomor halaman menempel ke judulnya. Editor tidak punya konsep
tab stop; opsi paling realistis adalah memetakan pola "teks — tab — nomor halaman" ke
`TocBlock` (lihat S3) dan menerima sisanya berantakan.

### S6. Kolom di section pertama dibuang — **S**

[`parse.ts:849`](../apps/web/features/document/docx/parse.ts) — `w:cols` pada section
pertama sengaja dilewati dan menjadi peringatan `kolom-bagian-pertama`; kolom baru hidup
mulai section kedua. Kena di UNPAD. Naskah jurnal dua kolom yang tidak punya section break
akan masuk satu kolom penuh.

### S7. Tautan internal & bookmark hilang — **S**

[`parse.ts:192`](../apps/web/features/document/docx/parse.ts) `linkTarget` hanya
mengembalikan relationship **eksternal**; `w:hyperlink w:anchor="…"` dan seluruh
`w:bookmarkStart` diabaikan. Naufal: 67 tautan internal + 22 bookmark — yaitu daftar isi dan
seluruh referensi silangnya.

### S8. Field lain jadi teks mati — **catatan, bukan pekerjaan**

`SEQ`, `REF`, `PAGEREF`, `STYLEREF`, dan `ADDIN` menyisakan teks hasilnya saja. 69565 punya
20 field `ADDIN` (Mendeley/Zotero): sitasinya tetap terbaca, tapi metadatanya hilang sehingga
gaya sitasi tidak bisa diformat ulang setelah import. Perbaikan sesungguhnya berarti
menyimpan muatan CSL dari field itu — pekerjaan tersendiri, sebaiknya digabung dengan rencana
manajemen referensi.

### S9. Border tabel dari *table style* tidak dibaca — **M**

[`table-props.ts:64`](../apps/web/features/document/docx/table-props.ts) `tablePropsOf` hanya
membaca `w:tblBorders` langsung; referensi `w:tblStyle` ke `styles.xml` diabaikan. Naufal: 15
tabel memakai style, 13 punya border langsung → 2 tabel masuk tanpa garis. Border juga
diseragamkan (sisi `top` menang, variasi per sisi diratakan) — ini sudah dinyatakan sadar
sebagai penyederhanaan v1 di komentar berkasnya.

### S10. Semua baris "ulangi sebagai header" jadi sel header — **S**

[`parse.ts:632`](../apps/web/features/document/docx/parse.ts) memetakan `w:tblHeader` ke tipe
node `tableHeader`. Di Word `w:tblHeader` berarti "ulangi baris ini di tiap halaman", bukan
"ini baris judul" — tidak ada konsekuensi visualnya. Naufal menandai **121 dari 121 baris**,
sehingga seluruh isi 15 tabelnya tampil sebagai baris judul. Usulan: pakai `w:tblHeader`
hanya untuk baris pertama tiap tabel, sisanya sel biasa.

### S11. Format karakter & paragraf yang hilang diam-diam — **S masing-masing**

Semuanya tanpa peringatan apa pun:

| Fitur | Terlihat di | Akibat |
|---|---|---|
| `w:shd` pada run/paragraf | Naufal 49 | Arsiran latar hilang (Word modern memakai ini, bukan `w:highlight`) |
| `w:pBdr` | Naufal 38 | Garis kotak/pembatas paragraf hilang |
| `w:spacing w:val` (jarak antar-huruf) | UNPAD 655, 69565 294 | Judul yang direnggangkan jadi rapat |
| `w:position` | IJMT 1 | Teks naik/turun kembali ke garis dasar |
| `w:pgNumType` | UNPAD, Naufal | Nomor halaman romawi bagian depan & titik mulai penomoran hilang |
| `w:vanish` | — | Teks tersembunyi ikut tampil |
| `w:highlight` di luar 16 nama Word | — | Sorotan hilang ([`units.ts`](../apps/web/features/document/docx/units.ts) `HIGHLIGHTS`) |
| `srcRect` / rotasi gambar | — | Gambar terpotong tampil utuh, gambar berputar tampil tegak |

### S12. Glyph simbol salah — **S**

[`parse.ts:172`](../apps/web/features/document/docx/parse.ts) mengambil `w:sym/@w:char` apa
adanya tanpa melihat `@w:font`, jadi karakter Wingdings/Symbol di area PUA muncul sebagai
kotak. IJMT: 1. `toBullet` di [`numbering.ts:150`](../apps/web/features/document/docx/numbering.ts)
sudah punya tabel pemetaan yang bisa dipakai ulang di sini.

---

## 5. Yang sudah aman

Diverifikasi terbawa benar pada keempat berkas — jangan sampai rusak saat memperbaiki di atas:

- Teks badan naskah, termasuk di dalam sel tabel (selisih 0–54 karakter).
- Heading dari style standar Word (Naufal 67, 69565 17, UNPAD 11).
- List bertingkat berikut penomorannya: desimal, romawi, huruf, dan bullet Wingdings, lengkap
  dengan pelanjutan nomor setelah list terputus.
- Tabel: penggabungan sel mendatar & menurun, lebar kolom dari `tblGrid`, arsiran sel,
  padding, tinggi baris.
- Gambar sebaris → data URI (Naufal 8/8, 69565 2/2).
- **OMML → LaTeX**: 69565 masuk dengan 82 rumus blok + 28 rumus inline.
- Page setup: ukuran kertas, orientasi, margin; section break dengan kolom untuk section
  kedua dan seterusnya; page break.
- Mark: tebal, miring, garis bawah, coret, warna, sorotan bernama, ukuran, dan keluarga font
  (termasuk pemetaan font tema lewat `theme1.xml`).
- Header/footer satu baris berikut token `{page}` (Naufal, 69565, IJMT).

---

## 6. Urutan prioritas

Diurutkan berdasarkan (kerusakan yang dicegah) ÷ (ongkos), bukan berdasarkan kerapian:

| # | Pekerjaan | Ongkos | Alasan urutan ini |
|---|---|---|---|
| 1 | **S4** superscript/subscript | S | Datanya sudah ada di tangan, tinggal dipakai. Beberapa baris |
| 2 | **S1** deteksi heading dari style kustom | M | Satu-satunya celah yang bisa membuat dokumen masuk tanpa kerangka sama sekali |
| 3 | **S2** heading 7–9 + **S10** baris header | S | Dua perbaikan kecil yang membuka jalan bagi S3 dan merapikan tabel |
| 4 | **D1** gambar mengambang + **D3** pratinjau objek | M | Mengembalikan gambar yang hilang di dua dari empat berkas uji |
| 5 | **D6** teks tabel bersarang + **D7** peringatan revisi | S | Menutup dua jalur kehilangan senyap sebelum ada yang tertipu |
| 6 | **D2** kotak teks + labelnya di `SKIPPED_LABELS` | M | Templat proposal Indonesia banyak memakainya |
| 7 | **D4** catatan kaki | M | Padanannya di editor sudah lengkap, tinggal dijembatani |
| 8 | **S3** field TOC → `TocBlock` | M | Baru bermakna setelah S1 dan S2 selesai |
| 9 | **D5** komentar, **S9** border table style, **S6** kolom section pertama, **S11**/**S12** | S–M | Ekor panjang; kerjakan saat ada keluhan nyata |
| — | **D8** header/footer kaya, **S8** metadata sitasi | L | Terkunci keputusan produk, lihat §7 |

Rekomendasi paket pertama: **nomor 1–3** dalam satu PR. Semuanya bertumpu di dua berkas
(`parse.ts`, `properties.ts`), ongkosnya kecil, dan bersama-sama menyelesaikan kerusakan
terparah yang ditemukan audit ini.

---

## 7. Keputusan produk yang perlu diambil

Tiga hal berikut tidak bisa diputuskan dari dalam kode:

1. **Seberapa kaya header/footer? (D8)** Model sekarang, `PageFurnitureLine = { text, align }`,
   hanya sanggup satu baris teks polos per slot. Menerima logo dan header multi-baris berarti
   merombak modelnya menjadi konten kaya — pekerjaan tersendiri yang menyentuh renderer
   halaman, ekspor DOCX, dan ekspor PDF sekaligus, bukan sekadar importer.
2. **Komentar Word masuk atas nama siapa? (D5)** Milik pengimpor, atau membawa nama penulis
   aslinya dari `comments.xml`?
3. **Metadata sitasi disimpan atau tidak? (S8)** Menyimpan muatan CSL dari field `ADDIN`
   hanya berguna kalau nanti ada manajer referensi yang membacanya. Kalau tidak ada di peta
   jalan, teks statis adalah jawaban yang benar dan butir ini bisa ditutup.

Satu hal yang **tidak** perlu diputuskan: peringatan. `warningsFor` sudah jadi tempat yang
tepat, dan tiap celah di atas yang belum bisa diperbaiki sebaiknya minimal muncul di sana
dengan kalimat yang menyebut jenis kontennya — bukan nama tag OOXML.

---

## 8. Hasil setelah perbaikan

Implementasi 5 September 2026 di `apps/web/features/document/docx/` (+ wiring komentar di
`import-context.tsx`). Semua butir S/M dikerjakan; D8 dan S8 menunggu keputusan produk (§7).

### Status per celah

| Celah | Status | Catatan implementasi |
|---|---|---|
| D1 gambar mengambang | ✅ | `drawingImages` menuruni `wp:anchor`/`wp:inline` dan **semua** `a:blip` di subtree (grup pun jalan). UNPAD 0→3 gambar. |
| D2 kotak teks | ✅ | `mc:Fallback`/`w:pict` → `v:textbox` → `w:txbxContent` jadi paragraf di posisi jangkar; Choice & Fallback hanya diambil satu sisi per jenis supaya tidak dobel. |
| D3 objek tertanam | ✅ sebagian | Pratinjau raster (`v:imagedata` PNG/JPEG) disisipkan; pratinjau **EMF/WMF tak bisa dirender browser** → peringatan jujur "pratinjau objek tertanam (EMF/WMF)". IJMT: 4 pratinjau MathType/Visio adalah WMF/EMF. |
| D4 catatan kaki | ✅ | Part `footnotes.xml` dibaca; `w:footnoteReference` → node `footnoteRef`, isi catatan jadi node `footnote` di akhir dokumen (pola `insert_footnote`). |
| D5 komentar | ✅ | `comments.xml` + rentang `commentRangeStart/End` → mark `comment` + `CommentThread` per tab (via `updateTab`). **Keputusan D5 diambil: komentar masuk atas nama penulis aslinya** (`w:author`), `authorId = word-<slug>`. |
| D6 tabel bersarang | ✅ | Diratakan jadi paragraf per baris di sel induk — teks selamat. |
| D7 revisi terlacak | ✅ | `w:ins`/`w:del` dihitung; peringatan "N revisi terlacak diterima otomatis". |
| D8 header/footer kaya | ⏳ | Menunggu keputusan produk (§7). |
| S1 heading style kustom | ✅ | (a) `outlineLvl` warisan rantai `basedOn` (sudah lewat merge props); (b) nama terlokalisasi (`제목N`, `Judul N`, dll); (c) **heuristik nomor** `^\d+(\.\d+)*\.?\s` yang hanya aktif bila dokumen tak punya satu pun heading dan kandidatnya ≥ 2 — kalibrasi: IJMT 10/10 presisi, UNPAD/IEEE 0 false-positive, kandidat Naufal adalah entri TOC yang sudah ditelan S3. IJMT 0→11 heading. |
| S2 heading 7–9 | ✅ | `Math.min(6,…)` dihapus; simetris dengan ekspor (7–9 = Heading 6 + outline). |
| S3 field TOC | ✅ | State machine lintas paragraf di `bodyBlocks`: begin+instr `TOC` … penutup ditelan → satu `TocBlock` (listKind dari `\c`, maxLevel dari `\o`/`\t`). Penutupnya ditentukan **kedalaman** field, bukan `fldChar end` mana pun: TOC bawaan Word memakai switch `\h` sehingga tiap entri adalah field `PAGEREF`-nya sendiri, dan versi pertama berhenti di entri pertama — sisanya bocor lalu tertangkap `replaceManualToc` menjadi daftar isi kedua. Pengaman 500 node kini ikut diperingatkan bila tercapai. Naufal: 3 field → 3 `tocBlock`. |
| S4 super/subscript | ✅ | `RunProps.vertAlign` → mark `superscript`/`subscript`. |
| S5 tab stop | ✅ sebagian | Pola "teks—tab—nomor halaman" ≥ 3 baris berurutan → `TocBlock`; sisanya memang tak punya padanan (diperingatkan tak perlu — tab tetap jadi teks). |
| S6 kolom section pertama | ✅ | Section break **menerus** (continuous) dibuat di awal dokumen membawa `columns`; `columnRegions` memang melewati span 0, tapi break di posisi 0 menjadi span 1. UNPAD terbawa. |
| S7 tautan internal | ✅ peringatan | Bookmark tak representable; tautan `w:anchor` kini dihitung → peringatan "tautan internal (bookmark)". Teks tetap masuk. |
| S8 metadata sitasi | ⏳ | Menunggu keputusan produk (§7). |
| S9 border table style | ✅ | `w:tblBorders` dari definisi style (rantai `basedOn`) jadi fallback bila `tblPr` tak membawanya. |
| S10 baris header | ✅ | `w:tblHeader` hanya dihormati pada baris pertama. |
| S11 format senyap | ✅ sebagian | `w:shd` run → `textStyle.backgroundColor`; `w:vanish` → teks disembunyikan; sorotan hex kustom diterima. Yang tak representable kini **berperingatan**: pBdr, jarak-huruf (`w:spacing`), posisi teks, `pgNumType`. `srcRect`/rotasi tetap senyap (jarang, ongkos > nilai). |
| S12 glyph simbol | ✅ | `w:sym` font-aware lewat `symbolGlyph` (tabel PUA bersama `numbering.ts`, fallback F0xx→0xxx Latin-1). |

### Audit ulang (skrip §Lampiran, sebelum → sesudah)

| | UNPAD | Naufal | 69565 (IEEE) | IJMT |
|---|---|---|---|---|
| Heading | 11 → 11 | 67 → 67 | 17 → 17 | **0 → 11** |
| Gambar masuk | **0 → 3** | 8 → 8 | 2 → 2 | 18 → 18 (+4 EMF jujur dilewati) |
| TocBlock | — | **0 → 3** | — | — |
| Selisih teks | 54 → 25* | 0 → 1.925** | 0 → 0 | 0 → 0 |
| Dilewati | 3 tag senyap → 2 label jujur | — → 2 label jujur | — → 1 label jujur | `object`×4 → `pratinjau-emf`×4 jujur |

\* Sisa 25 karakter adalah **duplikat** `mc:Choice`/`mc:Fallback` yang memang harus dibawa
sekali (audit menghitung `w:t` di kedua cabang). 29 karakter isi kotak teks kini masuk.
\** Selisih Naufal = ±1.925 karakter **entri TOC basi** (nomor halaman menempel) yang kini
digantikan tiga `TocBlock` hidup — teks badan naskah utuh.

Tes: `docx.test.ts` 136 lulus (26 tes baru untuk celah, tiga di antaranya regresi untuk TOC ber-`\h`,
field TOC tanpa penutup, dan nama style daun); keseluruhan `apps/web` 772 lulus.

### Pemecahan modul (5 September 2026)

`parse.ts` sudah 1.379 baris dan `ParseContext` berubah jadi kantong mutable berisi enam field
opsional. Keduanya dirapikan **tanpa mengubah perilaku**: keluaran keempat berkas uji disimpan
sebagai snapshot JSON sebelum dan sesudah, lalu dibandingkan `cmp` — identik byte per byte.

| Modul | Baris | Isi |
|---|---|---|
| `context.ts` | 110 | `ParseContext` (bahan yang tetap) + `ParseState` (akumulator) + `skip` + pembaca relasi & tema |
| `headings.ts` | 110 | `outlineLvl` → nama style terlokalisasi → heuristik nomor |
| `media.ts` | 202 | `w:drawing`, `w:pict`, `w:object`, `mc:AlternateContent` |
| `tables.ts` | 190 | Sel, penggabungan, lebar kolom, perataan tabel bersarang |
| `lists.ts` | 164 | Paragraf bernomor Word → list bertingkat |
| `toc.ts` | 122 | Field `TOC` dan daftar isi ketik tangan |
| `sections.ts` | 92 | `w:sectPr` → ukuran, margin, kolom |
| `content.ts` | 8 | Pembantu node hasil |
| `parse.ts` | 542 | Penelusur inline + perangkai paragraf/badan naskah |

Dua perubahan bentuk yang perlu dicatat:

1. **Input dipisah dari akumulator.** Yang tumbuh selama pembacaan (`skipped`, `footnoteQueue`,
   `commentStack`, `commentQuotes`) pindah ke `ParseContext.state`, jadi tidak ada lagi field
   opsional yang harus diakses dengan `?.` padahal selalu ada.
2. **Media dan tabel tidak mengimpor `parse.ts`.** Keduanya memuat paragraf, tapi perangkainya
   tetap di `parse.ts`; pembacanya disuntikkan sebagai `ReadParagraph` supaya tidak ada impor
   melingkar.

---

## 9. Sampul yang meluber ke halaman kedua (5 September 2026)

**Gejala** — `Naufal_Proposal_TA_Capstone_Bab1-3_v1.docx`: sampul yang di Google Docs pas satu
lembar terpecah jadi dua setelah diimpor. Dugaan awal jatuh ke margin dan header/footer.
Keduanya tidak bersalah:

- `w:pgMar` = 1701 twip = 1,18″ = 2,99 cm, terimpor jadi 113 px — persis yang ditampilkan
  dialog Google Docs.
- `pageGeometry.contentHeight = height − top − bottom` = 896 px; Word menghitung 895,9 px.
- Paginasi tidak pernah mengurangi ruang untuk perabot halaman ([`pagination.ts`](../apps/web/features/editor/pagination.ts)
  membandingkan `block.bottom` dengan `pageStart + sheet.contentHeight`, tanpa potongan lain).

**Sebabnya font.** Berkas ini tidak menyebut font sama sekali: tidak ada `w:rFonts` di run,
di style, maupun di `docDefaults`. Word menyelesaikannya lewat font **tema**
(`minorFont = Cambria`); importer hanya melihat tema kalau `rPr` membawa `asciiTheme`, jadi
seluruh naskah jatuh ke font bawaan kanvas, **Source Serif 4**. Metrik keduanya berbeda jauh —
dibaca langsung dari berkas fontnya:

```
source-serif-4-normal-200-900.woff2   upem=1000
  hhea asc=1036 desc=-335 gap=0  →  line-height: normal ≈ 1,371
```

Cambria ≈ 1,17. Dan karena paragraf sampul tidak menyebut `w:line`, importer menulis
`line-height: normal` — nilai yang **menyerahkan tinggi baris kepada font yang kebetulan
merender**. Hasilnya setiap baris ~17% lebih tinggi; pada halaman yang di Word terisi 95%, itu
cukup untuk melempar blok terakhir ke lembar berikutnya.

**Perbaikan**

| # | Perubahan | Berkas |
|---|---|---|
| 1 | Font tema dipakai saat `w:rFonts` tidak ada sama sekali — perilaku Word (`+minor-latin`) | [`parse.ts`](../apps/web/features/document/docx/parse.ts) `fontOf` |
| 2 | Spasi tunggal tidak lagi jadi `normal`. `toLineHeight` kini selalu angka dan memakai `cssLineHeight` dari `@writer-hub/shared` — satu sumber dengan tipografi dokumen, jadi impor dan dokumen buatan editor tidak bisa berselisih diam-diam | [`units.ts`](../apps/web/features/document/docx/units.ts) |
| 3 | Gambar dan tabel tidak lagi kebagian jarak baku `0,75em`. Aturannya harus mengenai pembungkus buatan TipTap (`.tableWrapper`, `.node-image`) — atribut node hanya sampai ke elemen di dalamnya | [`globals.css`](../apps/web/app/globals.css) |

Satuan yang dipakai: `w:line / 240` adalah **spasi dokumen** (1 = tunggal), dan
`cssLineHeight(x) = x × 1,15` yang mengubahnya ke CSS. Angka 1,15 itu bukan tebakan — ia
sudah menjadi `LINE_SPACING_TO_CSS` di `packages/shared/src/typography.ts`, dan komentarnya
memang menyebut dirinya kebalikan konstanta di `docx/units.ts`.

**Verifikasi di aplikasi sungguhan.** Chromium di kontainer `worker` (Playwright) membuka
`http://web:3000`, mengunggah berkasnya lewat input impor, lalu mengukur DOM-nya:

| | Sebelum | Sesudah |
|---|---|---|
| Font teks sampul | Source Serif 4 (bawaan kanvas) | `Cambria, serif` |
| `line-height` paragraf | `normal` (≈1,371 × 14,67 px) | `1.15` (16,87 px) |
| `margin-top` tabel & gambar | 11 px | 0 px |
| "PROGRAM STUDI…" | halaman 2 | halaman 1, pada 787–805 px dari 896 px |
| Akhir sampul | — | 877 px, sisa 19 px sebelum batas lembar |

**Yang masih tersisa** — ukuran tanda paragraf (`w:pPr/w:rPr/w:sz`) pada paragraf kosong tidak
terbawa: enam paragraf kosong di sampul ini seharusnya 12 pt, terimpor sebagai ukuran badan
naskah (11 pt). Bukan celah importer melainkan batas model editor — `textStyle` adalah mark,
dan mark butuh node teks; paragraf kosong tidak punya tempat menyimpannya. Memperbaikinya
berarti menambah atribut ukuran pada node paragraf, dan editor sendiri punya batas yang sama
saat penulis mengatur ukuran pada paragraf kosong.

---

## Lampiran — skrip audit

Salin ke `apps/web/docx-audit.ts`, jalankan `bun run docx-audit.ts <berkas.docx> …` dari
`apps/web`, lalu hapus. Ia sengaja memanggil `readBody` langsung, bukan `readDocx`, supaya
peta `context.skipped` bisa dibaca utuh berikut jumlahnya.

```ts
import { readFileSync } from 'node:fs'
import { createNumberer, readNumbering } from '@/features/document/docx/numbering'
import { bodyOf, type ParseContext, readBody, readRelationships, readTheme } from '@/features/document/docx/parse'
import { readStyles } from '@/features/document/docx/properties'
import { createXmlParser } from '@/features/document/docx/xml'
import { type DocxArchive, openDocx, resolvePath } from '@/features/document/docx/zip'

const relsPathOf = (part: string) =>
	part.includes('/') ? `${part.slice(0, part.lastIndexOf('/'))}/_rels/${part.slice(part.lastIndexOf('/') + 1)}.rels` : `_rels/${part}.rels`

function partByType(archive: DocxArchive, parse: (s: string) => Element, main: string, suffix: string) {
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

const parse = await createXmlParser()
for (const path of process.argv.slice(2)) {
	const archive = openDocx(new Uint8Array(readFileSync(path)))
	const main = 'word/document.xml'
	const source = archive.text(main) ?? ''
	const rels = archive.text(relsPathOf(main))
	const context: ParseContext = {
		styles: readStyles(partByType(archive, parse, main, 'styles')),
		theme: readTheme(partByType(archive, parse, main, 'theme')),
		numberer: createNumberer(readNumbering(partByType(archive, parse, main, 'numbering'))),
		relationships: rels ? readRelationships(parse(rels)) : new Map(),
		skipped: new Map(),
		archive,
		mainPart: main,
	}
	const { blocks, pageSetup } = readBody(bodyOf(parse(source))!, context)

	const norm = (s: string) => s.replace(/\s+/g, '').length
	const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
	const want = [...source.matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>/g)]
		.map((m) => m[1].replace(/&(amp|lt|gt|quot|apos);/g, (_, name: string) => entities[name] as string))
		.join('')
	console.log(`\n${path}`)
	console.log('  dilewati :', [...context.skipped].map(([k, v]) => `${k}=${v}`).join(', ') || '-')
	console.log('  teks     :', norm(want), '→', norm(blocks.map(textOf).join('')))
	console.log('  heading  :', blocks.filter((b: any) => b.type === 'heading').length)
	console.log('  pageSetup:', JSON.stringify(pageSetup))
	// Audit XML mentah — fitur yang ada di berkas, terlepas importer paham atau tidak.
	for (const [label, re] of [
		['gambar mengambang', /<wp:anchor/g],
		['VML/pict', /<w:pict/g],
		['objek tertanam', /<w:object/g],
		['kotak teks', /<w:txbxContent|<wps:txbx/g],
		['catatan kaki', /<w:footnoteReference/g],
		['komentar', /<w:commentReference/g],
		['super/subscript', /<w:vertAlign w:val="(super|sub)script"/g],
		['tautan internal', /<w:hyperlink[^>]*w:anchor=/g],
		['tabel bersarang', /<w:tc>(?:(?!<\/w:tc>)[\s\S])*?<w:tbl>/g],
		['tblStyle', /<w:tblStyle/g],
		['pBdr', /<w:pBdr/g],
		['revisi ins/del', /<w:(ins|del) /g],
	] as [string, RegExp][]) {
		const n = (source.match(re) ?? []).length
		if (n > 0) console.log(`  ${label}: ${n}`)
	}
}
```
