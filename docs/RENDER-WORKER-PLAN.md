# WritingHub — Rencana: Worker Render (PDF / DOCX / gambar untuk `/draft`)

Status: **Rancangan, belum ada kode.** Disusun 4 September 2026 · Baseline `a7e3be2` (branch `fix/share-version-page-geometry`).

Dipicu satu alur nyata: pengguna di **AI Chat PPE** meminta *"buatin saya pamflet
jangan buang sampah, outputnya pdf"*. Alih-alih PPE merender sendiri, permintaannya
diteruskan ke WritingHub lewat `POST /api/v1/drafts`; WritingHub menulis, merender,
lalu mengembalikan **tautan unduh berkas** beserta **tautan dokumen** yang bisa dibuka
penggunanya sendiri.

---

## 0. Ringkasan

| # | Butir | Jenis | Ukuran |
|---|---|---|---|
| **R1** | Pisahkan job **menulis** dari job **merender** | Arsitektur | Sedang |
| **R2** | Rute ekspor bertoken + penanda kesiapan halaman | API + web | Sedang |
| **R3** | Worker Playwright di `services/worker`, kolam terbatas | Worker | Besar |
| **R4** | Penyimpanan hasil: prefix `exports/`, lifecycle 1 hari | Infra | Kecil |
| **R5** | Kontrak `/draft`: medan `output`, status & tautan unduh baru | Shared + API | Kecil |
| **R6** | Peramban pengguna menggantikan sandbox — **sebagian saja**, lihat §3 | Web | Sedang |

**Kendala yang menentukan seluruh rancangan:** hari ini **tidak ada satu pun generator
PDF atau DOCX di sisi server**. PDF sepenuhnya lewat `window.print()`; `exportDocx`
tinggal di `apps/web` dan potretan blok HTML-nya menuntut `canvas`. `pypdf` di worker
hanya membaca PDF saat ekstraksi. Jadi peramban di server bukan pilihan optimasi — ia
syarat agar fiturnya ada sama sekali.

---

## 1. Kenapa peramban, bukan implementasi server

Tiga hal dibayar sekaligus oleh satu peramban, dan ketiganya sudah siap dipakai:

- **PDF benar menurut konstruksi.** CDP `Page.printToPDF` menghormati `@page`, jadi
  seluruh kerja cetak yang sudah ada langsung terpakai: `@page flyer` bermargin nol,
  `print-color-adjust: exact` (`globals.css` dan `html-sandbox.ts`), diagram Mermaid
  yang dirender, dan `document-print-root` yang kini melekat pada `DocumentPaper`.
  Hasilnya sama persis dengan Ctrl+P penulis.
- **DOCX tanpa implementasi kedua.** `exportDocx` dipanggil di dalam halaman, termasuk
  `rasterizeHtml` yang butuh canvas sungguhan. Tidak ada porting, tidak ada drift.
- **Gambar hampir gratis.** Untuk flyer, `rasterizeHtml` sudah menghasilkan PNG dari
  blok HTML. Untuk naskah berhalaman banyak, CDP `Page.captureScreenshot` per lembar.

Menulis ulang keduanya di server berarti **implementasi kedua dari pengekspor** —
persis jenis duplikasi yang menghasilkan tiga salinan kertas dokumen yang baru saja
kami satukan (`refactor(editor): one DocumentPaper for all three document views`).

---

## 2. R1 — Pisahkan menulis dari merender

Ini yang menentukan berapa RAM yang dibutuhkan, dan mudah terlewat.

| Pekerjaan | Lama | Butuh peramban? |
|---|---|---|
| Model menulis naskah | 30–90 dtk | **Tidak** |
| Merender jadi berkas | 3–8 dtk | **Ya** |

Kalau keduanya satu job, Chromium menganggur satu setengah menit menunggu model
mengetik. Dipisah, kolam dua peramban melayani belasan permintaan per menit.

Konsekuensi yang menyenangkan: **antreannya hampir tidak pernah penuh**, dan kalaupun
penuh, yang tertunda hanya berkasnya. Dokumennya sudah jadi dan tautannya sudah bisa
dibuka. Pesan ke pengguna karena itu bukan "buka WritingHub sendiri untuk membuatnya",
melainkan *"dokumen siap, berkas menyusul — atau cetak sendiri dari sana sekarang"*.
Degradasinya sebagian, bukan total.

---

## 3. R6 — Peramban pengguna menggantikan sandbox: berlaku untuk dua dari tiga keluaran

Idenya benar dan hemat: kalau penggunanya toh membuka dokumennya, peramban **dia**
yang mengekspor, job di antrean dibatalkan, dan slot kolam bebas.

Tapi ia tidak berlaku merata, dan bedanya bukan soal usaha:

| Keluaran | Bisa dari peramban pengguna? | Sebab |
|---|---|---|
| DOCX | **Ya** | `exportDocx` mengembalikan `Blob` — bisa langsung diunggah |
| PNG / JPG | **Ya** | `rasterizeHtml` mengembalikan data URI PNG |
| **PDF** | **Tidak** | `window.print()` menyerahkan berkasnya ke dialog cetak peramban; **JS tidak pernah menerimanya kembali** |

Tidak ada jalan memutar yang murah untuk PDF. Menambahkan pustaka PDF JavaScript
(jsPDF, pdf-lib) berarti PDF hasil klien **berbeda** dari PDF hasil `printToPDF` —
dua mesin cetak untuk satu dokumen, dan pertanyaan "kenapa PDF saya beda dengan punya
teman saya" yang tidak punya jawaban baik.

**Karena itu:** substitusi klien diterapkan untuk DOCX dan gambar. Untuk PDF, membuka
dokumen sendiri berarti pengguna mencetaknya lewat dialog — dan job antreannya tetap
berjalan supaya tautan unduh yang dijanjikan ke PPE tetap terpenuhi.

---

## 4. R2 — Otorisasi: token render, bukan kredensial pengguna

Worker **tidak boleh** memegang sesi penggunanya. Ia proses yang menjalankan HTML
buatan model di dalam Chromium; kalau ia juga memegang sesi, seluruh permukaan
terautentikasi aplikasi bisa dijangkau dari dalam proses yang sama.

Polanya sudah ada di repo — `lib/signed-url.ts`, yang dibangun untuk aset:

1. API menerbitkan HMAC berumur menit, terikat ke satu `documentId`.
2. Worker membuka `/{export}/{documentId}?exp=…&sig=…`.
3. Rute itu **read-only, satu dokumen**, tanpa panel dan tanpa chat.

Tautan yang dikembalikan ke PPE tetap tautan biasa (`/d/<id>`) yang dibuka pengguna
dengan sesinya sendiri. Itu sudah bekerja hari ini: `identity` memetakan
`(user_id, origin)` dengan `origin` memuat `ppe`, jadi satu akun PPE sudah satu
identitas WritingHub.

### Kesiapan halaman

Rute ekspor memanggil `prepareForExport(editor)` yang sudah ada — ia menyegarkan TOC,
potretan blok HTML, dan diagram Mermaid, lalu **ditunggu** — kemudian memasang penanda
DOM (`data-export-ready`) yang ditunggu worker. Tanpa penantian itu, worker memotret
dokumen yang blok turunannya belum jadi.

---

## 5. R3 — Worker dan kolam

Menumpang `services/worker` yang sudah ada (Python + Redis). Bahasanya tidak penting:
worker hanya **menyetir** aplikasi, seluruh logika ekspor tetap TypeScript di halaman.

- Kolam dibatasi `RENDER_MAX_CONCURRENCY`; melampauinya berarti mengantre.
- Satu kunjungan menghasilkan **semua** keluaran yang diminta — memuat dokumen dua kali
  untuk PDF lalu DOCX adalah pemborosan terbesar yang bisa dihindari gratis.
- Chromium ~250–400 MB per instance, 1–2 dtk start dengan kolam hangat.

---

## 6. R4 — Penyimpanan

- Prefix **`exports/`**, terpisah dari `assets/`. Aturan lifecycle "hapus setelah 1
  hari" adalah konfigurasi bucket; satu aturan yang salah sasaran akan menghapus
  pustaka aset proyek orang, dan itu baru ketahuan seminggu kemudian.
- Umur URL bertanda tangan **harus lebih pendek** dari umur objeknya.
  `PRESIGNED_TTL_SECONDS` sekarang 24 jam — persis seumur objek — jadi URL yang
  diterbitkan di jam ke-23 mati sebelum kedaluwarsa.

---

## 7. R5 — Perubahan kontrak

```ts
// packages/shared/src/draft.ts
export type DraftOutput = 'pdf' | 'docx' | 'png' | 'jpg'
export type DraftStatus = 'generating' | 'rendering' | 'queued' | 'ready' | 'failed'

export interface DraftHandoff {
  // …yang sudah ada
  /** Terisi setelah render selesai. URL bertanda tangan, berumur lebih pendek dari objeknya. */
  downloads?: Array<{ output: DraftOutput; url: string; expiresAt: number }>
  /** Posisi dalam antrean, hanya selama `queued`. */
  queuePosition?: number
}
```

`POST /api/v1/drafts` menerima `output?: DraftOutput[]` — hanya dirender saat diminta.

**Satu hal yang harus tertulis di kontraknya:** berkasnya adalah **potret dokumen pada
saat dirender**. Kalau penggunanya membuka tautan dan menyunting sebelum job jalan,
berkasnya isi lama.

---

## 8. Env baru

| Nama | Bawaan | Guna |
|---|---|---|
| `RENDER_MAX_CONCURRENCY` | 2 | Batas Chromium serentak |
| `RENDER_QUEUE_TIMEOUT_S` | 300 | Sesudahnya job dilepas, statusnya `failed` |
| `RENDER_TOKEN_TTL_S` | 300 | Umur token rute ekspor |
| `EXPORT_URL_TTL_S` | 43200 | Umur URL unduh — lebih pendek dari lifecycle 1 hari |

---

## 9. Font: dikunci, dan dipilih menurut tema

Chromium di kontainer tidak punya font sistem yang sama dengan mesin penulis, jadi
rancangan yang mengandalkan `system-ui` akan tampil **berbeda** di berkas hasil
render dibanding di kanvas. Itu justru bagian yang paling terlihat pada flyer, dan
ia mengubah "PDF-nya sama dengan yang saya lihat" dari jaminan menjadi harapan.

Karena itu daftarnya dikunci: satu himpunan font yang dipasang di image worker,
sama persis dengan yang ditawarkan editor. Sumber kebenarannya `features/editor/font-catalog.ts`.

Tapi mengunci saja tidak cukup, dan di sini ada peluang yang tidak jelas sejak awal:
**font punya nada.** Permintaan "flyer ceria untuk lomba anak" tidak boleh dijawab
dengan Times New Roman, dan permintaan "undangan resmi" tidak boleh dijawab dengan
font display yang main-main. Model sekarang tidak diberi tahu apa pun soal ini - ia
hanya diberi `system-ui`, jadi seluruh rancangan berakhir dengan suara yang sama.

Rencananya: katalog font membawa **label nada** (formal, ramah, tegas, klasik,
teknis), dan prompt rancangan menyebutkan pilihan yang tersedia beserta nadanya.
Ini bukan sekadar mencegah kegagalan render - ia menaikkan kualitas hasil secara
konkret, dengan ongkos beberapa baris di prompt.

### Ketergantungannya

Bagian ini **tidak bisa dikerjakan sendirian**. Sandbox mengunci
`font-family: system-ui, sans-serif` di `SANDBOX_ROOT_STYLE`, dan CSP-nya
`font-src data:` - jadi flyer hari ini hanya bisa memakai font sistem. Memberi model
pilihan sungguhan menuntut salah satu dari:

- font disematkan sebagai `data:` URI di dalam `srcdoc` (mandiri, tapi menggemukkan
  tiap blok), atau
- `font-src` dibuka ke origin aset - yaitu pekerjaan CSP yang sama dengan resolver
  `asset://`.

Jalur kedua lebih rapi dan sudah direncanakan untuk aset. Font karena itu ikut
gelombang itu, bukan gelombang worker render.

---

## 10. Risiko & pertanyaan terbuka

1. **Naskah berhalaman banyak sebagai gambar** menghasilkan N berkas. Keputusan:
   gambar hanya untuk dokumen 1-3 halaman; permintaan "beberapa desain" dijawab
   maksimal 3. Permintaan gambar untuk **dokumen** - apalagi berhalaman banyak -
   ditolak, dengan saran beralih ke WritingHub untuk hasil yang lebih baik.
2. **Job yatim.** Kalau worker mati di tengah render, siapa yang menandai `failed`?
   Pola tenggat di `drafts/status.ts` sudah menyelesaikan ini untuk penulisan dan bisa
   dipakai ulang apa adanya.
3. **Kuota.** Merender itu jauh lebih mahal daripada menulis. Apakah ia dihitung
   terhadap kuota alat pengguna (`ensureToolQuota`) atau gratis?
