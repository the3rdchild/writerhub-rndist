# Aturan Kerja Agen AI — WritingHub

Status: **Aturan tetap** · Disusun 25 Agustus 2026 · Baseline kode `66dfe5e` (branch `main`)

Dokumen ini berlaku untuk **setiap agen AI** yang menulis kode di repo ini, kapan pun, sesi
mana pun. Ia bukan catatan satu tugas.

Kalau sebuah instruksi di sini bertabrakan dengan kebiasaan bawaanmu, **yang di sini yang
menang**. Kalau ia bertabrakan dengan permintaan langsung pengguna, pengguna yang menang —
tapi sebut bahwa aturannya dilanggar supaya keputusan itu sadar.

---

## 1. Baca ini dulu

Sebelum menulis baris pertama, baca yang relevan dengan tugasmu. Jangan menyimpulkan
arsitektur dari membaca beberapa berkas.

| Kalau tugasmu soal… | Baca |
|---|---|
| Apa pun | `README.md`, `docs/design.md` |
| Menambah atau memindahkan kode | `docs/coding_standard.md` — **wajib** |
| Fitur produk & prioritas | `docs/prd.md`, `docs/WRITERHUB-POC-STATUS.md` |
| Editor: kolom, paginasi, section | `docs/COLUMNS-PROOFREADER-TOOLS-PRD.md`, `docs/EDITOR-AI-UPGRADE-PRD.md` |
| Ekspor / cetak | `docs/EXPORT-COLUMNS-PRD.md` |
| Tab & pemodelan dokumen | `docs/DOCUMENT-TABS-RESTRUCTURE-PLAN.md` |
| Version history | `docs/VERSION-HISTORY-PLAN.md` |
| History, Projects, Memory | `docs/HISTORY-PROJECTS-MEMORY-PLAN.md` |
| Glosarium | `docs/GLOSSARY-MAKER-PLAN.md` |
| Bekerja paralel dengan agen lain | `docs/WORKPLAN-P1-P12-DUA-JALUR.md` |

Hampir setiap area fitur **sudah punya PRD atau rencana tertulis**. Menulis rancangan baru
untuk sesuatu yang sudah dirancang adalah pemborosan dan sumber dokumen yang saling
bertentangan. Cari dulu.

---

## 2. Yang tidak bisa ditawar

### 2.1 Tanggung jawab tunggal

**Setiap berkas punya satu alasan untuk ada.** Saat menambah fungsi atau method, ia harus
melayani hal yang berkas itu memang tentangnya. Kalau kamu tidak bisa menjelaskan sebuah
berkas tanpa mengucap "dan", ia mengerjakan dua urusan.

Ini aturan terpenting di repo ini dan punya dokumennya sendiri: **`docs/coding_standard.md`**.
Yang perlu diingat di sini:

- **Ukuran tidak pernah jadi temuan.** Berkas 1.400 baris yang seluruhnya satu urusan itu
  benar. Yang dihitung jumlah urusan, bukan jumlah baris.
- **Jangan pernah membuat `utils.ts`, `helpers.py`, `misc.*`, atau `common.*`.** Nama itu
  tidak menjelaskan tanggung jawab apa pun, jadi tidak ada isi yang bisa dinilai salah tempat.
- **Menemukan pelanggaran bukan izin untuk merapikannya.** Laporkan, biar pengguna yang
  memutuskan — kecuali ia memang meminta perbaikannya.

### 2.2 Jangan merusak model keamanan

- `PP_API_KEY` **tidak boleh sampai ke browser**. Ia hanya boleh disentuh
  `apps/web/lib/server/upstream.ts` dan route handler di `apps/web/app/api/*`.
- `API_URL` adalah variabel **sisi server**. Kalau kamu tergoda mengubahnya jadi
  `NEXT_PUBLIC_API_URL` untuk memperbaiki sebuah error, berhenti — itu "memperbaiki" gejala
  dengan membocorkan seluruh rancangan.
- Browser tidak pernah memanggil `apps/api` langsung. Selalu lewat route same-origin `/api/*`.
- **Jangan menghapus cabang kode `AUTH_MODE=pp`** karena "tidak terpakai di lokal". Jalur
  produksi sengaja dipertahankan utuh saat mode `none`.

### 2.3 Jangan mengarang status

Kalau uji gagal, katakan gagal dan tunjukkan keluarannya. Kalau sebuah langkah dilewati,
katakan dilewati. Jangan menyebut sesuatu "selesai" atau "terverifikasi" kalau kamu belum
menjalankannya. Repo ini punya riwayat panjang dokumen status yang akurat — jangan jadi yang
pertama mengotorinya.

---

## 3. Aturan khusus repo ini

Hal-hal yang sudah pernah memakan korban. Tiap butir di sini adalah kesalahan nyata yang
pernah terjadi, bukan kehati-hatian teoretis.

1. **Naskah hanya berubah lewat transaction ProseMirror.** Memanipulasi DOM editor langsung
   akan merusak undo/redo lintas modul — dan rusaknya baru kelihatan saat pengguna menekan
   Ctrl+Z, jauh setelah PR-mu masuk.

2. **Temuan analisis adalah `Decoration`, bukan mark pada naskah.** Menyimpannya sebagai mark
   akan mengotori ekspor dan version history.

3. **Ukur di plugin, hitung di fungsi murni yang diekspor, gambar dengan decoration.** Ini pola
   yang sudah dipakai `flowColumns` dan `computeSpacers`, dan keduanya punya uji karena itu.
   Geometri yang ditulis inline di dalam `.tsx` tidak bisa diuji — jangan tambah yang baru.

4. **`packages/shared` tidak dibaca Python.** Kontrak ke worker tidak dijamin compiler.
   Perubahan bentuk payload job **wajib** diubah di kedua sisi dalam satu PR yang sama.

5. **`ruff check --select F821` blocking sendiri, terpisah dari lint.** Nama yang tak pernah
   didefinisikan lolos dari `compileall`. Sebuah `except CancelledError:` tanpa importnya
   pernah lolos ke produksi begitu, mematikan seluruh Proofreader sekaligus menyembunyikan
   galat aslinya.

6. **Pustaka `docx` menukar sendiri lebar↔tinggi saat `orientation: 'landscape'`.**
   `pageGeometry` juga menukar. Mengirim angka yang sudah tertukar menghasilkan lembar yang
   kembali tegak. Ekspor karena itu mengirim ukuran **tegak** plus `w:orient`.

7. **Pembatas section penutup harus membawa setelan sebelumnya selengkapnya.** Section mewarisi
   section sebelumnya, bukan setelan dasar. Penutup yang hanya membatalkan `orientation`
   meninggalkan ukuran kertas menetap sampai ujung naskah. Ada uji yang mengunci ini di
   `section-break.test.ts`.

8. **Migrasi `0010` harus jalan sebelum API yang menulis status `'cancelled'` dinaikkan.**

9. **Verifikasi bentuk berkas ekspor, bukan keberadaannya.** Bug orientasi di butir 6 hanya
   ketahuan karena ujinya membongkar `.docx` dan membaca `word/document.xml`. Memeriksa
   "berkasnya jadi" tidak akan pernah menangkapnya.

---

## 4. Bekerja paralel dengan agen lain

Kalau lebih dari satu agen bekerja di repo ini bersamaan, **pakai pembagian menurut kepemilikan
berkas** — bukan menurut fitur, bukan menurut ukuran tugas. Rinciannya di
`docs/WORKPLAN-P1-P12-DUA-JALUR.md`.

| Jalur | Wilayah |
|---|---|
| **A — Tata letak** | `apps/web/features/editor/*`, `apps/web/components/editor/*` |
| **B — Panel & pipeline** | `apps/web/components/panels/*`, `apps/web/features/{document,analysis,grammar,memory}/*`, `apps/api/src/**`, `services/worker/**` |

Aturannya:

- **Sebuah berkas hanya boleh diubah oleh satu jalur.** Kalau dua jalur butuh berkas yang sama,
  ia berkas bersama dan urutannya harus disepakati lebih dulu.
- **Kalau butuh berkas milik jalur lain: jangan mengubahnya.** Minta pemiliknya, atau tunda
  tugas itu. Satu perkecualian: menambah baris ke berkas daftar murni (mis. entri baru di
  sebuah konstanta) boleh, asal disebut di deskripsi PR.
- **Tiap agen bekerja di worktree terpisah**, bukan langsung di direktori kerja utama.
- Konflik rebase adalah **tanda batas kepemilikan dilanggar**, bukan sesuatu yang diselesaikan
  diam-diam di editor. Laporkan.

Perhatikan hubungannya dengan §2.1: pembagian ini hanya jalan kalau berkasnya memang punya
tanggung jawab tunggal. Berkas serba-guna tidak bisa dimiliki satu jalur.

---

## 5. Cabang, commit, dan PR

**Cabang.** `feat/<jalur>-<nomor>-<slug>`, mis. `feat/a-1-columns-overlap`,
`feat/b-7-cancel-layer-a`. Selalu bercabang dari `main`, tidak pernah dari cabang jalur lain.

**Commit.** Conventional Commits: `feat:`, `fix:`, `docs:`, `style:`, `chore:`, dengan scope
opsional — `fix(editor): …`, `feat(analysis): …`. Subjek boleh bahasa Indonesia atau Inggris,
ikuti yang sudah ada di sekitarnya.

**Jangan pernah menambahkan trailer `Co-Authored-By: Claude …`** atau penyebutan kepengarangan
AI apa pun di pesan commit maupun deskripsi PR.

**Satu PR = satu satuan kerja yang bisa ditinjau sekali duduk.**

**Deskripsi PR wajib menyebut nomor bagian PRD atau nomor user story** yang ia kerjakan, mis.
`Implements §P4 lapis 1` atau `US-27`. Peninjau membaca bagian itu, bukan menebak dari diff.

**Pemindahan kode adalah commit-nya sendiri.** Kalau kamu memecah berkas demi tanggung jawab
tunggal, pindahkan kode **tanpa mengubah perilaku**, dan pisahkan dari commit yang mengubah
perilaku — supaya peninjau bisa melihat bahwa itu murni pemindahan.

**Rebase, bukan merge**, untuk cabang yang tertinggal dari `main`.

---

## 6. Verifikasi

Jalankan ini sebelum menyatakan sesuatu selesai. Jangan melaporkan hijau tanpa menjalankannya.

TypeScript:

```bash
bun run typecheck && bun run test
```

Worker Python (dari `services/worker`, di dalam venv):

```bash
ruff check --select F821 . && pytest -q
```

**Perhatikan keterbatasannya — jangan salah membaca hijau:**

- **Tidak ada linter di sisi TypeScript.** Tidak ada ESLint, Prettier, maupun Biome. `tsc`
  menangkap kesalahan tipe, bukan kesalahan struktur. Impor tak terpakai dan berkas
  serba-guna lolos begitu saja. Standar di `coding_standard.md` ditegakkan lewat tinjauan,
  bukan otomatis.
- **`bun run test` tidak menguji API.** Seluruh uji TypeScript ada di `apps/web/features/**`.
  `apps/api` bahkan tidak punya skrip `test`, jadi perintah itu **terlihat hijau** padahal
  seluruh lapisan API tidak pernah dijalankan. Kalau kamu menyentuh `apps/api`, uji manual dan
  katakan begitu.
- **Lint & format Python masih advisory** di CI (`continue-on-error`), kecuali F821.

**Uji apa yang kamu tambahkan.** Jalur tata letak menambah kasus di `columns.test.ts` /
`pagination.test.ts`; jalur panel & pipeline di berkas uji sebelah kode yang diubah. Logika
murni yang baru diekstrak **harus** datang bersama ujinya — itu inti alasan mengekstraknya.

---

## 7. Bahasa

- **Dokumentasi, komentar, pesan commit, dan deskripsi PR: bahasa Indonesia.** Itu bahasa
  seluruh `docs/` dan riwayat commit repo ini. Ikuti.
- **Pengidentifikasi kode (nama variabel, fungsi, tipe, berkas): bahasa Inggris.**
- **Teks antarmuka:** ikuti yang sudah ada di komponen sekitarnya. Ada pekerjaan penyeragaman
  ke bahasa Inggris yang direncanakan (butir B-12) — jangan mendahuluinya sepotong-sepotong,
  karena ia menyentuh hampir semua berkas panel dan akan menabrak PR mana pun yang belum masuk.

---

## 8. Yang butuh persetujuan manusia

Jangan lakukan sendiri tanpa diminta:

- `git push`, membuka PR, atau menggabungkan apa pun ke `main`
- Menghapus atau menulis ulang berkas yang tidak diminta, termasuk `.md` milik orang lain
- Menambah dependensi baru (`bun add`, `pip install`) — sebutkan dulu alasannya
- Perubahan skema database atau migrasi baru
- Refactor besar yang tidak diminta, termasuk memperbaiki pelanggaran SRP yang kamu temukan
  sendiri
- Apa pun yang menyentuh `AUTH_MODE`, HMAC, atau penanganan token

Kalau ada pekerjaan agen yang selesai dan tidak ada konflik, push + buka PR **boleh** tanpa
bertanya lagi bila pengguna sudah memberi izin berdiri untuk itu. Menggabungkan PR tetap butuh
persetujuan terpisah — jangan pernah auto-merge.

---

## 9. Catatan kerja

Repo ini sudah punya banyak dokumen. **Jangan menambah berkas `.md` baru per sesi, per
handoff, atau per topik.** Perbarui dokumen yang sudah ada di tempatnya.

Kalau sebuah angka atau klaim berubah, **sunting pernyataan lamanya** — jangan menaruh
pernyataan tandingan di sebelahnya. Dokumen status yang saling bertentangan lebih buruk
daripada tidak ada dokumen sama sekali, karena angka usang akan menyebar ke tempat lain.

Berkas baru hanya kalau pengguna memintanya secara eksplisit.
