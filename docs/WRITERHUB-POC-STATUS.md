# WriterHub POC — Status Fitur vs R&D Map

Sumber: `docs/Writerhub-rnd-development-maps.xlsx` (kolom *RND POC* dan *Rnd Notes*) + pemeriksaan codebase.

Tiga kategori:
- **Sudah Jalan** — fitur bisa dipakai end-to-end di POC saat ini.
- **Masih Polish** — fitur ada tapi belum sesuai visi Google Docs atau masih ada bug/limitasi.
- **Belum** — belum diimplementasikan di POC ini.

---

## 1. Sudah Jalan (64 fitur)

### Editor Shell
- Rich text editor (Tiptap 3 + StarterKit, heading 1–9, text style, align, highlight, sub/superscript, lists, task lists, links)
- Panel switcher / tool rail (9 modul di rail kanan)
- User input / paste text (termasuk paste Markdown otomatis)
- Upload document (DOCX dengan format, PDF teks via worker, TXT; multi-file → dokumen baru)
- Autosave & draft persistence (periodic snapshot + manual named versions)
- Text selection scoping (run modul ke seleksi atau seluruh dokumen)
- Copy hasil ke clipboard
- Language selector (non-Inggris dipaksa ke AI tier)
- Undo / redo lintas modul
- Markdown & LaTeX support (inline/block math)
- Dark mode & theming
- Inline comments (resolve/unresolve, gutter)
- Document version history (snapshot auto/manual, diff & restore)
- Table of Contents (TOC)
- Page setup & section breaks
- Footnotes & endnotes
- Search & Replace
- Callout / info box
- Page canvas with rulers
- Resizable tables with formatting
- Resizable inline images
- Slash commands
- Document tabs / multi-tab editor

### Grammar Checker
- Grammar & spelling checker (Standard/Advanced rule-based + AI tier LLM)
- Writing quality score (grammar/fluency/clarity/engagement)
- Hover to accept & correction suggestion
- Error categorization (All/Grammar/Style/Spelling)
- Real-time streaming result (SSE + checkpoint)

### Paraphraser
- Paraphrase teks
- Paraphrase section tertentu
- Retry / parafrase ulang
- Apply / discard per segmen
- Pilih mode parafrase (tone: standard, akademik, formal, kreatif, ringkas, dst.)
- Pilih quality parafrase (model selector)
- SSE streaming result

### Plagiarism Checker
- Highlight kalimat/paragraf terdeteksi
- Overall similarity score

### File Translator
- Text translate (per seleksi/seluruh dokumen, preserve format)
- Deteksi bahasa (di worker; UI selector manual)
- More language (daftar bahasa di `LANGUAGE_OPTIONS`)
- Enhanced translator mode (via model AI terpilih)

### AI Detector
- AI detection score (overall + per-sentence)
- Per-sentence highlight

### Humanizer
- Humanizer (per-sentence suggestion)

### AI Chat Sidebar
- Chat sidebar dengan konteks dokumen
- Chat atas seleksi teks
- Insert hasil chat ke draft (Apply cards + auto-apply)
- Model selector (kurasi CHAT_MODELS)
- Writing command presets (tools/commands + slash command)
- AI step timeline / reasoning visibility

### Core Platform
- History (activity log + version history)
- File Library (halaman `/library`)
- Search by title
- Projects (CRUD + assign dokumen)
- Memory (tone, output language, glossary, style notes)
- Sharing document (link + viewer/commenter/editor)

### Cross-Cutting
- Unified highlight layer (ProseMirror decorations)
- Unified suggestion/diff engine (accept/reject per segmen)
- Streaming (SSE) di semua modul

---

## 2. Masih Polish (9 fitur)

| Fitur | Catatan opsional |
|-------|------------------|
| **Export / download draft** | PDF via browser print masih terpengaruh bug E1: chrome/panel ikut tercetak. DOCX export via worker sudah benar per-section. Lihat `docs/EXPORT-COLUMNS-PRD.md`. |
| **Similarity check** | Plagiarism panel masih heuristic; belum integrasi service similarity PPE. |
| **Cross-module action routing** | AI Chat punya Apply tool actions, tapi routing antar panel (mis. send to paraphraser) belum ada. |
| **Search by content** | Search & Replace di editor sudah ada; pencarian lintas dokumen belum. |
| **Quality/cost tier selector** | Model selector ada di AI Chat & Proofreader; belum universal untuk semua modul. |
| **File Library** | `/library` ada tapi belum jadi pusat file asset; masih berupa dokumen per project. |
| **Citation-aware detection** | Footnote + citation popover ada; plagiarism belum bisa membedakan kutipan yang sudah disitasi. |
| **Realtime collaboration** | Yjs Collaboration extension aktif per tab lokal; Hocuspocus multi-user sync belum wired. |
| **Async job + notifikasi** | BullMQ + Redis + cancel + SSE status sudah jalan; toast/notifikasi UI belum polished. |

---

## 3. Belum (20 fitur)

### Plagiarism Checker
- Source list & matched snippet — belum ada daftar sumber eksternal dengan URL.
- Click highlight to source — belum ada mapping ke sumber.
- Send to paraphraser — belum ada routing otomatis.
- Report export — belum bisa export laporan.
- Exclusion rules — belum ada pengecualian kutipan/daftar pustaka.
- Cross-language similarity — belum.
- Paraphrased plagiarism detection — belum.

### File Translator
- Translate by file — belum bisa upload .docx/.pdf/.pptx langsung.
- Rotate / swap language buttons — belum ada UI swap sumber/tujuan.
- Riwayat terjemahan — belum ada history terjemahan khusus.

### Grammar Checker
- Bulk accept per kategori — hanya Accept All, belum per kategori.
- Analyze structure per paragraph — belum.
- Tone & readability analysis — belum; AI Memory punya tone preference tapi bukan analisis otomatis.

### Paraphraser
- Multiple suggestion variants — satu hasil per segmen saja.

### AI Detector
- Send to humanizer — belum ada cross-module action.
- Detection report export — belum.

### Humanizer
- Humanizer multiple style — belum ada pilihan gaya.
- Verify loop dengan AI Detector — belum ada re-check otomatis setelah humanize.

### AI Chat Sidebar
- Reference / source grounding — chat belum bisa membaca File Library atau Project dokumen.

### Editor Shell
- Mermaid diagram — belum ada node view Mermaid.

---

## Catatan untuk Tim Desain

- Slide ini paling cocok dibuat sebagai **3 kolom teks** atau **3 card** dengan warna:
  - Hijau = Sudah Jalan
  - Kuning = Masih Polish
  - Abu-abu = Belum
- Karena jumlah fitur banyak, di slide utama cukup tampilkan **ringkasan angka** (64 / 9 / 20) plus 3–5 contoh teratas per kolom; daftar lengkap disimpan di appendix atau di R&D map.
