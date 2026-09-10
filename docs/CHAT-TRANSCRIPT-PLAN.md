# Rencana Implementasi — Transkrip AI Chat

Status: **T1-T4 selesai** (T1-T2 di `72c495f`, T3-T4 belum di-commit) · Disusun 10 September 2026 ·
Baseline kode `59be07c` (branch `feat/agent-skills`)

Dokumen terkait: `docs/CHAT-SUBAGENT-PLAN.md` (T2 adalah prasyaratnya — lihat §7),
`docs/DIAGRAM-DESIGN-PLAN.md`.

---

## 1. Masalah yang dipecahkan

Dua keluhan yang terdengar seperti satu, padahal penyebabnya berbeda dan tidak
saling bergantung.

**Pertama, menggulir ke atas mustahil.** Efek gulir di panel memaksa
`scrollTop = scrollHeight` tanpa syarat, dan `steps` ikut jadi pemicunya. Selama
model bekerja, panel ditarik kembali ke dasar tiap kali satu langkah bertambah —
beberapa kali per detik. Membaca ulang apa yang barusan lewat bukan sekadar
sulit; ia tidak mungkin.

**Kedua, pesan yang diucapkan di tengah kerja kehilangan tempatnya.** Giliran
disimpan sebagai satu blob teks (`streaming: string`) plus satu daftar langkah
(`steps: ChatStep[]`) — dua state paralel **tanpa urutan di antara keduanya** —
dan panel selalu menggambar daftar langkah di atas gelembung teks. Model yang
bicara, memakai alat, lalu bicara lagi tidak punya tempat untuk ucapan
pertamanya: kedua ucapan disambung jadi satu string, seluruh langkah menumpuk
di bawahnya. Yang penulis lihat adalah pesannya "berpindah ke atas" — padahal ia
memang tidak pernah punya posisi.

Bug pertama memperparah yang kedua: teks yang terdorong ke atas tidak bisa
disusul kembali.

---

## 2. Keputusan yang sudah dikonfirmasi

1. **Referensi tampilan: chat VS Code.** Tapi yang ditiru bukan visualnya
   melainkan model datanya — semua baris hidup di satu aliran terurut. Menyalin
   tampilan tanpa mengubah model data tidak memperbaiki apa pun.
2. **Teks memisahkan kelompok.** Model bicara → kelompok langkah ditutup; ia
   bekerja lagi → kelompok baru dibuka.
3. **Kelompok yang lewat menciut jadi satu baris**, berlabel, dengan elipsis
   kalau langkahnya banyak. Daftar lengkapnya muncul saat diklik.
4. **Satuan perubahan: kata**, bukan karakter. Karakter terlalu berisik untuk
   penulis.
5. **Langkah non-penyuntingan tidak diberi angka** — cukup labelnya.
6. **Riwayat versi mendapat atribusi AI**: `Hasil AI: AI Chat · +128 −34 kata`.

---

## 3. T1 — gulir yang berhenti memaksa · **selesai**

`apps/web/components/panels/ai-chat-panel/index.tsx`.

- `onScroll` menghitung jarak dari dasar; lebih dari `FOLLOW_THRESHOLD_PX` (48px)
  ke atas melepas ikatan, dan efeknya berhenti menarik.
- Ambangnya bukan nol karena gulir roda tetikus jarang berhenti persis di dasar,
  dan sisa beberapa piksel tidak berarti penulis sedang membaca ke atas.
- Tombol **Latest** melayang saat ikatan lepas. Pembungkusnya `h-0` supaya ia
  tidak menyisipkan ruang yang menggeser percakapan.
- Mengirim pesan mengikat ulang: itu pernyataan bahwa penulis kembali mengikuti.

---

## 4. T2 — giliran sebagai aliran terurut · **selesai**

### 4.1 Bentuk data

`apps/web/features/chat/chat-context.tsx`:

```ts
export type TurnPart = { kind: 'text'; text: string } | { kind: 'steps'; steps: ChatStep[] }
```

`ChatTurn.steps` diganti `ChatTurn.parts`. `content` **tetap ada dan tetap memuat
seluruh teksnya** — itu yang dikirim ke provider; `parts` hanya mengatur
bagaimana giliran digambar.

Kontrak ke provider tidak tersentuh: `buildOutboundMessages` memang sudah
membuang lini masa sebelum mengirim, jadi yang berubah hanya nama medannya.

### 4.2 Tempat aturannya hidup

Satu tempat saja, di pembantu langkah:

- `pushStep` menyambung ke kelompok terakhir kalau bagian terakhir bukan teks,
  dan membuka kelompok baru kalau teks.
- `appendText` menyambung ke bagian teks terakhir, atau membuka bagian teks baru
  kalau sebelumnya kelompok langkah. **Di situlah kelompok tertutup.**
- `patchRunningStep`, `recordPlan`, `advancePlan` bekerja lewat `mapSteps` di
  atas `parts`.
- `visibleParts` membersihkan panggilan alat cadangan dari bagian teks sebelum
  giliran disimpan, dan membuang bagian teks yang habis dibersihkan supaya tidak
  menyisakan gelembung kosong di antara dua kelompok.

### 4.3 Yang sebenarnya membuat urutannya benar

Tiap putaran alat **sudah lama** di-commit sebagai giliran sendiri ke `messages`.
Yang salah adalah langkahnya tidak ikut ke situ, melainkan menumpuk ke satu
daftar milik giliran terakhir.

Sekarang tiap putaran membawa `parts`-nya sendiri lalu memulai kelompok baru.
Karena `messages` memang sudah terurut, teks dan kerja terbaca bergantian tanpa
mesin pengurut apa pun.

### 4.4 Penggambarnya

`message-bubble.tsx` menggambar bagian sesuai urutan. Kelompok yang lewat →
`StepSummary` (menciut); kelompok yang sedang berjalan → `StepTimeline live`.
Panel dan giliran tersimpan kini memakai penggambar yang sama — sebelumnya ada
dua, dan itu sendiri sumber perbedaan tampilan.

Baris ringkasan: `Membaca garis besar · Mencari web · … 5 langkah` di kiri,
durasi di kanan. `LABELS_SHOWN = 2`; sisanya elipsis, karena seluruh daftarnya
toh muncul saat diklik. Label fase datang dengan elipsisnya sendiri
(`Berpikir…`), jadi `trimLabel` memangkasnya sebelum dirangkai.

### 4.5 Perubahan perilaku yang perlu diketahui

Putaran yang isinya cuma kerja — model membaca dokumen lalu lanjut tanpa berkata
apa-apa — dulu disembunyikan lewat `intermediate`. Sekarang ia punya gelembungnya
sendiri berisi kelompok langkahnya. **Itulah interleaving-nya.** Penanda
`No response.` diberi syarat tambahan supaya tidak muncul di gelembung seperti
itu.

### 4.6 Verifikasi

`bunx tsc --noEmit -p apps/web` bersih. `bun test apps/web/features/chat`:
138 lulus. Satu tes disesuaikan — `chat-compaction.test.ts` menegaskan lini masa
tidak pernah sampai ke provider; bentuk datanya kini `parts`, maksudnya tetap.

Sisa lint: satu `useExhaustiveDependencies` baru untuk `setPartsBoth`. Berkas itu
sudah punya 18 peringatan sejenis dari pola yang sama; memoisasi `runTurn` tidak
dirombak untuk mengejar satu tambahan.

---

## 5. T3 — angka perubahan (`+128 −34 kata`) · **selesai**

### 5.1 Temuan yang mengubah tempatnya

**Alat tulis bukan langkah.** Yang menjadi `ChatStep` hanya fase dan alat baca.
Alat tulis dikumpulkan sebagai `actions` di giliran, lalu dijalankan sesudahnya
lewat `ActionGroup` / auto-apply.

Jadi angkanya **tidak punya tempat di kelompok langkah sama sekali** — ia milik
kartu aksi. Kelompok langkah tetap label + durasi.

### 5.2 Dari mana angkanya

Alat tulis di `apps/web/features/chat/tools.ts` mengembalikan `{ ok, message }`
tanpa satu pun angka. Yang perlu ditambahkan: besaran perubahan per aksi.

Sudah ada bahannya, tidak perlu menulis pembanding baru:

- `computeVersionDiff(versionText, draftText)` di
  `apps/web/features/versions/diff.ts` — pembanding teks yang sudah dipakai
  Riwayat versi.
- `countWords` di `apps/web/lib/utils.ts`.

Ukur teks dokumen sebelum dan sesudah satu aksi diterapkan, bandingkan, hitung
kata yang masuk dan keluar. Memakai pembanding yang sama dengan Riwayat versi
membuat angka di kartu aksi dan angka di label versi tidak mungkin berbeda —
kalau dihitung dua cara, cepat atau lambat keduanya berselisih dan tidak ada yang
tahu mana yang benar.

### 5.3 Batas yang harus jujur

Aksi yang tidak menyunting teks — atur margin, sisipkan diagram, buka
proofreader — tidak punya angka yang berarti. Tampilkan labelnya saja; jangan
memaksa `+0 −0`, yang terbaca seperti kegagalan.

### 5.4 Bentuk akhirnya

`apps/web/features/chat/word-delta.ts` — `wordDelta(before, after)` memanggil
`computeVersionDiff`, menjumlahkan kata masuk dari rentang `added` dan kata
keluar dari potongan teks lama yang ditunjuk rentang `removed`.
`formatWordDelta` mengembalikan `null` untuk perubahan nol, sehingga aksi
non-penyuntingan tidak pernah dapat angka tanpa perlu daftar pengecualian.

Pengukurannya **mengapit penerapan** di `runWriteTool`, bukan dibaca dari
argumen alat: yang dihitung harus perubahan yang benar-benar mendarat di naskah.
Hasilnya disimpan per id aksi dan dibaca `ActionCard`, jadi angkanya tetap ada
setelah "Apply all" maupun setelah render ulang.

Batasnya jujur: alat yang berubah secara asinkron (mis. membuat tab baru) diukur
sebagai nol karena pengukurannya sinkron. Itu terbaca sebagai "tanpa angka",
bukan sebagai angka yang salah.

---

## 6. T4 — atribusi AI di Riwayat versi · **selesai**

Ini menyambungkan slot yang sudah ada, bukan membangun fitur.

- `versionTriggerEnum` di `apps/api/src/db/schemas/document-version.ts` **sudah
  punya** `ai_result`.
- `apps/web/components/versions/version-history-view.tsx:56` **sudah tahu** cara
  menampilkannya: `Hasil AI: ${featureLabel(version.feature)}`.
- **Tidak ada satu pun pemanggil yang menulisnya.** Suntingan AI Chat hari ini
  masuk sebagai snapshot interval biasa, tanpa keterangan siapa yang mengubah.

Yang perlu dikerjakan: jalur penerapan aksi chat mengambil snapshot dengan
`trigger: 'ai_result'`, dan labelnya membawa angka dari §5:

```
Hasil AI: AI Chat · +128 −34 kata
```

Satu pengukuran, dua pemakai. Itu alasan T3 dikerjakan lebih dulu.

### 6.1 Bentuk akhirnya

**Satu versi per giliran chat, bukan per aksi.** Penulis yang menerapkan lima
suntingan dari satu jawaban tidak sedang membuat lima titik pemulihan; ia membuat
satu. Snapshot diambil di `settleActions` tepat ketika seluruh aksi giliran itu
sudah diputuskan — diterapkan atau dilewati — dengan angka gabungannya.

Yang berubah di luar chat, semuanya kecil:

- `apps/api/src/services/versions/dto.ts` menerima `ai_result` dari klien.
  `interval` dan `pre_restore` tetap milik server sendiri.
- `LocalVersionTrigger` ikut menerima `ai_result`, supaya dokumen yang belum
  punya padanan di server tidak kehilangan keterangannya.
- `entryLabel` untuk `ai_result` mendahulukan `version.label`. Dua penulis, dua
  bentuk keterangan: modul analisis menandai versinya lewat `feature`, AI Chat
  lewat `label` — karena yang perlu disebut bukan nama fitur melainkan besaran
  perubahannya.

**Konsekuensi yang disengaja:** giliran yang aksinya dibiarkan menggantung tidak
pernah mendapat versi bertanda AI. Isinya tetap tersimpan lewat snapshot
interval; yang hilang cuma keterangannya — dan itu lebih baik daripada menandai
naskah yang penulis sendiri belum putuskan.

---

## 7. Urutan pengerjaan

| # | Butir | Status | Kenapa di urutan ini |
|---|---|---|---|
| T1 | Gulir berhenti memaksa | selesai | Mandiri, langsung terasa |
| T2 | Giliran sebagai aliran terurut | selesai | Prasyarat sub-agent (§8) |
| T3 | Angka kata di kartu aksi | selesai | Menghasilkan angka yang dipakai T4 |
| T4 | `ai_result` + label versi | selesai | Memakai angka T3 |

**T2 bukan pekerjaan sampingan, ia prasyarat.** Transkrip kronologis murni rusak
begitu ada sub-agent: pekerjaan yang berjalan paralel selesai belakangan, jadi
barisnya muncul di urutan yang salah — di bawah teks yang ditulis setelah ia
dimulai. Larik bagian karena itu tidak boleh sekadar "append": ia butuh **baris
yang disisipkan saat pekerjaan dimulai dan diperbarui di tempat saat selesai**.
Lihat `docs/CHAT-SUBAGENT-PLAN.md` §4.

---

## 8. Yang belum diputuskan

- Apakah kelompok langkah perlu bisa dilipat/dibuka semua sekaligus saat
  giliran panjang.
- Apakah `LABELS_SHOWN = 2` cukup di panel yang lebar.
