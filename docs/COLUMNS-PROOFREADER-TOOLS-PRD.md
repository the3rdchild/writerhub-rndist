# WritingHub — PRD: Kolom, Proofreader, Bendera Bahasa & Perluasan Tools

Status: **Draft untuk ditinjau** · Disusun 13 Agustus 2026 · Baseline kode `d033114` (branch `main`).

Dokumen ini merinci sepuluh permintaan perbaikan/penambahan yang muncul dari sesi pemakaian
nyata (naskah skripsi dua kolom, lihat tangkapan layar pada tiket asal), ditambah temuan
investigasi yang muncul saat menelusurinya.

Penomoran **P1–P12** di sini baru dan tidak bertabrakan dengan `docs/FEATURE-GAP-PRD.md`
(A–O) maupun `docs/EDITOR-AI-UPGRADE-PRD.md` (A1–A5, B1–B3).

> **Pembagian kerja:** dokumen ini berisi *apa* dan *kenapa*. Untuk *siapa mengerjakan yang mana
> dan kapan* — pembagian dua jalur beserta kepemilikan berkas — lihat
> `docs/WORKPLAN-P1-P12-DUA-JALUR.md`.

---

## 0. Ringkasan

| # | Butir | Nomor asal | Jenis | Keadaan sekarang | Ukuran |
|---|---|---|---|---|---|
| **P1** | Bendera di pemilih bahasa | 1 | Polish | Belum ada — hanya label teks | Kecil |
| **P2** | Glosarium: keterangan asal istilah | 2 | Polish | Belum ada — hitungan `3×` tanpa penjelasan | Kecil |
| **P3** | Proofreader: accept meleset halaman, tak bisa hapus hasil, garis merah menetap | 3 | **Bug** | 3 bug terpisah, semuanya terverifikasi | Sedang |
| **P4** | Tabel/blok raksasa saling menimpa di mode ≥2 kolom | 4 | **Bug** | Terverifikasi lewat tes tanpa DOM | Sedang-besar |
| **P5** | Penanda lebar kolom di penggaris | 5 | Fitur | Belum ada — penggaris kenal tabel & gambar saja | Sedang |
| **P6** | Referensi GitHub ke `/ref` | 6 | Riset | 3 repo sudah ada; 3 kandidat baru | Kecil |
| **P7** | Mode batal (cancel) pada tools | 7 | Fitur | Belum ada di panel analisis; chat sudah punya | Sedang-besar |
| **P8** | Kolom per-halaman | 8 | Fitur | Belum ada — kolom milik rentang teks, bukan halaman | Besar |
| **P9** | Orientasi per-halaman | 9 | Fitur | Belum ada — satu geometri untuk seluruh tab | Besar |
| **P10** | `replaceTextRange` mengganti kemunculan pertama, bukan yang dimaksud | 10 (temuan) | **Bug** | Menular ke Rewriter, Humanizer, Translator | Kecil |
| **P11** | Worker: satu job macet membekukan seluruh antrean | 10 (temuan) | **Risiko** | Satu thread per antrean, tanpa deadline | Sedang |
| **P12** | Konsistensi panel + seragamkan bahasa UI ke Inggris | 10 (temuan) | Polish | Proofreader Inggris, Glosarium/Translator Indonesia | Sedang |

Urutan yang mengikat: **P4 harus selesai sebelum P8** (kolom per-halaman menambah beban pada
mesin tata letak yang sekarang masih salah), dan **P9 mengubah `PageGeometry` dari satu nilai
jadi daftar per-lembar**, yang dibaca P4, P5, dan penggaris kiri. **P10 memperbaiki akar dari
salah satu gejala P3** dan tidak bergantung pada apa pun.

---

## 1. Keadaan sekarang (baseline terverifikasi)

| Area | Berkas | Keadaan |
|---|---|---|
| Tata letak kolom | `apps/web/features/editor/columns.ts:200` | `flowColumns` membagi blok ke petak (lembar, kolom) secara aritmetis; blok tidak pernah dipenggal |
| Paginasi | `apps/web/features/editor/pagination.ts:261` | `computeSpacers`; tabel diukur **per baris** (`measureTable:163`) sehingga bisa dipenggal antar baris |
| Geometri lembar | `apps/web/features/editor/page-geometry.ts:151` | Satu `PageGeometry` per tab; `pageStride` seragam untuk seluruh dokumen |
| Kanvas | `apps/web/components/editor/document-canvas.tsx:153` | Menggambar `pageCount` lembar **identik** dari satu `setup` |
| Penyiapan halaman | `apps/web/features/editor/use-page-setup.ts:33` | `tab.pageSetup ?? doc.pageSetup ?? bawaan pemakai`; scope `document` \| `tab` |
| Penggaris atas | `apps/web/components/editor/document-ruler.tsx:57` | Margin, indentasi paragraf, tepi & batas kolom **tabel**, posisi gambar. Tidak kenal blok kolom |
| Sasaran penggaris | `apps/web/features/editor/ruler-targets.ts:41` | `RulerTarget = TableRulerTarget \| ImageRulerTarget \| null` |
| Pemilih bahasa | `apps/web/components/panels/run-scope-bar.tsx:83` | Dropdown 16 bahasa, ikon `Globe` tunggal untuk semuanya |
| Daftar bahasa | `apps/web/features/document/language.ts:27` | `LANGUAGE_OPTIONS` = `{ code, label }`; **tidak ada** field bendera/negara |
| Pemakai daftar bahasa | `run-scope-bar.tsx`, `change-list-panel.tsx:41`, `features/memory/memory-tab.tsx:113` | Tiga permukaan berbeda |
| Glosarium (worker) | `services/worker/services/analyzers/glossary.py:54` | `extract_candidates` = akronim (≥1×) + frasa berkapital (≥2×), maks 60 kandidat → 1 panggilan LLM |
| Glosarium (panel) | `apps/web/components/panels/glossary-panel.tsx:87` | Menampilkan `entry.occurrences` sebagai `3×` tanpa keterangan apa pun |
| Bentuk `GlossaryEntry` | `packages/shared/src/analysis.ts` | `{ term, expansion, definition, occurrences }` — tidak ada field jenis kandidat |
| Proofreader | `apps/web/components/panels/proofreader-panel.tsx` | Filter, kartu saran, Accept All, Copy Result, skor |
| Sorotan saran | `apps/web/features/document/suggestion-highlight.ts:30` | Dekorasi dihitung ulang dari `original`; `dismissed` dilewati |
| Terap teks | `apps/web/features/editor/apply-text.ts:16` | `replaceTextRange` — **`indexOf` tanpa petunjuk offset**, lalu `.focus()` |
| Job async | `apps/api/src/lib/queue.ts`, `routes/v1/stream.route.ts` | BullMQ enqueue + SSE; **tidak ada endpoint batal** |
| Status job | `packages/shared/src/job.ts:3` | `pending \| processing \| completed \| failed` — **tidak ada `cancelled`** |
| Worker | `services/worker/entry.py`, `core/queue/worker.py:10` | Dua thread (grammar, analysis), masing-masing `BRPOP` → `handler(data)` **sinkron, tanpa deadline** |
| LLM | `services/worker/services/analyzers/llm_client.py:115` | `requests.post(..., timeout=60)`; satu panggilan per job, tanpa titik batal |
| Batal di chat | `apps/web/features/chat/chat-context.tsx:373` | `AbortController` + tombol Stop (`ai-chat-panel.tsx:273`) — **sudah ada**, jadi acuan pola |
| Tools AI | `packages/shared/src/tools.ts:32` | 33 alat; `set_columns:452` (rentang/seluruh naskah), `set_page_setup:234` (scope `document`\|`tab`) |
| `/ref` | `ref/ferdocs`, `ref/google-docs-clone`, `ref/tiptap` | fileverse-ddoc `11e5836`, sanidhyy/google-docs-clone `5147279`, ueberdosis/tiptap `eded5e4b2` |

---

## 2. Keputusan produk yang mengikat

1. **"Per-halaman" diwujudkan sebagai *section*, bukan sebagai nomor halaman.** Halaman ke-3
   bukan identitas yang stabil: menambah satu paragraf di halaman 1 memindahkan isinya ke
   halaman 4, dan setelan yang menempel pada "halaman 3" akan mendarat di isi yang salah. Word
   dan LibreOffice menyelesaikan ini dengan *section break*, dan kita mengikuti: setelan
   menempel pada **potongan naskah**, UI-nya saja yang berbicara dalam bahasa halaman
   ("halaman ini saja"). Ini mengikat P8 dan P9. **Dikonfirmasi (§15.1).**

2. **Kolom tetap milik rentang naskah, bukan milik lembar.** `setColumns` yang sudah ada
   membungkus seleksi; P8 menambahkan jalan pintas "kolomkan isi halaman ini" yang menyisipkan
   pembatas section di batas halaman berjalan, bukan model kolom kedua yang bersaing.

3. **Tidak ada blok yang boleh digambar menimpa blok lain.** Kalau sebuah blok memang lebih
   tinggi dari kolomnya dan belum bisa dipenggal, ia mendapat petaknya sendiri dan tata letak
   melompati ruang yang ia habiskan. Meluber ke margin masih boleh; tertimpa tidak.

4. **Hasil analisis harus bisa dibuang tanpa menerimanya.** Setiap panel yang meninggalkan
   sorotan di naskah wajib punya jalan keluar satu klik. Ini berlaku untuk Proofreader (P3) dan
   dipakai ulang oleh panel lain (P12).

5. **Batal (cancel) selalu membebaskan UI seketika, dan berusaha membebaskan worker.** Dua hal
   berbeda: yang pertama wajib dan murah, yang kedua *best effort* karena worker mungkin sedang
   menunggu jawaban LLM. Kita tidak menjanjikan yang kedua di UI.

6. **Bendera adalah aksesori label, bukan pengganti label.** Nama bahasa tetap ditulis; bendera
   hanya menambah kecepatan pindai. Bendera tidak pernah jadi satu-satunya penanda (bahasa
   bukan negara).

7. **Bahasa UI adalah bahasa Inggris, seluruhnya (§15.3).** Yang sekarang berbahasa Indonesia —
   Glosarium, Translator, sebagian `panel-parts` dan menu — diterjemahkan ke Inggris. Pemilih
   bahasa antarmuka di Settings akan datang menyusul sebagai pekerjaan tersendiri; sampai itu
   ada, **jangan** menambah string Indonesia baru. Komentar kode tetap berbahasa Indonesia —
   itu untuk penulisnya, bukan untuk pemakai.

8. **Job yang dibatalkan tetap menagih kuota (§15.5).** Token sudah terlanjur terpakai di sisi
   penyedia, jadi `cancelled` dicatat sebagai pemakaian seperti `completed`. UI harus jujur
   menyebutnya saat membatalkan ("Quota for this run has already been used"), supaya pemakai
   tidak menekan Batalkan dengan harapan yang keliru.

9. **Batas waktu job datang dari env, bukan dari konstanta (§15.6).** `JOB_DEADLINE_SECONDS`
   (bawaan 300) dan `WORKER_CONCURRENCY` (bawaan 2) di env worker. Angka bawaannya tebakan
   awal; yang menentukan angka akhir adalah pengukuran pada naskah 50 ribu karakter tier AI.

10. **Blok yang tidak muat di satu kolom naik jadi selebar penuh (§15.4).** Tabel lebar akan
    melintang menembus kedua kolom, seperti pada jurnal cetak. Perubahan tampilan ini diterima.

---

## P1 — Bendera di pemilih bahasa

### Keadaan
`LANGUAGE_OPTIONS` (`features/document/language.ts:27`) hanya membawa `{ code, label }`. Ketiga
permukaan yang memakainya menampilkan teks polos:

- `components/panels/run-scope-bar.tsx:83` — dropdown bahasa naskah (Proofreader & semua panel).
- `components/panels/change-list-panel.tsx:41` — bahasa tujuan Translator.
- `features/memory/memory-tab.tsx:113` — bahasa AI Memory.

### Rancangan
1. Tambahkan field `flag` pada `LANGUAGE_OPTIONS`, bukan tabel terpisah — satu daftar, satu
   tempat diubah:
   ```ts
   export const LANGUAGE_OPTIONS: ReadonlyArray<{ code: string; label: string; flag: string }>
   ```
2. **Cara menggambar bendera.** Emoji Unicode (`🇮🇩`) *tidak* dirender pada Chrome/Edge di
   Windows — Chromium menyatakan tidak akan mendukungnya kecuali Windows sendiri
   menambahkannya. Karena mayoritas pemakai WritingHub ada di Windows, emoji polos akan tampil
   sebagai dua huruf (`ID`) atau kotak. Dua jalan yang layak:
   - **Disarankan:** sprite SVG kecil di-*bundle* (16 bendera × ~1 KB), dirender lewat komponen
     `<Flag code="id" />`. Tidak ada permintaan jaringan, tampil sama di semua sistem.
   - Alternatif: `country-flag-emoji-polyfill` (menyuntik web font). Menambah dependensi runtime
     dan satu unduhan font; ditolak kecuali sprite ternyata terlalu merepotkan.
3. **Pemetaan bahasa→bendera — sudah diputuskan (§15.2):**
   `en`→🇺🇸, `id`→🇮🇩, `ms`→🇲🇾, `es`→🇪🇸, `pt`→🇧🇷, `fr`→🇫🇷, `de`→🇩🇪, `it`→🇮🇹, `nl`→🇳🇱,
   `tr`→🇹🇷, `vi`→🇻🇳, `ja`→🇯🇵, `ko`→🇰🇷, `zh`→🇨🇳, `ar`→🇸🇦, `ru`→🇷🇺.
   Sprite yang diunduh hanya 16 berkas ini — jangan bawa seluruh set bendera dunia.
4. Tombol pemicu dropdown (`run-scope-bar.tsx:65`) mengganti ikon `Globe` dengan bendera bahasa
   yang berlaku; `Globe` tetap dipakai saat bahasa belum pasti (`language.uncertain`).

### Kriteria terima
- Bendera tampil sama di Chrome/Windows, Chrome/Linux, dan Safari/macOS.
- Nama bahasa tetap terbaca; bendera punya `aria-hidden`, label tetap jadi nama aksesibilitas.
- Ukuran bundel bertambah < 25 KB.

**Ukuran:** kecil (½ hari).

---

## P2 — Glosarium: dari mana istilah ini datang

### Keadaan
Panel menampilkan `{entry.occurrences}×` (`glossary-panel.tsx:87`) tanpa keterangan. Pemakai
tidak punya cara tahu bahwa daftar itu berasal dari kata yang **berulang**, sehingga istilah
yang muncul sekali dianggap "hilang" — padahal itu keputusan desain yang disengaja
(`glossary.py:17`).

Aturan sebenarnya, terverifikasi di `glossary.py:54`:
- **Akronim** (2–6 huruf kapital, boleh berangka) diterima **walau muncul sekali**.
- **Frasa berkapital 1–3 kata** baru diterima kalau muncul **lebih dari sekali**.
- Maksimal **60 kandidat** teratas yang dikirim ke LLM; LLM membuang yang bukan istilah dan
  menuliskan definisinya.

### Rancangan
1. **Worker** (`glossary.py`): bawa jenis kandidat sampai ke hasil. `extract_candidates`
   mengembalikan `(term, count, kind)` dengan `kind ∈ {'acronym', 'phrase'}`; `run_glossary`
   meneruskannya ke entri.
2. **Shared** (`packages/shared/src/analysis.ts`): `GlossaryEntry` bertambah
   `source?: 'acronym' | 'phrase'`. Opsional, supaya hasil lama tetap terbaca.
3. **Panel** (`glossary-panel.tsx`):
   - Satu kalimat penjelas di atas daftar, selalu tampil saat ada hasil:
     > Disusun dari kata dan akronim yang **berulang** di naskah ini — istilah yang hanya muncul
     > sekali tidak terjaring, kecuali berupa akronim.
   - Hitungan `3×` diberi `title`/tooltip: `"Muncul 3 kali di naskah"`.
   - Lencana kecil per entri: `Akronim` / `Frasa berulang`.
   - Saat `entries.length === 0`, pesan kosongnya menjelaskan **kenapa** kosong dan bukan
     sekadar "tidak ada": sebutkan ambang berulang.
4. **Tabel yang disisipkan ke naskah tidak berubah.** Keterangan ini milik panel, bukan milik
   naskah — pembaca skripsi tidak perlu tahu heuristik kita.

### Kriteria terima
- Hasil glosarium lama (tanpa `source`) tetap tampil, hanya tanpa lencana.
- Uji `glossary.py` yang sudah ada tetap hijau; tambah satu kasus yang memastikan akronim satu
  kemunculan dapat `kind='acronym'`.

**Ukuran:** kecil (½–1 hari).

---

## P3 — Proofreader: tiga bug terpisah

Tiket asal menyebut tiga gejala. Investigasi menemukan tiga penyebab yang **berbeda**, jadi
ketiganya diperbaiki terpisah.

### P3.1 — Menerima saran melempar tampilan ke halaman lain

**Penyebab (terverifikasi).** Jalur *popover* di dalam editor:

```ts
// apps/web/components/editor/tiptap-editor.tsx:242-256
const applySuggestion = (id: string) => {
  const index = buildTextIndex(editor.state.doc)
  const span = index.text.indexOf(suggestion.original)   // ← kemunculan PERTAMA di dokumen
  ...
  editor.chain().focus().insertContentAt(range, suggestion.replacement).run()
  //             ^^^^^ menggulung ke posisi kursor yang baru
}
```

`suggestion.offset` — yang sudah dihitung ulang dengan teliti oleh `resolveSpan`
(`features/document/suggestions.ts:17`) — **dibuang**. Untuk kata yang sering muncul ("yang",
"dan", "data"), kemunculan pertama hampir selalu ada di halaman 1, sementara pemakai sedang di
halaman 8. `.focus()` lalu menggulung ke sana. Jadi dua kerusakan sekaligus: **teks yang salah
yang diganti**, dan tampilan yang melompat.

**Perbaikan.**
- `applySuggestion` memakai `resolveSpan(index.text, suggestion.original, suggestion.offset)`,
  sama seperti yang dipakai lapisan sorotan — satu fungsi, satu perilaku.
- Ganti `.focus()` dengan penempatan seleksi tanpa gulir: `editor.chain().insertContentAt(...)`
  lalu `setTextSelection`, dengan `scrollIntoView: false` pada transaksinya. Pemakai sudah
  melihat tempatnya; menggulungnya lagi hanya bisa salah.

### P3.2 — Menerima saran dari **panel** tidak mengubah naskah sama sekali

**Penyebab (terverifikasi).** `proofreader-panel.tsx:43` mendefinisikan `acceptSuggestion` yang
memanggil `replaceTextRange`, tapi kartu saran memanggil reducer langsung:

```tsx
// apps/web/components/panels/proofreader-panel.tsx:143
onAccept={() => dispatch({ type: 'acceptSuggestion', id: suggestion.id })}
```

`acceptSuggestion` lokal itu **tidak pernah dipakai** — kode mati. Reducer
(`document-reducer.ts:103`) hanya menandai saran selesai dan menggeser offset saran lain;
komentarnya sendiri menyatakan penggantian "diterapkan langsung di editor oleh panel". Jadi
menerima satu saran dari panel = sorotan hilang, naskah utuh. `acceptAll` (baris 56) benar dan
memang mengganti — sehingga gejalanya membingungkan: Accept All bekerja, Accept satuan tidak.

**Perbaikan.** `onAccept={() => acceptSuggestion(suggestion.id)}`. Tambah uji regresi yang
memastikan naskah editor berubah setelah satu accept dari panel.

### P3.3 — Garis merah menetap saat saran tidak diterima

**Penyebab.** Tidak ada satu pun jalan untuk membuang **seluruh** hasil. Yang tersedia hanya:
menekan Dismiss pada tiap kartu satu per satu, atau mengganti seluruh teks (`setText` memanggil
`withClearedResults`, `document-reducer.ts:62`). Menutup panel tidak menghapus apa pun — sorotan
digambar oleh ekstensi editor (`suggestion-highlight.ts`), bukan oleh panel — jadi garis merah
bertahan selama sesi.

**Perbaikan.**
1. Aksi baru pada reducer:
   ```ts
   case 'clearResults': return withClearedResults(state)
   ```
   `withClearedResults` sudah ada dan sudah mengosongkan `suggestions`, `scores`,
   `focusedRange`, `hoveredRange` — tidak ada yang baru perlu ditulis.
2. Tombol **"Hapus hasil"** di kaki panel, muncul kalau `hasResults`, di samping "Copy Result".
   Gaya sekunder (garis batas, bukan isian) supaya tidak bersaing dengan tombol Run.
3. Konfirmasi tidak dipakai: aksinya tidak merusak naskah dan bisa diulang dengan menekan Run.
4. Perilaku yang sama di panel lain — lihat P12.

### Kriteria terima P3
- Menerima saran dari kartu panel mengubah naskah pada posisi yang benar, meski kata yang sama
  muncul 20 kali sebelumnya.
- Menerima saran dari popover tidak menggulung tampilan.
- "Hapus hasil" menghilangkan semua garis bawah dan semua kartu dalam satu klik; skor ikut
  hilang; tombol Run kembali ke label "Check Grammar".
- Uji: satu kasus per bug di `apps/web/features/document/` (reducer + `resolveSpan`), dan satu
  uji integrasi editor untuk P3.2.

**Ukuran:** sedang (1–2 hari).

---

## P4 — Kolom: tabel dan blok raksasa saling menimpa

### Gejala
Pada mode dua kolom, tabel digambar menembus batas lembar dan isi berikutnya digambar **di
atasnya** (lihat tangkapan layar tiket: keterangan "Tabel 3.6" dan tabel barunya tercetak
menimpa baris-baris tabel 3.5).

### Penyebab (terverifikasi lewat tes)

`flowColumns` (`columns.ts:200`) tidak pernah memenggal satu blok. Kalau sebuah blok lebih
tinggi dari satu kolom, ia sengaja dibiarkan meluber (`columns.ts:247-250`), lalu tata letak
**maju satu petak** dan meletakkan blok berikutnya di sana — tanpa memperhitungkan ruang yang
sudah dihabiskan si blok raksasa. Pada kolom yang sama di lembar berikutnya, keduanya bertemu.

Direproduksi tanpa DOM dengan A4 (`contentHeight` 931, `pageStride` 1155), 2 kolom, satu blok
setinggi 1,5 kolom diikuti 20 blok 120 px:

```
  #0  col=0     0 → 1397     ← "tabel" raksasa, meluber ke lembar 2
  #1  col=1     0 →  120
  …
  #8  col=0  1155 → 1275     ← lembar 2, kolom 0
  #9  col=0  1275 → 1395
  #10 col=0  1395 → 1515
  !! TUMPANG TINDIH #0 dan #8 di kolom 0
  !! TUMPANG TINDIH #0 dan #9 di kolom 0
  !! TUMPANG TINDIH #0 dan #10 di kolom 0
```

Kenapa tabel yang paling sering kena: kolom pada A4 dua kolom lebarnya ±300 px dan tingginya
931 px. Teks sel yang di satu kolom penuh muat dalam tiga baris, di kolom setengah lebar jadi
enam — tabel enam baris pun lewat 931 px dengan mudah. Paginasi biasa tidak punya masalah ini
karena ia mengukur tabel **per baris** (`pagination.ts:163`); tata letak kolom tidak punya
padanannya dan memperlakukan tabel sebagai satu blok utuh.

Uji yang sudah ada justru mengunci perilaku ini sebagai "batasan yang diketahui"
(`columns.test.ts:121`), tapi hanya untuk **satu** blok tanpa blok sesudahnya — kasus yang tidak
pernah terjadi di naskah sungguhan.

### Rancangan

Tiga lapis, dikerjakan berurutan; lapis 1 sudah menghilangkan gejala, lapis 2 memperbaiki
hasilnya, lapis 3 menutup sisa kasus.

**Lapis 1 — tidak ada yang boleh tertimpa (wajib).**
`flowColumns` mencatat sampai mana blok raksasa benar-benar sampai, lalu memajukan petak
sebanyak yang ia habiskan sebelum menaruh blok berikutnya:

```ts
if (tops.length === 0 && limit >= contentHeight - 0.5) {
  tops = [0]                                  // blok raksasa dapat petaknya sendiri
  const spill = items[index].height - regionHeight(page)
  const sheetsEaten = Math.ceil(spill / pageStride)
  // majukan sampai lewat lembar yang ia tembus, di SEMUA kolom
}
```
`flow.height` juga harus mencakup luberan itu, supaya paginasi tidak menaruh blok sesudah
pembungkus di atasnya.

**Lapis 2 — tabel dipenggal antar baris di dalam kolom.**
Pindahkan gagasan `measureTable` ke `measureColumns`: anak bertipe `table` masuk sebagai
**deret satuan per baris**, bukan satu `ColumnItem`. Penempatannya memakai mekanisme yang sudah
ada di paginasi — baris kosong tanpa border sebagai pengganjal (`rowSpacer`,
`pagination.ts:437`) dan salinan baris header di puncak potongan (`repeatedHeader:457`). Ini
bagian terbesar dari P4 dan yang membuat jurnal dua kolom benar-benar terbaca.

**Lapis 3 — blok tak terpenggal yang tetap tidak muat** (gambar sehalaman, blok kode panjang,
satu paragraf raksasa): naikkan ke lebar penuh (`column-span: all` secara logis — satu petak
selebar pembungkus) alih-alih dibiarkan meluber di satu kolom. Ini yang dilakukan pengolah kata
lain, dan pada tabel skripsi hasilnya justru lebih benar daripada memaksanya ke setengah lebar.

**Catatan pengukuran (kandidat penyebab kedua, belum terverifikasi di peramban).**
`measureColumns:447` membaca `getComputedStyle(element)` pada DOM terluar node view. Untuk
tabel, DOM itu adalah `div.tableWrapper` bikinan `prosemirror-tables`
(lihat catatan di `features/editor/table-indent.ts:10`), yang **tidak** memegang margin —
margin ada pada `<table>` di dalamnya dan bocor keluar lewat penggabungan margin.
`marginBottom` yang terbaca 0 padahal sebenarnya 0,75em membuat penumpukan antar blok terhitung
terlalu rapat. Efeknya kecil (≈12 px per tabel) dibanding lapis 1, tapi gejalanya sama jenis —
karena itu diverifikasi dan diperbaiki bersamaan, dengan membaca margin dari elemen node
terdalam bila DOM terluar tidak punya margin sendiri. Berlaku juga untuk blok kode
(`code-block-node-view.tsx:94`), gambar (`resizable-image-view.tsx:156`), dan blok TOC.

### Kriteria terima
- Tes `columns.test.ts` bertambah: **tidak ada dua penempatan yang bertumpang tindih pada kolom
  yang sama**, diperiksa untuk 1–3 kolom, blok raksasa di awal/tengah/akhir, dan pembungkus yang
  mulai di tengah halaman. Uji ini yang menjadi jaring pengaman.
- Uji lama `columns.test.ts:121` ("blok lebih tinggi dari kolom penuh tetap ditempatkan")
  diperbarui, bukan dihapus — perilakunya memang berubah.
- Manual: naskah contoh dari tiket (tabel 3.5 & 3.6) dua kolom, dicetak ke PDF, tidak ada
  tumpang tindih dan tidak ada isi yang menembus margin bawah.

**Ukuran:** lapis 1 kecil (½ hari), lapis 2 sedang-besar (2–3 hari), lapis 3 sedang (1 hari).

---

## P5 — Penanda kolom di penggaris

### Keadaan
`document-ruler.tsx` menggambar margin, indentasi paragraf, tepi/batas kolom **tabel**, dan
posisi gambar. Blok kolom tidak dikenali sama sekali: saat kursor berada di dalam `columns`,
penggaris tetap menampilkan lebar penuh lembar, dan tidak ada cara mengubah lebar kolom atau
jarak antar kolom selain lewat CSS.

Google Docs (gambar 2 di tiket) menampilkan, untuk tiap kolom: batas kiri, batas kanan, dan
pita abu-abu untuk celah antar kolom — semuanya bisa diseret.

### Rancangan
1. **Sasaran baru** di `features/editor/ruler-targets.ts`:
   ```ts
   export interface ColumnsRulerTarget {
     kind: 'columns'
     pos: number          // posisi node columns
     count: number
     gap: number          // px dokumen
     widths: number[]     // per kolom; sekarang selalu rata
   }
   ```
   Dideteksi dari `$from` yang berada di dalam node `columns`, sejajar dengan `locateTable`.
2. **Atribut node**: `Columns` (`columns.ts:52`) bertambah `gap` (px) dan opsional
   `widths: number[] | null` (null = rata). `flowColumns` sudah menerima `columnWidth` dan
   `columnGap` sebagai parameter, jadi perubahannya terbatas pada `measureColumns:434-437` yang
   sekarang menghitungnya sendiri dari `clientWidth`.
3. **Penggaris**: gambar `count - 1` pasang penanda celah (kiri & kanan tiap celah), memakai
   `ObjectHandle` varian baru `columns-gap`. Menyeret satu sisi mengubah lebar dua kolom
   bertetangga (pola yang sama dengan `tableCol`, `document-ruler.tsx:376`); menyeret pita
   memindahkan celah tanpa mengubah lebar total. Masuk `DEFERRED` (`document-ruler.tsx:50`)
   supaya penulisan ke Y.Doc terjadi saat pointer dilepas, bukan tiap piksel.
4. **Konflik penanda**: penanda paragraf sudah disembunyikan saat tabel aktif
   (`document-ruler.tsx:166`). Untuk kolom, penanda indentasi paragraf **tetap** ditampilkan
   (indentasi di dalam kolom masih bermakna), tapi diikat ke batas kolom tempat kursor berada,
   bukan ke margin lembar.
5. **Nilai kembali ke rata** lewat klik-ganda pada penanda celah — jalan keluar tanpa harus
   menyeret dengan presisi.

### Kriteria terima
- Kursor di dalam blok 2/3 kolom menampilkan penanda celah; keluar dari blok, penanda hilang.
- Menyeret celah mengubah tata letak layar seketika dan bertahan setelah muat ulang.
- Lebar kolom minimum ditahan (pakai kembali `MIN_COLUMN_WIDTH`, `document-ruler.tsx:53`).
- Cetak: lebar kolom hasil seretan ikut ke `@media print` (`globals.css:1631`).

**Ukuran:** sedang (2 hari). Bergantung pada P4 lapis 1.

---

## P6 — Referensi ke `/ref`

### Yang sudah ada
| Folder | Repo | Commit | Berguna untuk |
|---|---|---|---|
| `ref/ferdocs` | `fileverse/fileverse-ddoc` | `11e5836` (2 Agu 2026) | `package/extensions/multi-column/` — kolom **berdampingan** (bukan koran) + menu kolom; `supercharged-table/` untuk `colgroup`/lebar kolom |
| `ref/google-docs-clone` | `sanidhyy/google-docs-clone` | `5147279` (3 Agu 2026) | Bentuk penggaris & toolbar bergaya Google Docs |
| `ref/tiptap` | `ueberdosis/tiptap` | `eded5e4b2` (10 Agu 2026) | Sumber kebenaran `prosemirror-tables`, node view, dekorasi |

### Kandidat baru yang layak di-*clone* (untuk **dibaca**, bukan dipakai)

| Kandidat | Kenapa | Untuk butir |
|---|---|---|
| [`adalat-ai-tech/tiptap-pages`](https://github.com/adalat-ai-tech/tiptap-pages) | Memecah isi antar halaman dengan pencarian biner + deteksi luapan; pendekatan pemenggalan node yang persis kita butuhkan untuk **P4 lapis 2** | P4 |
| [`adityayaduvanshi/tiptap-pagination-breaks`](https://github.com/adityayaduvanshi/tiptap-pagination-breaks) | Paginasi berbasis tinggi halaman tetap; berguna sebagai pembanding aritmetika `computeSpacers` | P4, P9 |
| [`tiptap-pagination-plus`](https://www.npmjs.com/package/tiptap-pagination-plus) | Mengklaim penanganan tabel di batas halaman | P4 |
| [Tiptap Pages resmi](https://tiptap.dev/docs/pages/getting-started/overview) | Dokumentasinya menyatakan tabel butuh paket terpisah (`extension-pages-tablekit`) — konfirmasi independen bahwa tabel-di-batas-halaman memang masalah tersendiri, bukan kekurangan kita | P4 |
| [`taktik/prose-editor`](https://github.com/taktik/prose-editor) | Pengolah kata berbasis ProseMirror; acuan model *section* untuk **P9** | P8, P9 |

**Aturan `/ref`.** Isi folder ini **tidak pernah** diimpor oleh kode `apps/*`. Ia dibaca,
dikutip di komentar (`ref/<repo>/<path>`), lalu ditulis ulang sesuai arsitektur kita —
persis seperti yang sudah dilakukan pada `tiptap-editor.tsx:66` yang menyebut ferdocs. `ref/`
sudah masuk `.gitignore:43`, jadi clone baru tidak akan ikut ter-*commit*; yang perlu dicatat di
PR hanyalah commit yang dibaca.

Perintah:
```bash
cd /mnt/doc/Reacteev/writer-hub/ref
git clone --depth=1 https://github.com/adalat-ai-tech/tiptap-pages.git
git clone --depth=1 https://github.com/adityayaduvanshi/tiptap-pagination-breaks.git
git clone --depth=1 https://github.com/taktik/prose-editor.git
```

**Ukuran:** kecil (½ hari membaca + catatan temuan).

---

## P7 — Mode batal pada tools

### Keadaan
- **AI Chat sudah punya** dan menjadi acuan: `AbortController` di `chat-context.tsx:373`, tombol
  Stop di `ai-chat-panel.tsx:273`, status langkah `cancelled` (`chat-context.tsx:73`).
- **Panel analisis tidak punya sama sekali.** `RunButton` (`panel-parts.tsx:108`) hanya berubah
  jadi spinner dan mati. `useAnalysis` sudah menerima `signal` dari TanStack Query
  (`use-analysis.ts:69`) tapi tidak pernah membatalkannya. `useGrammarCheck` bahkan tidak
  meneruskan `signal` ke `streamGrammarCheck` (`use-grammar-check.ts:76`).
- **Server tidak punya konsep batal.** `JOB_STATUSES` (`packages/shared/src/job.ts:3`) berisi
  `pending|processing|completed|failed`. Tidak ada rute batal.
- **Worker berjalan sinkron tanpa deadline** (`core/queue/worker.py:44`).

### Rancangan — tiga lapis, sesuai keputusan §2.5

**Lapis A — UI bebas seketika (wajib, murah).**
1. `useAnalysis` mengembalikan `cancel()` yang memanggil
   `queryClient.cancelQueries({ queryKey })`; `useGrammarCheck` meneruskan `AbortSignal` ke
   `streamGrammarCheck` dan menyediakan `cancel()`.
2. `streamJob` sudah menghormati `signal` dan menutup `EventSource`
   (`apps/web/lib/sse.ts`) — tidak ada yang perlu diubah di sana.
3. `RunButton` menerima `onCancel?`. Saat `isRunning` dan `onCancel` ada, tombol berubah jadi
   **"Batalkan"** dengan ikon `Square` — bukan tombol kedua di sebelahnya. Satu tombol, dua
   keadaan: itu pola yang sudah dipakai chat, dan tidak menambah target klik saat panik.
4. Pembatalan **tidak** dianggap error: panel kembali ke keadaan sebelum Run, tanpa `PanelError`.

**Lapis B — job ditandai batal di server (best effort).**
1. `JOB_STATUSES` bertambah `'cancelled'`; migrasi enum `pool_request.status`.
2. `POST /api/v1/jobs/:jobId/cancel`:
   - set `pool_request.status = 'cancelled'`;
   - `SET job:{jobId}:cancel 1 EX 3600` di Redis — bendera yang dibaca worker;
   - kalau job masih di antrean (`LREM bull:{QUEUE}:wait 0 {jobId}` berhasil), hapus juga hash-nya
     — job yang belum jalan bisa dibatalkan sungguhan;
   - `PUBLISH` `{type:'cancelled'}` ke `jobChannel(jobId)`.
3. `isTerminalEvent` (`apps/api/src/lib/job-events.ts:18`) menambahkan `'cancelled'` supaya SSE
   ditutup rapi.
4. Klien memakai rute ini di `cancel()`, tapi **tidak menunggu jawabannya** — UI sudah bebas.

**Lapis C — worker tidak lagi bisa membekukan antrean (lihat juga P11).**
1. Titik periksa kooperatif di `analysis_service.process` dan `grammar_service`: sebelum
   memanggil analyzer, sesudahnya, dan sebelum `save_*_result`. Kalau bendera batal menyala →
   `update_status(job_id, 'cancelled')`, tidak menyimpan hasil, tidak menerbitkan `done`.
2. Panggilan LLM sudah dibatasi 60 detik (`llm_client.py:10`), jadi jendela macet maksimum
   terikat pada jumlah panggilan per job. Jendela itu **tidak** dikecilkan lewat cancel; yang
   mengecilkannya adalah P11.

**Kuota (§2.8).** `cancelled` **tetap** dicatat sebagai pemakaian kuota — token sudah terpakai di
sisi penyedia. `update_tokens` karena itu dipanggil sebelum titik periksa batal terakhir, bukan
sesudahnya, supaya pemakaian yang sudah terjadi tidak hilang dari catatan. Tombol Batalkan
menyertakan keterangan kecil: *"Quota for this run has already been used."*

### Cakupan
Tujuh panel yang memanggil job: Proofreader, AI Detector, AI Rewriter, Humanizer, Plagiarism,
Translator, Glosarium. Semuanya lewat `RunButton`, jadi perubahan UI-nya satu tempat.

### Kriteria terima
- Menekan Batalkan mengembalikan panel ke keadaan siap dalam < 200 ms, tanpa pesan galat.
- Job yang masih `pending` benar-benar tidak pernah dijalankan.
- Job yang sudah `processing` berakhir `cancelled`, dan hasilnya tidak pernah tersimpan.
- Token yang sudah terpakai tetap tercatat pada `pool_request` yang berstatus `cancelled`.
- Menjalankan ulang setelah batal bekerja normal (kunci query tidak tersangkut).

**Ukuran:** lapis A kecil (1 hari), lapis B sedang (1–2 hari), lapis C sedang (1–2 hari).

---

## P8 & P9 — Kolom dan orientasi per-halaman

Kedua butir ini dibahas bersama karena keduanya menuntut perubahan yang sama pada model
dokumen; mengerjakannya terpisah berarti membongkar mesin yang sama dua kali.

### Kenapa ini besar

Hari ini seluruh tab punya **satu** geometri:

```ts
// apps/web/components/editor/document-canvas.tsx:58,153
const geometry = useMemo(() => pageGeometry(setup), [setup])
Array.from({ length: pageCount }, (_, index) => (
  <div className="document-sheet absolute" style={{ top: index * pageStride, width, height }} />
))
```

Dan seluruh aritmetika paginasi bersandar pada `pageStride` yang **seragam**:
`pagination.ts:315` (`const target = pageCount * pageStride`), `:345`
(`Math.floor(renderedBottom / pageStride) + 1`), dan `columns.ts:209-215` (`sheetTop`,
`sheetBottom`). Begitu lembar 3 lebih lebar dan lebih pendek dari lembar 2, perkalian itu tidak
lagi berlaku di satu pun tempat tersebut.

### Keputusan: *section*, bukan nomor halaman (§2.1)

Model yang diusulkan:

```ts
/** Pembatas section: mulai dari sini, tata letak lembar berubah. */
interface SectionBreakAttrs {
  pageSetup: Partial<PageSetup>   // hanya yang berubah; sisanya mewarisi
  columns?: { count: number; gap: number }
}
```

- Node baru `sectionBreak` (block, atomic), sekerabat dengan `pageBreak` yang sudah ada
  (`features/editor/page-break.ts`). Ia **selalu** memulai lembar baru.
- Geometri berhenti jadi satu nilai dan menjadi **daftar per lembar**:
  ```ts
  interface SheetGeometry extends PageGeometry { index: number; top: number }
  function sheetPlan(doc, setups): SheetGeometry[]
  ```
- `computeSpacers` menerima `sheets: SheetGeometry[]` dan mengganti tiap `pageCount * pageStride`
  dengan `sheets[n].top`. Aritmetikanya tetap murni dan tetap bisa diuji tanpa DOM — itu yang
  membuat perubahan sebesar ini masih aman.
- `document-canvas.tsx` menggambar lembar dari daftar itu; lebar wadah = lembar terlebar,
  lembar yang lebih sempit dipusatkan.
- Padding editor tidak lagi bisa satu nilai di pembungkus (`document-canvas.tsx:182`): margin
  yang berbeda per section harus datang sebagai dekorasi per blok, sejalan dengan cara
  paginasi bekerja sekarang.

### P8 — kolom per-halaman

Di atas model itu, P8 nyaris gratis: `sectionBreak.columns` menentukan jumlah kolom untuk isi
sampai pembatas berikutnya, dan `flowColumns` sudah menerima `count` sebagai parameter.

**UI.** Menu `Format → Kolom` (`menu-bar.tsx:602`) bertambah pilihan cakupan:
- *Seleksi* — perilaku `setColumns` sekarang, tidak berubah;
- *Halaman ini* — sisipkan `sectionBreak` di awal dan akhir isi halaman berjalan;
- *Seluruh dokumen*.

**Tools AI** (`packages/shared/src/tools.ts`):
```ts
{ name: 'set_section_columns', kind: 'write',
  description: 'Set the column count for one section of the document …',
  parameters: { count, scope: 'selection'|'page'|'document', page?: number } }
```

### P9 — orientasi per-halaman

`set_page_setup` yang ada (`tools.ts:234`) bertambah `scope: 'section'` dan `page?: number`; atau
alat baru `set_section_setup` bila ternyata parameternya jadi terlalu ramai. Dialog Penyiapan
halaman (`components/settings/page-setup-dialog.tsx`) bertambah pilihan *Apply to* ketiga:
"Halaman ini dan seterusnya" / "Halaman ini saja".

### Yang harus diverifikasi lebih dulu (tidak masuk estimasi)
1. **Cetak.** `@page` tidak bisa berbeda per halaman tanpa *named pages* (`page: name` + `@page
   name`). Dukungan peramban untuk itu perlu diuji sebelum menjanjikan cetak WYSIWYG untuk
   dokumen campur orientasi. Jalan mundur: ekspor PDF lewat DOCX.
2. **Ekspor DOCX.** Pustaka `docx` (`export-docx.ts`) mendukung banyak `Section` dengan
   `sectPr` masing-masing — ini justru **lebih** dekat ke model Word daripada model kita
   sekarang, jadi P9 memperbaiki kesetiaan ekspor, bukan merusaknya.
3. **Impor DOCX.** `features/document/docx/parse.ts` sekarang mengabaikan `sectPr`. Setelah P9,
   ia bisa memetakan section Word → `sectionBreak` kita. Di luar cakupan PRD ini, tapi jadi
   alasan tambahan memilih model section.

### Kriteria terima
- Dokumen dengan 3 section (potret 1 kolom → lanskap 1 kolom → potret 2 kolom) tampil benar,
  nomor halamannya benar, dan bertahan setelah muat ulang.
- `pagination.test.ts` diperluas dengan daftar lembar tak seragam; semua uji lama tetap hijau
  dengan daftar berisi satu jenis lembar.
- Ekspor DOCX menghasilkan tiga `sectPr` dan dibuka benar di Word & LibreOffice.

**Ukuran:** besar. Model section + paginasi tak seragam ±5 hari; P8 di atasnya ±1 hari; P9
(dialog, tools, kanvas, ekspor) ±3 hari. **Tidak disarankan mulai sebelum P4 selesai.**

---

## P10 — `replaceTextRange` mengganti kemunculan pertama

**Temuan investigasi, di luar sepuluh butir tiket, tapi akar dari gejala P3.1.**

```ts
// apps/web/features/editor/apply-text.ts:23-32
const atOffset = index.text.slice(offset, offset + length)
const start = atOffset === expected ? offset : index.text.indexOf(expected)  // ← dari 0
…
editor.chain().focus().insertContentAt(range, toEditorContent(replacement)).run()
```

Kalau isi di `offset` sudah bergeser sedikit saja — pemakai mengetik satu huruf di atasnya —
fungsi ini melompat ke **kemunculan pertama di seluruh dokumen**. `resolveSpan`
(`features/document/suggestions.ts:17`) sudah menyelesaikan persoalan ini dengan benar (cari
kemunculan **terdekat** dengan petunjuk offset) dan sudah dipakai lapisan sorotan serta
`canRevert` — tapi `replaceTextRange` tidak memanggilnya.

**Terdampak:** AI Rewriter, Humanizer, Translator (semuanya lewat
`use-pending-changes.ts:61,97,125`) dan Proofreader setelah P3.2 dipasang.

**Perbaikan.** Satu berkas:
```ts
const span = resolveSpan(index.text, expected, offset)
if (!span) return false
const range = textRangeToPM(index, span.offset, span.length)
```
plus opsi `{ focus?: boolean }` yang bawaannya `false` (§P3.1). Uji: dokumen dengan kata sama
20×, terapkan perubahan pada kemunculan ke-17, pastikan yang berubah kemunculan ke-17.

**Ukuran:** kecil (2 jam + uji).

---

## P11 — Satu job macet membekukan antrean

**Temuan investigasi.** `services/worker/entry.py` menjalankan dua thread; masing-masing
`core/queue/worker.py:22-47` mengambil satu job dan memanggil `handler(data)` **sinkron**.
Selama handler itu berjalan, tidak ada job lain dari antrean yang sama yang diambil — untuk
siapa pun. Tidak ada deadline: kalau sebuah job menggantung, seluruh fitur analisis mati sampai
proses di-*restart*.

P7 memberi pemakai jalan keluar dari sisi UI, tapi tidak membebaskan antrean. Dua perbaikan yang
saling melengkapi:

1. **Deadline per job.** Jalankan handler di thread anak dengan
   `join(timeout=JOB_DEADLINE_SECONDS)`. Lewat batas → tandai `failed` dengan pesan yang jujur
   ("melebihi batas waktu"), terbitkan `error`, lanjut ke job berikutnya. Thread anak yang
   tertinggal tetap akan mati sendiri karena `requests` sudah punya timeout 60 detik.
2. **Konkurensi.** `WORKER_CONCURRENCY` thread pengambil per antrean. Naskah panjang pada tier
   AI memakan puluhan detik; satu pemakai tidak boleh mengunci yang lain.
3. **Keduanya dari env (§2.9)**, dibaca di `services/worker/core/configs/env.py`:
   `JOB_DEADLINE_SECONDS` (bawaan 300) dan `WORKER_CONCURRENCY` (bawaan 2). Catat keduanya di
   `services/worker/.env.example` dan `docker-compose.yml`. Angka bawaan itu tebakan awal — ukur
   dulu tier AI pada naskah 50 ribu karakter sebelum menguncinya.

Keduanya prasyarat wajar untuk pemakaian nyata, dan keduanya kecil dibanding akibat kalau tidak
ada.

**Ukuran:** sedang (1–2 hari, termasuk uji beban ringan).

---

## P12 — Konsistensi panel

Temuan kecil yang muncul saat membaca ketujuh panel:

1. **Bahasa UI campur → seragamkan ke Inggris (§2.7).** Proofreader dan AI Chat sudah Inggris;
   yang harus diterjemahkan: `glossary-panel.tsx`, `translator-panel.tsx`,
   `change-list-panel.tsx` (label tone/bahasa tujuan, "Sudah diterapkan"), pesan
   `llm_unavailable` di kedua tempat, `panel-parts.tsx` yang tersisa, dan submenu Kolom di
   `menu-bar.tsx`. Cakupannya seluruh string yang terlihat pemakai di ketujuh panel — bukan
   hanya empat berkas di atas, jadi hitung ulang saat mengerjakannya. Pemilih bahasa antarmuka
   di Settings **bukan** bagian dari P12.
2. **"Hapus hasil" hanya ada di Proofreader setelah P3.3.** Panel berbasis `ChangeListPanel`
   (Rewriter, Humanizer, Translator) dan Glosarium punya masalah yang sama: hasil dan sorotannya
   bertahan sampai teks berubah. Pakai ulang pola yang sama di `panel-parts.tsx`.
3. **`canRun` memakai panjang seluruh dokumen** (`use-analysis.ts:132`) meski yang dijalankan
   hanya seleksi. Seleksi 3 kata pada dokumen panjang tetap "boleh" dijalankan dan
   menghabiskan kuota untuk hasil yang pasti kosong.
4. **`AcceptAllButton` pada Proofreader tidak menghormati `isStale`**, sementara
   `ChangeListPanel` menghormatinya (`change-list-panel.tsx:235`). Naskah yang sudah berubah
   sejak pemeriksaan bisa ditimpa massal.

**Ukuran:** sedang (butir 2–4 ±1 hari; butir 1 — penyeragaman bahasa — ±1,5 hari dan menyentuh
banyak berkas, jadi dikerjakan sebagai PR tersendiri di akhir agar tidak menabrak PR lain).

---

## 13. Tahapan yang disarankan

*Tabel ini menggambarkan urutan untuk **satu** pengerjaan. Karena pekerjaannya dibagi ke dua
orang, urutan yang berlaku adalah yang di `docs/WORKPLAN-P1-P12-DUA-JALUR.md`; tabel ini tetap
dipertahankan sebagai alasan kenapa urutannya begitu.*

| Tahap | Isi | Alasan urutan |
|---|---|---|
| **1** | P10, P3.1, P3.2, P3.3 | Bug yang merusak naskah pemakai. P10 lebih dulu karena P3.1/P3.2 memakai hasilnya |
| **2** | P4 lapis 1 + uji anti-tumpang-tindih | Gejala paling terlihat, perbaikan paling kecil |
| **3** | P1, P2, P12 (butir 2–4) | Polish murah, bisa jalan paralel dengan tahap 2 |
| **4** | P7 lapis A & B, P11 | Ketahanan; P11 membuat P7 benar-benar berarti |
| **5** | P4 lapis 2 & 3, P5 | Kolom yang benar-benar layak pakai |
| **6** | P6 (baca referensi) → P8/P9 | Perubahan model dokumen; hanya di atas fondasi yang sudah benar |

---

## 14. Verifikasi

| Butir | Cara |
|---|---|
| P3 | Uji unit reducer (`clearResults`), uji `resolveSpan` dengan kata berulang, uji integrasi editor untuk accept dari panel |
| P4 | `columns.test.ts`: invarian "tidak ada dua penempatan bertumpang tindih di kolom yang sama" untuk 1–3 kolom × posisi blok raksasa awal/tengah/akhir |
| P5 | Uji unit pembagian lebar (murni aritmetika), manual untuk seretan |
| P7 | Uji integrasi: batal saat `pending` → job tidak pernah jalan; batal saat `processing` → status `cancelled`, tidak ada hasil tersimpan |
| P8/P9 | `pagination.test.ts` dengan daftar lembar tak seragam; ekspor DOCX dibuka di Word & LibreOffice |
| P10 | Dokumen dengan kata sama 20×, terapkan pada kemunculan ke-17 |
| P11 | Kirim job yang sengaja menggantung, pastikan job berikutnya tetap terlayani |

Perintah yang sudah ada: `bun run test`, `bun run typecheck`.

---

## 15. Pertanyaan terbuka dan jawaban

1. **P8/P9 — apakah model *section* diterima? ya.** Setelan menempel pada potongan naskah, UI
   berbicara "halaman ini". Alternatifnya (menempel pada nomor halaman) lebih mudah dipahami
   tapi akan meleset setiap kali isi bergeser. Kalau jawabannya "harus benar-benar per nomor
   halaman", ruang lingkup P8/P9 berubah cukup banyak dan perlu dibahas ulang.
2. **P1 — pemetaan bendera.** `en` → 🇬🇧 atau 🇺🇸? 🇺🇸. `pt` → 🇵🇹 atau 🇧🇷? 🇧🇷. `es` → 🇪🇸 atau 🇲🇽? 🇪🇸.
   `ar` → 🇸🇦 atau bendera Liga Arab? 🇸🇦.
3. **P12 — bahasa UI mana yang menang?** Indonesia (mengikuti Glosarium/Translator dan komentar
   kode) atau Inggris (mengikuti Proofreader/Chat)? Ini menentukan pekerjaan penyeragaman yang
   tidak kecil. next, bakal ada ppilihan bahasa dari settings. seakrang stick to english dulu.
4. **P4 lapis 3 — blok yang tidak muat naik jadi selebar penuh.** Ini mengubah tampilan naskah
   dua kolom yang sudah ada (tabel lebar akan melintang penuh). Diterima? ya.
5. **P7 — apakah batal mengembalikan kuota? tetap berikan, quota sudah pernah digunakan** Kalau `pool_request` sudah tercatat memakai token,
   status `cancelled` perlu aturan penagihan sendiri. Perlu jawaban dari sisi PPE/kuota.
6. **P11 — berapa `JOB_DEADLINE` yang wajar?kalo bisa, bisa diatur dari env?** Tier AI pada naskah 50 ribu karakter perlu diukur
   dulu; angka yang terlalu ketat akan membunuh job yang sehat.
7. **Tahap 1 boleh langsung dikerjakan? ya.** P10 + P3 seluruhnya ±2 hari dan semuanya bug yang
   merusak naskah pemakai. Kalau iya, sisa pertanyaan di atas tidak menghalangi.
