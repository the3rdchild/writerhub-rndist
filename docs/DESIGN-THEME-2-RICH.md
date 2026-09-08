# Tema ke-2 blok rancangan — "konten penuh"

Ditulis 8 September 2026. **Status: rencana, belum ada satu baris kode pun.**

Pemicunya satu pengamatan: repo pembanding [`ref/ai-chat`](../ref/ai-chat) —
sebuah spike bernama *Visual Book Generator* — menghasilkan halaman yang jauh
lebih padat dan lebih "dirancang" daripada blok rancangan yang keluar dari AI
Chat di sini, padahal keduanya berakhir sebagai HTML satu halaman yang dicetak.

Tone AI Chat sekarang **tidak diganggu**. Yang direncanakan di sini adalah tema
kedua yang menyala hanya ketika penggunanya memang meminta hasil yang penuh.

## Keputusan yang sudah diambil

| # | Pertanyaan | Keputusan |
|---|---|---|
| K1 | Cakupan | **Prompt + design token saja.** Tetap satu panggilan, satu blok. Bukan pipeline ala ref. |
| K2 | Cara memilih tema | **Deteksi dari kalimat pengguna.** Tanpa toggle UI, tanpa medan API baru. |
| K3 | Gambar raster | **Ya, hybrid ala mode C.** Slot adegan jadi gambar AI, sisanya tetap SVG. |
| K4 | Temuan `DRAFTS-API` (T2/T3/T4) | **Dipisah.** Bukan bagian pekerjaan ini. |

K1 dan K3 bertabrakan di satu titik, dan itu dibahas terbuka di [§4](#4-raster-hybrid-mode-c).

---

## 1. Kenapa hasil `ref/ai-chat` terasa lebih penuh

Bukan karena prompt-nya lebih panjang. Empat sebab, dan hanya dua yang setingkat
prompt:

| | project ini | `ref/ai-chat` |
|---|---|---|
| Bentuk kerja | satu tembakan: satu panggilan model → satu blok | pipeline: chat → `bookspec` JSON → N halaman paralel → pass ilustrasi |
| Konsistensi visual | diserahkan sepenuhnya ke model | **design system dikunci lebih dulu**, disuntik literal ke tiap prompt |
| Ilustrasi | model layout menggambar SVG sendiri, sekalian | model illustrator **terpisah** per slot, opsional raster |
| Halaman jamak | tidak ada | native, plus regenerate per halaman |

**S1 — Design system terkunci.** [`design-system-css.ts`](../ref/ai-chat/src/book/design-system-css.ts)
mengubah spec jadi `:root{--color-*; --fs-*}` lalu menyuntiknya **apa adanya** ke
tiap prompt halaman dengan kalimat "pakai HANYA variabel ini; dilarang membuat
warna, font, atau ukuran baru". Paletnya sendiri diturunkan dari tema lewat
[`chat-system-prompt.ts`](../ref/ai-chat/src/book/chat-system-prompt.ts), yang
memuat satu larangan yang layak dicuri bulat-bulat: *"jangan pakai palet
biru-abu korporat generik kecuali temanya memang menuntut"*. **Setingkat prompt
— bisa diambil di bawah K1.**

**S2 — Perintah mengisi lembar.** Eksperimen mereka sendiri (README §"model bagus
→ PDF bagus") mengukurnya: model murah menyisakan 50–60% halaman kosong berupa
grid kartu berongga, model kelas atas menyusun satu adegan penuh halaman dengan
kicker, footer, dan kata kunci ter-highlight. Selisihnya sebagian art direction
model, sebagian instruksi. **Bagian instruksinya bisa diambil.**

**S3 — Ilustrasi dikerjakan model lain.** Kesimpulan mereka: illustrator adalah
titik ungkit terbesar, bukan model layout — SVG naik dari 2–4 KB ikon datar dua
warna menjadi 6–12 KB adegan berlapis dengan gradient dan glow. **Ini pipeline,
di luar K1.**

**S4 — Kontrak server yang menang atas model.**
[`document-assembler.ts`](../ref/ai-chat/src/html/document-assembler.ts) memaksa
`height` (bukan `min-height`) + `overflow:hidden` + `print-color-adjust:exact`,
sehingga bleed mustahil secara struktural. Di sini padanannya sudah ada dan
bekerja dengan cara berbeda: bingkai sandbox
([`html-sandbox.ts`](../apps/web/features/editor/html-sandbox.ts)) sudah
memaksakan tinggi root dan `print-color-adjust`, dan
[`design-repair.ts`](../apps/api/src/services/drafts/design-repair.ts) menambal
dua refleks halaman web yang paling merusak. **Tidak perlu diambil.**

## 2. Yang diambil dan yang tidak

| Dari ref | Diambil? | Alasan |
|---|---|---|
| Design system terkunci sebagai CSS variable | **Ya** | Setingkat prompt; sebab terbesar yang bisa dijangkau K1 |
| Palet diturunkan dari tema + larangan biru-abu korporat | **Ya** | Satu paragraf prompt, efeknya langsung terlihat |
| Aturan kepadatan / mengisi lembar | **Ya** | Idem |
| Slot ilustrasi `data-kind` + raster hybrid | **Ya** (K3) | Lihat §4 — ini satu-satunya bagian yang menembus batas K1 |
| Rem-rem raster (cover, budget, klausa negasi, tanpa teks) | **Ya** | Ikut wajib; tanpa itu raster justru merusak |
| Illustrator SVG sebagai model terpisah | Tidak | Panggilan model tambahan per slot; di luar K1 |
| `bookspec` sebagai langkah percakapan | Tidak | Mengubah alur chat; di luar K1 |
| Multi-halaman | Tidak | Itu T2 di [DRAFTS-API-FINDINGS](DRAFTS-API-FINDINGS.md), dipisah per K4 |
| Sanitizer & CSS scoper | Tidak | T3 dan prasyarat multi-blok, dipisah per K4 |
| Deteksi overflow | Tidak | Di sini sudah ada di jalur chat (`probeScript` di `html-sandbox.ts`); yang kurang cuma jalur draf, itu T4 |
| Google Fonts `@import` | **Tidak, dan jangan** | Font tertanam ([`fonts.ts`](../packages/shared/src/fonts.ts)) lebih benar: berkas ekspor harus utuh tanpa jaringan |

## 3. Rancangan tema ke-2

### 3.1 Pemicu: deteksi dari kalimat

Mengikuti idiom yang sudah dipakai
[`design-layout.ts`](../apps/api/src/services/drafts/design-layout.ts): kata
kunci deterministik, bukan keluaran terstruktur kedua dari model.

```
RICH   = penuh, padat, meriah, mewah, kaya, berwarna, colorful, full,
         rich, bold, dramatis, eye-catching, mencolok, wah, niat,
         "jangan polos", "jangan kosong", "isinya banyak"
PLAIN  = simpel, sederhana, minimalis, polos, bersih, clean, minimal,
         ringkas, "jangan ramai", "jangan berlebihan"
```

Aturannya tiga baris, dan urutannya penting:

1. `PLAIN` menang atas `RICH`. "penuh tapi tetap bersih" adalah permintaan tema
   1; salah tebak ke arah ramai lebih menyakitkan daripada sebaliknya.
2. Frasa negasi diperiksa sebagai frasa utuh, bukan kata lepas — "jangan penuh"
   tidak boleh cocok dengan `RICH` gara-gara kata "penuh" di dalamnya. Ref
   menabrak persis masalah ini dan menyelesaikannya dengan membuang klausa
   negasi lebih dulu (`NEGATION_CLAUSE` di
   [`illustration-prompt.ts`](../ref/ai-chat/src/book/illustration-prompt.ts)).
3. Tidak cocok apa pun → tema 1. Diam-diam, tanpa peringatan.

Titik pasangnya:

| Jalur | Berkas | Yang diperiksa |
|---|---|---|
| AI Chat | [`messages.ts`](../apps/api/src/services/chat/messages.ts) `buildMessages` | pesan `user` terakhir di `body.messages` |
| Draf eksternal | [`prompt.ts`](../apps/api/src/services/drafts/prompt.ts) `buildDraftMessages` | `request.prompt` |

Panduan tema 2 ditulis **bersyarat** — "kalau kamu menyisipkan blok rancangan di
giliran ini, …" — supaya salah tembak pada permintaan prosa hanya memboroskan
token, bukan mengubah tone tulisannya. Itu yang membuat deteksi kasar bisa
diterima tanpa toggle.

Satu keterbatasan yang harus disebut sekarang, bukan ditemukan nanti: di chat,
permintaan "bikin lebih penuh" sering datang **satu giliran setelah** flyer-nya
jadi. Memeriksa hanya pesan terakhir sudah menangkap kasus itu (pesan terakhirnya
memang memuat kata "penuh"), tapi tidak menangkap kebalikannya — flyer diminta
penuh di giliran pertama, lalu direvisi dengan kalimat netral di giliran kedua,
dan tema 2 padam di tengah jalan. Kalau ini muncul saat dicoba, obatnya
memeriksa dua pesan `user` terakhir, bukan menambah toggle.

### 3.2 Token yang dikunci

Tokennya hidup **di dalam blok itu sendiri**, sebagai `:root{}` di `<style>`
milik blok — bukan di `globals.css` dan bukan di prompt sebagai angka literal
ala ref. Alasannya: di ref, palet sudah diputuskan lewat percakapan sebelum
halaman dibuat; di sini keputusan itu dibuat model dalam panggilan yang sama.
Yang bisa kita paksakan bukan *nilainya*, melainkan **disiplinnya**: nyatakan
dulu, lalu jangan pakai apa pun di luar itu.

- Warna: `--color-bg`, `--color-ink`, `--color-accent`, `--color-accent-soft`,
  `--color-surface` — lima, sama seperti ref.
- Huruf: `--font-heading`, `--font-body`, dan namanya **wajib** dari daftar
  tertanam. `fontChoicePrompt()` sudah menyatakan aturan itu dan sudah ikut di
  kedua prompt yang ada; tema 2 tidak mengulangnya, cukup memakainya.
- Skala ukuran: `--fs-xs` … `--fs-3xl`, tiap langkah 1,25×.

Bedanya dengan ref, dan ini disengaja: skalanya dinyatakan dalam **em, bukan
pt**. Ref selalu A4 sehingga pt aman; di sini lembarnya bisa A3 sampai A5 dan
aturan yang sudah ada di [`prompt.ts`](../apps/api/src/services/drafts/prompt.ts)
melarang satuan tetap ("Size everything in % or em, never vh/vw"). Menambahkan
pt lewat pintu belakang token akan melawan aturan itu.

### 3.3 Draf teks prompt

Ditulis dalam bahasa Inggris mengikuti prompt yang sudah ada. Ini draf untuk
ditinjau, bukan teks final.

```ts
export const RICH_DESIGN_PROMPT = [
  'If you produce a design block for this request, design it FULL: this reader',
  'asked for a piece that fills the page, not a restrained one.',

  'Fix a design system first, at the top of your <style>, as custom properties',
  'on the root element: --color-bg, --color-ink, --color-accent,',
  '--color-accent-soft, --color-surface, --font-heading, --font-body, and a',
  'type scale --fs-xs to --fs-3xl in em, each step 1.25x the one below it.',
  'Then use ONLY those values in the rest of the block. A colour, a face or a',
  'size that is not one of them is a mistake - mixing them is exactly what',
  'makes a page look assembled instead of designed.',

  'Derive the palette from the SUBJECT, never from a default. Volcanic ash is',
  'ash grey with ember orange; a rainforest is damp green over earth brown; an',
  'archive piece is sepia, faded red and cream. Generic corporate blue-grey is',
  'banned unless the subject is literally corporate.',

  'Fill the sheet. Empty paper is the failure mode here: a layout that stops a',
  'third of the way down is a failed flyer, not a minimal one. Leave breathing',
  'space deliberately, in a few places, not as a border around everything.',

  'Build it in layers, back to front: a full-bleed background field; a large',
  'SVG scene, shape or pattern that bleeds off at least one edge; a surface',
  'that carries the text and overlaps that shape rather than sitting beside',
  'it; then the type.',

  'Give it the parts a printed piece has: a kicker line above the headline, a',
  'headline at --fs-3xl, a deck under it, body text in blocks or columns, one',
  'fact or number pulled out large as its own element, and a footer band that',
  'reaches both edges. Highlight the two or three phrases that matter instead',
  'of bolding whole sentences.',
].join(' ')
```

### 3.4 Yang tidak berubah

Tema 1 tetap bawaan dan teksnya tidak disentuh. `canvasPrompt`,
`fontChoicePrompt`, `design-repair`, sandbox, dan seluruh jalur ekspor juga
tidak. Tema 2 hanya satu blok teks tambahan di ujung prompt.

## 4. Raster hybrid (mode C)

### 4.1 Ini tidak bisa prompt-only

Perlu dikatakan lugas: **K3 menembus batas K1.** Bukan karena rancangannya
kurang rapi, melainkan karena dua batas keras.

1. CSP bingkai blok hanya mengizinkan `img-src data:`
   ([`html-sandbox.ts`](../apps/web/features/editor/html-sandbox.ts)). URL
   gambar apa pun — termasuk milik layanan `assets` sendiri — tidak akan muncul.
   Dan itu memang **syarat, bukan kekurangan**: berkas ekspor harus utuh tanpa
   jaringan.
2. Model tidak bisa memanggil generator gambar sendiri. Ada pihak lain yang
   harus memanggilnya, menunggu, lalu menempelkan hasilnya sebagai `data:` URI.

Jadi satu langkah tambahan tidak terhindarkan. Yang bisa dijaga adalah
ukurannya.

### 4.2 Bentuk paling kecil yang masih benar

Ambil pembagian kerja mode C, buang illustrator SVG-nya:

- Model layout tetap **satu panggilan**, dan tetap menggambar sendiri semua SVG
  — ikon, bentuk, diagram — persis seperti sekarang.
- Untuk gambar yang tidak masuk akal digambar sebagai SVG (adegan naturalistik,
  tekstur, foto), model menaruh **placeholder kosong** alih-alih memaksakan
  path:
  `<div class="illus" data-kind="scene" data-brief="…" style="width:…;height:…"></div>`
- Satu penyelesai di server mengisi tiap placeholder dengan `<img src="data:…">`.

Tambahan panggilan model teks: **nol**. Yang bertambah hanya panggilan gambar,
dan hanya kalau modelnya memang menaruh slot.

### 4.3 Rem yang wajib ikut disalin

Semua ini sudah dibayar mahal di ref; menyalinnya gratis.

| Rem | Kenapa |
|---|---|
| Cover / lembar utama tidak pernah raster | Layout cover menumpuk slot absolut; raster di situ merusak komposisi |
| Maksimal 2 raster per lembar | Sisanya turun ke SVG. Batas waktu, biaya, dan berat dokumen sekaligus |
| Apa pun yang butuh presisi tetap SVG | Peta, diagram, bagan, grafik, panah, angka. Image-gen menuliskannya jadi gibberish |
| Klausa negasi dibuang sebelum penyaringan | "adegan tanpa teks" tidak boleh terbaca sebagai "butuh teks" |
| Judul / tema tidak pernah masuk prompt gambar | Kasus nyata di ref: "Geothebenal Powerplant" tercetak di dalam gambar |
| `data-kind` hilang → heuristik kata kunci pada `data-brief` | Model murah lupa menandai; jangan sampai seluruh mekanismenya padam karena satu atribut |

### 4.4 Yang belum diputuskan

Tiga hal, dan ketiganya butuh keputusan sebelum kode ditulis:

**(a) Penyedia gambar.** `AI_BASE_URL` sekarang menunjuk ke OpenRouter dan
seluruh jalur AI di sini adalah *chat completions*
([`env.ts`](../apps/api/src/config/env.ts)). Ref memakai endpoint gambar
tersendiri (`/v1/openai/images/generations` DeepInfra) dengan model dan harga
sendiri. Pilihannya: env terpisah (`IMAGE_BASE_URL`, `IMAGE_MODEL`,
`IMAGE_ENABLED`) seperti ref, atau memakai model chat yang bisa mengembalikan
gambar. Yang pertama lebih jujur terhadap arsitektur yang ada.

**(b) Berat dokumen.** Satu PNG 1024² sebagai base64 berada di kisaran ratusan
KB sampai ~2 MB, dan itu masuk ke HTML blok, lalu ke baris dokumen di basis
data, lalu ke riwayat versi, lalu ke setiap ekspor. Dua slot per lembar berarti
satu flyer bisa berbobot beberapa MB. Ref mengukur PDF-nya di 0,44 MB/halaman.
Perlu diputuskan: batas ukuran gambar, dan apakah aset disimpan juga di layanan
`assets` untuk dipakai ulang (blok tetap memakai `data:` URI — lihat §4.1).

**(c) Titik pasang di jalur chat.** Di jalur draf mudah: penyelesai berjalan di
server, sesudah `design-repair`, sebelum HTML-nya disimpan. Di jalur chat tidak:
`insert_html_block` adalah tool call yang dieksekusi di sisi editor, jadi HTML-nya
tidak pernah melewati server dalam bentuk jadi. Berarti perlu satu titik akhir
baru (`POST /api/v1/design/illustrate`) yang dipanggil web sebelum blok
disisipkan — dan penulisnya akan menunggu beberapa detik lagi di depan antrean
persetujuan tool. Ini bagian paling mahal dari K3 dan pantas ditimbang ulang
sebelum dikerjakan.

## 5. Berkas yang akan tersentuh

| Berkas | Sifat | Isi |
|---|---|---|
| `apps/api/src/services/design/rich.ts` | baru | `wantsRichDesign()` + `RICH_DESIGN_PROMPT` |
| [`chat/messages.ts`](../apps/api/src/services/chat/messages.ts) | sunting | deteksi pada pesan user terakhir, teruskan ke `buildSystemPrompt` |
| [`chat/prompts.ts`](../apps/api/src/services/chat/prompts.ts) | sunting | medan `rich` di `SystemPromptInput`, satu baris di perakit |
| [`drafts/prompt.ts`](../apps/api/src/services/drafts/prompt.ts) | sunting | sisipkan tema 2 di cabang `kind === 'flyer'` dan di `DRAFT_AUTO_CLAUSE` |
| `apps/api/src/services/design/illustrate.ts` | baru (K3) | temukan slot, rencanakan raster/SVG, isi |
| `apps/api/src/lib/image-client.ts` | baru (K3) | klien text-to-image |
| [`config/env.ts`](../apps/api/src/config/env.ts) | sunting (K3) | `IMAGE_*` |
| `apps/api/src/routes/v1/design.route.ts` | baru (K3) | titik akhir untuk jalur chat (§4.4c) |

Satu catatan penataan: `rich.ts` sengaja tidak diletakkan di dalam `drafts/`
maupun `chat/`. Keduanya memakainya, dan komentar di kepala
[`drafts/prompt.ts`](../apps/api/src/services/drafts/prompt.ts) sudah menyatakan
alasannya untuk kasus serupa — dua salinan prompt yang sama pelan-pelan menjadi
berbeda.

## 6. Risiko

- **Tema 2 bocor ke tema 1.** Ditahan oleh presedensi `PLAIN` dan oleh panduan
  yang ditulis bersyarat. Yang perlu dijaga: daftar kata kunci jangan tumbuh
  menampung kata umum seperti "bagus" atau "keren".
- **Token dinyatakan lalu diabaikan.** Model bisa saja menulis `:root{}` yang
  rapi lalu tetap menaburkan hex acak di bawahnya. Ini bisa **diukur** tanpa
  memperbaikinya: hitung hex literal di luar blok `:root`. Kalau angkanya
  tinggi, prompt-nya yang salah, bukan modelnya.
- **Raster merusak alih-alih memperbaiki.** Sudah diantisipasi §4.3, tapi hanya
  percobaan nyata yang bisa memutuskannya. Saran: `IMAGE_ENABLED` dimatikan
  secara bawaan sampai ada hasil yang dilihat mata sendiri.
- **Dokumen membengkak.** §4.4b.

## 7. Di luar cakupan

T2, T3, T4 dan sisanya di [DRAFTS-API-FINDINGS.md](DRAFTS-API-FINDINGS.md)
(keputusan K4). Illustrator SVG terpisah, `bookspec`, multi-halaman, sanitizer,
dan CSS scoper — semuanya pipeline, di luar K1. Tone AI Chat yang sekarang tidak
diubah sama sekali.
