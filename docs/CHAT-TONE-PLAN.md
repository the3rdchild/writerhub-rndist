# Tone di AI Chat — Riset & Rencana

Status: **Riset selesai — rencana, belum diimplementasi** · Disusun 30 Agustus 2026 ·
Baseline kode `5865d34` (branch `main`)

Dokumen ini menjawab keluhan tim dev: **hasil AI Chat (PDF/DOCX maupun isi dokumen baru)
monoton** — permintaan seperti "buatkan draf akademik tentang X" menghasilkan gaya umum yang
tidak terasa lebih akademik dari hasil bawaan.

---

## 1. Diagnosis

**Akar masalahnya ada di pipeline, bukan di model.** Tidak ada satu pun titik di jalur AI
Chat yang membawa register/gaya dari permintaan pengguna ke prompt sistem:

1. **System prompt tidak pernah menyebut gaya.** `apps/api/src/services/chat/prompts.ts` —
   `SYSTEM_PROMPT` dan `TOOL_GUIDANCE` mengatur bahasa balasan, format Markdown, dan tata
   cara tool, tetapi **nol instruksi register**. Satu-satunya saluran tone yang ada adalah
   `memoryPrompt(memory)` — preferensi tone **global yang tersimpan** (AI Memory), bukan
   tone per permintaan.
2. **Tool penulisan tidak punya slot gaya.** `create_tab` dan `insert_content` di
   `packages/shared/src/tools.ts` hanya menerima `title`/`markdown`/`position`. Saat model
   menulis konten dokumen lewat tool call, perhatiannya didominasi kepatuhan format
   (aturan Markdown di `TOOL_GUIDANCE` panjang dan keras); instruksi gaya di pesan pengguna
   tidak diperkuat di mana pun, jadi terdilusi tepat pada momen konten ditulis.
3. **Pola yang terbukti jalan sudah ada, tapi hanya di Paraphraser.** `REWRITE_TONES`
   (`packages/shared/src/analysis.ts`: academic/formal/casual/natural, masing-masing dengan
   `instruction` bahasa Inggris) divalidasi di `analysis/dto.ts`
   (`z.enum(REWRITE_TONE_IDS)`), dipetakan id → instruction di
   `apps/api/src/services/analysis/service.ts`, lalu disuntik sebagai `style_memory.tone`
   ke worker. Jalur ini terbukti mengubah register keluaran — ia hanya tidak pernah
   disambungkan ke AI Chat.

Jadi bukan "model mengabaikan instruksi gaya yang sudah disampaikan dengan benar" —
instruksinya memang **tidak pernah disampaikan lewat saluran yang model hormati** (system
prompt / parameter tool), hanya lewat pesan pengguna yang bersaing dengan belasan instruksi
format.

## 2. Opsi perbaikan

### a. Deteksi kata kunci → suntik ke system prompt

Pindai pesan pengguna ("akademik", "formal", "santai", …) di sisi API, lalu suntik instruksi
register otomatis.

- **Untung:** tanpa perubahan UI; langsung bekerja untuk frasa umum.
- **Rugi:** rapuh — daftar kata kunci dwibahasa tidak pernah lengkap, positif palsu
  ("buatkan paragraf yang mengkritik gaya formal") menyebabkan gaya yang tidak diminta,
  perilakunya tersembunyi dari pengguna dan sulit ditimpa, dan dua mekanisme (deteksi +
  memori) bisa saling menimpa tanpa bisa dijelaskan.

### b. Parameter eksplisit, reuse `REWRITE_TONES`

Dua titik eksplisit:

1. **`tone` di body chat** (`chatBodySchema`, divalidasi `z.enum(REWRITE_TONE_IDS)`) →
   disuntik ke system prompt sebagai instruksi register per permintaan, menang atas memori
   tersimpan. Ini jalur untuk UI picker maupun klien eksternal (lihat rencana endpoint
   dokumen eksternal untuk PPE AI Chat, PRD terpisah).
2. **Parameter `tone` opsional di tool `insert_content` / `create_tab`** — model sendiri
   yang mendeklarasikan register saat menulis konten. Berfungsi sebagai komitmen diri tepat
   di momen generasi (model menyatakan tone, lalu menulis dalam tone itu), tanpa butuh
   perubahan UI sama sekali.

- **Untung:** deterministik, bisa ditimpa, konsisten persis dengan pola Paraphraser yang
  sudah terbukti; tidak ada konsep tone baru yang diciptakan.
- **Rugi:** butir (1) butuh UI picker supaya terpakai penuh dari dalam aplikasi; butir (2)
  masih bergantung pada model membaca permintaan gaya di pesan pengguna — tapi kali ini
  didukung instruksi eksplisit di `TOOL_GUIDANCE`.

### c. Kombinasi keduanya

Parameter eksplisit sebagai jalur utama, deteksi kata kunci sebagai bawaan saat tidak ada
yang memilih.

- **Untung:** cakupan terluas.
- **Rugi:** mewarisi seluruh kerapuhan (a); dua mekanisme untuk satu masalah, dan aturan
  prioritasnya jadi urusan baru yang harus dipelihara.

## 3. Rekomendasi

**Opsi (b), tanpa deteksi kata kunci.** Ia menyambungkan konsep yang sudah terbukti ke AI
Chat alih-alih menciptakan sistem tone baru, dan setiap lapisnya bisa diverifikasi dengan
uji. Deteksi kata kunci (a) bisa ditambah belakangan kalau produk menginginkan nol-UI —
tapi sebagai pelengkap, bukan fondasi.

### Rencana implementasi tahap 1 (risiko rendah, belum dikerjakan)

- `packages/shared/src/tools.ts` — parameter `tone` opsional (enum `REWRITE_TONE_IDS`) di
  `insert_content` dan `create_tab`. Klien web mengabaikan argumen yang tidak dikenalnya,
  jadi ini aman tanpa perubahan `apps/web`.
- `apps/api/src/services/chat/dto.ts` — `tone` opsional di body chat.
- `apps/api/src/services/chat/prompts.ts` — `tonePrompt()` baru: instruksi register per
  permintaan yang disisipkan sesudah blok memori (menang atas tone tersimpan), plus satu
  baris di `TOOL_GUIDANCE` yang meminta model mendeklarasikan tone lewat parameter tool.
- `apps/api/src/services/chat/messages.ts` — meneruskan `body.tone` ke `buildSystemPrompt`.
- Uji baru di `apps/api/src/services/chat/prompts.test.ts` (injeksi register, ketiadaan
  paragraf hampa, prioritas atas memori).

### Tahap 2 (perlu keputusan UI)

- **Pemilih tone di panel chat** (`apps/web`): mengirim `tone` di body. Tanpa ini, jalur
  body hanya dipakai klien eksternal; di dalam aplikasi, tone mengandalkan parameter tool
  yang diisi model sendiri.
- **Endpoint eksternal PPE AI Chat** meneruskan `tone` dari satu permintaan "buatkan draf
  akademik" — kontraknya dirancang di PRD terpisah.
