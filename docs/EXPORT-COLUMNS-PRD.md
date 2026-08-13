# WritingHub — PRD: Ekspor & Kolom (sisa yang belum beres)

Status: **Draft untuk ditinjau** · Disusun 14 Agustus 2026 · Baseline kode `3f0adc1` (branch `main`).

Lanjutan langsung dari `docs/COLUMNS-PROOFREADER-TOOLS-PRD.md` (P1–P12) dan
`docs/WORKPLAN-P1-P12-DUA-JALUR.md` §9 (C-1…C-3). Dokumen ini hanya memuat yang **masih rusak**
setelah rangkaian perbaikan itu, berikut penyebabnya yang sudah ditelusuri sampai ke barisnya.

Penomoran **E1–E4** baru dan tidak bertabrakan dengan P1–P12, A–O, maupun A1–B3.

---

## 0. Ringkasan

| # | Butir | Jenis | Keadaan | Ukuran |
|---|---|---|---|---|
| **E1** | Ekspor PDF tetap satu halaman, dan panel ikut tercetak | **Bug** | Penyebab terverifikasi; perbaikan sebelumnya perlu tapi belum cukup | Sedang |
| **E2** | Page break di blok kolom menyisakan halaman kosong | **Bug** | Penyebab terverifikasi (regresi dari `4b4dd20`) | Kecil |
| **E3** | Kolom: tabel di kolom sempit | Belum diselidiki | Dilewat atas keputusan; dicatat supaya tidak hilang | ? |
| **E4** | DOCX: impor `sectPr` & kolom pembungkus lama | Utang yang diketahui | Sengaja ditunda | Sedang |

**E1 dan E2 saling lepas** - keduanya bisa dikerjakan paralel oleh orang berbeda tanpa menyentuh
berkas yang sama.

---

## 1. Yang sudah beres (jangan dikerjakan ulang)

Supaya jelas apa yang TIDAK lagi jadi masalah:

| Perbaikan | Commit | Bukti |
|---|---|---|
| Lebar kolom tabel DOCX (dulu `w:gridCol w:w="100"` ≈ 1,8 mm) | `a3319b0` | uji membaca `word/document.xml` |
| Baris baru dalam satu simpul teks jadi `<w:br/>` | `a3319b0` | idem |
| Satu `sectPr` per section, termasuk `w:cols` | `bc00f1d` | idem |
| Orientasi DOCX (pustaka `docx` menukar sendiri saat lanskap) | `bc00f1d` | idem, **dikonfirmasi pemakai: 1 halaman lanskap benar** |
| `transform: scale()` dilepas saat mencetak | `b219e85` | perlu, tapi belum cukup - lihat E1 |
| Named pages `@page secN` per section | `3f0adc1` | belum bisa diuji sampai E1 beres |
| Page break di blok kolom dikenali sama sekali | `4b4dd20` | uji `columns.test.ts`; menyisakan E2 |

---

## 2. E1 — Ekspor PDF tetap satu halaman

### Gejala
Dialog cetak melaporkan **"Total: 1 page"** berapa pun panjang naskah, dan **panel Proofreader
ikut tergambar** di pratinjau cetak (tampak di tangkapan layar tiket: teks "Proofreade", "All /
Gra", "Whole", "Standard" di tepi kanan lembar).

Panel yang ikut tercetak itu bukan gangguan terpisah - ia **petunjuk utama** bahwa blok
`@media print` memang tidak lagi mengenali susunan DOM aplikasi.

### Penyebab (terverifikasi)

Aturan cetak menyembunyikan chrome aplikasi lewat:

```css
/* apps/web/app/globals.css, blok @media print */
header, nav, aside, .document-canvas ~ *, … { display: none !important; }
```

`.document-canvas ~ *` berarti **saudara sekandung** `.document-canvas`. Susunan sebenarnya:

```
div.relative.flex…pr-20                      ← workspace-page.tsx:41
├── aside                                     ← document-tabs.tsx:90   ✅ tersembunyi
├── div.relative.flex.flex-1.overflow-hidden  ← document-editor.tsx:45  ← pembungkus editor
│   └── … div.document-canvas
├── div.flex.w-[340px].overflow-hidden        ← panel-container.tsx:63  ❌ TIDAK tersembunyi
└── PanelRail                                 ← ❌ TIDAK tersembunyi
```

Panel dan rail adalah saudara **pembungkus editor**, bukan saudara `.document-canvas`. Selektor
itu tidak pernah menyentuh mereka. Daftar tab kebetulan selamat hanya karena ia `<aside>`.

Dua akibat, dan yang kedua yang mematikan:

1. Panel & rail ikut tercetak.
2. **Pembungkus editor `overflow-hidden` + `flex-1` tetap berlaku saat mencetak.** Ia memotong
   naskah setinggi viewport, jadi yang sampai ke peramban hanya sepetak isi - dan sepetak isi
   memang muat di satu halaman. Baris flex-nya pun masih menata editor dan panel berdampingan,
   sehingga lebar naskah menyusut sesuai sisa ruang.

Perbaikan `b219e85` (melepas `transform`) menghilangkan satu penghalang, tapi penghalang kedua -
pemotongan oleh ancestor - masih berdiri. Karena itu gejalanya tidak berubah sama sekali di mata
pemakai.

### Rancangan

Berhenti menyebut chrome satu per satu. Yang dicetak hanya naskah, jadi lebih aman menyatakan
itu secara positif:

1. **Beri nama pada apa yang boleh dicetak.** `document-editor.tsx` menandai pembungkusnya
   `document-print-root`. Saat mencetak, ia dilepas dari aliran aplikasi:
   ```css
   @media print {
     body > *:not(:has(.document-print-root)) { display: none !important; }
     .document-print-root {
       position: static !important;
       overflow: visible !important;
       flex: none !important;
       border-radius: 0 !important;
       background: #fff !important;
     }
   }
   ```
   `:has()` sudah baseline sejak 2023, dan jalur ini memang hanya perlu benar di peramban modern.
2. **Netralkan SEMUA ancestor yang memotong**, bukan hanya satu: setiap pembungkus dari `body`
   sampai `.document-canvas` harus `overflow: visible` dan tanpa tinggi tetap. Ini yang membuat
   naskah panjang benar-benar mengalir ke halaman berikutnya.
3. **Uji regresi yang mungkin tanpa peramban:** aturan cetak tidak bisa diuji dengan `bun test`,
   tapi **strukturnya** bisa. Tambahkan uji yang me-render `DocumentEditor` dan memastikan
   pembungkusnya membawa kelas `document-print-root` - itu yang mencegah selektor meleset lagi
   diam-diam saat lapisan pembungkus bertambah. Persis cara `document-zoom-frame` diberi nama
   pada `b219e85`.
4. **Panel & rail:** setelah butir 1, keduanya hilang dengan sendirinya. Tidak perlu selektor
   khusus - dan itu justru intinya: daftar "apa saja yang harus disembunyikan" akan selalu
   ketinggalan setiap kali ada komponen baru.

### Kriteria terima
- Naskah 10 halaman melaporkan 10 halaman di dialog cetak Chrome.
- Tidak ada bagian antarmuka (panel, rail, tab, menu) yang muncul di pratinjau.
- Margin tiap halaman - termasuk halaman kedua dan seterusnya - sesuai Penyiapan halaman.
- Dokumen ber-section campur: halaman lanskapnya benar-benar lanskap (ini sekaligus verifikasi
  pertama untuk `3f0adc1`, yang sampai sekarang belum bisa diuji karena terhalang E1).

**Ukuran:** sedang (1 hari, sebagian besar untuk mencoba di peramban sungguhan).

---

## 3. E2 — Page break di blok kolom menyisakan halaman kosong

### Gejala
Pada blok 3 kolom, page break memindahkan isi ke halaman berikutnya - tapi **menyisipkan satu
halaman kosong sebelumnya**. Regresi dari `4b4dd20`, yang sebelumnya tidak melakukan apa-apa
sama sekali.

### Penyebab (terverifikasi lewat pembacaan alur)

Perulangan penempatan mengakhiri tiap blok dengan:

```ts
// columns.ts, akhir badan while
if (index < items.length) advance()   // pindah ke kolom berikutnya; kolom terakhir → lembar baru
```

Jadi begitu isi mengisi **kolom terakhir** sebuah lembar, `advance()` sudah memindahkan posisi ke
kolom 0 **lembar berikutnya**. Barulah page break diproses:

```ts
if (items[index].isBreak) {
  slots.push({ page, column, top: base, height: 0 })   // penanda mendarat di lembar BARU
  breakPage()                                           // page += 1  ← melompat sekali lagi
}
```

Hasilnya lembar yang baru saja dibuka `advance()` tidak pernah terisi apa-apa selain penanda
setinggi nol - halaman kosong yang dilaporkan. Pada 2 kolom gejalanya jarang muncul karena
peluang isi berhenti tepat di kolom terakhir lebih kecil; pada 3 kolom jauh lebih sering.

### Rancangan

Page break hanya perlu melompat kalau lembar berjalan **sudah dipakai**. Bila posisi sedang
berada di puncak lembar yang masih kosong, ia sudah berada di tempat yang diminta:

```ts
if (items[index].isBreak) {
  const fresh = column === 0 && !slots.some((slot) => slot.page === page)
  slots.push({ page, column, top: Math.max(regionTop(page), blockedUntil[column]), height: 0 })
  index += 1
  if (!fresh) breakPage()
  continue
}
```

Uji yang harus ada (semuanya tanpa DOM, di `columns.test.ts`):

- break tepat setelah isi memenuhi kolom terakhir → **tidak** ada lembar tanpa isi;
- break di tengah kolom → isi sesudahnya mulai di kolom pertama lembar berikutnya (uji yang sudah
  ada, harus tetap hijau);
- dua break berturut-turut → hanya satu lembar yang dilewati, bukan dua;
- invarian umum: **tidak ada lembar di antara lembar pertama dan terakhir yang tanpa penempatan
  apa pun.** Ini yang paling berharga - ia menangkap bentuk kerusakan ini, bukan satu kasusnya.

### Kriteria terima
- Sampul 3 kolom dengan page break: halaman berurutan tanpa lembar kosong di antaranya.
- Uji page break yang sudah ada tetap hijau.

**Ukuran:** kecil (setengah hari, termasuk uji).

---

## 4. E3 — Kolom: tabel di kolom sempit

Dilewat atas keputusan pada 13 Agustus 2026 ("tugas RnD cuma sampai bagian *work*"), dicatat di
sini supaya tidak hilang dari daftar.

Yang diketahui: §P4 lapis 2 sudah memenggal tabel antar baris di dalam kolom (`cutTableRows`),
dan lapis 3 menaikkan blok tak terpenggal jadi selebar pembungkus. Yang **belum** pernah
diperiksa adalah tabel yang muat tingginya tapi terlalu sempit isinya - kolom A4 tiga-kolom
lebarnya sekitar 190 px, dan tabel dua kolom di dalamnya menyisakan ±90 px per sel.

Perlu diputuskan lebih dulu, bukan langsung dikerjakan: apakah tabel di dalam kolom sempit
sebaiknya **otomatis naik jadi selebar pembungkus** (seperti lapis 3), atau dibiarkan sempit
karena itu memang yang diminta penulis saat ia menaruh tabel di sana.

**Ukuran:** belum bisa ditaksir sebelum keputusan itu diambil.

---

## 5. E4 — DOCX: sisa yang diketahui

Bukan bug; keduanya sengaja ditunda dan tercatat di `WORKPLAN` §8.

1. **Impor `sectPr` belum ada.** `features/document/docx/parse.ts` mengabaikan properti section
   Word, jadi dokumen berorientasi campur yang diimpor menjadi satu section. Ekspor sudah benar,
   jadi ini satu-satunya arah yang masih pincang. Pemetaannya lurus: tiap `sectPr` → satu
   `sectionBreak` dengan `pageSetup` dan `columns`-nya.
2. **Blok kolom pembungkus lama diratakan.** Kolom di DOCX selalu properti *section*, jadi blok
   `columns` di tengah naskah tidak punya padanan tanpa memecah dokumen jadi tiga section -
   yang berarti menyisipkan pemenggalan halaman yang tidak pernah diminta penulis. Keputusan 13
   Agustus: ratakan. Dengan E2 beres dan kolom per-section (§P8) tersedia, jalan keluarnya
   sekarang berbeda: **arahkan pemakai memakai kolom per-section**, dan blok pembungkus lama
   cukup dianggap warisan.

---

## 6. Urutan & verifikasi

| Tahap | Isi | Alasan |
|---|---|---|
| **1** | E2 | Kecil, mandiri, dan mengembalikan kolom ke keadaan layak pakai |
| **2** | E1 | Membuka jalan verifikasi named pages (`3f0adc1`) yang sampai kini terhalang |
| **3** | E3 (putuskan dulu), E4 butir 1 | Keduanya butuh keputusan produk sebelum ditaksir |

Perintah: `bun run test`, `bun run typecheck`, dan untuk worker `pytest` (lihat README §Perintah).

Yang **tidak** bisa diverifikasi di mesin pengembangan dan harus dicoba pemakai: pratinjau cetak
Chrome (E1) dan tampilan berkas DOCX di Google Docs (E4).

---

## 7. Pertanyaan terbuka

1. **E3 - tabel di kolom sempit: naik selebar penuh, atau dibiarkan?** Ini keputusan produk;
   ukurannya tidak bisa ditaksir sebelum dijawab.
2. **E1 - apakah kepala/kaki halaman bawaan peramban (URL & tanggal) perlu diurus?** Ia tidak
   bisa dimatikan dari CSS; satu-satunya jalan adalah meminta pemakai mematikannya di dialog
   cetak. Dialog Ekspor PDF sudah menyebutkan langkahnya - cukup, atau perlu lebih terang?
3. **E4 butir 2 - blok kolom pembungkus lama mau dipensiunkan?** Kalau ya, `setColumns` pada
   seleksi bisa diarahkan membuat section berkolom, dan naskah lama tetap dibaca seperti
   sekarang. Kalau tidak, ia akan selamanya jadi bentuk kolom yang tidak bisa diekspor.
