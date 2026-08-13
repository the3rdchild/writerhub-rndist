# Rencana kerja dua jalur — P1…P12

Pendamping `docs/COLUMNS-PROOFREADER-TOOLS-PRD.md`. Disusun 13 Agustus 2026 · baseline `d033114`.

Dokumen ini **tidak** mengulang spesifikasi. Ia menjawab satu pertanyaan saja: *siapa menyentuh
berkas yang mana, kapan, supaya dua orang tidak bertabrakan.* Isi pekerjaannya selalu dibaca dari
PRD — tiap tugas di bawah menyebut nomor bagiannya.

---

## 1. Dasar pembagian

Pembagian dibuat menurut **kepemilikan berkas**, bukan menurut ukuran atau minat. Aturannya satu:

> Sebuah berkas hanya boleh diubah oleh satu jalur. Kalau dua jalur butuh berkas yang sama, ia
> masuk daftar **berkas bersama** (§4) dan ada aturan urutannya.

Dua jalur itu jatuh nyaris tepat pada batas arsitektur yang sudah ada di repo:

| Jalur | Nama | Wilayah | Butir PRD |
|---|---|---|---|
| **A** | **Tata letak** | Mesin ProseMirror: paginasi, kolom, geometri lembar, penggaris, kanvas | P4, P5, P6, P8, P9 |
| **B** | **Panel & pipeline** | Panel analisis, reducer dokumen, API job, worker Python | P1, P2, P3, P7, P10, P11, P12 |

Batas itu nyata, bukan dibuat-buat: jalur A hidup di `features/editor/*` dan
`components/editor/*`, jalur B di `components/panels/*`, `features/document/*`,
`features/analysis/*`, `apps/api/*`, dan `services/worker/*`. Keduanya hanya berpapasan di lima
berkas, dan kelimanya sudah dijadwalkan agar tidak bersamaan.

**Beban.** Jalur A ±15 hari kerja, jalur B ±11 hari. Selisihnya sengaja: begitu jalur B selesai
(sekitar hari ke-11), ia bergabung ke P8/P9 lewat sub-pembagian di §6 — bagian permukaan (dialog,
menu, tools AI, ekspor DOCX) yang memang tidak menyentuh mesin tata letak.

---

## 2. Jalur A — Tata letak

**Berkas milik jalur A (jangan disentuh jalur B):**

```
apps/web/features/editor/columns.ts
apps/web/features/editor/columns.test.ts
apps/web/features/editor/pagination.ts
apps/web/features/editor/pagination.test.ts
apps/web/features/editor/page-geometry.ts
apps/web/features/editor/ruler-targets.ts
apps/web/features/editor/ruler-drag.ts
apps/web/features/editor/use-page-setup.ts
apps/web/features/editor/page-break.ts
apps/web/features/editor/section-break.ts          (baru, P8/P9)
apps/web/components/editor/document-canvas.tsx
apps/web/components/editor/document-ruler.tsx
apps/web/components/editor/document-left-ruler.tsx
apps/web/components/settings/page-setup-dialog.tsx
apps/web/app/globals.css
ref/**                                              (P6)
```

| # | Tugas | Baca PRD | Ukuran | Prasyarat |
|---|---|---|---|---|
| **A-1** | Kolom: tidak ada blok yang tertimpa (lapis 1) + uji invarian anti-tumpang-tindih | §P4 → *Lapis 1* & *Kriteria terima* | ½ hari | — |
| **A-2** | Kolom: perbaiki pembacaan margin pada node view (tabel, blok kode, gambar, TOC) | §P4 → *Catatan pengukuran* | ½ hari | A-1 |
| **A-3** | Kolom: tabel dipenggal antar baris di dalam kolom (lapis 2) | §P4 → *Lapis 2* | 2–3 hari | A-1 |
| **A-4** | Kolom: blok tak terpenggal naik jadi selebar penuh (lapis 3) | §P4 → *Lapis 3*, §2.10 | 1 hari | A-3 |
| **A-5** | Baca referensi, catat temuan di PR | §P6 | ½ hari | — (bisa disisipkan kapan saja) |
| **A-6** | Penggaris: penanda lebar & celah kolom | §P5 | 2 hari | A-1 |
| **A-7** | Model *section*: `SheetGeometry[]`, node `sectionBreak`, paginasi tak seragam, kanvas | §P8&P9 → *Kenapa ini besar*, *Keputusan* | 5 hari | A-4 |
| **A-8** | Kolom per-halaman di atas model section | §P8&P9 → *P8* | 1 hari | A-7 |

**Urutan wajib:** A-1 → A-3 → A-4 → A-7. A-2, A-5, A-6 boleh disisipkan di sela.

**Titik henti aman.** Setelah A-1 gejala paling terlihat sudah hilang; setelah A-4 kolom sudah
layak pakai. Kalau harus berhenti, berhentilah di salah satu dari dua titik itu — bukan di tengah
A-3 atau A-7.

---

## 3. Jalur B — Panel & pipeline

**Berkas milik jalur B (jangan disentuh jalur A):**

```
apps/web/features/editor/apply-text.ts             ← satu-satunya berkas features/editor milik B
apps/web/features/document/document-reducer.ts
apps/web/features/document/suggestions.ts
apps/web/features/document/language.ts
apps/web/features/analysis/use-analysis.ts
apps/web/features/analysis/use-pending-changes.ts
apps/web/features/grammar/use-grammar-check.ts
apps/web/features/grammar/api.ts
apps/web/features/memory/memory-tab.tsx
apps/web/components/panels/**                       (seluruh isinya)
apps/web/components/ui/flag.tsx                     (baru, P1)
apps/web/public/flags/**                            (baru, P1)
apps/web/lib/sse.ts
packages/shared/src/job.ts
packages/shared/src/analysis.ts
apps/api/src/**
services/worker/**
```

| # | Tugas | Baca PRD | Ukuran | Prasyarat |
|---|---|---|---|---|
| **B-1** | `replaceTextRange` pakai `resolveSpan`, hentikan gulir otomatis | §P10 | ¼ hari | — |
| **B-2** | Proofreader: accept dari popover menyasar kemunculan yang benar | §P3.1 | ¼ hari | B-1 |
| **B-3** | Proofreader: accept dari kartu panel benar-benar mengubah naskah | §P3.2 | ¼ hari | B-1 |
| **B-4** | Proofreader: aksi `clearResults` + tombol "Clear results" | §P3.3 | ½ hari | — |
| **B-5** | Bendera di tiga pemilih bahasa | §P1, §2.6, §15.2 | ½ hari | — |
| **B-6** | Glosarium: jenis kandidat sampai ke panel + keterangan asalnya | §P2 | ¾ hari | — |
| **B-7** | Batal lapis A: `cancel()` di hook, `RunButton` dua keadaan | §P7 → *Lapis A* | 1 hari | — |
| **B-8** | Batal lapis B: status `cancelled`, rute batal, bendera Redis, migrasi | §P7 → *Lapis B*, §2.8 | 1–2 hari | B-7 |
| **B-9** | Batal lapis C: titik periksa kooperatif di worker | §P7 → *Lapis C* | 1–2 hari | B-8 |
| **B-10** | Worker: `JOB_DEADLINE_SECONDS` + `WORKER_CONCURRENCY` dari env | §P11, §2.9 | 1–2 hari | — |
| **B-11** | Konsistensi panel: "Clear results" di semua panel, `canRun` per-cakupan, `isStale` pada Accept All | §P12 butir 2–4 | 1 hari | B-4, B-7 |
| **B-12** | Seragamkan bahasa UI ke Inggris | §P12 butir 1, §2.7 | 1½ hari | **paling akhir** |

**Urutan wajib:** B-1 → B-2/B-3. B-7 → B-8 → B-9. B-12 **selalu terakhir di jalur B**, karena ia
menyentuh hampir semua berkas panel dan akan menabrak PR mana pun yang belum masuk.

**Titik henti aman.** Setelah B-4 seluruh keluhan Proofreader di tiket sudah terjawab.

---

## 4. Berkas bersama — lima titik singgung

Hanya lima berkas yang benar-benar dibutuhkan kedua jalur. Semuanya punya aturan.

| Berkas | Jalur A butuh untuk | Jalur B butuh untuk | Aturan |
|---|---|---|---|
| `apps/web/components/editor/tiptap-editor.tsx` | A-7: kirim `sheets[]` ke plugin paginasi (baris ±113) | B-2: `applySuggestion` (baris ±242) | Terpisah 130 baris **dan** terpisah waktu: B-2 selesai di hari ke-1, A-7 mulai setelah hari ke-4. **B duluan.** |
| `apps/web/components/layout/menu-bar.tsx` | A-8: submenu Kolom bertambah cakupan | B-12: terjemahkan label | **A duluan**; B-12 memang dijadwalkan paling akhir |
| `packages/shared/src/tools.ts` | A-8/A-7: `set_section_columns`, `set_section_setup` | — | Milik A. Kalau B perlu menambah alat, minta A yang menulis |
| `apps/web/features/chat/tools.ts` | A-8/A-7: handler alat baru | — | Milik A |
| `apps/web/features/document/export-docx.ts` | A-7: satu `Section` per section | — | Milik A (lihat §6 kalau B ikut membantu) |

Berkas yang **terlihat** bersama tapi sebenarnya tidak:

- `apps/web/app/globals.css` — hanya A. Jalur B memakai kelas Tailwind di komponen; kalau B
  merasa perlu menulis CSS global, itu tanda rancangannya perlu ditinjau ulang.
- `apps/web/components/panels/panel-parts.tsx` — hanya B (`RunButton`, `AcceptAllButton`).
- `apps/web/features/editor/*` — milik A, **kecuali** `apply-text.ts` yang milik B. Satu
  pengecualian ini murni sejarah: berkas itu melayani panel, bukan editor.

---

## 5. Cara bekerja

**Cabang.** `feat/a-<nomor>-<slug>` dan `feat/b-<nomor>-<slug>`, mis. `feat/a-1-columns-overlap`,
`feat/b-1-replace-text-range`. Semua bercabang dari `main`, bukan dari cabang jalur lain.

**Satu PR = satu baris tabel.** Tugas di §2 dan §3 sudah dipecah supaya tiap barisnya muat dalam
satu PR yang bisa ditinjau dalam sekali duduk. A-3 dan A-7 adalah pengecualian yang boleh dipecah
lagi; kalau dipecah, `columns.ts` tetap dipegang satu orang sampai selesai.

**Isi PR wajib menyebut nomor bagian PRD** yang ia kerjakan, mis. `Implements §P4 lapis 1`.
Peninjau membaca bagian itu, bukan menebak dari diff.

**Uji.** `bun run test && bun run typecheck` hijau sebelum minta tinjauan. Jalur A wajib
menambah kasus di `columns.test.ts` / `pagination.test.ts`; jalur B di berkas uji sebelah kode
yang diubah. Daftar apa yang harus diuji ada di §14 PRD.

**Rebase, bukan merge.** Cabang yang tertinggal di-*rebase* ke `main`. Dengan pembagian berkas di
atas, rebase hampir selalu bersih; kalau ada konflik, itu tanda batas §4 dilanggar dan perlu
dibicarakan, bukan diselesaikan diam-diam di editor.

**Kalau butuh berkas milik jalur lain:** jangan mengubahnya. Minta pemiliknya, atau tunda tugas
itu. Satu perkecualian: menambah baris di berkas daftar murni (mis. menambah entri ke sebuah
konstanta) boleh, asal disebut di deskripsi PR.

---

## 6. Setelah jalur B selesai (±hari ke-11)

Jalur B bergabung ke P8/P9. Sub-pembagiannya mengikuti kontrak yang sudah dibekukan oleh A-7:

| Bagian | Pemilik | Isi |
|---|---|---|
| **Mesin** | A | `SheetGeometry[]`, `sectionBreak`, `computeSpacers` tak seragam, `document-canvas.tsx`, `flowColumns` per section |
| **Permukaan** | B | Dialog Penyiapan halaman (*Apply to* ketiga), submenu Kolom, `set_section_setup` / `set_section_columns` di `packages/shared/src/tools.ts` + handler di `features/chat/tools.ts`, ekspor DOCX multi-`sectPr` |

**Syarat mulai:** A sudah menggabungkan (merge) tipe `SheetGeometry` dan atribut
`sectionBreak` ke `main`, walau implementasinya belum lengkap. Bentuk data itulah kontraknya;
selama ia belum ada di `main`, bagian permukaan tidak boleh dimulai — persis alasan kenapa
`packages/shared/src/tools.ts` didaftarkan sebagai milik A di §4.

---

## 7. Ringkasan urutan

```
hari   1    2    3    4    5    6    7    8    9   10   11   12   13   14   15   16
A      A-1  A-2  A-3────────────  A-4  A-6──────  A-7──────────────────────  A-8
B      B-1  B-2  B-4  B-5  B-6──  B-7  B-8─────  B-9────  B-10───  B-11 B-12  │
       B-3                                                                     └→ B ikut §6
```

Tidak ada satu pun hari di mana kedua jalur memegang berkas yang sama.

---

## 8. Catatan pasca-merge — utang yang diketahui

Kedua jalur digabungkan ke `main` pada 13 Agustus 2026. Uji-merge lebih dulu dijalankan di
worktree terpisah: **nol konflik**, dan dari 13 berkas jalur A + 50 berkas jalur B hanya satu
yang bersinggungan — `apps/web/components/editor/tiptap-editor.tsx`, persis berkas yang
diperkirakan §4. Verifikasi setelah merge: `bun run typecheck` bersih di ketiga workspace,
`bun run test` 366 lulus, `pytest` worker 11 lulus.

Yang **belum** selesai dan sengaja dibiarkan masuk apa adanya:

1. ~~**P8/P9 baru mesinnya.**~~ **Sebagian besar selesai** lewat C-1…C-3 (§9):
   - ✅ dialog Penyiapan halaman punya *This point forward* dan *This page only*;
   - ✅ `set_page_setup` / `set_columns` punya `scope: from_here|this_page`, plus alat baru
     `insert_section_break`;
   - ✅ `export-docx.ts` menulis satu `sectPr` per section, lengkap dengan `w:cols`;
   - ⬜ submenu Kolom di `menu-bar.tsx` belum punya pilihan cakupan — jalannya sudah ada lewat
     dialog dan AI Chat, jadi ini kenyamanan, bukan penghalang;
   - ⬜ **impor** DOCX belum membaca `sectPr` (butir (d) yang ditunda): dokumen Word
     berorientasi campur tetap rata jadi satu section saat diimpor.

2. **`POST /jobs/:jobId/cancel` tanpa cek kepemilikan.** Rute sudah di balik `authMiddleware`,
   tapi siapa pun yang login bisa membatalkan job orang lain kalau tahu jobId-nya.
   **Diterima apa adanya**: risikonya rendah karena jobId berupa UUID acak, dan
   `routes/v1/stream.route.ts` memang sudah bersandar pada ketidakterkaan UUID yang sama.
   Kalau model ancamannya berubah, di sinilah cek pemilik ditambahkan.

3. **Migrasi `0010` harus jalan sebelum API baru dinaikkan.** Ia menambah nilai `'cancelled'` ke
   enum `pool_request_status`. API yang sudah menulis status itu ke basis data yang belum
   dimigrasi akan gagal. Aman di PostgreSQL 16 (yang dipakai `docker-compose.yml`) karena
   `ALTER TYPE … ADD VALUE` boleh di dalam transaksi sejak PG 12, dan migrasi ini tidak memakai
   nilainya di transaksi yang sama.

4. **Dependensi baru `country-flag-icons`.** `bun install` wajib di tiap mesin dan di image
   Docker sebelum menjalankan web.

5. ~~**`pytest` tidak ada di `services/worker/requirements.txt`.**~~ **Selesai** — dipisah ke
   `services/worker/requirements-dev.txt` (pytest + ruff), dengan cara menjalankannya dicatat di
   README §Perintah. Sengaja tidak digabung ke `requirements.txt` supaya image produksi tetap
   ramping.

6. **`JOB_DEADLINE_SECONDS=300` dan `WORKER_CONCURRENCY=2` masih tebakan (§2.9 PRD).** Belum
   diukur pada naskah 50 ribu karakter tier AI.

7. **`main` belum di-push.** Cabang `feat/a-*` dan `feat/jalur-b` sengaja dipertahankan sebagai
   bukti perubahan, tidak dihapus.

---

## 9. §6 — permukaan section (C-1…C-3)

Dikerjakan langsung di `main` setelah merge, satu commit per bagian. Butir (d), impor `sectPr`
DOCX, sengaja dilewati.

| # | Isi | Commit |
|---|---|---|
| **C-1** | Cakupan *This point forward* & *This page only* di dialog Penyiapan halaman | `adf1ac9` |
| **C-2** | `scope: from_here\|this_page` pada `set_page_setup`/`set_columns` + `insert_section_break` | `b9b03b1` |
| **C-3** | Ekspor DOCX multi-`sectPr`, termasuk `w:cols` | commit ini |

Tiga hal yang ditemukan saat mengerjakannya dan layak diingat:

1. **Nomor halaman hanya bisa datang dari hasil paginasi.** Ia tidak tersimpan di naskah, jadi
   `computeSpacers` kini juga mengembalikan peta blok tingkat atas → lembar tempat ia MULAI
   (`BlockPage`). Blok yang menyeberang batas tercatat sekali saja, di lembar tempat ia bermula,
   supaya "halaman ini" tidak pernah memotong satu blok jadi dua section.

2. **Pembatas penutup harus membawa setelan sebelumnya SELENGKAPNYA.** Section mewarisi section
   sebelumnya, bukan setelan dasar - penutup yang hanya membatalkan `orientation` meninggalkan
   ukuran kertasnya menetap sampai ujung naskah. Ada uji yang mengunci ini
   (`section-break.test.ts`), sengaja berikut kasus "selisih saja tidak cukup" supaya alasannya
   ikut terbaca.

3. **`docx` menukar sendiri lebar↔tinggi saat `orientation: 'landscape'`** (lihat
   `createPageSize` di pustakanya). `pageGeometry` juga menukar - untuk layar - jadi mengirim
   angka yang sudah tertukar menghasilkan lembar yang kembali tegak. Ekspor karena itu mengirim
   ukuran TEGAK plus `w:orient`. Ini ditemukan hanya karena ujinya membongkar `.docx` dan
   membaca `word/document.xml`; memeriksa "berkasnya jadi" tidak akan pernah menangkapnya.

**Verifikasi visual masih terbuka.** Tidak ada pengolah kata di mesin pengembangan, jadi yang
diperiksa di sini bentuk XML-nya. Berkas contoh tiga section (potret → lanskap bertabel →
potret dua kolom) dibuat lewat uji `export-docx.test.ts`; buka di Google Docs untuk memastikan
tampilannya.

**Hasil pemeriksaan pemakai (14 Agustus 2026):** ekspor DOCX dengan satu halaman lanskap
**benar**. Yang masih rusak - ekspor PDF dan halaman kosong pada blok 3 kolom - pindah ke
`docs/EXPORT-COLUMNS-PRD.md` (E1–E4) beserta penyebabnya yang sudah ditelusuri.
