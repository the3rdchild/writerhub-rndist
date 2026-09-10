# Rencana Implementasi — Diagram Editorial (diagram-design)

Status: **fase 1 selesai** (`eb9ebcb`, `9a403ff`) · fase 2-5 belum · Disusun 10 September 2026 · Baseline kode
`72c495f` (branch `feat/agent-skills`)

**Sumber luar:** [cathrynlavery/diagram-design](https://github.com/cathrynlavery/diagram-design)
v2.6, MIT. Klon kerja ada di `ref/diagram-design/` (lihat §11 — `ref/` bukan tempat
akhirnya).

Dokumen terkait: `docs/AGENT-SKILLS-PLAN.md` (arsitektur overlay yang dipakai
ulang), `docs/CHAT-SUBAGENT-PLAN.md` (jalur eksekusinya),
`docs/CHAT-TRANSCRIPT-PLAN.md` (prasyarat UI).

---

## 1. Masalah yang dipecahkan

Dua lubang sekaligus.

**Diagram yang ada terlihat seperti Mermaid.** Kotak membulat generik, warna
bawaan, tipografi bawaan. Di dokumen yang tipografinya sudah diurus sampai ke
watermark dan penomoran halaman, diagramnya adalah satu-satunya yang terlihat
seperti keluaran mesin.

**Chart tidak ada sama sekali.** Tidak ada bar, line, scatter, treemap — apa pun.
Penulis yang butuh grafik hari ini menempelkan tangkapan layar.

---

## 2. Keputusan yang sudah dikonfirmasi

1. **Penggunanya penulis lewat chat**, bukan tim yang menyiapkan set siap pakai.
2. **Sumbernya harus tetap bisa disunting penulis.** Itu yang menentukan blok
   mana yang dipakai — lihat §6.
3. **40 tipe seluruhnya**, karena sekaligus mengisi lubang chart.
4. **Mermaid tetap ada.** Berdampingan, bukan diganti.
5. **Judul dan eyebrow di luar gambar**, bukan di dalam SVG.
6. **Tidak boleh melewati margin.**
7. **Terang baku; gelap saat diminta** — terutama supaya diagram cocok ketika ia
   ditanam di rancangan pamflet yang gelap.
8. **Palet coral bawaan.**
9. **Sanitasi lewat allowlist**, dan konsisten untuk kedua jalur.
10. **Render yang rusak diberi keterangan**, tidak gagal diam.
11. **Dieksekusi dua langkah lewat sub-agent** (`docs/CHAT-SUBAGENT-PLAN.md`).

---

## 3. Apa itu diagram-design

Bukan library JS. Ia **Agent Skill**: `SKILL.md` (40 KB) + 55 berkas
`references/` (756 KB) + 162 contoh HTML (2,5 MB) + beberapa skrip Python.
Keluarannya HTML statis dengan inline SVG — tanpa build step, tanpa JS, tanpa
dependensi.

Jadi pertanyaannya bukan "bisa dipasang?" melainkan "siapa yang menggambar
SVG-nya". Jawabannya: model, dipandu skill.

---

## 4. Kecocokan dengan writer-hub

Ketiga potongan yang dibutuhkan sudah ada:

| Butuh | Sudah ada di |
|---|---|
| Memuat instruksi skill sesuai kebutuhan | `packages/shared/src/skills.ts` + `read_skill` |
| Menaruh SVG di dokumen dengan sumber tersunting | `codeBlock` + `NodeViewContent` |
| SVG → PNG untuk DOCX | `rasterizeSvg` di `apps/web/features/editor/html-raster.ts:138` |
| Palet `/` untuk memaksa skill | `SKILL_COMMANDS` di `apps/web/features/chat/commands.ts:90` memetakan **seluruh** `ACTIVE_SKILLS` otomatis — nol pekerjaan UI |

---

## 5. Temuan teknis yang menentukan rancangan

### 5.1 SVG-nya sudah mandiri

Seluruh gaya di contoh diagram-design ada sebagai **atribut presentasi pada tiap
elemen** (`fill=`, `stroke=`, `font-family=`). Blok `<style>` di `<head>` hanya
mengurus hiasan halaman (`body`, `.eyebrow`, `h1`), bukan diagramnya.

Artinya: **potong `<svg>`-nya saja, ia render sama persis.** Tidak ada CSS
yatim, tidak ada dependensi pembungkus. Markup yang sama hidup di code block
maupun di dalam markup pamflet.

### 5.2 Gelap adalah substitusi warna, bukan gambar lain

`example-architecture.html` dibanding versi gelapnya:

```
terang: 25×#4f5d75  12×#f5f5f5  8×#2d3142  7×#eb6c36  4×#7a8399  4×#2e5aa8
gelap:  25×#bfc0c0  12×#2d3142  8×#f5f5f5  7×#f08a59  4×#8e98ac  4×#6a95d8
```

Hitungannya cocok satu per satu; geometrinya identik. Jadi terang ⇄ gelap
**tidak perlu model sama sekali** — cukup `reskinSvg(svg, palette)`: peta empat
token, substitusi, selesai. Nol token, dan mustahil merusak tata letak. Ada 2-3
nilai yang tidak bijektif (`#ffffff` → `#393e53`); itu kasus khusus di peta.

Karena bentuknya peta token, ia tidak terbatas pada gelap: **palet apa pun bisa**,
termasuk warna pamflet yang menampungnya.

### 5.3 `<style>` di dalam SVG bocor ke seluruh dokumen

CSS di dalam SVG tidak ter-scope, dan di code block SVG dirender langsung di
aliran halaman (bukan di iframe). Mermaid selamat karena memprefiks selektornya
dengan id.

Diagram-design tidak memakai `<style>` sama sekali, jadi ini jadi **aturan keras**
di overlay dan di sanitizer: dilarang. Kebetulan itu juga menyederhanakan
sanitizer-nya.

### 5.4 Margin sudah aman, tingginya yang tidak

Aturan yang sudah ada di `apps/web/app/globals.css`:

- `:1406` — `svg { max-width: 100%; height: auto }` di pratinjau
- `:2330` — aturan yang sama saat cetak
- `:2328` — `break-inside: avoid` pada blok cetak

Jadi **lebar tidak bisa melewati margin secara konstruksi**, dan diagram yang
tidak muat di sisa halaman didorong utuh ke lembar berikutnya. Sudah terbukti
lewat mermaid.

Yang berbahaya adalah tinggi: `break-inside: avoid` pada blok yang lebih tinggi
dari satu halaman penuh tidak bisa dipatuhi browser. Karena itu §8 mengunci rasio
`viewBox`.

### 5.5 CSP bingkai menerima inline SVG

`apps/web/features/editor/html-sandbox.ts:101` — `default-src 'none'`,
`img-src data:`, `style-src 'unsafe-inline'`, `font-src data:`. Inline SVG lolos
tanpa syarat. Yang **tidak** lolos: `<link>` Google Fonts di template
diagram-design.

### 5.6 `rasterizeSvg` tidak menyematkan font

PNG untuk DOCX jatuh ke font sistem. Untuk mermaid itu tidak terlalu kentara;
untuk diagram-design — yang seluruh tampilannya bertumpu pada Geist / Instrument
Serif / Geist Mono — kentara sekali. Ketiganya juga tidak ada di
`packages/shared/src/fonts.ts`.

---

## 6. Slotnya: bahasa code block baru, cermin mermaid

```
Diagram Mermaid   → sumber mermaid  → mermaid.render() → SVG
Diagram Editorial → sumber SVG      → (sudah SVG)      → SVG
```

Keduanya bermuara ke satu hal: SVG yang disimpan, dipratinjau, dicetak, diraster.
Yang dipakai ulang **tanpa ditulis ulang**:

| Kebutuhan | Sudah ada di `code-block-node-view.tsx` |
|---|---|
| Sumber tersunting penulis | `NodeViewContent` (:219) |
| Toggle Sumber ⇄ Pratinjau | tombol `Eye`/`Code2` (:163-178) |
| Tetap tercetak walau sedang lihat sumber | `code-block-mermaid-print` (:232) |
| Ukuran | `viewBox` yang menentukan — soal "full page" hilang sendiri |

**Kenapa bukan blok HTML.** Tombol "Sumber" di `html-block-view.tsx:247` hanya
menampilkan `<pre>{attrs.html}</pre>` — baca saja, tidak bisa diketik. HTML-nya
hidup sebagai atribut node, bukan teks ProseMirror. Blok HTML juga memang
dirancang untuk rancangan satu halaman yang diratakan jadi gambar.

---

## 7. Yang tetap harus ditulis

1. **Sanitizer allowlist.** Mermaid aman karena `securityLevel: 'strict'`
   membersihkannya. SVG tulisan model — apalagi yang lalu disunting penulis —
   masuk lewat `dangerouslySetInnerHTML` tanpa penjaga: `<script>`,
   `<foreignObject>`, `on*=`, `href="javascript:"`, dan `<style>` (§5.3).
   Bukan iframe: jalur cetak menaruh SVG langsung di aliran dokumen, dan iframe
   merusak pagination serta `break-inside`.
2. **Font di `rasterizeSvg`.** Petakan token diagram-design ke katalog
   (Inter / JetBrains Mono / serif dokumen), lalu suntikkan `fontFaceCss` sebagai
   `<style>` **di dalam SVG saat meraster** — di sana ia tidak bocor karena
   dokumennya memang cuma SVG itu.
3. **Overlay skill.** `SKILL.md` 40 KB (~11K token) melanggar plafon ±4K per
   berkas di `docs/AGENT-SKILLS-PLAN.md` §2.7. Harus ditulis ulang tipis:
   pemilih tipe + aturan gaya inti di badan, tiap `type-*` diambil
   `read_skill(name, file)`. 40 entri `SkillFile[]` ikut di indeks system prompt
   setiap permintaan — perlu dikelompokkan, bukan didaftar satu-satu.
4. **`reskinSvg`** (§5.2).
5. **Keterangan render rusak.** Dua bentuk kegagalan: tidak ter-parse (mudah
   dideteksi) dan ter-parse tapi berantakan (tidak terdeteksi sama sekali).
   Yang pertama diberi kotak keterangan seperti error mermaid; yang kedua hanya
   bisa dijaga lewat aturan di §8.

**Yang tidak ikut:** skrip Python (`self_check.py`, `verify-geometry.py`,
`lint-render.py`) tidak jalan di runtime chat, 162 contoh HTML tidak perlu ikut,
dan gate onboarding interaktif ("mau ambil brand dari URL?") tidak masuk akal
untuk penulis skripsi — ganti token tetap.

---

## 8. Aturan yang dikunci di overlay

- **`viewBox`: tinggi ≤ lebar** untuk diagram di badan dokumen (contoh upstream
  1000×480 dan 1000×600, keduanya aman). Yang butuh lebih tinggi memang
  seharusnya dipecah dua.
- **Dilarang `<style>` di dalam SVG** (§5.3).
- **Dilarang sumber daya jauh** — tidak ada `<link>`, `<image href="http…">`.
- **Judul dan eyebrow di luar SVG**, jadi teks dokumen biasa.
- **Font hanya dari katalog** (§7.2).
- **Coral hanya untuk 1-2 node fokal** — aturan upstream yang dipertahankan
  karena itu yang membuat gambarnya terbaca.

### 8.1 Catatan soal "judul di luar"

writer-hub **belum punya caption maupun Daftar Gambar** — tidak ada `figure`,
tidak ada penomoran otomatis. Jadi hari ini "judul di luar" berarti paragraf
biasa yang dinomori sendiri penulis. Keputusannya tetap benar (judul di dalam
SVG jelas lebih buruk), tapi manfaat penuhnya baru muncul kalau penomoran gambar
dibangun terpisah. **Itu fitur sendiri, bukan bagian dari rencana ini.**

---

## 9. Diagram di dalam blok HTML (pamflet)

Ini bukan "pamflet mengikuti filosofi diagram-design". Cakupannya sempit:
**hanya elemen chart/diagram di dalam pamflet** yang memakai tata bahasa itu,
sisanya tetap bebas.

Pembedaan itu penting karena kalau diperluas ia bertabrakan langsung. Deskripsi
`insert_html_block` berbunyi *"Design these pieces ambitiously — layered shapes,
gradients…"*, sedangkan `SKILL.md` berbunyi *"The highest-quality move is usually
deletion. No shadows. Target density: 4/10."* Model yang menerima keduanya
menghasilkan pamflet setengah hati.

Konsekuensi yang sudah diterima:

- **Dua langkah.** Model utama menulis markup dengan penanda `<!--diagram:1-->`;
  sub-agent menggambar paralel; klien menjahit sebelum blok tersimpan. SVG-nya
  tidak pernah melewati konteks utama.
- **Diagram di pamflet bersifat final** — sumber blok HTML read-only, jadi ia
  tidak bisa disunting penulis. Beda dengan yang di code block.
- **Rasio longgar di sini.** Aturan tinggi ≤ lebar (§8) berlaku untuk badan
  dokumen; di pamflet diagram boleh jadi kolom sempit yang tinggi.
- **Sanitasi tetap satu tempat** — di server, sebelum apa pun dikirim ke klien.

---

## 10. Chart butuh penjagaan tersendiri

Bar / line / scatter / treemap di diagram-design digambar dengan **koordinat
manual**. Model mengubah angka jadi piksel sendiri: tinggi bar, skala sumbu,
posisi label. Tanpa `verify-geometry.py` (§7), tidak ada yang memeriksa bahwa
bar 40% benar-benar setinggi 40%.

Diagram struktur yang salah terlihat jelek. **Chart yang salah skala adalah data
yang salah di skripsi orang.** Karena itu overlay untuk tipe chart wajib:

- memaksa model menuliskan tabel angkanya lebih dulu, di dalam `<desc>`;
- menaruh nilai asli sebagai label di tiap mark, supaya pembaca bisa mengoreksi
  dengan mata;
- menolak menggambar kalau angkanya tidak lengkap, alih-alih menebak.

---

## 11. Vendor dan lisensi

`ref/` bukan tempat akhirnya. Ikuti pola yang sudah berjalan di
`docs/AGENT-SKILLS-PLAN.md` §3:

```
vendor/diagram-design/          cuplikan upstream, bahan diff, TIDAK ikut ke image
packages/shared/skills/diagram-design/   overlay kita sendiri, satu-satunya yang sampai ke model
```

`Dockerfile` hanya menyalin `packages/shared` dan `apps/api`, jadi pemisahan itu
dipaksakan mesin, bukan sekadar disepakati. MIT → tambahkan atribusi di `NOTICE`.

---

## 12. Urutan pengerjaan

| Fase | Isi | Status |
|---|---|---|
| 0 | `docs/CHAT-TRANSCRIPT-PLAN.md` T2 | selesai |
| 1 | Slot: bahasa code block, sanitizer, font di `rasterizeSvg`, 6 tipe struktural | selesai — **belum dilihat di kertas** |
| 2 | Sub-agent (`docs/CHAT-SUBAGENT-PLAN.md`) + `redraw_diagram` | belum |
| 3 | `reskinSvg` + diagram di dalam pamflet | belum |
| 4 | Sisa tipe struktural | belum |
| 5 | Chart dengan penjagaan angka (§10) | belum |

### 12.1 Yang mendarat di fase 1

- `diagram-allowlist.ts` + `diagram-svg.ts` — daftar putih dan penelusurnya,
  dipisah supaya keputusannya bisa diuji tanpa DOM (18 tes).
- Bahasa code block `diagram` berlabel **Diagram Editorial**, memakai petak
  pratinjau, cetak, dan raster yang sama dengan Mermaid. Kelas CSS `mermaid-*`
  dinamai ulang jadi `visual-*` karena kini melayani dua produsen.
- `rasterizeSvg` menyematkan font. Ini sekaligus memperbaiki Mermaid, yang
  selama ini ikut kehilangan fontnya di DOCX tanpa ada yang menyadarinya.
- Ekspor DOCX menyaring diagram dengan penyaring yang sama dengan layar.
- `insert_diagram` + skill overlay dengan enam tipe.

**Tipenya enam, dan satu ditukar.** Rencana awal menyebut `process`; tipe itu di
upstream bersifat parametrik — kontrak input YAML yang menurunkan tiap koordinat
lewat rumus — dan jauh melewati plafon 4K token per berkas. `swimlane` menjawab
pertanyaan yang sama, siapa mengerjakan apa dalam urutan apa, dengan tata bahasa
yang muat. Kalau `process` memang dibutuhkan nanti, ia perlu berkasnya sendiri
dan mungkin lebih dari satu.

### 12.2 Yang belum terverifikasi

**Tidak ada satu diagram pun yang pernah dilihat di kertas.** Mesin pengembangan
tidak punya Chromium yang bisa dijalankan, jadi `print-pages.test.ts` — termasuk
dua kasus diagram yang baru ditambahkan — **dilewati diam-diam dan dilaporkan
sebagai lulus**. Jalankan dengan `PRINT_TEST_BROWSER` menunjuk ke chromium sistem
sebelum mempercayai bagian mana pun dari perilaku cetaknya.

Yang sudah dijamin: typecheck dua aplikasi, biome tanpa temuan baru, dan 1.265
tes unit (285 API + 980 web).

Yang khususnya belum pernah dijalankan sekali pun:

1. Apakah SVG hasil model benar-benar lolos daftar putih tanpa kehilangan yang
   penting — daftar itu diturunkan dari inventaris upstream, bukan dari keluaran
   model kita sendiri.
2. Apakah `break-inside: avoid` benar-benar memindahkan diagram utuh.
3. Apakah font yang disematkan benar-benar muncul di PNG DOCX.

---

## 13. Yang belum diputuskan

- Model untuk sub-agent penggambar (lihat `docs/CHAT-SUBAGENT-PLAN.md` §8).
- Apakah code block perlu atribut lebar (60/80/100%) di toolbar, atau cukup
  penulis menyunting `viewBox` langsung.
- Bagaimana `<title>`/`<desc>` dipakai ulang sebagai spesifikasi regenerasi —
  keduanya sudah wajib ada demi aksesibilitas, jadi "gambar ulang jadi timeline"
  bisa membaca dua baris itu alih-alih 400 baris koordinat.
