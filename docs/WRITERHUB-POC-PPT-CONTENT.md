# WriterHub POC — Materi Presentasi

Panduan ini berisi **konten per slide** dan **notes pembicara** untuk presentasi singkat hasil POC WriterHub.  
Tone: praktis, tidak bertele-tele.  
Audience: stakeholder/teknis yang ingin melihat bukti jalan dan arsitektur.  

> **Catatan UI**: penempatan visual, screenshot/mockup, dan animasi dibiarkan untuk tim UI. Di setiap slide disebutkan saja bagian mana yang perlu divisualkan.

---

## Slide 1 — Cover

**Judul slide:** WriterHub POC  
**Subjudul:** AI-powered document editor — one draft, many AI tools

**Isi slide (konten PPT):**
- Nama produk: WriterHub
- Status: Proof of Concept
- Tagline: *Google Docs-like editor + AI writing assistant dalam satu halaman*

**Notes pembicara:**
- Buka dengan satu kalimat: kita sedang membuktikan bahwa pengalaman menulis dengan AI bisa terjadi di satu canvas, bukan di tab-tab terpisah.
- **Bagian UI**: logo produk, background clean, tagline besar.

---

## Slide 2 — Masalah yang Diselesaikan

**Judul slide:** Kenapa WriterHub?

**Isi slide (konten PPT):**
- Penulis akademik/profesional sering berpindah antar tool: Google Docs, Grammarly, Quillbot, Turnitin, Translate.
- Hasil dari tiap tool sulit digabung kembali ke naskah asli.
- Format dokumen (heading, tabel, page setup) sering rusak saat dipindah-pindah.

**Notes pembicara:**
- Fokus pada gesekan (friction) bukan pada fitur. Satu naskah, banyak tab = banyak versi.
- **Bagian UI**: icon 3–4 tools terpisah, panah menujuk ke satu dokumen; atau ilustrasi split screen.

---

## Slide 3 — Solusi dalam Satu Kalimat

**Judul slide:** Satu Draft, Semua AI

**Isi slide (konten PPT):**
- Editor dokumen kaya (rich text) sebagai pusat.
- Panel AI di samping: grammar, parafrase, translate, plagiarisme, AI detector, humanizer, glossary, chat.
- Semua hasil AI kembali ke dokumen dengan format tetap utuh.

**Notes pembicara:**
- Analogi: Google Docs sebagai dasar, tapi setiap tool AI ada di sidebar tanpa meninggalkan canvas.
- **Bagian UI**: layout 3 kolom (tab kiri, editor tengah, panel kanan). Gunakan mockup wireframe, bukan screenshot penuh.

---

## Slide 4 — Core Editor (Mirip Google Docs)

**Judul slide:** Editor yang Bukan Sekadar Text Area

**Isi slide (konten PPT):**
- Rich formatting: bold, italic, heading 1–9, align, highlight, sub/superscript.
- Struktur dokumen nyata: page setup, section breaks, page breaks, columns, margins, rulers.
- Konten kompleks: tabel resizable, gambar resize, footnote, callout, math (LaTeX), task list, TOC otomatis.
- Paste Markdown otomatis.

**Notes pembicara:**
- Jelaskan kenapa ini penting: kalau editor-nya lemah, output AI tidak bisa diformat dengan baik. Kita membangun pondasi dulu.
- **Bagian UI**: satu screenshot/mockup editor dengan: halaman kertas, penggaris, heading, tabel, dan panel AI kanan.

---

## Slide 5 — AI Writing Modules

**Judul slide:** 9 AI Tools dalam Satu Rail

**Isi slide (konten PPT):**
- **Proofreader** — grammar, spelling, style + skor kualitas tulisan.
- **AI Rewriter** — parafrase per kalimat, pilih tone (akademik, formal, kreatif, ringkas).
- **Translator** — terjemah seleksi atau seluruh dokumen, format tetap.
- **Plagiarism** — heuristic similarity score + highlight kalimat bermasalah.
- **AI Detector** — skor AI-written per kalimat.
- **Humanizer** — ubah teks yang terdeteksi AI jadi lebih natural.
- **Glossary** — scan istilah berulang, buat daftar definisi otomatis.
- **AI Chat** — tanya jawab soal draft, bisa apply hasil chat ke dokumen.
- **Comments** — komentar inline dengan resolve/unresolve.

**Notes pembicara:**
- Semua modul mengirim hasil kembali ke editor sebagai saran yang bisa diterima/ditolak per segmen, bukan menimpa seluruh dokumen.
- **Bagian UI**: ikon 9 modul dalam rail samping; atau 3–4 card kecil dengan nama modul.

---

## Slide 6 — Cara Hasil AI Masuk ke Dokumen

**Judul slide:** Accept / Dismiss Per Segmen

**Isi slide (konten PPT):**
- Hasil AI ditampilkan sebagai diff per kalimat/blok.
- User bisa **Accept** atau **Dismiss** satu per satu.
- Ada **Accept All** dan **Compare mode** untuk pratinjau virtual di editor.
- Semua perubahan masuk ke history undo/redo.

**Notes pembicara:**
- Keuntungan UX: penulis tetap punya kendali; tidak ada “AI menghapus naskah saya”.
- **Bagian UI**: satu suggestion card di panel kanan + sorotan di editor tengah.

---

## Slide 7 — Workflow & Collaboration

**Judul slide:** Draft, Version, Share

**Isi slide (konten PPT):**
- **Version history** — snapshot otomatis + manual, bisa diff dan restore.
- **Share** — generate link seperti Google Docs dengan role viewer/commenter/editor.
- **Projects** — kelompokkan dokumen per proyek.
- **Library** — pusat dokumen, filter per proyek.
- **Document tabs** — banyak tab dalam satu dokumen.

**Notes pembicara:**
- Ini menunjukkan produk bukan sekadar editor, tapi workspace menulis.
- **Bagian UI**: tiga icon kecil (clock version, share link, folder project).

---

## Slide 8 — Tech Stack

**Judul slide:** Stack & Tools yang Dipakai di POC

**Isi slide (konten PPT):**

| Layer | Stack |
|-------|-------|
| Frontend | Next.js 16.2.4, React 19.2.4, TypeScript 5.9.3, Tailwind CSS 4.1.14 |
| Editor core | Tiptap 3 / ProseMirror |
| State & sync | Yjs (CRDT), TanStack Query 5.90.2, React Context |
| Backend | Bun + Hono, PostgreSQL, Drizzle ORM |
| Queue / jobs | BullMQ + Redis |
| AI worker | Python (Bun-driven), LLM provider via nine-router |
| Real-time | Server-Sent Events (SSE) |
| Monorepo | Bun workspaces |
| FE–BE communication | Next.js route proxy (`/api/*`) → `API_URL` (server-side only) |

**Notes pembicara:**
- Pilih Next.js/Tailwind karena tim familiar; Tiptap/ProseMirror karena butuh kontrol dokumen tingkat rendah; Yjs karena kolaborasi real-time butuh CRDT; Python worker karena library NLP (spellchecker, proselint, langdetect) sudah matang di sana.
- **Bagian UI**: logo/logo kecil tiap teknologi, atau diagram layer sederhana.

---

## Slide 9 — Arsitektur Singkat

**Judul slide:** Alur Data

**Isi slide (konten PPT):**
- Browser → Next.js route proxy (`/api/*`) → API (Hono) → PostgreSQL / Redis.
- Browser **tidak** langsung ke `API_URL`; `API_URL` hanya dibaca server-side oleh proxy.
- API enqueue job ke BullMQ.
- Worker Python mengolah: grammar, parafrase, translate, plagiarism, dll.
- Hasil worker streaming kembali via SSE ke browser.
- Dokumen disimpan sebagai Yjs document; kolaborasi siap dinyalakan.

**Notes pembicara:**
- Penekanan: arsitektur ini membuat proses berat (translate file besar, plagiarism panjang) bisa asynchronous + bisa dicancel. Proxy same-origin juga menyederhanakan CORS dan kredensial di browser.
- **Bagian UI**: diagram kotak sederhana: Browser → Next.js `/api/*` → API → Redis → Worker → SSE → Browser; DB PostgreSQL di bawah API.

---

## Slide 10 — Apa yang Sudah Jalan vs Belum

**Judul slide:** Status POC

**Isi slide (konten PPT):**
- **Sudah jalan**: rich editor, page setup, section/columns, tables, images, comments, version history, share, projects, semua AI module dasar, SSE streaming, job cancel.
- **Masih polish**: export PDF dari browser print, cross-module action (kirim hasil plagiarism ke rewriter), translator by file.
- **Belum dikerjakan**: real-time multi-user collaboration (Yjs sudah ada, server sync belum), source-list plagiarism eksternal, report export.

**Notes pembicara:**
- Jujur soal batasan. POC ini bukan produk jadi; ini bukti bahwa arsitektur dan UX bisa dibangun.
- **Bagian UI**: tiga kolor (hijau/kuning/abu) atau badge status.

---

## Slide 11 — Kenapa Stack Ini?

**Judul slide:** Keputusan Teknis Utama

**Isi slide (konten PPT):**
- **ProseMirror/Tiptap**: satu-satunya library open-source yang memberi kontrol penuh atas struktur dokumen + marks + decorations.
- **Yjs**: kolaborasi real-time tanpa lock server.
- **BullMQ + Python worker**: NLP library mature di Python; queue membuat UI tetap responsif.
- **SSE, bukan WebSocket (saat ini)**: cukup untuk streaming hasil AI; lebih sederhana dari sisi state.
- **Next.js `/api/*` proxy**: browser tidak menyimpan `NEXT_PUBLIC_API_URL`; semua request FE same-origin, kredensial di-handle server-side.

**Notes pembicara:**
- Jelaskan bahwa keputusan ini mendukung visi Google Docs-like: struktur dokumen kuat + AI tools modular + kolaborasi scalable.
- **Bagian UI**: 4 card kecil dengan judul keputusan + satu kalimat manfaat.

---

## Slide 12 — Demo Flow (disinggung saja)

**Judul slide:** Demo Singkat

**Isi slide (konten PPT):**
- Buka dokumen → ketik / paste / import DOCX.
- Jalankan Proofreader → lihat saran di editor.
- Gunakan AI Chat untuk memperpanjang paragraf → apply ke dokumen.
- Buka version history → restore versi lama.

**Notes pembicara:**
- Ini adalah outline demo. Jika demo live tidak dilakukan, slide ini bisa diganti dengan screenshot.
- **Bagian UI**: 4 thumbnail screenshot/mockup berurutan, atau satu video placeholder.

---

## Slide 13 — R&D & Roadmap

**Judul slide:** Dari POC ke Produk

**Isi slide (konten PPT):**
- R&D map sudah dibuat: fitur dikelompokkan per versi (Beta, V1–V6).
- Yang sudah di-POC dicatat di map, termasuk catatan teknis.
- Prioritas dev berikutnya: perbaikan export/print, cross-module action, real-time collaboration.

**Notes pembicara:**
- Tunjukkan bahwa ada dokumen tracking yang bisa dibaca tim produk dan dev.
- **Bagian UI**: cuplikan kecil dari `Writerhub-rnd-development-maps.xlsx` atau ringkasan tabel fitur.

---

## Slide 14 — Kesimpulan

**Judul slide:** WriterHub Siap Diteruskan Dev

**Isi slide (konten PPT):**
- POC membuktikan core editor dan AI modules bisa bekerja dalam satu canvas.
- Arsitektur (Next.js + Tiptap + Yjs + Python worker + SSE) cukup solid untuk skala selanjutnya.
- Butuh dev team untuk polish UX, integration test, dan real-time collaboration.

**Notes pembicara:**
- Tutup dengan call-to-action: “ini fondasinya; tim dev bisa mulai memperkuat fitur demi fitur.”
- **Bagian UI**: tagline besar + kontak/next step.

---

## Slide 15 — Q&A

**Judul slide:** Questions?

**Isi slide (konten PPT):**
- WriterHub POC
- [email / repo / demo link placeholder]

**Notes pembicara:**
- Siapkan link ke repo/docs dan R&D map.
- **Bagian UI**: slide kosong minimalis dengan logo dan kontak.

---

## Checklist UI yang Perlu Diisi Tim Desain

1. **Slide 1 & 15**: cover dan Q&A — tata letak logo + tipografi.
2. **Slide 2**: ilustrasi masalah (tool terpisah).
3. **Slide 3**: layout 3 kolom (tabs | editor | panel).
4. **Slide 4**: mockup editor dengan halaman, penggaris, heading, tabel.
5. **Slide 5**: 9 icon modul AI di rail samping.
6. **Slide 6**: suggestion card + highlight di editor.
7. **Slide 7**: icon workflow (version, share, project, library).
8. **Slide 8**: logo tech stack atau tabel visual.
9. **Slide 9**: diagram arsitektur sederhana.
10. **Slide 10**: badge status (jalan / polish / belum).
11. **Slide 12**: 4 thumbnail demo atau video placeholder.
12. **Slide 13**: cuplikan R&D map.

---

## Catatan Pembuat Konten

- Semua konten slide sengaja dibuat **singkat dan scannable**. Rata-rata 3–5 bullet per slide.
- **Notes** boleh dibaca pembicara untuk konteks teknis, tapi jangan dibawa seluruhnya ke slide.
- Tech stack dan tools disebutkan secara konkret agar audience teknis bisa mengukur maturity stack.
