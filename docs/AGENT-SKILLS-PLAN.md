# Rencana Implementasi — Agent Skills di Chat AI

Status: **PR-1 selesai, PR-2 belum** · Disusun 10 September 2026 · Baseline kode
`9293480` (branch `main`)

**Sumber luar:** [K-Dense-AI/scientific-agent-skills](https://github.com/K-Dense-AI/scientific-agent-skills)
— 163 skill, format [Agent Skills](https://agentskills.io/), mayoritas MIT.

Dokumen turunan: `docs/CITATION-ACADEMIC-SEARCH-PLAN.md` (bagian yang butuh jaringan,
sengaja dipisah — lihat §9).

---

## 1. Masalah yang dipecahkan

`apps/api/src/services/chat/prompts.ts` sudah 337 baris, dan `TOOL_GUIDANCE` bertambah tiap
kali ada fitur editor baru (header/footer, watermark, HTML block, penomoran halaman). Seluruh
teks itu dikirim **pada setiap permintaan, untuk setiap penulis** — entah dia menyusun skripsi
atau sekadar menanyakan sinonim.

Agent Skills memecahkan persis itu lewat *progressive disclosure*: metadata ringkas selalu ada,
badan instruksinya dimuat hanya saat relevan.

Nilai terbesar repo K-Dense untuk kita **bukan isinya** — 157 dari 163 skill soal scanpy,
qiskit, rdkit, dan tidak ada hubungannya dengan penyuntingan dokumen. Yang kita ambil adalah
polanya, lalu ~5 skill kepenulisan sebagai isi pertama.

---

## 2. Keputusan yang sudah dikonfirmasi

1. **Overlay + tetap melacak upstream.** Bukan fork sekali jalan, bukan juga vendoring mentah.
2. **`aiRules` template menang atas skill.** Skill dibatasi pada hal yang *tidak* diatur
   template (argumentasi, provenance bukti, cara mengaudit klaim). Lihat §6.
3. **Indeks skill selalu disuntik; badan dimuat lewat tool.** Tanpa tool `list_skills`.
4. **`/` di chat menampilkan daftar skill** sebagai tier ketiga, di samping `intent` dan `tool`.
5. **Satu bahasa untuk file skill (English, menghadap model).** Output tetap mengikuti bahasa
   penulis lewat aturan yang sudah ada di `prompts.ts`.
6. **Skill tidak menyebut nama heading sama sekali** — bicara fungsi, bukan label. Lihat §6.
7. **Plafon ±4K token per berkas skill**, lebih dalam dari itu dipecah dan diambil dengan
   `read_skill(name, file)`.
8. **Sinkronisasi mingguan lewat GitHub Action**, membuka issue kalau upstream bergerak.
9. **Pin awal: `v2.66.0`.**

---

## 3. Arsitektur — dua lapis yang sengaja dipisah

```
vendor/scientific-agent-skills/     cuplikan upstream, hanya Markdown, 808 KB
  .upstream.json                    tag + sha256 tiap berkas
  skills/<skill>/…                  teks upstream apa adanya
                                    → hanya waktu-pengembangan, bahan untuk diff
                                    → TIDAK PERNAH dibaca saat runtime

packages/shared/src/skills.ts       katalog: kurasi, dua muka, daftar berkas
packages/shared/skills/
  <skill>/SKILL.md                  teks kita sendiri
  <skill>/<file>.md                 berkas dalam, dimuat sesuai permintaan
                                    → ikut ke kontainer, satu-satunya yang sampai ke model
```

**Kenapa pemisahan ini dipaksakan, bukan sekadar disepakati.** `Dockerfile` hanya menyalin
`packages/shared` dan `apps/api` (baris 42-43); `vendor/` tidak pernah ikut ke image. Artinya
mustahil ada teks upstream bocor ke penulis tanpa melewati overlay yang kita tulis sendiri.
Itu sekaligus menyederhanakan urusan lisensi (§8): yang perlu diatribusi hanya yang benar-benar
kita salin.

**Cuplikan, bukan `git subtree`.** Rancangan awal memakai subtree sparse. Itu tidak bisa
dibangun: `git subtree` menarik seluruh repo (30 MB, 163 skill) dan **tidak mendukung sparse**
— sifatnya menggabungkan riwayat, bukan mengambil sebagian pohon.

Gantinya `skills:sync` melakukan clone sparse + blobless ke direktori sementara, lalu menyalin
Markdown yang dikurasi saja ke `vendor/`. Hasilnya 808 KB, bukan 30 MB, dan tidak ada riwayat
asing yang masuk ke repo kita.

Yang hilang: tidak ada. Karena cuplikannya berupa berkas biasa yang ikut di-commit,
**`git diff vendor/` setelah menjalankan sync *adalah* diff terhadap upstream** — persis
kemampuan yang tadinya jadi alasan memilih subtree.

Skrip Python upstream sengaja tidak ikut disalin: chat ini tidak punya shell maupun akses
berkas, jadi menyimpannya hanya akan mengundang skill yang menyuruh model menjalankan sesuatu
yang tidak ada.

---

## 4. Manifest punya dua muka

Satu berkas, dua pembaca yang berbeda:

| Bidang | Bahasa | Dibaca oleh |
|---|---|---|
| `label`, `hint` | Indonesia | penulis, muncul di palet `/` |
| `description` | English | model, ikut di indeks system prompt |
| `files[]` | — | `read_skill` |
| `overlay` | — | `null` = dikurasi tapi belum ditulis; tidak pernah sampai ke model |

Hash upstream tidak disimpan di katalog ini melainkan di `vendor/.upstream.json`, supaya
katalog runtime tidak ikut berubah tiap kali upstream bergerak.

Sejajar dengan yang sudah ada: `label`/`hint` di `apps/web/features/chat/commands.ts` memang
sudah Bahasa Indonesia ("Rapikan format", "Daftar isi").

---

## 5. Runtime — satu katalog, tiga konsumen

```
packages/shared/src/skills.ts  (SKILLS / ACTIVE_SKILLS)
   ├─→ indeks ringkas   → disuntik permanen ke system prompt
   ├─→ read_skill(name, file?) → badan dimuat saat dibutuhkan
   └─→ tier 'skill' di /… → penulis bisa memaksa
```

**Kenapa tanpa `list_skills`.** Dengan ~5 skill, indeksnya (nama + satu baris) hanya ±150 token
— lebih murah disuntik permanen daripada membayar satu putaran tool call untuk membacanya.
`list_skills` baru masuk akal di angka ~30 skill ke atas.

**Kenapa `/` bukan sekadar nice-to-have.** Pemilihan skill oleh model pasti meleset sesekali,
dan tanpa `/` penulis tidak punya cara memperbaikinya.

**Detail palet.** Tier skill duduk bersama `intent` — langsung terlihat, tidak menunggu tiga
huruf seperti tier `tool` (`TOOL_TIER_MIN_CHARS` di `commands.ts:95`). Daftarnya cuma ~5 baris.
Tier skill **diturunkan dari manifest**, tidak ditulis tangan — mengikuti pola tier `tool` yang
sudah diturunkan dari `ALL_TOOLS` (`commands.ts:86`).

---

## 6. Aturan penulisan overlay

**Jangan sebut nama heading.** Tulis fungsinya: "bagian yang memposisikan karya ini terhadap
literatur yang ada", bukan "Related Work section".

Alasannya bukan penerjemahan — model menerjemahkan istilah akademik dengan baik. Alasannya
"Tinjauan Pustaka" **bukan terjemahan** dari "Related Work", melainkan konvensi berbeda yang
berbeda-beda per kampus ("BAB II TINJAUAN PUSTAKA" vs "KAJIAN TEORI"). Tidak ada terjemahan
yang bisa menebak yang mana — dan itu memang bukan urusan skill: nama heading dimiliki template
lewat `aiRules` dan `apply_template_format` (keputusan §2.2).

Menulis skill tanpa label menghapus masalahnya di sumbernya, bukan menambalnya dengan
glosarium pemetaan istilah.

**Yang tersisa: daftar "jangan diterjemahkan"** — beberapa baris per skill, bukan tabel dua
arah. Isinya istilah yang memang harus tetap Inggris: DOI, p-value, IMRaD, BibTeX, nama uji
statistik, nama dataset.

**Konsekuensi yang harus disadari.** Teks upstream penuh label ("Related Work", "Discussion",
kerangka IMRaD), jadi porsi yang bisa dipakai apa adanya kecil. Yang kita ikuti dari upstream
adalah **strukturnya** — bagian apa saja yang ada, urutan pemeriksaan, alur audit bukti — dan
itulah yang di-diff mingguan. Kalimatnya jadi milik kita.

---

## 7. `bun run skills:sync`

`scripts/skills-sync.ts`, tiga mode:

| Perintah | Yang dilakukan |
|---|---|
| `bun run skills:sync` | segarkan `vendor/` ke tag yang dipatok (`PINNED_TAG`) |
| `bun run skills:sync --latest` | segarkan ke tag terbaru upstream |
| `bun run skills:sync --check` | bandingkan tag terbaru dengan lockfile, **tidak menulis**; keluar dengan kode 1 kalau upstream bergerak |

`--check` melaporkan per berkas: `berubah`, `baru`, `hilang`. **Tidak** ada auto-merge —
overlay memang akan selalu menyimpang (§6), jadi penggabungan otomatis hanya akan merusak.

Menaikkan `PINNED_TAG` adalah tindakan sadar, tidak pernah otomatis.

GitHub Action mingguan menempel di `.github/workflows/` yang sudah ada; kalau ada pergerakan,
ia membuka issue berisi ringkasan diff, bukan PR.

---

## 8. Lisensi

Mayoritas skill upstream MIT; `markdown-mermaid-writing` Apache-2.0 (Superior Byte Works, LLC).
Keduanya menuntut atribusi kalau teksnya masuk ke produk komersial.

`NOTICE` dibuat **sekarang**, bukan menjelang production. Isinya beberapa baris, tapi
menambahkannya belakangan berarti menelusuri ulang teks mana berasal dari mana.

---

## 9. Cakupan — yang masuk dan yang dipotong

**Masuk (5):**

| Skill | Kenapa |
|---|---|
| `scientific-writing` | inti: struktur argumen, provenance bukti, audit klaim |
| `peer-review` | memeriksa naskah sendiri sebelum disetor |
| `venue-templates` | aturan format per tujuan terbit |
| `research-grants` | proposal penelitian |
| `scientific-brainstorming` | tahap awal, sebelum ada tulisan |

**Dipotong: `citation-management` dan `literature-review`.** Keduanya bukan skill, melainkan
**fitur produk** — butuh jaringan (OpenAlex, PubMed, Crossref), rate limit, cache, dan
penanganan kegagalan API pihak ketiga. Memaksakannya sebagai teks instruksi akan menghasilkan
skill yang menyuruh model melakukan sesuatu yang tidak bisa dilakukannya.

Sudah ada pijakan untuk itu di repo: `packages/shared/src/research-tools.ts` dan rute Crossref
di `apps/web/app/api/citations/route.ts`. Rencananya dipisah ke
**`docs/CITATION-ACADEMIC-SEARCH-PLAN.md`**.

**Tidak masuk sama sekali:** 157 skill sisanya (scanpy, qiskit, rdkit, pymatgen, dst).
Sparse-checkout hanya mengambil lima direktori yang dikurasi, bukan 30 MB penuh.

---

## 10. Urutan pengerjaan

**PR-1 — fondasi + satu skill jadi.** ✅ *Selesai, branch `feat/agent-skills`.*
`scripts/skills-sync.ts` + `vendor/` (808 KB, v2.66.0) + `packages/shared/src/skills.ts` +
`NOTICE` + `scientific-writing` (`SKILL.md` dan `evidence-audit.md`). **Runtime chat tidak
disentuh sama sekali** — `ACTIVE_SKILLS` diekspor tapi belum ada yang memakainya.

Awalnya PR-1 dirancang murni infrastruktur, lalu direvisi: manifest kosong tidak bisa dinilai
— bentuknya baru terbukti benar setelah ada isi yang lewat di dalamnya.

**PR-2 — runtime.** Suntik indeks ke system prompt, tool `read_skill`, tier `skill` di palet
`/`. Di sinilah `TOOL_GUIDANCE` mulai bisa dipangkas.

**PR-3 — empat skill sisanya.** Pekerjaan mekanis setelah bentuknya terbukti.

**PR-4 — Action sinkronisasi mingguan.**

---

## 11. Yang belum diputuskan

- Berapa banyak `TOOL_GUIDANCE` yang benar-benar bisa pindah ke skill di PR-2. Sebagian besar
  isinya soal alat editor, yang memang harus selalu ada — jadi penghematannya mungkin lebih
  kecil dari yang terlihat. Diukur, bukan ditebak.
- Apakah skill perlu digantung otomatis ke `templateSlug` (template skripsi → aktifkan
  `scientific-writing` tanpa diminta). Ditunda sampai ada data pemakaian nyata.
