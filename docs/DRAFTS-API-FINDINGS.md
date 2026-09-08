# Temuan `/api/v1/drafts` — jalur rancangan (flyer) & ekspor PDF

Ditulis 8 September 2026, dipicu satu keluhan: permintaan "flyer 3 halaman"
menghasilkan PDF 3 halaman yang **halaman 1 dan 3-nya kosong**, isinya hanya di
halaman 2.

Dokumen ini catatan temuan, bukan rencana kerja. Tiap temuan disertai bukti dan
berkas yang bertanggung jawab, supaya keputusan cakupan perbaikan bisa diambil
dengan angka, bukan dugaan.

> **Pembaruan 8 September 2026 (kemudian hari):** T1–T8 sudah dibereskan —
> rincian di bagian [Penyelesaian](#penyelesaian) di ujung dokumen. Bagian
> "Arah perbaikan" tiap temuan dipertahankan sebagai dokumentasi keputusan.

Permintaan yang jadi bahan:

```json
{
  "prompt": "buatkan saya flayer 3 halaman, bahaya abu vulkanik, output ke pdf",
  "tone": "academic",
  "language": "Indonesian",
  "Model": "anthropic/claude-sonnet-5"
}
```

Balasannya `status: ready`, `renderErrors: []`. Tidak ada satu pun bagian sistem
yang menganggap ada yang salah — dan itu sendiri salah satu temuannya.

---

## Ringkasan

| # | Temuan | Dampak | Berat |
|---|---|---|---|
| T1 | Halaman kosong mengapit blok rancangan di PDF | PDF flyer 1 lembar keluar 3 lembar | **P0** |
| T2 | Permintaan multi-halaman diabaikan tanpa jejak | "3 halaman" jadi 1 lembar terpotong | **P1** |
| T3 | Jawaban model yang meleset sedikit dari format jatuh jadi blok kode | Flyer keluar sebagai HTML mentah | **P1** |
| T4 | Isi rancangan yang terpotong tidak pernah dilaporkan ke pemanggil | Ajakan bertindak hilang diam-diam | P2 |
| T5 | Medan tak dikenal di badan permintaan didiamkan | `"Model"` diabaikan, model bawaan yang dipakai | P2 |
| T6 | Paragraf penutup editor ikut tercetak | Halaman kosong ekstra, juga di dokumen prosa | P2 |
| T7 | Hitungan halaman layar ≠ halaman PDF | Penjaga `RENDER_MAX_PAGES` meleset | P3 |
| T8 | Taksiran kemajuan memakai target prosa untuk rancangan | Bar kemajuan mentok 95% sejak awal | P3 |

---

## T1 — Halaman kosong mengapit blok rancangan di PDF (P0)

**Ini penyebab langsung keluhannya.** Dua bug yang berdiri sendiri, keduanya di
jalur cetak, keduanya dipicu satu deklarasi: `page: flyer` di
[globals.css:920](../apps/web/app/globals.css#L920).

Chromium **selalu** memenggal halaman ketika nama `@page` berganti — di depan
maupun di belakang elemennya. Jadi apa pun yang mengapit blok rancangan berubah
menjadi lembar kosong:

1. **Halaman 1 kosong.** [document-paper.tsx:262](../apps/web/components/editor/document-paper.tsx#L262)
   merender `<div aria-hidden="true">` sebagai pembungkus latar lembar. Saat
   cetak yang disembunyikan hanya anaknya — `.document-sheet` di
   [globals.css:2094](../apps/web/app/globals.css#L2094) — sementara
   **pembungkusnya sendiri tetap punya kotak** setinggi nol. Kotak itu mendahului
   blok rancangan, jadi penggalan paksa di `page: flyer` mendorong flyer ke
   lembar kedua.

2. **Halaman 3 kosong.** [trailing-paragraph.ts:14](../apps/web/features/editor/trailing-paragraph.ts#L14)
   menyisipkan paragraf kosong setiap kali node terakhir dokumen bukan paragraf.
   Isi dokumen draf rancangan **persis satu** `htmlBlock`, jadi paragraf itu
   selalu lahir. Ia kembali ke `@page` bawaan → penggalan paksa kedua → lembar
   ketiga. Ekstensinya ikut ke halaman ekspor lewat `buildEditorExtensions` di
   [export-document-view.tsx:53](../apps/web/components/export/export-document-view.tsx#L53),
   padahal editor di sana `editable: false` — paragraf penutup itu murni
   perkakas menyunting yang tidak punya kegunaan saat mencetak.

### Bukti

Struktur DOM cetak ditiru apa adanya (`.document-print-root` →
`.document-page-padding` → `.document-body` → blok mode halaman), lalu dicetak
dengan peramban yang sama persis dengan worker (`chromium-headless-shell`,
`print_background=True`, `prefer_css_page_size=True` — lihat
[render_service.py:173](../services/worker/services/render_service.py#L173)):

| Kasus | Halaman |
|---|---|
| A. pembungkus lembar + flyer + paragraf penutup (**kondisi nyata**) | **3** |
| B. tanpa paragraf penutup | 2 |
| C. tanpa pembungkus lembar | 2 |
| D. tanpa keduanya | **1** |
| E. pembungkus + 3 blok rancangan + paragraf penutup | 5 |

Isi per halaman pada kasus A: `1 '' · 2 'FLYER' · 3 ''` — sama persis dengan
laporannya. Skrip reproduksinya ada di lampiran.

### Kenapa tidak ketahuan lebih awal

Gejalanya **tidak terlihat di layar**. Paginasi kanvas mengukur `offsetTop` blok
naskah dan tidak tahu-menahu soal `@page`; pembungkus latar lembar bukan blok
naskah. Jadi kanvas menampilkan flyer di lembar pertama, sementara PDF-nya
berbeda. Uji yang ada
([print-root.test.ts](../apps/web/features/editor/print-root.test.ts)) hanya
memeriksa bahwa aturannya *tertulis* di CSS, bukan berapa lembar yang
benar-benar keluar — tidak ada satu pun uji yang mencetak.

### Arah perbaikan

- Pembungkus latar lembar jangan menyisakan kotak saat cetak — beri kelas
  sendiri lalu `display: none`, atau `display: contents`. Menyembunyikan anak
  tanpa menyembunyikan induk adalah setengah perbaikan yang justru menipu.
- `TrailingParagraph` tidak dimuat pada halaman ekspor. Editor di sana tidak
  bisa disunting; paragraf penutup adalah kenyamanan menyunting, bukan isi.
  (Alternatif yang lebih sempit — menyembunyikan paragraf kosong terakhir lewat
  CSS cetak — menyentuh dokumen prosa juga, dan paragraf kosong di sana bisa saja
  disengaja penulisnya.)
- Tambahkan uji yang benar-benar mencetak, dan menghitung halamannya. Ini satu-
  satunya kelas bug yang tidak bisa ditangkap uji CSS tekstual.

---

## T2 — Permintaan multi-halaman diabaikan tanpa jejak (P1)

Jalur rancangan **satu halaman secara struktural**, bukan kebetulan:

- [prompt.ts:49](../apps/api/src/services/drafts/prompt.ts#L49) (`DRAFT_FLYER_PROMPT`)
  meminta *"ONE fenced ```html block"* berisi *"a self-contained one-page
  design"*, dan menegaskan isi yang lebih tinggi dari lembarnya **dipotong**,
  bukan dikecilkan;
- [markdown-doc.ts:264](../apps/api/src/services/drafts/markdown-doc.ts#L264)
  (`fencedHtml`) menolak jawaban yang punya isi apa pun setelah pagar penutup —
  jadi model yang patuh pada permintaan "3 halaman" dan mengirim tiga pagar
  justru gagal terdeteksi sebagai rancangan (lihat T3);
- [markdown-doc.ts:354](../apps/api/src/services/drafts/markdown-doc.ts#L354)
  memakai `fit: 'page'`, dan blok itu tingginya persis satu kotak konten dengan
  luapan dipotong ([globals.css:760](../apps/web/app/globals.css#L760)).

Artinya kata "3 halaman" di prompt **tidak pernah dibaca oleh apa pun**. Ia bukan
diabaikan karena tidak didukung — ia tidak punya pembaca sama sekali, tidak
seperti "A3", "lanskap", atau "pdf" yang semuanya punya pemindai kata kunci
([design-layout.ts](../apps/api/src/services/drafts/design-layout.ts),
[output.ts](../apps/api/src/services/drafts/output.ts)).

Hasil akhirnya satu lembar dengan sisa isi terpotong, dan pemanggil tidak diberi
tahu apa pun. Angka 3 di PDF keluhan itu murni kebetulan dari T1 — bukan tiga
halaman rancangan.

### Arah perbaikan (dua pilihan, bukan satu)

- **Dukung sungguhan**: izinkan N pagar ```html, tiap pagar jadi satu
  `htmlBlock` `fit: 'page'` berurutan. Perlu menyentuh prompt, `singleHtmlBlock`
  → `htmlBlocks`, deteksi `isDesignDoc` di
  [service.ts](../apps/api/src/services/drafts/service.ts) dan
  [runner.ts](../apps/api/src/services/drafts/runner.ts) (dua salinan logika yang
  sama), plus T1 harus beres lebih dulu — kasus E di atas menunjukkan tiga blok
  hari ini keluar 5 lembar.
- **Jujur soal batasnya**: baca angka halaman dari prompt seperti ukuran kertas
  dibaca, lalu nyatakan di balasan bahwa hanya satu lembar yang dibuat. Lebih
  murah, dan menutup "diam-diam" yang jadi inti keluhannya.

---

## T3 — Jawaban yang meleset sedikit dari format jatuh jadi blok kode (P1)

`fencedHtml` mensyaratkan: seluruh jawaban adalah satu pagar ```html, paling
banyak didahului satu baris judul, dan **tidak ada apa pun setelah pagar
penutup**. Ketatnya disengaja dan alasannya benar (artikel teknis yang memuat
contoh HTML harus tetap jadi dokumen).

Tapi kegagalannya tidak landai, ia jurang. Satu kalimat penutup dari model —
"Semoga membantu!" — dan seluruh jawaban jatuh ke pengurai Markdown, tempat
`readFencedCode` mengubah rancangan itu menjadi **`codeBlock` berisi HTML
mentah**. Yang diterima pengguna: PDF berlembar-lembar kode sumber, dengan
`status: ready` dan `renderErrors: []`.

Tidak ada satu pun sinyal: tidak dicatat di log, tidak ada di balasan status,
tidak ada penanda di dokumen.

### Arah perbaikan

Minimal: catat di log dan/atau balasan status ketika `allowHtmlBlock` menyala,
jawabannya **memuat** pagar ```html, tapi `singleHtmlBlock` mengembalikan null.
Itu tanda pasti bahwa maksudnya rancangan dan deteksinya meleset — informasi
yang hari ini dibuang.

---

## T4 — Isi rancangan yang terpotong tidak pernah sampai ke pemanggil API (P2)

Editor sudah mengukurnya dan menampilkannya sebagai lencana "Isi terpotong Npx"
([html-block-view.tsx:213](../apps/web/components/editor/html-block-view.tsx#L213)),
lalu menyembunyikannya saat cetak
([globals.css:898](../apps/web/app/globals.css#L898)) — benar untuk kertas.

Yang hilang: pemanggil API tidak pernah melihat lencana itu. Ia menerima
`renderErrors: []` untuk flyer yang sepertiga isinya terbuang di tepi lembar.
Padahal justru bagian bawah yang terpotong — dan di flyer, bagian bawah adalah
ajakan bertindak.

Pengukurannya butuh DOM, jadi ia hanya bisa datang dari halaman ekspor. Jalurnya
sudah ada dan sudah dipakai untuk hal serupa: `data-export-pages`
([types.ts:34](../apps/web/features/export/types.ts#L34)) sudah membawa angka
dari halaman ekspor ke worker.

---

## T5 — Medan tak dikenal di badan permintaan didiamkan (P2)

Permintaan di atas mengirim `"Model"` dengan M besar. Skema di
[dto.ts](../apps/api/src/services/drafts/dto.ts) menamainya `model`, dan
`z.object` tanpa `.strict()` **membuang medan tak dikenal tanpa bersuara**.

Jadi `anthropic/claude-sonnet-5` tidak pernah sampai ke `pickModel`; draf itu
ditulis oleh model bawaan pengguna. Pemanggil tidak punya cara mengetahuinya —
balasan tidak menyebut model yang dipakai.

Hal serupa berlaku untuk medan yang **dikenal tapi tidak berlaku**, dan di sini
ada seluk-beluk yang perlu diluruskan: `tone` dan `words` memang dibuang untuk
rancangan — tapi hanya ketika pemanggil menulis `kind: "flyer"` secara eksplisit
([prompt.ts:139](../apps/api/src/services/drafts/prompt.ts#L139)). Permintaan di
atas tidak menyebut `kind` sama sekali, jadi ia jatuh ke `auto`, dan pada cabang
itu prompt yang dikirim adalah prompt dokumen **lengkap** — termasuk
`"Write the document in an academic and scholarly register throughout."` dan
`DRAFT_SYSTEM_PROMPT` yang memerintahkan menulis dokumen Markdown — lalu
`DRAFT_AUTO_CLAUSE` ditempelkan di ujungnya sebagai pengecualian yang
membatalkan semua itu.

Jadi pada `kind: "auto"` model menerima dua perintah yang saling tarik-menarik,
dan register akademik ikut membebani permintaan yang hasilnya sebuah flyer —
tempat "register" tidak punya arti. Ini bukan bug yang merusak hasil, tapi ia
menjelaskan kenapa jalur `auto` lebih sering meleset formatnya daripada `flyer`
(lihat T3).

### Arah perbaikan

Tolak medan tak dikenal (`.strict()`), atau minimal kembalikan daftar medan yang
diabaikan di balasan. Untuk API yang dipanggil sistem lain, salah ketik nama
medan yang didiamkan adalah kelas bug yang mahal — ia terlihat berhasil.

---

## T6 — Paragraf penutup editor ikut tercetak, termasuk di dokumen prosa (P2)

Sisi lain dari T1.2, tapi cakupannya lebih luas dari flyer. `TrailingParagraph`
menambah satu paragraf kosong di ujung **setiap** dokumen yang node terakhirnya
bukan paragraf — tabel, gambar, blok kode, daftar isi.

Di dokumen prosa ia tidak memaksa penggalan halaman (tidak ada pergantian nama
`@page`), tapi ia tetap menambah tinggi. Dokumen yang isinya pas mengisi lembar
terakhir bisa mendapat satu lembar kosong tambahan di PDF — karena sebuah
paragraf yang tidak pernah diketik siapa pun.

---

## T7 — Hitungan halaman layar ≠ halaman PDF (P3)

Worker menolak dokumen yang terlalu tebal dengan membaca `data-export-pages`
([render_service.py:164](../services/worker/services/render_service.py#L164)),
dan angka itu berasal dari paginasi **layar** (`pageCount` di
[export-document-view.tsx](../apps/web/components/export/export-document-view.tsx)).

T1 membuktikan kedua angka itu bisa berbeda: dokumen keluhan ini kemungkinan
besar dihitung 2 lembar di layar (blok setinggi tepat satu kotak konten, lalu
paragraf penutup jatuh ke lembar berikutnya) sementara PDF-nya 3. *Catatan: angka
layar ini disimpulkan dari geometrinya, belum diukur langsung.*

Selama keduanya bisa berselisih, `RENDER_MAX_PAGES` adalah penjaga yang menjaga
angka yang salah. Untuk dokumen 48 lembar berisi beberapa rancangan, selisihnya
tidak lagi satu-dua lembar.

---

## T8 — Taksiran kemajuan memakai target prosa untuk rancangan (P3)

`targetCharacters` jatuh ke `DEFAULT_TARGET_WORDS = 600` → 3.600 karakter
([progress.ts](../apps/api/src/services/drafts/progress.ts)) ketika pemanggil
tidak mengirim `words` — dan pada jalur rancangan, `words` memang sengaja tidak
dipakai.

HTML flyer yang layak biasanya 6.000–15.000 karakter. Jadi bar kemajuannya
mencapai batas atas 95% saat rancangannya baru setengah jadi, lalu diam di sana.
Bukan kesalahan yang merusak hasil, tapi ia melanggar prinsip yang ditulis di
kepala `progress.ts` sendiri: bar yang berhenti dan diam adalah kebohongan yang
ingin dihindari berkas itu.

---

## Yang sudah benar dan sebaiknya tidak diutak-atik

Supaya cakupan perbaikan tidak melebar:

- **Pemisahan tulis dan render.** Job render baru dititipkan setelah naskah
  tersimpan ([runner.ts](../apps/api/src/services/drafts/runner.ts)), sehingga
  Chromium tidak menganggur menunggu model mengetik. Balasan keluhan ini
  membuktikan alurnya bekerja: `status: ready` dengan unduhan siap.
- **Penanganan kegagalan.** Setiap jalan keluar dari `writeDraft` menandai
  `ready` atau `failed`, dan `generating` selalu bertenggat
  ([status.ts](../apps/api/src/services/drafts/status.ts)) — proses yang mati
  tidak meninggalkan penanti abadi.
- **Deteksi format keluaran.** `pdf` terbaca dari kalimat `"output ke pdf"`
  tanpa medan `output` ([output.ts](../apps/api/src/services/drafts/output.ts)),
  dan daftar tokennya sengaja sempit. Itu keputusan yang benar.
- **Ukuran kertas dari kata kunci.** `designPageSize`/`designOrientation`
  deterministik dan bisa diuji, bukan satu keluaran terstruktur lagi yang bisa
  digagalkan model.
- **`renderErrors` untuk format yang belum punya perender.** `docx`, `png`, `jpg`
  dijawab dengan alasan yang jujur, bukan didiamkan.

---

## Penyelesaian — 8 September 2026 (kemudian hari)

Semua temuan dibereskan dalam satu putaran; uji cetak sungguhan kini bagian
suit (`apps/web/components/export/print-pages.test.ts`) dan semuanya hijau.

| # | Yang dilakukan |
|---|---|
| T1 | Lapisan lembar diberi kelasnya sendiri (`document-sheet-layer`) dan disembunyikan **utuh** saat cetak; `TrailingParagraph` tak lagi dimuat di halaman ekspor (`trailingParagraph: false`); uji cetak Playwright menghitung lembar sungguhan — reproduksi lampiran kini keluar 1 halaman |
| T2 | `designPageCount` membaca angka dari kalimat (seperti ukuran kertas, dipingit 1–8); prompt meminta tepat N pagar (eksplisit maupun klausa auto); pengurai menerima N pagar → N `htmlBlock` mode halaman; jumlah yang tak sesuai dibalas sebagai `warnings` |
| T3 | Basa-basi pendek antar/setelah pagar ditoleransi (batas 160 karakter, tanpa struktur) — "Semoga membantu!" tak lagi menjatuhkan rancangan; bila jawaban berpagar tetap tak terdeteksi, itu dicatat di log dan dibalas lewat `warnings` |
| T4 | Halaman ekspor memasang `data-export-clipped` (jumlah blok terpotong, diukur dengan cara yang sama dengan probe sandbox); worker mengubahnya menjadi `warnings` di catatan render → serah-terima |
| T5 | Medan tak dikenal dibalas sebagai `ignoredFields` pada jawaban pembuatan (dipilih di atas `.strict()` supaya pemanggil lama tak putus) |
| T6 | Tertutup oleh T1 (paragraf penutup tak pernah sampai halaman ekspor) |
| T7 | Worker menghitung halaman dari berkas PDF-nya sendiri dan menyerahkannya sebagai `downloads[].pages`; melebihi `RENDER_MAX_PAGES` setelah lolos angka layar → `warnings` (hasil tetap diserahkan, kejujurannya dijaga) |
| T8 | `designTargetCharacters` (± 8.000 karakter per halaman) dipakai sebagai target kemajuan saat jalur rancangan diperkirakan |

Catatan kecil: pada `kind: 'auto'` tebakan jalur rancangan dibuat dari angka halaman di prompt — tebakan yang meleset hanya membuat bar kurang jauh lalu melompat ke 97 saat menyimpan, bukan berdiam di 95%.

## Lampiran — skrip reproduksi T1

Dijalankan di dalam kontainer worker (`docker exec writer-hub-worker-1 python …`),
karena di sanalah Chromium yang sama dengan perender berada.

```python
import re
from playwright.sync_api import sync_playwright

PAGE_RULES = """
@page { size: 210mm 297mm; margin: 0mm; }
@page flyer { size: 210mm 297mm; margin: 0; }
"""

BASE = """
<style>
*{box-sizing:border-box}
body{margin:0;background:#fff}
.document-sheet{display:none !important}
.document-print-root{width:auto !important;height:auto !important;min-height:0 !important;
  transform:none !important;padding:0 !important;overflow:visible !important;background:#fff !important}
.document-body > [data-html-block-fit='page']{margin:0; page: flyer;}
.html-block-page{margin:0}
.html-block-page .html-block-stage{position:relative;height:var(--page-height, var(--page-content-height,640px))}
.html-block-page .html-block-frame{position:absolute;top:0;left:0;width:100%;height:100%;border:0}
.document-body > * + *{margin-top:0.75em}
p{margin:0}
</style>
"""

FLYER_SRC = ("<body style='margin:0'><div style='width:100%;height:100%;background:#0a3d62;"
             "color:#fff;font:700 48px sans-serif;display:flex;align-items:center;"
             "justify-content:center'>FLYER</div></body>")

def block():
    src = FLYER_SRC.replace('"', '&quot;')
    return ("<div class='react-renderer node-htmlBlock' data-html-block-fit='page'>"
            "<div class='html-block html-block-page'><div class='html-block-stage'>"
            f'<iframe class="html-block-frame" srcdoc="{src}"></iframe>'
            "</div></div></div>")

def doc(sheets_wrapper=True, trailing=True, blocks=1):
    body = ""
    if sheets_wrapper:
        body += ("<div aria-hidden='true'><div class='document-sheet absolute' "
                 "style='top:0;left:0;width:794px;height:1123px'></div></div>")
    inner = block() * blocks + ("<p><br></p>" if trailing else "")
    body += ("<div class='document-page-padding relative z-10' style=\"padding:0;"
             "--page-content-height:1123px;--page-width:794px;--page-height:1123px;"
             "--page-margin-top:0px;--page-margin-left:0px\">"
             f"<div class='document-body'>{inner}</div></div>")
    return ("<html><head>" + BASE + "<style>" + PAGE_RULES + "</style></head><body>"
            "<div class='document-canvas'><div class='document-paper document-print-root' "
            "style='width:794px;min-height:1123px'>" + body + "</div></div></body></html>")

pages = lambda pdf: len(re.findall(rb"/Type\s*/Page[^s]", pdf))

cases = {
    "A. wrapper + flyer + trailing p": doc(True, True),
    "B. wrapper + flyer": doc(True, False),
    "C. flyer + trailing p": doc(False, True),
    "D. flyer saja": doc(False, False),
    "E. wrapper + 3 flyer + trailing p": doc(True, True, 3),
}

with sync_playwright() as p:
    b = p.chromium.launch(channel="chromium-headless-shell",
                          args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = b.new_page()
    for name, html in cases.items():
        pg.set_content(html, wait_until="load")
        print(name, pages(pg.pdf(print_background=True, prefer_css_page_size=True)))
    b.close()
```
