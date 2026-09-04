# WritingHub — Rencana: Worker Render (PDF / DOCX / gambar untuk `/draft`)

Status: **R2 dan R5 sudah mendarat, begitu pula font di §9; yang tersisa perendernya
sendiri (R1, R3, R4).** Disusun 4 September 2026 · Baseline `a7e3be2`. Kontraknya dikunci
dalam tinjauan 4 September 2026 - §7, §8, §9 dan §10 di bawah sudah memuat hasilnya, dan
§9 berubah paling banyak: ketergantungan yang ditulis di draf pertama ternyata tidak ada.

Yang sudah bisa dipakai PPE hari ini: `output` diterima dan dibaca, dan permintaannya
dijawab `status: 'ready'` dengan `renderErrors` yang menerangkan perendernya belum ada.
Begitu R3 mendarat, entri itu berubah jadi entri di `downloads` **tanpa PPE mengubah
apa pun** - itu memang alasan kontraknya dikunci lebih dulu.

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
| **R2** | Rute ekspor bertoken + penanda kesiapan halaman | API + web | **Selesai** (`e5e401e`) |
| **R3** | Worker Playwright di `services/worker`, kolam terbatas | Worker | Besar |
| **R4** | Penyimpanan hasil: prefix `exports/`, lifecycle 1 hari | Infra | Kecil |
| **R5** | Kontrak `/draft`: medan `output`, status & tautan unduh baru | Shared + API | **Selesai** |
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

Satu catatan yang perlu ikut ke kontrak: **font tidak selamat di semua keluaran.**
`printToPDF` menyematkan dan men-subset font yang dipakai, jadi PDF mandiri; PNG/JPG
sudah jadi piksel; blok flyer di DOCX diratakan jadi gambar. Tapi **prosa di DOCX hanya
menyimpan nama font**, dan Word di mesin yang tidak memasangnya akan jatuh ke fallback.
Itu batasan format, bukan bug, dan tidak bisa diperbaiki `data:` URI.

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
- **Dua tenggat, bukan satu.** `RENDER_QUEUE_TIMEOUT_S` menjaga antreannya, tapi tidak
  menolong satu render yang macet - dan macetnya punya jalur nyata: blok Mermaid yang
  tidak pernah selesai berarti `data-export-ready` tidak pernah terpasang, jadi worker
  menunggu selamanya sambil memegang slotnya. `RENDER_PAGE_TIMEOUT_S` yang mematikan
  halamannya.
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

export interface DraftDownload {
  output: DraftOutput
  url: string
  expiresAt: number
  /** Hanya untuk gambar: halaman keberapa yang dipotret. Lihat §10.1. */
  page?: number
}

export interface DraftHandoff {
  // …yang sudah ada
  /** Terisi setelah render selesai. URL bertanda tangan, berumur lebih pendek dari objeknya. */
  downloads?: DraftDownload[]
  /** Keluaran yang diminta tapi tidak jadi. Lihat "sebagian berhasil" di bawah. */
  renderErrors?: Array<{ output: DraftOutput; reason: string }>
  /** Posisi dalam antrean, hanya selama `queued`. */
  queuePosition?: number
}
```

`POST /api/v1/drafts` menerima `output` — **skalar maupun larik**
(`'pdf'` sama sahnya dengan `['pdf','png']`), dinormalkan jadi himpunan di dalam.
Memaksa pemanggil menulis `['pdf']` untuk kasus yang paling umum adalah pajak tanpa
imbalan. Tanpa `output` sama sekali: **tidak ada yang dirender** - itu yang menjaga
panggilan PPE yang sudah ada hari ini tetap berperilaku persis seperti sebelumnya.

### Format boleh dibaca dari kalimatnya, tapi bukan oleh model

Pemanggil eksternal sering hanya meneruskan kalimat penggunanya - "outputnya pdf" ada
di teksnya, bukan di medan mana pun. Jadi ada jaring pengaman: **ekstraktor
deterministik** atas `prompt`, fungsi murni yang bisa diuji. `output` yang eksplisit
selalu menang atasnya.

Yang **tidak** dipakai: menyerahkan keputusan ini ke model. `kind: 'auto'` boleh
begitu karena artefaknya mendeklarasikan dirinya sendiri - jawaban satu-pagar-```html
*adalah* keputusannya (`markdown-doc.ts`). Format tidak punya properti itu; ia wadah
pengiriman, bukan bentuk naskah. Menambahkannya ke prompt berarti satu keputusan lagi
untuk dilawan, dan riwayat `26cc150` serta `a7e3be2` sudah menunjukkan ongkosnya.

### Sebagian berhasil adalah keadaan normal, bukan kekecualian

`output: ['pdf','png']` atas dokumen 6 halaman menghasilkan PDF yang jadi dan PNG yang
ditolak (§10.1). Karena itu statusnya tetap **`ready`** - dokumennya utuh dan bisa
dibuka - dan PPE membaca `downloads` bersama `renderErrors` untuk tahu mana yang ada.
Menandainya `failed` akan menyembunyikan dokumen yang sebenarnya siap pakai.

Aturan yang sama berlaku saat seluruh render gagal: `status: 'ready'`,
`downloads: []`, dan `renderErrors` yang menjelaskan sebabnya.

**Satu hal yang harus tertulis di kontraknya:** berkasnya adalah **potret dokumen pada
saat dirender**. Kalau penggunanya membuka tautan dan menyunting sebelum job jalan,
berkasnya isi lama. Tidak ada render ulang - lihat §11.

### Nama berkas

Objeknya bernama `exports/<uuid>.pdf`, jadi peramban akan mengunduhnya dengan nama itu
kecuali presigned URL-nya membawa `ResponseContentDisposition`. `getPresignedUrl()` di
`lib/cdn.ts` belum meneruskannya; ia butuh parameter tambahan plus sanitasi judul →
nama berkas (garis miring, karakter kendali, panjang).

---

## 8. Env baru

| Nama | Bawaan | Guna |
|---|---|---|
| `RENDER_MAX_CONCURRENCY` | 2 | Batas Chromium serentak |
| `RENDER_QUEUE_TIMEOUT_S` | 300 | Sesudahnya job dilepas, statusnya `failed` |
| `RENDER_PAGE_TIMEOUT_S` | 120 | Tenggat **satu** render; sesudahnya halamannya dimatikan dan slotnya dilepas |
| `RENDER_MAX_PAGES` | 50 | Plafon halaman satu render. Lihat §10.1 |
| `RENDER_TOKEN_TTL_SECONDS` | 300 | Umur token rute ekspor. **Sudah ada** di `config/env.ts` |
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

### Ketergantungannya - ralat

**Draf pertama bagian ini keliru, dan kekeliruannya mahal:** ia menyatakan font
terhalang pekerjaan CSP `asset://` dan menyarankan membuka `font-src` ke origin aset
sebagai "jalur yang lebih rapi". Keduanya salah, jadi bagian ini ditulis ulang supaya
pembaca berikutnya tidak merantai pekerjaan ini ke gelombang yang tidak pernah datang.

Sebabnya ada di `html-raster.ts`. Pemotret blok bekerja lewat `<foreignObject>` di
dalam SVG yang dimuat sebagai `data:image/svg+xml` ke dalam `<img>` - dokumen
terisolasi yang **tidak memuat apa pun dari URL, termasuk font**. Docstring-nya sendiri
sudah mencatatnya: *"huruf yang dipakai adalah yang ada di sistem."*

Jadi membuka `font-src` ke origin aset akan memperbaiki bingkai iframe **tapi tidak
memperbaiki pemotret**: flyer benar di layar, salah di PNG dan di DOCX. Itu justru
kegagalan yang paling sulit dikenali, karena kanvas terlihat baik-baik saja.

**`data:` URI adalah satu-satunya mekanisme yang melayani ketiga pembaca** - bingkai,
pemotret, dan `printToPDF`.

Dan ongkosnya lebih ringan daripada yang dikhawatirkan draf pertama
("menggemukkan tiap blok"). Font disuntikkan `sandboxDocument()` dan `svgSource()`
**saat render**, sementara node `htmlBlock` hanya menyimpan markup body - `bodyMarkup()`
sudah membuang `<head>`. Jadi ia menggemukkan srcdoc sementara, **bukan dokumen
tersimpan**. Suntikkan hanya keluarga yang benar-benar dirujuk markup-nya dan batasnya
~50-130KB per blok.

Terbaiknya: **tidak ada perubahan CSP sama sekali.** `html-sandbox.ts` sudah menyatakan
`font-src data:`, dan kedua prompt sudah memberi tahu model *"fonts must be data: URIs
or system fonts"* (`drafts/prompt.ts`, `shared/tools.ts`). Izinnya sudah ada; modelnya
cuma tidak punya font untuk dijangkau. `c9dafc6` sudah menaruh berkas woff2-nya di
`apps/web/assets/fonts/`. Yang kurang tinggal penyuntiknya.

**Konsekuensi struktural:** `apps/api` tidak bisa mengimpor dari `apps/web`, jadi
katalog font harus pindah ke `packages/shared` - kalau tidak, label nada di prompt akan
menyebut font yang tidak ada di penyuntiknya.

### Sudah dikerjakan

Katalog beserta nadanya di `packages/shared/src/fonts.ts`, penyuntiknya di
`apps/web/features/editor/font-embed.ts`, disambungkan ke `sandboxDocument()` dan
`rasterizeHtml()`. Berkas woff2 pindah ke `apps/web/public/fonts/` supaya punya URL
tetap - `next/font/local` menunjuk berkas yang sama, jadi tetap satu salinan di disk.
Kedua prompt rancangan kini menawarkan pilihannya lewat `fontChoicePrompt()`.

**Yang belum terbukti:** apakah `@font-face` ber-`data:` URI benar-benar terpakai di
jalur pemotret saat runtime. Chrome memuat font di dalam SVG-dalam-`<img>` secara
asinkron, jadi potretan pertama bisa terambil sebelum fontnya siap - hasilnya PNG dan
blok flyer di DOCX yang memakai font sistem meski di layar sudah benar. Kalau meleset,
penambalnya potret dua kali atau menunggu `document.fonts.ready` di dalam SVG-nya.

---

## 10. Batas, dan siapa yang memiliknya

Pertanyaan terbuka di draf pertama sudah dijawab dalam tinjauan 4 September 2026.

### 10.1 Dua batas berbeda, dua pemilik berbeda

Yang paling sering tercampur di pembicaraan ini:

| | Apa | Pemiliknya | Kalau dilanggar |
|---|---|---|---|
| **Kuota** | hak pakai - "user ini boleh berapa banyak" | **PPE**, dari identity | ditolak sebelum sampai ke WritingHub |
| **Batas halaman** | perlindungan sumber daya - "satu render boleh sebesar apa" | **WritingHub** | ditolak sebelum mencetak |

Kuota **tidak** dihitung di sini: PPE yang tahu tier akunnya, dan ia sudah memutuskan
sebelum memanggil. WritingHub tetap buta terhadap tier.

Batas halaman bukan soal tier sama sekali. Bahkan pengguna tanpa batas kuota tidak
boleh menyandera kolam Chromium dengan satu dokumen 80 halaman - itu merugikan
pengguna lain, bukan dirinya. `RENDER_MAX_PAGES` karena itu berlaku untuk semua orang.

Kalau nanti batas per-tier memang dibutuhkan, bentuknya: PPE mengirim `maxPages`
opsional dan WritingHub memakai `min(maxPages, RENDER_MAX_PAGES)` - **PPE boleh
memperketat, tidak boleh melonggarkan**. Ditunda sampai tiernya ada.

**Yang tidak dibatasi:** `MAX_CONTENT_CHARS = 200_000` di `drafts/dto.ts` sengaja
dibiarkan. Mengimpor dokumen besar itu sah; yang tidak sah adalah merendernya.
Membatasi di titik render menjaga keduanya tetap benar. Perhatikan bahwa plafon
nyatanya datang dari sini, bukan dari jalur `prompt` yang sudah terkurung
`MAX_TARGET_WORDS = 5_000` (~10-15 halaman, jadi tidak pernah menyentuh plafonnya).

### 10.2 Menegakkannya hampir gratis

Jumlah halaman biasanya baru diketahui setelah tata letak jadi - itu yang membuat batas
halaman terasa mahal. Di sini ia **sudah dihitung**: `ExportDocumentView` memegang
`pageCount` sebagai state, dan angka itu sudah jadi mekanisme kesiapannya (efek penanda
diulang tiap paginasi bergerak). Pada detik `data-export-ready` terpasang, jumlahnya
sudah pasti. Ia cuma belum diterbitkan.

Satu atribut di sebelah penanda yang sudah ada:

```tsx
document.body.setAttribute(EXPORT_READY_ATTRIBUTE, 'true')
document.body.setAttribute(EXPORT_PAGES_ATTRIBUTE, String(pageCount))
```

Worker membacanya **sebelum** memanggil `printToPDF`, jadi dokumen yang kelewat besar
ditolak tanpa pernah membayar biaya cetaknya. Dua tahap:

- **saat permintaan masuk** - taksiran kasar dari panjang masukan (±30%), hanya untuk
  menolak yang jelas mustahil sebelum ia mengantre;
- **saat halaman siap** - angka pasti dari atribut di atas. Ini yang menentukan.

Pesan gagalnya karena itu bisa tepat dan bisa ditindaklanjuti, dan ia mendarat persis
di dorongan yang sudah jadi keputusan produk (§11): *"dokumen ini 94 halaman, batas
render 50. Buka di WritingHub dan cetak dari sana."*

### 10.3 Gambar: maksimal 3, dan halamannya disebut

Gambar hanya untuk dokumen 1-3 halaman. Lebih dari itu, keluaran gambarnya saja yang
ditolak - PDF-nya tetap jalan (§7, "sebagian berhasil"). Permintaan "beberapa desain"
dijawab maksimal 3.

Dokumen 3 halaman berarti tiga entri ber-`output: 'png'` di `downloads`, jadi tiap
entri membawa `page` **eksplisit**. Membedakannya lewat urutan larik adalah jenis
asumsi yang diam-diam rusak.

### 10.4 Job yatim

Kalau worker mati di tengah render, pola tenggat di `drafts/status.ts` sudah
menyelesaikan ini untuk penulisan dan dipakai ulang apa adanya.

---

## 11. Batas serah-terima: sekali render, lalu pindah ke WritingHub

Sekali render per permintaan. Tidak ada rute render ulang, dan itu disengaja.

Sebabnya arsitektural, bukan selera: **chat PPE tidak memegang dokumennya.** Kalau
pengguna minta revisi di sana, satu-satunya cara PPE menjawab adalah menarik seluruh
naskah ke dalam konteksnya - persis pembakaran token yang jadi alasan jalur ini ada.
Setiap putaran revisi di PPE membatalkan penghematan yang baru saja dibeli.

Chat WritingHub sudah memegang dokumennya beserta alatnya (`set_font`,
`insert_html_block`, `apply_template`). Jadi batasnya: **PPE = "buatkan X" sekali;
WritingHub = semua sesudahnya.** Balasan ke PPE mengarahkan ke sana, dan tautannya
sebaiknya membuka dokumen dengan panel chat sudah terbuka - bukan mendarat di dasbor.

Dua hal supaya batas itu tidak bocor:

- **Permintaan ulang menghasilkan dokumen baru, bukan menimpa.** Menimpa berarti
  menghancurkan suntingan yang mungkin sudah dibuat penggunanya. Tapi dokumen baru
  menumpuk, jadi PPE **harus** meneruskan `projectId` (sudah ada di `dto.ts`) supaya
  percobaannya berkumpul di satu proyek, bukan berserak.
- `POST /drafts/:documentId/retry` yang sudah ada hanya melayani draf yang **gagal**,
  bukan yang "hasilnya kurang". Pembagian itu dipertahankan apa adanya.
