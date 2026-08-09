# Rencana Implementasi — Glosarium Maker (fitur L, Tier V2)

**PRD fitur L:** Glossary / terminology lock.
**Bentuk yang disepakati:** panel baru di tool rail yang membangun **daftar istilah akademik**
(istilah + definisi) dari naskah, dengan bantuan AI dan kurasi pengguna.

Ini menyimpang dari sketsa §3.L `docs/FEATURE-GAP-PRD.md` dalam satu hal penting: di sana L
digambarkan sebagai pelengkap File Translator (C) dan **bergantung padanya**. C ditunda, jadi
rencana ini membuat L **berdiri sendiri** — glosarium dipakai untuk dokumen dan modul AI yang
sudah ada, bukan untuk terjemahan. Saat C akhirnya digarap, ia tinggal ikut membaca tabel yang
sama.

## Keputusan yang sudah dikonfirmasi

1. **Entri = istilah + definisi** (glosarium akademik, seperti "Daftar Istilah" di skripsi).
   Bukan daftar varian terlarang.
2. **Pengisian = AI mengusulkan, pengguna mengurasi.** Analyzer baru di worker memindai naskah
   dan mengusulkan kandidat beserta definisi draf; pengguna menerima/menolak/menyunting.
3. **Lingkup = per dokumen, bisa diangkat ke proyek.**
4. **Kegunaan = dua:** (a) menyisipkan tabel glosarium ke dokumen, (b) mengunci istilah supaya
   tidak diubah modul AI.
   **Tidak termasuk:** pemeriksaan konsistensi di naskah, dan ekspor CSV/DOCX terpisah.

Keputusan 1 dan 4a sejalan: definisi ada untuk dibaca manusia dan dicetak. Keputusan 4b hanya
membutuhkan **string istilahnya saja** — persis bentuk yang sudah diterima
`style_memory.glossary` hari ini. Jadi definisi tidak perlu ikut ke prompt LLM.

---

## 1. Prasyarat & titik sambung yang sudah ada

| Yang dibutuhkan | Kondisi |
|---|---|
| Dokumen server-side + kepemilikan | ✅ fitur A+B |
| Projects (untuk "angkat ke proyek") | ✅ fitur G, `documents.project_id` |
| Mekanisme kunci istilah ke worker | ✅ fitur H, `style_memory.glossary` sudah mengalir ke Rewriter & Humanizer |
| `documentId` di request analisis | ✅ ditambahkan fitur F (`analysis/dto.ts:17`), sudah divalidasi kepemilikannya |
| Tabel di editor | ✅ `TableKit` aktif (`extensions.ts:75`) |
| Pola panel + analyzer | ✅ 4 analyzer + 7 panel yang sudah jalan |

**Satu yang belum ada dan akan terasa:** `ChatContext` (`packages/shared/src/chat.ts:22`) **tidak
membawa `documentId`**. Analisis sudah punya sejak fitur F, chat belum. Lihat §5.2.

---

## 2. Skema data

### Migrasi 0009

```sql
CREATE TABLE glossaries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    varchar(255) NOT NULL,
  document_id uuid REFERENCES documents(id) ON DELETE CASCADE,
  project_id  uuid REFERENCES projects(id)  ON DELETE CASCADE,
  entries     jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT glossaries_scope_ck CHECK (
    (document_id IS NOT NULL AND project_id IS NULL) OR
    (document_id IS NULL AND project_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX glossaries_document_idx ON glossaries (document_id) WHERE document_id IS NOT NULL;
CREATE UNIQUE INDEX glossaries_project_idx  ON glossaries (project_id)  WHERE project_id  IS NOT NULL;
```

- **Satu baris per dokumen atau per proyek**, entri di jsonb — bukan satu baris per istilah.
  Glosarium selalu dibaca dan ditulis utuh (panel menampilkan semuanya, prompt butuh semuanya),
  jadi tabel per-istilah hanya menambah query tanpa keuntungan. Pola yang sama dengan
  `user_memories` di fitur H.
- `CHECK` memastikan tiap baris melekat pada tepat satu lingkup. Tanpa itu, baris "yatim" atau
  "dua tuan" akan muncul dan tiap query harus berjaga sendiri.
- Dua unique index parsial: satu dokumen/proyek tidak boleh punya dua glosarium.
- `ON DELETE CASCADE` di kedua sisi: glosarium tidak punya arti tanpa induknya.

Bentuk satu entri (`packages/shared`):

```ts
export interface GlossaryEntry {
  term: string            // istilah, wajib
  definition: string      // definisi, wajib — ini inti glosarium akademik
  abbreviation?: string   // singkatan, mis. "AKD"
  foreign?: string        // padanan asing, mis. "principal component analysis"
  source?: 'ai' | 'manual' // dari usulan analyzer atau diketik sendiri
}
```

`source` bukan hiasan: ia yang memungkinkan panel menandai mana yang masih perlu ditinjau, dan
nanti mengukur seberapa sering usulan AI diterima.

---

## 3. Worker — analyzer `glossary`

### Kontrak

`packages/shared/src/analysis.ts`:

- `ANALYSIS_FEATURES` bertambah `'glossary'` (jadi 5).
- `GlossaryResult` masuk `AnalysisResultMap`:

```ts
export interface GlossaryResult {
  candidates: Array<{
    term: string
    definition: string
    abbreviation?: string
    foreign?: string
    /** Berapa kali istilah ini muncul di naskah — bahan urut & keyakinan. */
    occurrences: number
  }>
}
```

Perhatikan: hasilnya **tidak** memakai `TextRange`. Empat analyzer yang ada mengembalikan rentang
untuk disorot di editor; glosarium tidak menyorot apa pun, ia menghasilkan daftar. Karena itu ia
juga tidak menyentuh highlight layer maupun `shift-result.ts`.

### Analyzer

`services/worker/services/analyzers/glossary.py`, didaftarkan di `_ANALYZERS`
(`analysis_service.py:27`). Satu panggilan LLM lewat `llm_client`, prompt meminta:

- istilah teknis/khusus domain yang layak masuk daftar istilah,
- definisi ringkas **dalam bahasa naskah** (`language_name()` sudah tersedia),
- singkatan dan padanan asing bila ada di naskah,
- **melewatkan kata umum** — ini bagian yang paling menentukan kualitas hasil.

Batas wajar: maksimum ~40 kandidat per panggilan. Naskah panjang dipotong seperti analyzer lain.

Fallback tanpa LLM harus sopan: kembalikan `candidates: []`, bukan galat. Pola ini sudah dipakai
`ai_rewriter` ("LLM tidak tersedia - teks dikembalikan apa adanya").

**Analyzer ini tidak menerima `style_memory`.** Ia mengekstrak, tidak menulis ulang. Percabangan
di `analysis_service.py:82` tetap hanya untuk rewriter & humanizer.

---

## 4. API

### Endpoint glosarium

| Method | Path | Guna |
|---|---|---|
| `GET` | `/api/v1/documents/:id/glossary` | Glosarium efektif dokumen (lihat penggabungan di bawah) |
| `PUT` | `/api/v1/documents/:id/glossary` | Simpan entri dokumen |
| `POST` | `/api/v1/documents/:id/glossary/promote` | Angkat entri dokumen ke proyek induknya |
| `GET` | `/api/v1/projects/:id/glossary` | Glosarium proyek |
| `PUT` | `/api/v1/projects/:id/glossary` | Sunting glosarium proyek |

Semua memverifikasi kepemilikan lebih dulu lewat `findDocumentById` / repository proyek — pola
`VersionsService.ownedDocument()`. Lapisan `repository/glossary.ts` sesuai mitigasi §5.4.

### Penggabungan dokumen + proyek

`GET /documents/:id/glossary` mengembalikan gabungan glosarium proyek dan dokumen, dengan
**entri dokumen menang** bila `term` sama (dibandingkan case-insensitive setelah trim).
Responsnya memisahkan asal supaya panel bisa menampilkannya berbeda:

```ts
{ own: GlossaryEntry[], inherited: GlossaryEntry[], effective: GlossaryEntry[] }
```

Tanpa `inherited` yang eksplisit, pengguna akan menyunting entri warisan dan bingung kenapa
perubahannya tidak tersimpan ke tempat yang ia kira.

`promote` memindahkan entri terpilih ke glosarium proyek lalu membuangnya dari dokumen — bukan
menyalin. Menyalin akan melahirkan dua sumber kebenaran yang langsung menyimpang.
Dokumen tanpa proyek → 400 dengan pesan yang menjelaskan, bukan diam-diam gagal.

---

## 5. Penguncian istilah di modul AI

### 5.1 Rewriter & Humanizer — jalur sudah ada

`AnalysisService.styleMemory()` (fitur H) sekarang mengembalikan preferensi user. Ia diperluas
menjadi `resolveStyleMemory(documentId)`:

```
memory   = findMemoryByOwner(userId)           // per user, sudah ada
glossary = glossary efektif documentId          // baru
style_memory.glossary = gabungan(memory.glossary, glossary.map(e => e.term))
```

Worker tidak berubah sama sekali — `style_memory_instruction()` di `llm_client.py` sudah
merangkai daftar istilah jadi "Never translate or alter these terms". Ini keuntungan langsung
dari keputusan H sebelumnya.

Yang perlu dijaga: **deduplikasi** (istilah bisa ada di dua tempat) dan **batas jumlah**. Prompt
dengan 300 istilah akan menenggelamkan instruksi lain; potong di ~100 istilah dengan urutan
dokumen dulu, lalu proyek, lalu user.

### 5.2 AI Chat — perlu satu penambahan kontrak

Chat tidak tahu dokumen mana yang sedang dibuka: `ChatContext` hanya membawa `selection`,
`surrounding`, `document`, dan `title`. Jadi glosarium per-dokumen tidak bisa diambil server-side
seperti pada analisis.

**Tambahkan `documentId?: string` ke `ChatBody`** (bukan ke `ChatContext` — ia identitas request,
bukan potongan naskah). Server memvalidasi kepemilikannya persis seperti
`createPoolRequest` (`job-submission.service.ts`), lalu menggabungkan glosarium ke `memoryPrompt()`.

Ini **tidak melanggar** prinsip fitur H ("klien tidak pernah mengirim preferensi"): yang dikirim
adalah *pengenal dokumen* yang divalidasi server, bukan isi preferensinya. Preferensi tetap dibaca
dari database. Bedanya perlu ditulis di komentar supaya tidak dibaca sebagai kemunduran.

Tab lokal-saja mengirim `undefined` → hanya glosarium tingkat user yang berlaku. Sama seperti F.

---

## 6. Frontend

### 6.1 Panel di tool rail

Menambah panel non-analisis maupun analisis sama-sama menyentuh empat tempat:

| Berkas | Perubahan |
|---|---|
| `features/analysis/panel-context.tsx:11` | `PanelId` ikut bertambah otomatis — `glossary` masuk lewat `AnalysisFeature` |
| `components/panels/panel-rail.tsx:16` | entri `{ id: 'glossary', icon: BookMarked, label: 'Glosarium' }` |
| `components/panels/panel-container.tsx` | `PANEL_TITLES` + cabang `PanelBody` |
| `components/panels/glossary-panel.tsx` | panel baru |

Rail jadi 8 panel. Karena `PanelId` diturunkan dari `AnalysisFeature`, menambah `'glossary'` ke
`ANALYSIS_FEATURES` otomatis membuat TypeScript menuntut cabang baru di `PANEL_TITLES` dan
`PanelBody` — kompilernya yang menjaga, tidak perlu diingat manual.

**Konsekuensi yang harus dicek:** `run_module` di `packages/shared/src/tools.ts:152` memakai enum
literal `['proofreader','ai_detector','ai_rewriter','humanizer','plagiarism']`. Ia **tidak**
otomatis ikut. Putuskan sadar: biarkan chat tidak bisa memicu glosarium (rekomendasi untuk
iterasi pertama — hasilnya butuh kurasi manusia, bukan sesuatu yang pantas dijalankan agen
diam-diam), atau tambahkan sekalian.

### 6.2 Isi panel

Tiga bagian dari atas ke bawah:

1. **Tombol "Usulkan istilah"** — menjalankan analyzer lewat `useAnalysis('glossary')`, dapat
   antrean + SSE gratis. Hormati scoping seleksi seperti modul lain (`RunScopeBar`).
2. **Kandidat AI** — kartu per kandidat: istilah, definisi draf yang bisa disunting inline,
   jumlah kemunculan, tombol Terima / Tolak. Pola visual `SuggestionCard`/`ChangeListPanel`.
   Kandidat yang istilahnya sudah ada di glosarium ditandai "sudah ada", tidak ditampilkan
   sebagai baru.
3. **Daftar glosarium** — entri tersimpan, terurut alfabetis, bisa disunting/dihapus, plus
   "+ Tambah manual". Entri warisan proyek ditampilkan dengan lencana "dari proyek" dan tidak
   bisa disunting dari sini (ada tautan ke glosarium proyek).

Di kaki panel: **"Sisipkan ke dokumen"** dan **"Angkat ke proyek"**.

### 6.3 Sisip tabel glosarium

Tombol menyisipkan tabel 2 kolom (Istilah | Definisi) di posisi kursor, memakai `TableKit` yang
sudah aktif. Kolom singkatan/padanan asing hanya ikut bila ada isinya — tabel dengan dua kolom
kosong lebih buruk daripada tanpa kolom itu.

Penyisipan lewat `editor.chain().insertContentAt(...)` dengan JSON ProseMirror, bukan HTML string
— pola yang sama dengan `apply-text.ts` dan tool `insert_content`.

**Menyisip ulang tidak menimpa tabel lama.** Mendeteksi dan mengganti "tabel glosarium yang dulu"
butuh penanda node dan penanganan kasus yang tidak sebanding untuk iterasi pertama. Cukup
sisipkan di kursor; kalau pengguna ingin memperbarui, ia menghapus yang lama sendiri. Sebutkan ini
di UI dalam satu kalimat, jangan biarkan ia mengejutkan.

### 6.4 Berkas baru

```
features/glossary/types.ts        GlossaryEntry, GlossaryResponse
features/glossary/api.ts          get/put/promote, dokumen & proyek
features/glossary/use-glossary.ts TanStack Query, pola use-versions.ts
features/glossary/insert-table.ts perakitan node tabel (fungsi murni → bisa diuji)
components/panels/glossary-panel.tsx
app/api/documents/[id]/glossary/route.ts + /promote/route.ts
app/api/projects/[id]/glossary/route.ts
```

---

## 7. Tahapan

| # | Isi | Selesai bila |
|---|---|---|
| **M1** | Skema + migrasi 0009 + repository + 5 endpoint + proxy | Diverifikasi lewat `fetch` langsung: simpan, baca gabungan dokumen+proyek, promote, dan tolak dokumen tanpa proyek |
| **M2** | Analyzer `glossary` + kontrak shared | `POST /analyze` dengan `feature=glossary` mengembalikan kandidat; tanpa LLM mengembalikan daftar kosong, bukan galat |
| **M3** | Panel di rail: daftar, CRUD manual, kandidat AI | Bisa mengusulkan, mengurasi, menyimpan |
| **M4** | Sisip tabel ke dokumen | Tabel muncul di kursor dengan kolom yang relevan saja |
| **M5** | Kunci istilah: `resolveStyleMemory` + `documentId` di ChatBody | Istilah glosarium ikut di payload job Rewriter/Humanizer dan di system prompt chat |
| **M6** | Angkat ke proyek | Entri pindah, bukan tersalin; dokumen lain di proyek ikut mewarisi |

M1 dan M2 tidak saling bergantung.

---

## 8. Verifikasi

1. `bun run typecheck` (3 paket) + `bun test`.
2. **Unit test** untuk `insert-table.ts` (fungsi murni: entri → node ProseMirror) dan penggabungan
   dokumen+proyek di sisi API — termasuk kasus istilah bertabrakan beda kapitalisasi.
3. `bun run db:generate` → migrasi 0009 → `db:migrate`.
4. Smoke E2E lewat proxy:
   - simpan glosarium dokumen → baca kembali;
   - glosarium proyek + dokumen → `effective` menang di dokumen, `inherited` terisi;
   - promote → entri hilang dari dokumen, muncul di proyek, dokumen lain ikut mewarisi;
   - glosarium dokumen milik user lain → 404;
   - hapus dokumen → glosariumnya ikut terhapus (cascade);
   - jalankan `ai_rewriter` pada dokumen berglosarium → `style_memory.glossary` di payload job
     memuat istilahnya (dicek di log worker, cara yang sama dipakai saat verifikasi fitur H).
5. Manual di browser: usulkan istilah pada naskah nyata, kurasi, sisipkan tabel.

---

## 9. Risiko

| Bagian | Risiko |
|---|---|
| Skema + endpoint + panel CRUD | **Rendah** — pola persis fitur G/H |
| Analyzer `glossary` | **Sedang** — kualitas hasil bergantung prompt; "mana yang layak jadi istilah" itu penilaian, bukan aturan. Rencanakan satu putaran penyetelan prompt dengan naskah nyata, jangan anggap selesai di percobaan pertama |
| Penggabungan dokumen+proyek | **Sedang** — aturan menang/kalah dan `inherited` yang tidak bisa disunting adalah tempat bug halus bersembunyi. Diuji unit, bukan hanya lewat UI |
| `documentId` di ChatBody | **Rendah-sedang** — menyentuh kontrak chat yang sudah stabil; wajib validasi kepemilikan seperti `createPoolRequest` |
| Sisip tabel | **Rendah** — `TableKit` sudah aktif dan terpakai |

## 10. Yang sengaja tidak dikerjakan

- **Pemeriksaan konsistensi di naskah** dan **ekspor CSV/DOCX** — tidak dipilih. Keduanya bisa
  ditambahkan di atas skema yang sama tanpa migrasi baru bila kelak dibutuhkan.
- **Varian terlarang per istilah** — konsekuensi dari memilih bentuk glosarium akademik. Kolom
  `entries` jsonb bisa menampungnya nanti tanpa mengubah tabel.
- **File Translator (C)** tetap ditunda. Saat digarap, analyzer translator tinggal membaca
  glosarium efektif lewat jalur yang sama dengan `resolveStyleMemory` — inilah bentuk asli
  fitur L di PRD, dan ia tidak memerlukan perubahan skema.
