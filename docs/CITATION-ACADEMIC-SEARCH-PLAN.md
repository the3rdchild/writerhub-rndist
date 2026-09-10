# Rencana — Pencarian Akademik & Manajemen Sitasi

Status: **Catatan cakupan, belum dirancang penuh** · Disusun 10 September 2026 · Baseline kode
`9293480` (branch `main`)

Dokumen ini lahir dari `docs/AGENT-SKILLS-PLAN.md` §9. Dua skill upstream —
`citation-management` dan `literature-review` — sengaja **dipotong** dari rencana Agent Skills
karena keduanya bukan skill.

Berkaitan dengan `docs/WEB-RESEARCH-PLAN.md` (riset web via Tavily), tapi **bukan hal yang
sama** — lihat §3.

---

## 1. Kenapa ini dipisah dari Agent Skills

Skill adalah **teks instruksi**: ia mengubah cara model menulis, dan tidak menambah kemampuan
apa pun. Dua skill upstream itu justru sebaliknya — nilainya seluruhnya ada pada jaringan:

- `citation-management` — OpenAlex, PubMed, Crossref, DataCite, Google Scholar; validasi
  metadata; keluaran BibTeX.
- `literature-review` — PubMed, arXiv, bioRxiv, Semantic Scholar; sintesis sistematis.

Memasukkannya sebagai teks skill akan menghasilkan instruksi yang menyuruh model melakukan
sesuatu yang tidak bisa dilakukannya. Yang dibutuhkan adalah **tool**, dengan rate limit,
cache, dan penanganan kegagalan API pihak ketiga — pekerjaan produk, bukan pekerjaan prompt.

---

## 2. Yang sudah ada di repo (penting — ini bukan lahan kosong)

**`apps/web/app/api/citations/route.ts`** sudah mencari Crossref: `query.bibliographic`, 5
hasil, timeout 12 detik, dinormalkan jadi `Citation { doi, title, authors, year, source, url }`.

**`apps/web/components/editor/citation-popover.tsx`** memakainya — penulis menyeleksi teks,
popover mencarikan kandidat sitasi.

**Yang belum ada: AI tidak tahu rute ini eksis.** Tidak ada `cite_source` di
`packages/shared/src/research-tools.ts` (isinya baru `web_search` dan `fetch_url`). Model tidak
bisa mencarikan atau memverifikasi sitasi, walaupun mesinnya sudah terpasang dan sudah dipakai
manusia di editor yang sama.

Jadi langkah pertama yang paling murah bukan menambah penyedia baru, melainkan
**mengekspos yang sudah ada ke model**.

---

## 3. Hubungannya dengan riset web (Tavily)

Beda tujuan, jangan digabung:

| | Riset web (`WEB-RESEARCH-PLAN.md`) | Pencarian akademik (dokumen ini) |
|---|---|---|
| Penyedia | Tavily | Crossref, OpenAlex, PubMed, arXiv |
| Sumber | halaman web apa pun | karya terbit ber-DOI |
| Keluaran | kutipan + URL | metadata terstruktur, BibTeX |
| Pemicu | toggle riset / `/riset` | selalu, kalau naskahnya akademik |
| Biaya | berbayar per panggilan | gratis, tapi ber-rate-limit |

Riset web menjawab "apa yang terjadi"; pencarian akademik menjawab "siapa yang sudah
menerbitkannya, dan bagaimana menuliskannya di daftar pustaka".

---

## 4. Urutan yang disarankan

**Tahap 1 — `cite_source` (kecil, jelas).** Bungkus rute Crossref yang sudah ada jadi tool di
`RESEARCH_TOOLS`. Model bisa mencari, memverifikasi DOI, dan menyisipkan sitasi. Tidak ada
penyedia baru, tidak ada kunci API baru.

**Tahap 2 — OpenAlex sebagai penyedia kedua.** Cakupannya lebih luas dari Crossref dan tanpa
kunci API (cukup `mailto` untuk polite pool). Perlu keputusan: gabung hasil atau pilih salah
satu.

**Tahap 3 — daftar pustaka sebagai objek, bukan teks.** Sitasi tersimpan di data dokumen,
bukan diketik ke badan tulisan — supaya gaya sitasi (APA/IEEE/Vancouver) bisa diganti tanpa
menulis ulang. Ini yang paling besar, dan bersinggungan dengan model tab/dokumen.

**Tahap 4 — tinjauan literatur.** Baru masuk akal setelah tahap 3 ada. Di titik itu barulah
`literature-review` upstream berguna sebagai **skill** — mengatur alur sintesisnya — di atas
tool yang sudah nyata.

---

## 5. Yang perlu diputuskan sebelum mulai

- **PubMed butuh `NCBI_EMAIL`**, dan rate limit-nya ketat tanpa kunci. Apakah kita mau
  menambah env var lagi, atau cukup Crossref + OpenAlex dulu?
- **Cache di mana.** Redis sudah dipakai riset web dengan TTL berjenjang; metadata sitasi
  hampir tidak pernah berubah, jadi TTL-nya bisa jauh lebih panjang (mingguan).
- **Kuota per tenant.** Riset web berbayar sehingga wajib dikuotai; pencarian akademik gratis
  tapi bisa kena block kalau kasar. Perlakuannya beda, jangan disamakan begitu saja.
- **Google Scholar tidak punya API resmi.** Upstream memakai `scholarly`, yang mengandalkan
  scraping dan mudah diblokir. Rekomendasi: **jangan** — pakai OpenAlex.
