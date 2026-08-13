# WritingHub — PRD: Ekspor & Kolom (sisa yang belum beres)

Status: **Keputusan lengkap - siap dikerjakan** · Disusun 14 Agustus 2026 · Baseline kode `0c4dab7` (branch `main`).

Lanjutan langsung dari `docs/COLUMNS-PROOFREADER-TOOLS-PRD.md` (P1–P12) dan
`docs/WORKPLAN-P1-P12-DUA-JALUR.md` §9 (C-1…C-3). Dokumen ini hanya memuat yang **masih rusak
atau belum ada** setelah rangkaian perbaikan itu, berikut penyebabnya yang sudah ditelusuri
sampai ke barisnya.

Penomoran **E1–E5** baru dan tidak bertabrakan dengan P1–P12, A–O, maupun A1–B3.

---

## 0. Ringkasan

| # | Butir | Jenis | Keadaan | Ukuran |
|---|---|---|---|---|
| **E1** | Ekspor PDF tetap satu halaman, dan panel ikut tercetak | **Bug** | Penyebab terverifikasi; perbaikan `b219e85` perlu tapi belum cukup | Sedang |
| **E2** | Page break di blok kolom menyisakan halaman kosong | **Bug** | Penyebab terverifikasi (regresi dari `4b4dd20`) | Kecil |
| **E3** | Tabel di kolom sempit | Verifikasi | Keputusan: **dibiarkan sempit** (§2.1); sisanya tinggal memastikan tidak meluber | Kecil |
| **E4** | Impor DOCX belum membaca `sectPr` | Fitur | Belum ada; ekspornya sudah benar, jadi hanya arah masuk yang pincang | Sedang |
| **E5** | Pensiunkan blok kolom pembungkus, ganti section berkolom | Fitur | Diputuskan §2.2 & §2.5; **butuh pembatas section "menerus" yang belum ada** | Besar |

**E1, E2, dan E3 saling lepas** - bisa dikerjakan paralel tanpa menyentuh berkas yang sama.
**E5 wajib menunggu E2**: keduanya menyunting aritmetika penempatan di `columns.ts`.

---

## 1. Yang sudah beres (jangan dikerjakan ulang)

| Perbaikan | Commit | Bukti |
|---|---|---|
| Lebar kolom tabel DOCX (dulu `w:gridCol w:w="100"` ≈ 1,8 mm) | `a3319b0` | uji membaca `word/document.xml` |
| Baris baru dalam satu simpul teks jadi `<w:br/>` | `a3319b0` | idem |
| Satu `sectPr` per section, termasuk `w:cols` | `bc00f1d` | idem |
| Orientasi DOCX (pustaka `docx` menukar sendiri saat lanskap) | `bc00f1d` | idem, **dikonfirmasi pemakai: 1 halaman lanskap benar** |
| `transform: scale()` dilepas saat mencetak | `b219e85` | perlu, tapi belum cukup - lihat E1 |
| Named pages `@page secN` per section | `3f0adc1` | **belum bisa diuji sampai E1 beres** |
| Page break di blok kolom dikenali sama sekali | `4b4dd20` | uji `columns.test.ts`; menyisakan E2 |

---

## 2. Keputusan produk yang mengikat

1. **Tabel di kolom sempit dibiarkan sempit.** Ia tidak dinaikkan otomatis jadi selebar
   pembungkus. Alasannya: penulis yang menaruh tabel di dalam blok kolom sedang menyatakan
   maksud, dan menaikkannya diam-diam akan mengubah tata letak naskah yang sudah jadi. Yang
   otomatis naik tetap hanya blok yang **tidak muat sama sekali** di kolom mana pun (§P4 lapis 3)
   - itu bukan pilihan gaya, melainkan satu-satunya cara menghindari tumpang tindih.

2. **Blok kolom pembungkus (`columns`) dipensiunkan.** `setColumns` pada seleksi akan membuat
   **section berkolom**, bukan node pembungkus. Alasannya tegas: kolom di DOCX selalu properti
   section, jadi bentuk pembungkus adalah satu-satunya kolom yang **tidak akan pernah bisa
   diekspor**. Naskah lama tetap dibaca dan ditata seperti sekarang - node-nya tidak dihapus dari
   skema, hanya tidak pernah dibuat lagi (pola yang sama dengan `LegacyColumn`).

3. **Konsekuensi §2.2 yang belum tersedia: pembatas section "menerus".** Pembatas section hari
   ini **selalu** membuka lembar baru (`pagination.ts`, `isSectionBreak` → `forceNext = true`).
   Kalau `setColumns` pada seleksi langsung dialihkan ke section, mengolomkan satu paragraf di
   tengah halaman akan mendorongnya ke halaman berikutnya - jelas bukan yang diminta penulis.
   Word menyelesaikan ini dengan *continuous section break*; kita harus melakukan hal yang sama
   sebelum §2.2 bisa dijalankan. Rinciannya di E5.

4. **Aturan cetak berhenti menyebut chrome satu per satu.** Daftar "apa saja yang harus
   disembunyikan" akan selalu ketinggalan setiap kali ada komponen baru - itulah yang terjadi
   pada E1. Yang dinyatakan justru sebaliknya: apa yang **boleh** dicetak.

5. **Blok kolom lama dimigrasi saat naskah dibuka, bukan diperingatkan saat diekspor.**
   Menimpa usulan awal §7: begitu pembatas menerus ada (E5 langkah 1), dokumen yang masih
   memuat node `columns` diubah menjadi sepasang pembatas menerus pada saat dimuat - satu
   kali, idempoten, tidak masuk riwayat undo. Alasannya: peringatan ekspor membiarkan bentuk
   yang tidak bisa diekspor hidup selamanya di naskah-naskah lama, sedangkan migrasi saat
   dibuka menyelesaikannya persis di naskah yang benar-benar dipakai, tanpa menyentuh yang
   tidak pernah dibuka. Harganya nyata - migrasi menyunting dokumen orang tanpa diminta -
   jadi ia wajib tampil identik (E5 langkah 4).

---

## 3. E1 — Ekspor PDF tetap satu halaman

### Gejala
Dialog cetak melaporkan **"Total: 1 page"** berapa pun panjang naskah, dan **panel Proofreader
ikut tergambar** di pratinjau (tampak di tangkapan layar tiket: "Proofreade", "All / Gra",
"Whole", "Standard" di tepi kanan lembar).

Panel yang ikut tercetak bukan gangguan terpisah - ia **petunjuk utama** bahwa blok
`@media print` tidak lagi mengenali susunan DOM aplikasi.

### Penyebab (terverifikasi)

**Bagian pertama - chrome tidak tersembunyi.**

```css
/* apps/web/app/globals.css, blok @media print */
header, nav, aside, .document-canvas ~ *, … { display: none !important; }
```

`.document-canvas ~ *` berarti **saudara sekandung** `.document-canvas`. Susunan sebenarnya:

```
body
└── div.flex.h-dvh.flex-col.overflow-hidden          ← app-shell.tsx:19
    ├── TopBar
    ├── main.flex.min-h-0.flex-1                     ← app-shell.tsx:21
    │   └── div.relative.flex…pr-20                  ← workspace-page.tsx:41
    │       ├── aside                                ← document-tabs.tsx:90    ✅ tersembunyi
    │       ├── div.relative.flex.flex-1.overflow-hidden  ← document-editor.tsx:45
    │       │   └── … div.document-canvas
    │       ├── div.flex.w-[340px].overflow-hidden   ← panel-container.tsx:63  ❌ TIDAK
    │       └── PanelRail                            ← ❌ TIDAK
    └── (enam dialog)
```

Panel dan rail adalah saudara **pembungkus editor**, bukan saudara `.document-canvas`. Daftar tab
selamat hanya karena kebetulan ia `<aside>`.

**Bagian kedua - dan inilah yang mematikan.** Tiga leluhur memotong atau mengunci tinggi naskah,
dan tak satu pun disentuh aturan cetak:

| Elemen | Sifat yang merusak |
|---|---|
| `div.h-dvh.overflow-hidden` (app-shell) | tinggi terkunci setinggi viewport, isinya dipotong |
| `main.min-h-0.flex-1` | tinggi ikut induknya, bukan ikut isinya |
| `div.flex-1.overflow-hidden` (pembungkus editor) | dipotong lagi, dan barisnya masih menata editor bersebelahan dengan panel |

Peramban karena itu hanya menerima **sepetak isi setinggi layar** - dan sepetak isi memang muat
di satu halaman. Melepas `transform` (`b219e85`) menghilangkan satu penghalang; ketiga penghalang
ini masih berdiri, jadi gejalanya tidak berubah sedikit pun di mata pemakai.

### Rancangan

Sesuai §2.4, dinyatakan positif:

1. **`document-editor.tsx` menandai pembungkusnya `document-print-root`.** Itu satu-satunya
   penanda yang perlu ditambahkan ke JSX.

2. **Leluhurnya kehilangan kotaknya sendiri saat mencetak.** `display: contents` menghapus kotak
   elemen tanpa menghapus isinya - jadi tinggi viewport, pemotongan, dan baris flex ikut hilang
   sekaligus, tanpa perlu menebak berapa lapis pembungkus yang ada sekarang atau nanti:

   ```css
   @media print {
     /* Leluhur naskah: kotaknya lenyap, isinya tetap. */
     body *:has(.document-print-root) { display: contents !important; }

     /* Selain naskah dan leluhurnya, tidak ada yang dicetak. */
     body *:not(:has(.document-print-root)):not(.document-print-root):not(.document-print-root *) {
       display: none !important;
     }

     .document-print-root {
       overflow: visible !important;
       border-radius: 0 !important;
       background: #fff !important;
     }
   }
   ```

   `:has()` sudah baseline sejak Desember 2023 dan `display: contents` sejak 2018; jalur cetak
   memang hanya perlu benar di peramban modern. **Wajib dicoba di peramban sungguhan sebelum
   dianggap selesai** - dua selektor di atas belum pernah dijalankan, dan `display: contents`
   punya sejarah bug pada elemen tabel (tidak relevan di sini, tapi patut diingat).

3. **Jalan mundur bila `:has()` bermasalah:** beri nama kelas pada ketiga pembungkus di tabel
   penyebab dan setel `display: contents` pada mereka satu per satu. Lebih rapuh - itu persis
   jenis rantai yang membuat E1 lolos - jadi hanya dipakai kalau butir 2 gagal.

4. **Aturan lama dihapus, bukan ditumpuk.** `header, nav, aside, .document-canvas ~ *` dibuang.
   Membiarkannya berdampingan dengan aturan baru berarti dua sumber kebenaran, dan yang salah
   akan tetap terlihat benar selama yang benar kebetulan menang.

5. **Dialog Ekspor PDF menyatakan langkah header/footer lebih terang** (keputusan: petunjuk
   kecil tidak cukup). Pengingat "matikan *Headers and footers* di *More settings*" naik dari
   catatan kaki menjadi blok yang tidak mungkin terlewat - tebal, dengan langkah per peramban,
   tepat di atas tombol cetak, dan terlihat selama dialog terbuka. Tombol tidak dikunci:
   pemakai yang sengaja membiarkan kepala/kaki halaman tidak boleh dihalangi.

### Uji

Aturan cetak tidak bisa dijalankan `bun test`, tapi **strukturnya bisa** - dan struktur itulah
yang meleset:

- uji yang me-render `DocumentEditor` dan memastikan pembungkusnya membawa kelas
  `document-print-root`. Ini yang mencegah selektor meleset lagi diam-diam saat lapisan
  pembungkus bertambah, persis alasan `document-zoom-frame` diberi nama pada `b219e85`.

Sisanya manual, di Chrome:

### Kriteria terima
- Naskah 10 halaman melaporkan 10 halaman di dialog cetak.
- Tidak ada bagian antarmuka (panel, rail, tab, menu bar, dialog) yang muncul di pratinjau.
- Margin tiap halaman - **termasuk halaman kedua dan seterusnya** - sesuai Penyiapan halaman.
- Dokumen ber-section campur: halaman lanskapnya benar-benar lanskap. Ini sekaligus **verifikasi
  pertama untuk named pages (`3f0adc1`)**, yang sampai sekarang belum pernah bisa diuji.
- Mode pageless tetap tercetak wajar (tanpa `@page size`, margin dari aturan cadangan).

**Ukuran:** sedang (1 hari; sebagian besar mencoba di peramban).

---

## 4. E2 — Page break di blok kolom menyisakan halaman kosong

### Gejala
Pada blok 3 kolom, page break memindahkan isi ke halaman berikutnya - tapi **menyisipkan satu
halaman kosong sebelumnya**. Regresi dari `4b4dd20`.

### Penyebab (terverifikasi lewat pembacaan alur)

Perulangan penempatan mengakhiri tiap blok dengan:

```ts
// columns.ts, akhir badan while
if (index < items.length) advance()   // kolom berikutnya; dari kolom terakhir → lembar baru
```

Jadi begitu isi memenuhi **kolom terakhir** sebuah lembar, `advance()` sudah membuka lembar
berikutnya. Barulah page break diproses:

```ts
if (items[index].isBreak) {
  slots.push({ page, column, top: base, height: 0 })   // penanda mendarat di lembar BARU
  index += 1
  breakPage()                                          // page += 1  ← melompat sekali lagi
  continue
}
```

Lembar yang baru saja dibuka `advance()` tidak pernah terisi apa pun selain penanda setinggi nol.
Pada 2 kolom gejalanya jarang muncul - peluang isi berhenti tepat di kolom terakhir lebih kecil;
pada 3 kolom jauh lebih sering.

### Rancangan

Page break hanya perlu melompat kalau lembar berjalan **sudah dipakai**:

```ts
if (items[index].isBreak) {
  // Lembar yang masih perawan: posisi sudah persis di tempat yang diminta break,
  // dan melompat lagi hanya menyisakan lembar kosong.
  const fresh = column === 0 && !slots.some((slot) => slot.page === page)
  slots.push({ page, column, top: Math.max(regionTop(page), blockedUntil[column]), height: 0 })
  index += 1
  if (!fresh) breakPage()
  continue
}
```

`slots.some(...)` menelusuri seluruh daftar untuk tiap break. Itu tidak apa-apa: jumlah break
dalam satu blok kolom terhitung jari, dan menukarnya dengan penghitung terpisah berarti satu
keadaan lagi yang harus dijaga tetap benar di lima tempat.

### Uji (semuanya tanpa DOM, `columns.test.ts`)

| Kasus | Yang dijaga |
|---|---|
| break tepat setelah isi memenuhi kolom terakhir | tidak ada lembar tanpa isi |
| break di tengah kolom | isi sesudahnya mulai di kolom pertama lembar berikutnya (uji lama, harus tetap hijau) |
| dua break berturut-turut | hanya satu lembar dilewati, bukan dua |
| break sebagai butir pertama blok kolom | tidak membuka lembar kosong di depan |
| **invarian umum** | **tidak ada lembar di antara lembar pertama dan terakhir yang tanpa penempatan apa pun** |

Baris terakhir yang paling berharga: ia menangkap bentuk kerusakannya, bukan satu kasusnya.

### Kriteria terima
- Sampul 3 kolom dengan page break: halaman berurutan tanpa lembar kosong.
- Seluruh uji kolom yang sudah ada tetap hijau.

**Ukuran:** kecil (½ hari termasuk uji).

---

## 5. E3 — Tabel di kolom sempit

**Keputusan (§2.1): dibiarkan sempit.** Tidak ada penaikan otomatis. Butir ini karena itu bukan
lagi pertanyaan desain, melainkan satu verifikasi kecil.

Yang tersisa diperiksa: tabel sempit boleh **sempit**, tapi tidak boleh **meluber keluar
kolomnya** - itu dua hal berbeda, dan yang kedua adalah bug yang sama jenisnya dengan §P4.

Titik yang perlu dilihat:
- `.document-body table { table-layout: fixed; width: 100% }` (globals.css:591) seharusnya sudah
  menahan tabel di dalam petaknya, **kecuali** bila selnya punya `colwidth` tetap dari penggaris
  atau impor DOCX. Lebar tetap 420 px di kolom selebar 190 px akan menonjol keluar.
- Kalau ternyata benar meluber: yang diubah bukan tata letak kolom melainkan penyempitan
  proporsional `colwidth` terhadap lebar petak - perhitungan yang sama dengan `scaleWidths` di
  `document-ruler.tsx:333`.

### Kriteria terima
- Tabel ber-`colwidth` di dalam blok 3 kolom tidak menonjol melewati batas kolomnya.
- Lebarnya boleh sempit; tidak ada yang otomatis dinaikkan jadi selebar pembungkus.

**Ukuran:** kecil (½ hari; sebagian besar memeriksa, mungkin nol perubahan kode).

---

## 6. E4 — Impor DOCX belum membaca `sectPr`

`features/document/docx/parse.ts` mengabaikan properti section Word, jadi dokumen berorientasi
campur yang diimpor menjadi satu section. Ekspor sudah benar sejak `bc00f1d`, jadi ini
satu-satunya arah yang masih pincang - dan akibatnya bukan sekadar kurang: naskah yang diekspor
dari WritingHub lalu diimpor kembali **kehilangan seluruh section-nya**.

### Rancangan
Pemetaannya lurus, dan seluruh sasarannya sudah ada:

| DOCX | WritingHub |
|---|---|
| `w:sectPr/w:pgSz` (`w:w`, `w:h`, `w:orient`) | `sectionBreak.pageSetup.size` + `orientation` |
| `w:sectPr/w:pgMar` | `sectionBreak.pageSetup.margins` (twip → px, bagi 15) |
| `w:sectPr/w:cols` (`w:num`, `w:space`) | `sectionBreak.columns` |
| `w:sectPr/w:type val="continuous"` | pembatas menerus - **butuh E5** |

Dua hal yang mudah keliru:
1. **`sectPr` terakhir tinggal di `w:body`, bukan di paragraf.** Ia milik section TERAKHIR;
   `sectPr` yang berada di dalam `w:pPr` sebuah paragraf menutup section yang berakhir di
   paragraf itu. Membaca keduanya sebagai hal yang sama akan menggeser seluruh section satu
   langkah.
2. **Ukuran kertas harus dicocokkan balik ke `PAGE_SIZES`**, bukan disimpan sebagai custom
   mentah-mentah - kalau tidak, dokumen A4 hasil impor akan tampil sebagai "Ukuran khusus"
   dengan angka yang kebetulan sama.
3. **`w:type` selain `continuous` dibaca sebagai pembatas halaman biasa** (keputusan: degradasi
   aman, bukan penolakan). `nextPage` memang setara pembatas halaman; `evenPage`/`oddPage`
   kehilangan makna paritasnya, tapi isi, ukuran kertas, dan kolom section itu tetap terbaca.
   Impor boleh mencatat satu peringatan per dokumen; yang tidak boleh adalah menolak naskah
   yang sebenarnya masih bisa diselamatkan.

### Kriteria terima
- Ekspor → impor sebuah dokumen tiga section menghasilkan tiga section yang sama.
- Dokumen Word berorientasi campur dari luar terbaca dengan orientasi per bagiannya.
- Dokumen Word tanpa `sectPr` tambahan tetap terbaca seperti sekarang.

**Ukuran:** sedang (1–2 hari).

---

## 7. E5 — Pensiunkan blok kolom pembungkus

**Keputusan §2.2.** Ini butir terbesar di dokumen ini, dan **tidak bisa dikerjakan apa adanya** -
§2.3 menjelaskan kenapa.

### Masalahnya
Pembatas section hari ini selalu membuka lembar baru. Jadi `setColumns` pada seleksi yang
langsung dialihkan ke section akan **mendorong isi terpilih ke halaman berikutnya**. Untuk
"kolomkan dua paragraf ini", itu jelas bukan yang diminta.

### Rancangan - tiga langkah berurutan

**Langkah 1: pembatas section menerus.**

`SectionBreakAttrs` bertambah `continuous?: boolean`. Bedanya hanya satu, tapi menyentuh dua
plugin:

- `pagination.ts`: pembatas menerus **tidak** menyalakan `forceNext`. Geometri lembar tidak
  berubah - itu batasannya, lihat di bawah.
- `export-docx.ts`: section-nya ditulis dengan `type: SectionType.CONTINUOUS` (tersedia di
  pustaka `docx`, `SectionType.CONTINUOUS = "continuous"`).

**Batasan yang harus ditegakkan, bukan disembunyikan:** satu lembar hanya punya satu ukuran
kertas. Karena itu pembatas menerus boleh mengubah **kolom saja**. Bila ia juga membawa
`pageSetup`, ia turun pangkat jadi pembatas biasa yang membuka lembar - dan UI harus
mengatakannya, bukan diam-diam mengabaikan salah satunya. Word berperilaku sama.

**Langkah 2: `setColumns` membuat section menerus.**

```
setColumns(n) pada seleksi
  → sisipkan sectionBreak{ continuous: true, columns: { count: n } } di awal blok terpilih
  → sisipkan sectionBreak{ continuous: true, columns: <yang tadi berlaku> } sesudahnya
```

Persis pola `applySectionColumns` yang sudah ada (§C-2) - yang baru hanya benderanya. `menu-bar`
dan alat AI `set_columns` tidak perlu berubah sama sekali: keduanya sudah memanggil perintah itu.

**Langkah 3: node `columns` jadi warisan.**

Tidak dihapus dari skema - naskah lama harus tetap terbaca - tapi tidak pernah dibuat lagi, sama
seperti `LegacyColumn` yang sudah ada di `columns.ts:184`. Tata letak layarnya dipertahankan apa
adanya. `unsetColumns` tetap bekerja untuk naskah lama, dan untuk section berkolom ia berarti
menghapus sepasang pembatasnya.

**Langkah 4: migrasi naskah lama saat dibuka** (keputusan §2.5, menimpa usulan awal).

Tiap node `columns` diganti sepasang pembatas menerus - `columns: { count: n }` sebelum isinya,
`columns: <yang tadi berlaku>` sesudahnya, persis pola langkah 2 - dan isinya diangkat keluar.
Titik masuknya **bukan** `setContent`: isi naskah datang dari fragmen Yjs (`collaboration:
{ document: doc, field }` di `tiptap-editor.tsx`), jadi migrasi dijalankan sebagai satu
transaksi editor tepat setelah fragmen dokumen pertama kali terikat. Syaratnya tiga:

- **Idempoten dan senyap bila bersih** - tanpa node `columns`, tidak ada transaksi sama
  sekali. Dokumen yang sudah benar tidak boleh ikut tercatat "berubah": riwayat versi dan
  sinkronisasi membaca tiap transaksi sebagai suntingan.
- **Tidak masuk riwayat undo** - transaksinya diberi origin/meta yang tidak dilacak undo
  manager Yjs. Pemakai tidak boleh bisa meng-undo migrasi dan kembali ke bentuk yang tidak
  bisa diekspor.
- **Tampil identik** - tata letak hasil migrasi harus sama pikselnya dengan blok `columns`
  yang digantikannya; bedanya baru terasa saat diekspor.

Node `columns` tetap ada di skema - naskah yang belum pernah dibuka tetap terbaca, dan editor
pratinjau (riwayat versi, tautan berbagi) ikut membacanya apa adanya tanpa dimigrasi.

### Kriteria terima
- Mengolomkan dua paragraf di tengah halaman **tidak** memindahkannya ke halaman berikutnya.
- Hasilnya diekspor ke DOCX sebagai section dengan `w:cols` dan `w:type val="continuous"`, dan
  terbaca benar di Google Docs.
- Naskah lama berisi node `columns`: begitu dibuka, node-nya termigrasi ke sepasang pembatas
  menerus, tampilannya sama persis, dan migrasinya tidak bisa di-undo.
- Naskah hasil migrasi diekspor sebagai section berkolom `continuous` - tanpa peringatan apa
  pun, karena tidak ada lagi yang diratakan.
- Membuka naskah yang sama dua kali tidak menambah apa-apa: migrasi kedua bukan transaksi.
- Pembatas menerus yang membawa `pageSetup` terbaca sebagai pembatas halaman, dan UI-nya
  mengatakan itu.

**Ukuran:** besar (3–4 hari). Prasyarat: **E2 selesai** - keduanya menyunting aritmetika
penempatan yang sama.

---

## 8. Urutan & verifikasi

| Tahap | Isi | Alasan |
|---|---|---|
| **1** | E2, E3 | Kecil, mandiri; mengembalikan kolom ke keadaan layak pakai |
| **2** | E1 | Membuka jalan verifikasi named pages (`3f0adc1`) yang sampai kini terhalang |
| **3** | E4 | Menutup arah impor; tidak bergantung pada apa pun di atas |
| **4** | E5 | Butir terbesar; menunggu E2, dan lebih baik setelah E4 supaya pembatas menerus langsung ikut terbaca dari impor |

Perintah: `bun run test`, `bun run typecheck`, dan untuk worker `pytest` (README §Perintah).

Yang **tidak** bisa diverifikasi di mesin pengembangan dan harus dicoba pemakai: pratinjau cetak
Chrome (E1) dan tampilan berkas DOCX di Google Docs (E4, E5).

---

## 9. Pertanyaan terbuka - sudah dijawab (14 Agustus)

1. **E5 - blok `columns` lama dimigrasi otomatis?** **Ya, saat dokumen dibuka** - menimpa
   usulan awal (peringatan saat ekspor). Tercatat sebagai §2.5 dan langkah 4 E5.
2. **E1 - petunjuk header/footer di dialog ekspor: cukup?** **Tidak, perlu lebih terang** -
   menjadi butir 5 rancangan E1. Kepala/kaki halaman bawaan peramban tetap tidak bisa dimatikan
   dari CSS; satu-satunya jalan adalah pemakai mematikannya, jadi pengingatnya yang diperkuat.
3. **E4 - `sectPr` dengan tipe yang tidak didukung (`evenPage`/`oddPage`)?** Dibaca sebagai
   **pembatas halaman biasa** - degradasi aman; impor boleh memperingatkan, tidak menolak.
   Tercatat sebagai catatan 3 di §6.
