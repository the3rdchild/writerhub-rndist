# Usulan Perbaikan — AI Chat, Editor, dan Fitur Pendukung

Status: **Sebagian dikerjakan** (16 selesai, 3 sebagian, 14 belum; diukur ulang lewat putaran uji
[27 Sep](#hasil-27sep) dan [28 Sep](#hasil-28sep)). Perbaikan ada di branch `fix/ekspor-docx` (EX-1, EX-7), `fix/struktur-editor`
(ED-1), `feat/rencana-tugas` (AC-1/AC-2/AC-7), `fix/gambar-diagram` (ED-2), `fix/percakapan-panjang` (AC-9), `fix/kerangka-gambar` (AC-10), `fix/urutan-bab` (ED-3), `fix/gambar-subagent` (ED-4, ED-6), `fix/aksi-ganda` (CO-2),
`fix/laporan-praktikum-halaman` (TP-2), `fix/gandakan-subbab` (ED-5), `fix/flyer-sehalaman` (UC5), `fix/pindah-tab` (UC7), dan
`feat/uji-use-case` (QA-1) ·
Disusun 26 September 2026 · Baseline kode `b1ceb6a` (sejak uji berjalan, kode hanya berubah di
konfigurasi port, jadi semua temuan masih berlaku)

Sumber: tiga putaran uji use case lewat UI Writer Hub, dengan laporan dan berkas hasil di
`/mnt/doc/Reacteev/writer-hub-test/` (`TEMUAN-WriterHub.md` dan `Use Case WriterHub.xlsx`).

| Putaran | Model | Lingkup | Hasil |
|---|---|---|---|
| 17 Sep | Claude Sonnet 5 (DeepInfra) | 4 use case × 3 jalur (template, dokumen kosong, `/drafts`) | Terhenti karena saldo habis |
| 21 Sep | DeepSeek V4 Flash (OpenRouter) | 9 use case | 8 dokumen berakhir sendiri, tidak satu pun memenuhi semua syaratnya, US$0,76 |
| 23 Sep | Claude Sonnet 5 (OpenRouter) | 3 dari 9 use case | Dihentikan: US$18,86, tidak satu pun selesai |

Kode asal di setiap butir (`N1`, `T3`, `K1`, `U1`, …) merujuk nomor temuan di `TEMUAN-WriterHub.md`,
tempat bukti lengkapnya.

**Keputusan produk yang menjadi dasar urutan prioritas:** produksi memakai **DeepSeek V4 Flash** sampai
AI Chat siap untuk model kelas atas. Hasil uji menunjukkan masalah utamanya bukan pada model. Masalah
editor yang sama muncul di kedua model, sedangkan Sonnet 5 berbiaya ±50 kali lipat tanpa hasil yang lebih
lengkap. Jadi prioritas di bawah diurutkan menurut dampaknya pada Flash.

---

## Ringkasan prioritas

**P0**: use case gagal atau dokumen rusak; kerjakan dulu. **P1**: hasil jadi, tetapi keliru, boros,
atau menyesatkan. **P2**: kosmetik atau kenyamanan.

**Status** (per `7ca67aa`, 27 Sep): **Selesai**, **Sebagian** (rincian sudah/sisa di bagian butirnya),
atau **Belum**.

| ID | P | Area | Usulan singkat | Asal | Status |
|---|---|---|---|---|---|
| [AC-1](#ac-1) | P0 | AI Chat | Tugas panjang berjalan sampai outline selesai, tanpa harus didorong | N1, N13, T13 | Sebagian |
| [AC-2](#ac-2) | P0 | AI Chat | Pemeriksaan kelengkapan otomatis terhadap outline sebelum "selesai" | N1, N3, N8 | Selesai |
| [ED-1](#ed-1) | P0 | Editor | Alat tulis AI menyasar bagian (heading), bukan cocok-teks | T3, T4, N5, T20 | Selesai |
| [ED-2](#ed-2) | P0 | Editor | Chart dan infografis harus jadi gambar, atau gagal secara terlihat | N3 | Selesai |
| [EX-1](#ex-1) | P0 | Ekspor DOCX | Isi sel tabel selain paragraf (gambar, diagram, daftar) ikut diekspor | N4 | Selesai |
| [EX-7](#ex-7) | P0 | Ekspor DOCX | Gambar biasa (node `image`) tidak ikut ke DOCX sama sekali | — | Selesai |
| [AC-3](#ac-3) | P1 | AI Chat | Masukan gambar di chat (data dari gambar → tabel/grafik) | N6 | Belum |
| [AC-4](#ac-4) | P1 | AI Chat | Gerbang persetujuan outline dan kepatuhan instruksi | N18, N11, N12, N16, N13 | Sebagian |
| [AC-5](#ac-5) | P1 | AI Chat | Balasan kosong dan galat provider diperlakukan dengan benar | T2, T7 | Selesai |
| [AC-6](#ac-6) | P1 | AI Chat | Batas waktu berbasis jeda diam, bukan total durasi | T1, N7 | Belum |
| [AC-7](#ac-7) | P1 | AI Chat | Panjang dokumen mengikuti target halaman | N8 | Sebagian |
| [CO-1](#co-1) | P1 | Biaya | Ongkos tetap per panggilan diturunkan, biaya terlihat | N15, N20, T14, T13, K4 | Belum |
| [MD-1](#md-1) | P1 | Model | Picker model dikunci ke Flash untuk produksi | N14, T8, N19 | Belum |
| [EX-2](#ex-2) | P1 | Ekspor PDF | Halaman kosong di akhir dokumen | N9 | Selesai |
| [EX-3](#ex-3) | P1 | Ekspor | Dokumen multi-tab: cakupan ekspor tidak diam-diam sebagian | N10 | Belum |
| [EX-4](#ex-4) | P1 | Ekspor PDF | Sorotan bekas aksi AI ikut tercetak | T10 | Belum |
| [TP-1](#tp-1) | P1 | Template | Template jurnal dirapikan, template laporan formal ditambah | T12, K3 | Selesai |
| [DR-1](#dr-1) | P1 | `/drafts` | Jalur PPE disetarakan dengan AI Chat | T5, T6, T11, T17, K2 | Belum |
| [FL-1](#fl-1) | P1 | Alur | Alur onboard → outline → setujui → dokumen jadi fitur | K1 | Belum |
| [AC-8](#ac-8) | P2 | AI Chat | Penjaga em/en dash masih bocor | N17, T15 | Belum |
| [EX-5](#ex-5) | P2 | Dokumen | Judul "Untitled document" dan nama berkas ekspor | T16 | Belum |
| [UI-1](#ui-1) | P2 | UI | Bahasa campur dan hitungan halaman editor ≠ PDF | T18, T19 | Belum |
| [EX-6](#ex-6) | P2 | Ekspor PDF | PDF editor tidak bergantung pada dialog cetak browser | K5 | Belum |
| [QA-1](#qa-1) | P1 | Kualitas | Uji regresi use case otomatis sebagai gerbang rilis | — | Selesai |
| [QA-2](#qa-2) | P2 | Kualitas | Uji worker basi, temuan biome, `.venv` rusak | U1, U2, U3 | Belum |
| [AC-9](#ac-9) | P0 | AI Chat | Satu balasan >64 ribu karakter mematikan seluruh percakapan | 27 Sep | Selesai |
| [CO-2](#co-2) | P0 | Biaya | Aksi yang sedang diterapkan bisa diterapkan lagi | 27 Sep | Selesai |
| [ED-3](#ed-3) | P1 | Editor | Bab baru ditambahkan di akhir dokumen, bukan di urutannya | 27 Sep | Selesai |
| [AC-10](#ac-10) | P1 | AI Chat | Kerangka yang tidak bisa dipenuhi membuat tugas berputar | 27 Sep | Selesai |
| [ED-4](#ed-4) | P0 | Editor | Separuh permintaan gambar ke sub-agent gagal | 28 Sep | Selesai |
| [TP-2](#tp-2) | P1 | Template | Laporan Praktikum: setiap heading membuka halaman, target halaman mustahil | 28 Sep | Selesai |
| [ED-5](#ed-5) | P1 | Editor | `write_section` menggandakan subbab yang judulnya diganti model | 28 Sep | Selesai |
| [ED-6](#ed-6) | P2 | Editor | Mermaid yang ditulis sebagai pagar kode tidak digambar | 28 Sep | Selesai |

Butir yang saling bergantung: AC-2, AC-7, dan FL-1 memakai rencana tugas dari AC-1, jadi rencana itu
dikerjakan lebih dulu. Gerbang tool di AC-4 adalah pekerjaan yang sama dengan "tool per fase" di CO-1.

---

## Kriteria "AI Chat siap produksi"

Usulan patokan terukur untuk memutuskan kapan model kelas atas layak dibuka. Setiap patokan diukur
dengan rangkaian 9 use case yang sama ([QA-1](#qa-1)).

| Patokan | Flash, 21 Sep | Flash, 27 Sep ([hasil](#hasil-27sep)) | Flash, 28 Sep ([hasil](#hasil-28sep)) | Target |
|---|---|---|---|---|
| Dokumen yang memenuhi semua syaratnya | 0 dari 9 | 1 dari 9 (UC7) | 2 dari 9 (UC1, UC6); dengan ulangan 4 case yang terputus: 4 dari 9 (+UC4, UC9) | ≥ 8 dari 9 |
| Dorongan manual "lanjutkan" per dokumen | 0–8, sering > 0 | 0–3; 4 dari 9 tanpa dorongan | 0–7; 60 lanjutan otomatis "jeda suntingan" | 0 |
| Elemen visual yang diminta ada sebagai gambar di DOCX | 4 dari 9 dokumen tanpa gambar sama sekali | 3 dari 8; UC1, UC2, UC8 tanpa gambar | 5 dari 8; UC2 8 gambar; separuh permintaan gambar gagal ([ED-4](#ed-4)) | Semua |
| Kerusakan struktur (isi di heading, urutan terbalik, heading duplikat) | Muncul di kedua model | 0 heading berisi paragraf; BAB IV di akhir (UC2) | 0 di 5 dokumen yang selesai; urutan bab UC2 benar | 0 |
| Jumlah halaman dalam rentang yang diminta (±1) | 2 dari 8 dokumen bertarget halaman | 2 dari 8; tiga lainnya lewat 1 halaman | 6 dari 8; UC2 29, UC3 15 halaman | ≥ 7 dari 8 |
| Biaya rata-rata per dokumen, Flash | ±US$0,08 | US$0,09 (tagihan) | US$0,15 (tagihan) | Tetap atau turun |

Model kelas atas baru layak dibandingkan setelah patokan di atas tercapai dengan Flash. Sebelum itu,
yang diuji sebenarnya editor, bukan modelnya.

### <a id="hasil-27sep"></a>Hasil putaran 27 Sep

Kode: branch `uji/putaran-27sep` (brief + EX-1, EX-7, ED-1, AC-1/2/7, CO-2, penggerak QA-1). Berkas dan
laporan: `/mnt/doc/Reacteev/writer-hub-test/hasil-27sep/` (`laporan.md`). Biaya US$0,77 untuk 9 dokumen,
ditambah ±US$0,57 untuk dua uji-asap.

| Case | 21 Sep | 27 Sep | Syarat yang belum terpenuhi (27 Sep) |
|---|---|---|---|
| UC1 Jurnal | 18 hlm, 0 gambar, isi di heading, 6 dorongan | 14 hlm, 3 tabel, 2 kolom, 0 dorongan | 14 dari 8–12 hlm; 0 dari 2 gambar |
| UC2 Skripsi | 25 hlm, 2 gambar, 8 dorongan | 32 hlm, 4 tabel, 3 dorongan | 32 dari 12–15 hlm; 0 dari 4 gambar; BAB IV sesudah Lampiran; Lampiran kosong |
| UC3 Laporan tokoh | urutan terbalik, bagian kosong | terhenti di menit ke-3 | galat 400, lihat [AC-9](#ac-9) |
| UC4 Kajian MBG | 6 hlm, 1 tabel, 0 gambar | 14 hlm, 4 tabel, 2 gambar, 0 dorongan | 14 dari 8–12 hlm |
| UC5 Flyer | 2 hlm, hlm 2 kosong | 2 hlm, tanpa halaman kosong | harus tepat 1 hlm ([EX-2](#ex-2)) |
| UC6 Proposal | 12 hlm, tanpa bagian Risiko | 12 hlm, 7 tabel, 1 chart | 12 dari 6–10 hlm |
| UC7 CV + surat | subjudul bukan heading | **lolos**, 0 dorongan | - |
| UC8 Praktikum | 24 hlm, 0 gambar | 7 hlm, semua bagian | 0 dari 1 chart |
| UC9 Data + grafik | 1 dari 2 gambar | 1 dari 2 gambar | 1 dari 2 gambar |

Yang paling menentukan: gambar ([ED-2](#ed-2)). Di UC1, UC2, dan UC8 model menggambar diagramnya, lalu
mengubahnya sendiri menjadi blok HTML karena `get_outline` melaporkan diagram itu sebagai "HTML yang
belum dirender", dan blok HTML itu hilang dari DOCX.

---

### <a id="hasil-28sep"></a>Hasil putaran 28 Sep

Kode: branch `uji/putaran-28sep` (putaran 27 Sep + ED-2, AC-9, AC-10, ED-3). Berkas dan laporan:
`/mnt/doc/Reacteev/writer-hub-test/hasil-28sep/` (`laporan.md`). Biaya US$1,36 untuk 9 dokumen, di atas
perkiraan US$0,80: UC2, UC3, dan UC8 berjalan sampai batas 60 menit.

| Case | 27 Sep | 28 Sep | Syarat yang belum terpenuhi (28 Sep) |
|---|---|---|---|
| UC1 Jurnal | 14 hlm, 0 gambar | **lolos**: 12 hlm, 3 tabel, 2 gambar | - |
| UC2 Skripsi | 32 hlm, 0 gambar, BAB IV di akhir | 29 hlm, 4 tabel, 8 gambar, urutan bab benar | 29 dari 12–15 hlm (±9 hlm halaman depan) |
| UC3 Laporan tokoh | terhenti, galat 400 | 15 hlm, 1 tabel, 3 gambar | 15 dari 8–12 hlm; "Tabel 1" tidak disebut; tanpa Ringkasan Eksekutif |
| UC4 Kajian MBG | 14 hlm, 2 gambar | galat penggerak | 1 dari 2 gambar (dua `draw_diagram` gagal) |
| UC5 Flyer | 2 hlm | galat penggerak di menit ke-2 | - |
| UC6 Proposal | 12 dari 6–10 hlm | **lolos**: 10 hlm, 5 tabel, 1 chart | - |
| UC7 CV + surat | lolos | galat penggerak di menit ke-2 | - |
| UC8 Praktikum | 0 dari 1 chart | 8 hlm, 2 tabel, 1 chart | bagian Pembahasan hilang, lihat [TP-2](#tp-2) |
| UC9 Data + grafik | 1 dari 2 gambar | galat penggerak di menit ke-3 | - |

- Yang membaik:
  - Gambar sampai ke DOCX: UC1 2 gambar dan UC2 8 gambar, dari 0 dan 0 ([ED-2](#ed-2)).
  - Tidak ada kerusakan struktur di lima dokumen yang selesai. BAB IV UC2 berada di urutannya ([ED-3](#ed-3)).
  - UC3 selesai tanpa DSML bocor.
- Empat "galat penggerak" adalah cacat alat uji, bukan aplikasi. Sudah diperbaiki (`ede1092`), dan empat
  case itu perlu dijalankan ulang:
  - UC5, UC7, UC9: model menampilkan kartu pertanyaan bertahap di tahap outline. Penggerak tidak
    mengenalinya karena judul kartu ditulis huruf besar lewat CSS ("PERTANYAAN AI"). Putaran 27 dan 28 Sep
    tidak pernah menjawab satu kartu pun.
  - UC4: model menulis seluruh laporan tanpa menunggu persetujuan outline ([AC-4](#ac-4)). Batas 15 menit
    tahap outline habis saat ia masih berjalan.
- Temuan baru:
  - [ED-4](#ed-4): 24 dari 46 permintaan gambar gagal.
  - [TP-2](#tp-2): format Laporan Praktikum membuat target halaman mustahil, dan model berputar menghapus
    bagian.
  - [ED-5](#ed-5): `write_section` menggandakan subbab yang judulnya diganti model.
  - [ED-6](#ed-6): Mermaid yang ditulis sebagai pagar kode tidak digambar.
- Lanjutan otomatis "jeda suntingan" naik dari 27 menjadi 60. Sebagian besar dari UC8 (22) dan UC2 (14),
  yaitu dokumen yang berputar karena dua temuan di atas.

**Ulangan 28 Sep pagi** (UC4, UC5, UC7, UC9; kode + [ED-4](#ed-4), [ED-6](#ed-6), penggerak `ede1092`).
Berkas: `/mnt/doc/Reacteev/writer-hub-test/hasil-28sep-ulang/`. Biaya ±US$0,18.

| Case | Hasil | Catatan |
|---|---|---|
| UC4 Kajian MBG | **lolos**: 11 hlm, 3 tabel, 2 gambar, 0 dorongan, 12 menit | Percobaan pertama gagal karena bug baru dari parser AC-9 (lihat [AC-9](#ac-9), `ecdfb70`) |
| UC5 Flyer | 2 hlm; 3 bagian kosong | Flyer HTML masuk, tetapi kerangka heading template tidak dihapus; sama seperti 27 Sep |
| UC7 CV + surat | heading "Surat Lamaran Pekerjaan" ganda | Alat tulis hanya bekerja di tab aktif. Model gagal mengisi tab surat yang baru, lalu membuat tab kedua ([AC-4](#ac-4)) |
| UC9 Data + grafik | **lolos**: tabel dan dua grafik, angka sesuai data | Satu bar chart ditolak cek skala. Alasannya sampai ke model, dan percobaan kedua berhasil |

- Gambar sesudah ED-4: 6 dari 7 permintaan berhasil dalam 16–166 detik. Satu ditolak cek skala dalam 23
  detik dan berhasil pada percobaan berikutnya. Sebelumnya 24 dari 46 gagal.
- Perbaikan kartu pertanyaan di penggerak belum teruji; kali ini model tidak memunculkan kartu.

**Uji perbaikan 28 Sep siang** (UC5, UC7, UC8; kode + TP-2, ED-5, UC5, UC7 sesudah tinjauan).
Berkas: `/mnt/doc/Reacteev/writer-hub-test/hasil-28sep-perbaikan/`. Biaya US$0,32.

| Case | Hasil | Catatan |
|---|---|---|
| UC5 Flyer | 2 halaman | Kerangka template tergantikan, dan flyer mengisi halaman 1. Halaman 2 kosong berisi nomor halaman ([EX-2](#ex-2)) |
| UC7 CV + surat | **lolos** | CV dan surat di tab masing-masing lewat `switch_tab`; 4 menit, US$0,03 |
| UC8 Praktikum | **lolos** | 7 halaman, 2 tabel, 1 gambar, 0 dorongan; 31 `write_section` dan 7 penghapusan, turun dari 123 dan 47 |

**Ulang UC5/UC7 sesudah perbaikan tinjauan** (`hasil-28sep-perbaikan-2/`, US$0,09):
- UC7 tetap **lolos**. `switch_tab` yang dipanggil dengan judul tab gagal, sisa aksinya tidak ditunda,
  dan model lalu memakai id yang benar.
- UC5: 3 halaman.
  - Model lebih dulu menulis "English Booster" ke bagian "Headline Utama", jadi dokumen tidak lagi
    sama dengan template, dan aturan kerangka dengan benar menolak menghapusnya.
  - Model lalu menghapus bagian satu per satu dengan `restructure_section`. Blok flyer berada di bawah
    heading pertama, jadi ikut terhapus. Model menulis ulang flyer-nya.
  - **Temuan baru:** `restructure_section delete` masih menghapus gambar dan blok desain diam-diam,
    tidak seperti alat tulis lain sejak [ED-2](#ed-2).
  - Usulan: blok gambar di bagian yang dihapus dipertahankan seperti `keepFigures`, dan desain
    satu halaman disisipkan di awal dokumen, bukan di kursor.

**Pemeriksaan dokumen oleh penulis (28 Sep sore):**
- **UC5:** tinggal satu halaman tambahan sesudah flyer ([EX-2](#ex-2)). Kerangka template sudah bersih.
- **UC7:** isi dan tab sudah benar, tetapi heading tingkat 1 bawaan template "Nama Lengkap" masih
  tercetak di atas nama asli "Andi Pratama".
  - Template CV memakai heading itu sebagai pengganti, bukan judul bagian.
  - `write_section` selalu mempertahankan heading, dan tidak ada alat untuk mengganti teks heading, jadi
    model menulis nama di bawahnya.
  - Hal yang sama bisa terjadi pada "Headline Utama" (flyer) dan "Judul Artikel" (jurnal).
  - Diteruskan ke agen lain: `/mnt/doc/Reacteev/writer-hub-test/PROMPT-perbaikan-3.md`.

**Perbaikan-4: template baru dan sisa perbaikan (28 Sep malam)**

Diuji di `hasil-29sep-template/` (US$0,22) dan `hasil-template-baru/`. Pemeriksaan yang terakhir tanpa
model: dokumen dibuat dari template lalu diekspor.

| Case | Hasil | Catatan |
|---|---|---|
| UC4 Kajian MBG | **lolos**: 13 halaman, 3 tabel, 2 gambar | Memakai template baru "Laporan Kajian Kebijakan". Berhenti karena dorongan tanpa kemajuan, sesudah 2 dorongan manual. |
| UC5 Flyer | 3 halaman | Model lebih dulu menulis "English Booster" ke heading template, jadi kerangka tidak lagi dianggap kerangka dan tidak digantikan. Flyer terdorong ke halaman 2; halaman 3 berisi sisa kerangka dan teks "[Flyer full-page design - see rendered block below]". |
| UC7 CV + surat | **lolos** | CV diawali nama asli lewat `new_heading`. Surat dibuat di tab baru dari template surat (`create_tab` dengan template). Tidak ada tempat isian yang tersisa. |

Temuan tinjauan:
- **B1** (garis bawah heading) dan **B2** (perataan per paragraf) bekerja di editor, PDF, dan DOCX. CV baru
  sesuai acuan.
- **B3 tab stop belum bekerja di editor dan PDF.**
  - Node tab selalu selebar 0,5 inci (`display: inline-block; width: 0.5in`), dan `tabStops` hanya
    disimpan sebagai atribut. NodeView penghitung lebarnya tidak ada.
  - Di DOCX, `<w:tabs>` dan `<w:tab/>` ikut.
  - Tombol Tab di paragraf tetap menambah indentasi (`indentLeft` +48), karena ekstensi indentasi lama
    menangkapnya lebih dulu. Perlu keputusan produk. Di tabel, Tab tetap berpindah sel.
- **Surat lamaran:**
  - Baris-baris kerangka yang berurutan ("Kepada Yth." dan seterusnya, serta blok data) digabung
    kompilator menjadi satu paragraf.
  - Jarak antarblok dan ruang tanda tangan hilang.
  - Di UC7, blok data pelamar tampil kacau, dengan baris menyatu dan titik dua tidak sejajar.
- **Kajian:** kerangkanya sesuai (10 halaman kosong), tetapi halaman judulnya rata kiri.
- **Uji:** hanya 3 uji baru untuk seluruh perbaikan-4. Commit B (`7232123`, 314 baris) tanpa uji.
- **Branch:** `feat/uc4-kajian-kebijakan` dan `feat/tab-dari-template` bercabang dari branch uji, bukan
  dari basis yang diminta, jadi keduanya membawa seluruh isi branch uji.

**Perbaikan-5, dikerjakan langsung (28 Sep malam).** Berkas di `hasil-template-baru-2/`,
`hasil-29sep-perbaikan5/`, dan `hasil-29sep-perbaikan5-uc5/`.
- **Tab stop (`8367442`):**
  - Lebar tab dihitung dari tab stop paragraf. Diuji di Edge: label berbeda panjang, titik dua sejajar.
  - Tombol Tab mengikuti Word: di tengah baris menyisipkan tab; di awal paragraf, daftar, dan tabel
    tetap perilaku lama.
  - Ekspor DOCX kini memakai twip yang benar (sebelumnya 120 pt jadi 90 pt).
  - Impor DOCX menjadikan `<w:tab/>` node tab.
  - Kerangka template mendukung pindah baris dengan `\` di akhir baris.
- **Template (`93e842f`):**
  - Surat lamaran kini per blok, dengan tab stop 144 pt. Hasilnya 1 halaman, dan titik dua sejajar di
    editor, PDF, dan DOCX.
  - Halaman judul kajian rata tengah.
  - Flyer dan poster diberi aturan "desain satu halaman sebagai tulisan pertama". Di UC5 aturan ini
    berhasil: kerangka tergantikan.
- **EX-2 (`ced4d30`):**
  - Penyebab sebenarnya: penyangga paginasi berdiri di antara flyer dan paragraf kosong, dan tanda
    `trailingPageFit` tidak pernah hidup untuk blok HTML.
  - Setelah diperbaiki, dokumen UC5 dicetak ulang di aplikasi: **1 halaman**.
  - Uji cetak baru memakai bentuk DOM sungguhan.
- **Hasil uji:**
  - UC7 **lolos**, tetapi boros: model bolak-balik `switch_tab` sepuluh kali, 7 lanjutan otomatis,
    US$0,13.
  - UC5 masih 2 halaman karena **sebab baru**: model memanggil `insert_html_block` dua kali, dan desain
    kedua ditambahkan sebagai halaman 2, tidak menggantikan yang pertama. Menggantikan atau menambah
    adalah keputusan produk. Ada juga emoji (💥, ➔) yang lolos sebagai ikon.
- **Sisa kecil surat:** di PDF, jarak sesudah blok data dan sesudah daftar lampiran tidak muncul,
  padahal di editor ada.

Dengan hasil ini (sebelum perbaikan-4), 6 dari 9 use case sudah pernah lolos: UC1, UC4, UC6, UC7, UC8, UC9.
UC2, UC3, dan UC5 belum. Hasil UC1, UC4, UC6, dan UC9 berasal dari kode sebelum perbaikan siang ini.

---

## AI Chat

### <a id="ac-1"></a>AC-1 · Tugas panjang berjalan sampai outline selesai · P0

**Masalah.** Delapan dari sembilan dokumen berhenti sebelum selesai dan baru lanjut setelah diminta:
UC1 enam kali, UC2 delapan kali (tetap belum lengkap setelah 141 panggilan). Ada dua penyebab:

1. **Batas gelombang edit.** `MAX_WRITE_WAVES = 8` beserta `WRITE_WAVE_NOTICE`, yang meminta model
   *"Wrap up: summarize what changed and what is left for the writer to decide"*, secara harfiah
   menyuruh model berhenti. Model lalu membalas "Karena batasan sistem, saya tidak bisa melanjutkan
   dalam satu sesi…".
2. **Batas tugas menghapus konteks.** Pesan "lanjutkan" dianggap tugas baru (`TASK_BOUNDARY_GUIDANCE`),
   sehingga model kehilangan outline dan membalas menu generik "Apa yang ingin Anda lakukan dengan
   dokumen ini?" (N13). Riset web yang sama pun diulang dari nol setelah outline disetujui (T13).

**Usulan.**
- Outline yang disetujui disimpan sebagai **rencana tugas**: daftar bagian beserta tabel/gambar yang
  dijanjikan tiap bagian. Rencana ini ikut di setiap giliran dan tidak terhapus oleh batas tugas.
- Saat batas gelombang tercapai dan rencana masih punya bagian kosong, sediakan **"Lanjutkan (bagian
  5 dari 9)"** satu klik, atau lanjut otomatis bila penulis mengizinkan. Pesan sistem yang menyuruh
  model "wrap up" tidak dipakai lagi selama rencana belum habis.
- Hasil riset dari giliran outline dibawa ke giliran menulis, jangan dibuang di batas tugas.
- Pertimbangkan menaruh rencana ini di panel Metadata yang sedang dikerjakan di `feat/brief-penelitian`
  (isian "isi per bab"), supaya tidak ada dua sumber kebenaran.

**Lokasi.** `apps/web/features/chat/chat-context.tsx:106-116` (`MAX_TOOL_ROUNDS`, `MAX_WRITE_WAVES`,
`WRITE_WAVE_NOTICE`), `apps/api/src/services/chat/prompts.ts:206` (`TASK_BOUNDARY_GUIDANCE`).

**Selesai bila.** UC1–UC8 selesai tanpa satu pun pesan "lanjutkan" yang diketik penulis.

**Status (27 Sep): Sebagian** (`f8d226e`, branch `feat/rencana-tugas`, di atas `fix/struktur-editor`).
Semua usulan sudah dikerjakan, tetapi kriteria "Selesai bila" belum tercapai: pada
[putaran 27 Sep](#hasil-27sep) dorongan manual turun dari 0–8 menjadi 0–3, dan baru 4 dari 9 dokumen
tanpa dorongan. Sisa dorongan terutama datang dari bab yang gambarnya tidak pernah jadi
([ED-2](#ed-2)), dari UC3 yang terhenti ([AC-9](#ac-9)), dan dari lingkaran [AC-10](#ac-10).
- Sebelumnya (`089f67e`, `2fd773d`):
  - `WRITE_WAVE_NOTICE` dihapus. Batas gelombang kini menjeda tugas, lalu melanjutkannya otomatis
    maksimal 3 kali.
  - "lanjut" yang diketik penulis meneruskan tugas yang sama.
  - Tersedia tombol "Lanjutkan" dan perintah `/lanjut`.
- Rencana tugas:
  - Alat baru `set_outline` (alat baca, tanpa kartu persetujuan) mencatat bab berurutan beserta
    tabel/gambar yang dijanjikan, rentang halaman, dan catatan riset.
  - Semuanya disimpan di brief, dalam daftar bab yang sama dengan panel Metadata, jadi ikut di setiap
    giliran. Kerangka menggantikan bab rekaan AI dan semaian template; bab tulisan penulis tetap.
- Riset: catatan riset dirender di prompt dengan pesan "pakai ini, jangan mencari lagi" (T13). Hasil alat
  riset lama tidak dibawa utuh, karena mengirimnya di setiap giliran menulis lebih mahal daripada
  mencatat intinya.
- Lanjut otomatis: model yang menutup tugas menulis sementara kerangka belum terpenuhi memicu macet
  `unfinished`. Tugas itu dilanjutkan sendiri, dengan jatah dan rem yang sama seperti sebab macet lain.
  Ini hanya berlaku untuk tugas yang mencatat kerangka atau tepat sesudahnya, supaya permintaan kecil di
  lain waktu tidak berubah menjadi menulis seluruh sisa kerangka.

### <a id="ac-2"></a>AC-2 · Pemeriksaan kelengkapan terhadap outline · P0

**Masalah.** Tidak ada yang memeriksa apakah dokumen sudah sesuai dengan outline yang disetujui. Label
"Gambar 2" bisa tertulis tanpa gambarnya, atau bahkan tidak ada sama sekali (UC1). UC2 berakhir
dengan 2 dari 4 gambar, UC4 dengan 6 halaman dari target 8–12. Penulis baru tahu setelah membaca ulang
seluruh dokumen.

> Catatan: temuan lama N2 ("AI mengaku selesai padahal belum") **dicabut** karena salah baca alat uji.
> Usulan ini bersifat pencegahan, bukan jawaban atas bug yang terbukti.

**Usulan.** Pemeriksaan deterministik di klien, tanpa model, dijalankan setiap kali satu gelombang
edit berakhir:
- Setiap heading dari rencana tugas (AC-1) ada dan tidak kosong.
- Setiap label "Tabel N" / "Gambar N" yang dijanjikan menunjuk node tabel atau gambar yang nyata,
  bukan sekadar teks.
- Jumlah halaman terkini dibandingkan dengan target.

Hasilnya ditampilkan ke penulis ("Belum ada: Gambar 2, Tabel 3 · 18 dari 8–12 halaman") dan diumpankan
ke giliran berikutnya.

**Selesai bila.** Pada rangkaian uji, setiap syarat yang tidak terpenuhi tampil di panel sebelum
penulis mengekspor.

**Status (27 Sep): Selesai** (`f8d226e`, branch `feat/rencana-tugas`).
- `features/chat/outline-check.ts` memeriksa naskah terhadap kerangka, tanpa model:
  - bab berisi, kosong, atau belum ada, di semua tab;
  - setiap label "Tabel N"/"Gambar N" harus membuka keterangan dengan tabel atau gambar nyata dalam dua
    blok di dekatnya ("Tabel 10" bukan "Tabel 1", dan sebutan di kalimat bukan keterangan);
  - panjang terhadap target.
- Hasilnya dikirim ke model di setiap giliran ("Outline check: …"), dan ditampilkan di tombol
  Lanjutkan, kartu macet, dan panel Metadata. Contoh tampilan: "2 bab kosong · Gambar 2 belum ada · 18
  dari 8-12 hlm".
- Batasan:
  - Yang diperiksa hanya isi kerangka. Syarat lain (dua kolom, tanpa emoji) tetap dinilai alat uji
    QA-1.
  - Belum ada peringatan di dialog ekspor itu sendiri.

### <a id="ac-3"></a>AC-3 · Masukan gambar di chat · P1

**Masalah.** Chat tidak punya jalur gambar sama sekali. Isi pesan bertipe string, tidak ada
`image_url` di seluruh repo, dan konteks dokumen dibuat dari `editor.getText()`, sehingga gambar di
dokumen tidak menghasilkan teks apa pun. Permintaan "berdasarkan data di gambar ini, sajikan dalam bentuk
tabel dan grafik" dijawab model: *"tidak memiliki kemampuan OCR atau penglihatan"*.

**Usulan.**
- Tombol unggah atau tempel gambar di composer, dan isi pesan menjadi larik bagian (`text` +
  `image_url`) sesuai format OpenAI/OpenRouter.
- Gambar yang sudah ada di dokumen bisa dirujuk ("pakai gambar yang saya pilih").
- **Karena produksi memakai Flash yang tidak menerima gambar:** pesan bergambar dialihkan dulu ke satu
  panggilan model visi murah (mis. Gemini 3.6 Flash, yang sudah ada di picker) untuk mentranskripsi
  data gambar menjadi tabel teks. Setelah itu Flash melanjutkan seperti biasa. Hasil transkripsi
  ditampilkan agar penulis bisa mengoreksi angkanya.

**Lokasi.** `apps/api/src/services/chat/dto.ts:10`, `apps/web/features/editor/text-content.ts:5`.

**Selesai bila.** UC9 berjalan dengan gambar asli dan angka di tabel sama dengan angka di gambar.

### <a id="ac-4"></a>AC-4 · Gerbang persetujuan dan kepatuhan instruksi · P1

**Masalah.** Beberapa instruksi eksplisit dilanggar:

| Instruksi | Yang terjadi | Asal |
|---|---|---|
| "Jangan menulis apa pun sebelum outline disetujui" | Aksi "Apply document format: skripsi-s1" diusulkan saat tahap outline | N18 |
| "Surat lamaran di tab kedua" | Keduanya ditulis di satu tab, `create_tab` tidak pernah dipanggil | N11 |
| (Dokumen dari template "Laporan Kuartalan") | `apply_template_format` dipanggil dengan slug `laporan-bulanan`, tanpa pemberitahuan | N12 |
| "Pendahuluan 2 kolom" | `set_columns` diterapkan dulu ke seluruh dokumen | N16, T9 |
| "Padatkan jadi maksimal 10 halaman" | Dijawab daftar kemungkinan tindakan, tidak dikerjakan | N13 |

**Usulan.**
- **Gerbang di server, bukan hanya di prompt.** Selama ada outline yang belum disetujui, daftar tool yang
  dikirim ke model hanya berisi tool baca dan riset. Tool tulis baru dibuka setelah persetujuan.
- `apply_template_format` dikunci ke template dokumen itu. Mengganti template harus lewat usulan yang
  menyebutnya secara eksplisit ("Ganti format dari Laporan Kuartalan ke Laporan Bulanan?").
- `set_columns` secara bawaan berlaku untuk bagian yang disebut. Cakupan "seluruh dokumen" hanya
  dipakai bila diminta.
- Permintaan yang jelas langsung dikerjakan. Untuk yang benar-benar ambigu, pakai kartu pertanyaan
  pilihan ganda (`ask_user`, sedang dikerjakan di `feat/brief-penelitian`) sebagai ganti menu teks
  bebas.

**Lokasi.** `apps/web/features/chat/tools.ts:526` (`apply_template_format`), `:581` (`set_columns`),
`:591` (`create_tab`); daftar tool per giliran di `apps/api/src/services/chat/service.ts`.

**Status (27 Sep): Sebagian.**
- Sudah: kartu pertanyaan `ask_user` (`11f35a5`, `45e2de4`). `apply_template_format` menolak menerapkan
  ulang format yang sama tanpa `reapply: true` (`e15b6d6`).
- Sisa: gerbang tool di server, karena semua tool masih dikirim setiap giliran (`service.ts:114`).
  `apply_template_format` masih menerima slug template lain selain template dokumen (`tools.ts:1087`).
  Bawaan `set_columns` masih seluruh dokumen, dan kepatuhan pada `create_tab` belum ditangani.
- Temuan 28 Sep (UC7 ulang): `replace_text`/`write_section` hanya bekerja di tab aktif. Tab baru dari
  `create_tab` tidak bisa disunting tanpa membukanya, dan model membuat tab surat kedua.
- Perbaikan UC7 (`ad70084` + `bb6ad65`, branch `fix/pindah-tab`):
  - Alat `switch_tab` untuk berpindah tab.
  - Bila teks yang dicari ada di tab lain, pesannya menyebut tab itu.
  - Aksi yang dikirim sesudah `switch_tab` dalam balasan yang sama tidak dijalankan dan dijawab "Not run".
    Tanpa itu, aksi tersebut menulis ke tab lama, karena pergantian tab di React tidak sinkron.
  - Uji UC7 siang 28 Sep **lolos**: CV di satu tab, surat di tab sendiri lewat `switch_tab`, tanpa
    heading ganda.
  - `31013f0`:
    - Sisa aksi hanya ditunda bila `switch_tab` berhasil, lewat fungsi murni `applyInOrder` yang
      bisa diuji.
    - `runWriteTool` membaca fungsi tab lewat ref, supaya `selectSession` tidak basi.
  **Perbaikan 28 Sep** (`ad70084`, branch `fix/pindah-tab`): alat baru `switch_tab` mengganti tab aktif.
  `find_text`, `replace_text`, dan `write_section` kini menyebut tab mana yang menyimpan teks/heading
  bila tidak ada di tab aktif, jadi model tahu harus `switch_tab` dulu. Diuji dengan unit test; uji
  editor sungguhan ditunda ke akhir putaran.
- Temuan 28 Sep: di UC4, model menulis seluruh laporan pada tahap outline, padahal prompt meminta outline
  dulu dan "jangan menulis apa pun sebelum outline saya setujui". Gerbang di server akan mencegahnya.
- **Perbaikan 28 Sep malam** (`375c609`, branch `feat/tab-dari-template`): `create_tab` menerima parameter
  `template` (slug). Tab baru diisi dengan isi, tata letak, dan tipografi template tersebut. UC7: surat
  lamaran di tab kedua kini memakai `template: "surat-lamaran-kerja"`. Masih sisa: gerbang tool di
  server dan `apply_template_format` terkunci ke template dokumen.

### <a id="ac-5"></a>AC-5 · Balasan kosong dan galat provider · P1

**Masalah.**
- Provider membalas `connecting → thinking → done` dalam 960 ms tanpa teks maupun tool call. Chat
  menerimanya sebagai giliran selesai, lalu berhenti diam-diam (T2).
- Saldo habis (HTTP 402) dibaca sebagai "provider menolak tool calling": ada satu panggilan ulang tanpa
  tool yang sia-sia, lalu saran yang salah, "Periksa kunci API dan model yang dipilih" (T7).

**Usulan.**
- Giliran tanpa teks dan tanpa tool call menjadi galat `empty_response` (kode yang sudah dipakai jalur
  `/drafts`) dan dicoba ulang sekali.
- Coba ulang tanpa tool hanya untuk 400/422 yang memang menyebut tool. 401, 402, 403, dan 429 langsung
  diteruskan sebagai galat.
- 402 dipetakan ke kategori saldo/kuota dengan pesan yang benar.

**Lokasi.** `apps/api/src/services/chat/stream.ts:53-57`, `packages/shared/src/provider-failure.ts:42`,
`apps/web/features/chat/failure.ts`.

**Status (27 Sep): Selesai** (`089f67e`). Giliran kosong dicoba ulang otomatis sebagai macet `empty` di
klien (`features/chat/stall.ts`), bukan lewat kode `empty_response` di server; hasilnya sama.
`rejectsTools` hanya membaca penolakan yang memang soal tool, dan 401/402/403/429 tidak pernah
dianggap begitu. 402 menjadi `quota_exceeded` dengan pesan saldo.

### <a id="ac-6"></a>AC-6 · Batas waktu berbasis jeda diam · P1

**Masalah.**
- Chat: `AbortSignal.timeout(AI_REQUEST_TIMEOUT_MS)` (120 dtk) memotong **total** durasi respons. Di
  DeepInfra, argumen tool call ditahan sampai lengkap, sehingga tulisan > ±11 ribu token pasti gagal
  (T1). Lewat OpenRouter argumen mengalir bertahap, jadi pada konfigurasi sekarang risikonya lebih
  kecil, tetapi batasnya tetap salah ukur.

---

### Update 28 Sep 2026 malam — Perbaikan-4 (PROMPT-perbaikan-4.md)

Kode di branch `uji/putaran-28sep`. Semua tugas ter-commit ke branch masing-masing lalu di-merge
dengan `--no-ff`.

| Tugas | Branch | Commit | Isi |
|---|---|---|---|
| A1 `new_heading` | `fix/ganti-heading` | `1f283e0` | `ReferenceError` saat `write_section` dengan `new_heading` |
| A2 gambar `restructure_section delete` | `fix/hapus-bagian-gambar` | `d4ad2ab` | gambar tidak hilang bergeser |
| B1 `borderBottom` | `feat/format-template` | `7232123` | `BlockStyle.borderBottom` → CSS + DOCX |
| B2 perataan | `feat/format-template` | `7232123` | `{:align=center/right/justify}` di kerangka |
| B3 tab stop | `feat/format-template` | `7232123` | `{:tabs=...}` + node `tab` + ekstensi `TabStops` |
| C1 `cv-ats` | `feat/template-surat-cv-kajian` | `635f984` | ganti template CV ATS |
| C2 `surat-lamaran-kerja` | `feat/template-surat-cv-kajian` | `635f984` | ganti template surat lamaran |
| C3 `laporan-kajian-kebijakan` | `feat/template-surat-cv-kajian` | `635f984` | template baru kajian kebijakan |
| UC4 | `feat/uc4-kajian-kebijakan` | `5f00840` | ganti template UC4 ke Laporan Kajian Kebijakan |
| D `create_tab` template | `feat/tab-dari-template` | `375c609` | parameter `template` di `create_tab` |

**Verifikasi otomatis** (branch `uji/putaran-28sep`):
- Typecheck: shared 0 error, api 0 error, web 0 error.
- Test: shared 63 pass / 0 fail, api 367 pass / 0 fail, web 1369 pass / 0 fail.
- API restart + `curl` untuk `cv-ats`, `surat-lamaran-kerja`, `laporan-kajian-kebijakan` — ketiganya
  tersedia.

**Belum terverifikasi:**
- Uji use case sungguhan (UC4, UC5, UC7) belum dijalankan terhadap kode perbaikan-4.
- Uji cetak/PDF untuk template kajian kebijakan belum dijalankan.
- Biaya uji belum tersedia.

### Update 28 Sep 2026 — Implementasi singkat

- **EX-2 (Halaman kosong setelah page-fit):** Diperbaiki — tambahan CSS cetak untuk menyembunyikan paragraf kosong setelah `HTML_BLOCK` ber-`fit: 'page'`, penyesuaian logika paginasi (`trailingPageFit`), dan pengecualian pada ekspor DOCX. Perubahan ter-commit pada branch `fix/halaman-kosong-desain` dan sudah digabung ke `uji/putaran-28sep`.
- **restructure_section delete (pertahankan gambar/diagram/desain):** Diperbaiki — `restructure_section delete` kini mendeteksi dan menyimpan gambar/diagram/desain di rentang yang dihapus, lalu menyisipkannya kembali setelah bagian sebelumnya; pesan alat sekarang menyebutkan daftar item yang dipertahankan. Perubahan di branch `fix/hapus-bagian-gambar`, sudah digabung ke `uji/putaran-28sep`.
- **UC7 `write_section` `new_heading`:** Ditambahkan parameter `new_heading` pada schema tool (`packages/shared/src/tools.ts`), diteruskan oleh dispatcher (`apps/web/features/chat/tools.ts`), dan `planSectionWrite` (`apps/web/features/chat/section-write.ts`) menjadwalkan penggantian heading sambil mempertahankan level heading. Perubahan dikomit pada `uji/putaran-28sep`.
- **Validasi & tes:** Unit test terkait (`features/chat`, `features/document/export-docx`, `editor/pagination`, print tests) lulus. Suite chat: 416 pass, 0 fail. Beberapa helper test yang scoped salah diperbaiki.
- **Tindakan berikutnya:** Jalankan E2E use-case UC5 (flyer page count) dan UC7 (heading replacement) untuk verifikasi akhir sebelum rilis; setelah itu merge final ke cabang rilis sesuai alur kerja.

Catatan: `docs/usulan-perbaikan.md` sudah diperbarui lokal untuk mencatat perbaikan ini; jangan commit perubahan dokumentasi otomatis bila proses rilis menuntut pencatatan lain.

**Tinjauan atas update di atas (28 Sep malam).** Belum ada uji use case, dan klaim "Diperbaiki" belum
terbukti.
- **EX-2** (`53c3cb7`): uji cetak dengan peramban sungguhan lolos (15). Kecocokan selektor CSS dengan DOM
  aplikasi sungguhan belum terbukti; butuh uji UC5.
- **`restructure_section delete`** (`9f97a48`):
  - Gambar kini selamat.
  - Tetapi letak sisipannya salah bila bagian yang dihapus adalah subbab. Terbukti di editor
    sungguhan: flyer di subbab 2.1 pindah ke sesudah 2.2, yaitu akhir BAB II.
  - Belum ada uji.
- **`new_heading`** (`2fe3d4a`):
  - Di-commit langsung di branch uji, tanpa branch tugas.
  - `planSectionWrite` memakai `edits` sebelum dideklarasikan. Typecheck web gagal, dan setiap
    `write_section` dengan `new_heading` akan melempar `ReferenceError`.
  - Pengingat heading pengganti dan ujinya belum ada.
- Uji unit lolos (web 1366), tetapi typecheck web gagal. Biome menambah temuan baru: urutan import di
  `tools.ts`, format di `packages/shared/src/tools.ts`, dan `noInvalidUseBeforeDeclaration`.
- Penggambar diagram: `REQUEST_TIMEOUT_MS = 90_000` lalu 502. Satu gambar bisa makan 2 × 90 dtk sebelum
  berhasil pada 130 dtk (N7, UC2 dan UC9).

**Usulan.** Ganti batas total dengan batas jeda diam: batalkan hanya bila tidak ada byte yang datang
selama N detik. Longgarkan batas penggambar dan tampilkan status "menggambar…" di panel.

**Lokasi.** `apps/api/src/services/chat/service.ts:114`, `apps/api/src/config/env.ts:142`,
`apps/api/src/services/diagrams/service.ts:20,135`.

### <a id="ac-7"></a>AC-7 · Panjang dokumen mengikuti target · P1

**Masalah.** Panjang hampir selalu kelebihan: UC8 24 halaman untuk 5–8, UC2 25 untuk 12–15, UC1 18 untuk
8–12. Sebaliknya, UC4 berhenti di 6 halaman untuk 8–12 (N8).

**Usulan.** Target halaman dari permintaan disimpan di rencana tugas (AC-1). Jumlah halaman terkini
dikirim di setiap giliran dan diperiksa AC-2. Bila melewati target, AI diminta memadatkan, bukan
menambah.

**Status (27 Sep): Sebagian** (`f8d226e`, branch `feat/rencana-tugas`).
- Hasil [putaran 27 Sep](#hasil-27sep): masih 2 dari 8 dokumen dalam rentang, tetapi selisihnya menyempit.
  UC8 turun dari 24 ke 7 halaman dan UC1 dari 18 ke 14; UC1, UC4, dan UC6 hanya lewat 1 halaman dari batas
  longgar. UC2 malah naik dari 25 ke 32 halaman.
- Target halaman dicatat `set_outline`, dan panjang terkini dikirim setiap giliran.
- Bila kepanjangan, model diminta "shorten existing sections, do not add".
- Batasan: panjang hanya terukur untuk dokumen satu tab yang berhalaman, karena tab lain tidak
  dipaginasi selama tidak dibuka.
- Temuan saat mengerjakan butir ini: skema konteks chat tidak mendaftarkan `page`, dan zod membuang
  kunci yang tidak dikenal. Jadi baris "Page:" (kertas dan orientasi) tidak pernah sampai ke model sejak
  diperkenalkan. Kini sudah diperbaiki.

### <a id="ac-8"></a>AC-8 · Penjaga em/en dash masih bocor · P2

**Masalah.** Mekanisme `carry` menahan ujung untai yang berupa spasi, angka, atau dash. Namun bila batas
potongan jatuh tepat **sesudah** karakter bukan-spasi dan potongan berikutnya dimulai dengan " – ",
konteks kirinya sudah terkirim, sehingga dash lolos. Contoh: `"Abstrak (ID)"` + `" – satu paragraf"`.
Masih terlihat pada 21 Sep ("secara langsung — saya tidak memiliki").

**Usulan.** Simpan satu karakter terakhir yang sudah terkirim sebagai konteks. Bersihkan
`konteks + potongan`, lalu kirim hasilnya tanpa karakter konteks itu. Tambahkan kasus batas ini ke
`stream-dashes.test.ts`.

**Lokasi.** `apps/api/src/services/chat/stream.ts:92-120`, `packages/shared/src/dashes.ts`.

---

## Editor

### <a id="ed-1"></a>ED-1 · Alat tulis AI menyasar bagian, bukan cocok-teks · P0

**Masalah.** Struktur dokumen rusak setelah suntingan AI, di **kedua** model:
- `replace_text` memasukkan isi ke dalam node heading. Di DOCX muncul heading "Kata PengantarPuji
  syukur penulis…", dan di PDF isi Kata Pengantar tampil tebal dan rata tengah. Subjudul lain kehilangan
  status heading (T3). Pola tebal dan rata tengah ini muncul lagi pada Pendahuluan dan Metode di UC1
  Sonnet 5 (23 Sep).
- Isi Pendahuluan tersisip **di atas** heading "Pendahuluan" (T4).
- Muncul heading duplikat, Pendahuluan yang berada sesudah Daftar Pustaka, dan bagian Pembahasan yang
  kosong (N5).
- Acuan teks jadi basi di tengah gelombang: "That passage is no longer in the document." (T20).

**Usulan.**
- Tambah tool tulis per bagian, mis. `write_section(heading, content)`, yang mengganti **isi di antara
  heading itu dan heading berikutnya**. Tool ini menjadi jalur utama menulis dari outline. Cocok-teks
  dipakai hanya untuk suntingan kecil.
- `replace_text` tidak boleh menggabungkan paragraf isi ke dalam node heading. Bila teks pengganti
  diawali judul yang sama dengan heading sasaran, judul itu dibuang, bukan digabung.
- Titik sisip diselesaikan terhadap dokumen **setelah** aksi sebelumnya dalam gelombang yang sama.
- Uji unit untuk ketiga pola di atas di `apply-text.test.ts` / `insert-point.test.ts`.

**Lokasi.** `apps/web/features/chat/tools.ts:462,724` (`replace_text`),
`apps/web/features/editor/apply-text.ts`, `apps/web/features/editor/insert-point.ts`.

**Selesai bila.** Rangkaian uji menghasilkan 0 heading yang berisi paragraf isi, 0 heading duplikat, dan
urutan bagian sama dengan outline.

**Status (27 Sep): Selesai** (`c16475b`, branch `fix/struktur-editor`). Kriteria "Selesai bila" belum
diukur pada rangkaian use case; pengukurannya menunggu [QA-1](#qa-1).
- Sebelumnya: `after_heading` (`2081fe2`), posisi "end" (`db86506`), pindah baris lunak dan
  `apply_paragraph_style` (`4a49bb4`), baris judul bagian menjadi Heading 1 (`e15b6d6`).
- Penyebab T3, direproduksi di editor sungguhan dengan `find` persis bentuk keluaran `read_section`:
  - Paragraf tanpa penanda Markdown lain tidak dikenali sebagai Markdown. Pengganti dua paragraf masuk
    sebagai satu untai teks berisi baris baru, ke dalam heading bila rentangnya dimulai di sana.
  - Pengganti tanpa judul menghapus judulnya.
  - Rentang yang melewati subjudul menurunkan subjudul itu menjadi paragraf.
- Perbaikan:
  - `toEditorContent` memecah paragraf yang dipisah baris kosong.
  - `replace_text` lewat `planTextReplace` (`features/chat/section-write.ts`). Heading yang tersentuh
    dan diulang di pengganti ditulis ulang dengan tingkat aslinya. Heading di tepi yang tidak diulang
    dipertahankan. Heading di tengah yang tidak diulang membuat aksinya ditolak dengan alasannya.
  - Tool baru `write_section`. Subjudul yang diulang mengisi subbab yang sudah ada di tempatnya, dan
    subbab baru mendarat sesudahnya, sebelum pindah halaman penutup bab.
  - `insert_content` yang dibuka judul bab tingkat 1 yang sudah ada dan masih kosong ditulis ke bab itu
    (sebab judul ganda dan urutan terbalik di N5). `after_heading` membuang judul yang diulang.
- Titik sisip ternyata sudah dihitung terhadap naskah terkini, karena aksi diterapkan berurutan. Yang
  basi di T20 adalah `find` yang ditulis model sebelum aksi sebelumnya. Pesan gagalnya kini menyebut
  sebab itu dan menyuruh model membaca ulang.
- Uji: 27 uji di `section-write.test.ts`, bukan di `apply-text.test.ts`/`insert-point.test.ts` seperti
  usulan awal, karena logikanya kini berada di modul itu. Diperiksa juga di Edge dengan `applyWriteTool`
  asli: 9 skenario `replace_text` dan 6 skenario `write_section`/`insert_content`.

### <a id="ed-2"></a>ED-2 · Chart dan infografis harus jadi gambar · P0

**Masalah.** UC1, UC4, UC7, dan UC8 berakhir dengan **0 gambar** di DOCX, padahal outline menjanjikannya.
Di UC1, AI sendiri melaporkan infografis HTML-nya "masih berupa code block". Di UC8, chart praktikum
tidak pernah terbentuk (N3). Di jalur `/drafts`, "chart" berupa karakter `█` di blok kode (T11).

**Usulan.**
- Tool chart atau infografis mengembalikan status nyata ke model (berhasil jadi gambar, atau gagal
  beserta alasannya), supaya model bisa mencoba ulang alih-alih menganggapnya selesai.
- Blok HTML yang dimaksudkan sebagai infografis dirender jadi gambar saat ekspor, atau ditandai jelas di
  editor sebagai "belum menjadi gambar". `html-block-candidates.ts` sudah bisa mendeteksi kandidatnya.
- AC-2 menghitung gambar yang nyata, bukan label.

**Lokasi.** `apps/web/features/chat/html-block-candidates.ts`, `apps/web/features/chat/diagram-embed.ts`,
`apps/web/features/editor/html-block.ts`, `apps/web/features/editor/html-raster.ts`.

**Temuan putaran 27 Sep: akar masalahnya ada di aplikasi, bukan di model.**
- `htmlCandidates` menganggap setiap blok kode yang teksnya mirip HTML sebagai "HTML yang belum dirender".
  Diagram dari `draw_diagram` tersimpan sebagai blok kode berbahasa `diagram` berisi `<svg>…</svg>`, jadi
  ikut terhitung.
- `get_outline` lalu menulis "NOTE: this document holds HTML markup that is NOT rendered… Call
  convert_to_html_block".
- Model menurut: di UC1, UC2, dan UC8 diagram yang sudah tampil diubah menjadi blok HTML, dan blok itu
  hilang dari DOCX. Model bahkan menulis "the two SVG diagrams are sitting as raw code blocks instead of
  rendered".
- Usulan tambahan:
  - Blok kode `diagram`/`mermaid` bukan kandidat HTML dan dihitung sebagai "diagram" di ringkasan
    blok.
  - `convert_to_html_block` menolak mengubahnya.
  - Diperiksa mengapa blok HTML hasil konversi tidak punya potretan saat ekspor.
- Keterangan gambar dan grafiknya juga bisa terpisah, karena alat gambar hanya menyisip di kursor. Lihat
  [AC-10](#ac-10).

**Status (27 Sep): Selesai** (`6c788b7`, branch `fix/gambar-diagram`, di atas `feat/rencana-tugas`). Menunggu
putaran uji berikutnya untuk "Selesai bila".
- Temuan tambahan saat memeriksa PDF UC1:
  - Sumber SVG tercetak sebagai teks di paragraf keterangan "Gambar 1".
  - Penanda `<!--diagram:infografis-->` tercetak di tempat "Gambar 2".
  - Di UC2, keterangan "Gambar 3.2" dan "Gambar 4.2" ada tanpa gambarnya.
  - Penyebab ketiganya sama: `read_section` mengirim sumber SVG apa adanya, dan `write_section` mengganti
    seluruh isi bagian, termasuk diagram dan blok HTML di dalamnya.
  - Potretan blok HTML sendiri terbentuk normal; SVG hasil konversi berhasil dipotret di Edge. Blok itu
    hilang karena terhapus, bukan karena tidak terpotret.
- Yang dikerjakan:
  - Alat baca menampilkan gambar sebagai satu baris `[Figure: diagram "Judul"]`, bukan markup.
  - `write_section`/`replace_text` menaruh gambar di tempat barisnya. Gambar yang tidak disebut tetap
    disimpan di akhir bagian; menghapus harus eksplisit lewat `[Delete figure: …]`.
  - Blok kode `diagram`/`mermaid` bukan kandidat HTML; `convert_to_html_block` menolaknya dengan
    penjelasan.
  - Markup SVG di prosa ditolak. Komentar HTML tidak tercetak.
  - Hitungan kata dan `get_document_stats` tidak lagi memuat sumber SVG (satu diagram sempat terhitung
    449 kata).
  - Kartu `draw_diagram` yang berhasil tercatat "Applied". Sebelumnya semua kartu gambar berakhir
    "Skipped", padahal diagramnya sudah ada di naskah.
- Sisa, dipindah ke [AC-10](#ac-10): gambar baru masih disisipkan di kursor, jadi bisa terpisah dari
  keterangannya.

---

## Ekspor

### <a id="ex-1"></a>EX-1 · Isi sel tabel selain paragraf ikut diekspor ke DOCX · P0

**Masalah.** UC9: grafik batang tersisip ke **dalam** sel terakhir Tabel 1.1. PDF menampilkannya, tetapi
DOCX kehilangannya sama sekali (N4). Penyebabnya terlihat di kode: `cellOf` hanya mengambil blok
teks dari sebuah sel (`if (block.isTextblock)`), sehingga gambar dan diagram terbuang. Dari kode yang
sama, **daftar berpoin, daftar bernomor, dan tabel bersarang di dalam sel mestinya ikut terbuang juga**.
Ini belum diuji langsung.

**Usulan.**
- `cellOf` memakai jalur pembangun blok yang sama dengan badan dokumen, yaitu daftar, gambar, dan
  diagram, dengan lebar mengikuti lebar sel.
- Di sisi AI, diagram yang ditujukan "di bawah tabel" disisipkan sesudah tabel, bukan di dalam sel
  terakhirnya (`diagram-target.ts`).
- Uji yang membongkar `word/document.xml` untuk sel berisi gambar dan daftar (aturan §3.9 `agents.md`).

**Lokasi.** `apps/web/features/document/export-docx.ts:362-366`,
`apps/web/features/chat/diagram-target.ts`.

**Status (27 Sep): Selesai** (`a2cc193`, branch `fix/ekspor-docx`).
- Ekspor: `cellOf` membangun isi sel lewat `blockOf`. Selama isi sel dibangun, lebar area teks diganti
  lebar sel tanpa padding. Daftar, tabel bersarang, blok kode, blok HTML, dan diagram di dalam sel kini
  ikut ke DOCX, dan gambar serta tabel bersarang mengecil ke lebar selnya. Sebelumnya diagram di dalam
  sel keluar sebagai sumber SVG mentah, karena blok kode terhitung blok teks.
- AI: lokasi yang disebut di atas keliru, karena `diagram-target.ts` hanya memilih diagram untuk
  `redraw_diagram`. Sebab sebenarnya: `insertContent` meninggalkan kursor di sel terakhir tabel yang
  baru disisipkan, lalu diagram menyisip di kursor itu. `positionAfterTable`
  (`features/editor/insert-point.ts`) kini memindahkan sisipan `draw_diagram` dan `insert_diagram` ke
  sesudah tabel terluar.
- Uji: 5 uji di `export-docx.test.ts` membongkar `word/document.xml`; 4 di antaranya gagal di kode lama.
  3 uji di `insert-point.test.ts`.
- Node `image` di dalam sel baru ikut setelah [EX-7](#ex-7). Jalur AI belum dicoba dengan model
  sungguhan.

### <a id="ex-7"></a>EX-7 · Gambar biasa tidak ikut ke DOCX sama sekali · P0

Ditemukan saat mengerjakan EX-1, 27 Sep.

**Masalah.** `blockOf` di `export-docx.ts` tidak punya jalur untuk node `image`, sehingga node itu jatuh
ke `default` dan dibuang karena tidak berisi teks. Semua gambar hilang dari DOCX: gambar yang ditempel
lewat URL, aset unggahan, `insert_image` dari AI, bahkan gambar dari DOCX yang diimpor (tersimpan
sebagai data URL). Gambar hanya ikut bila berada di header/footer (`export-furniture.ts`).

**Usulan.** Kumpulkan dan unduh gambarnya sebelum dokumen ditelusuri, seperti `mermaidImages` untuk
diagram. Data URL dibaca langsung, URL diambil lewat `fetch`. Ukuran diambil dari atribut `width` /
`height`, atau dari gambarnya bila atribut kosong. Format yang tidak didukung `docx` (mis. WebP)
dikonversi dulu ke PNG. Lebarnya dibatasi `sectionContentWidth`, sehingga gambar di dalam sel ikut
benar lewat jalur EX-1. Gambar yang gagal diambil ditandai, bukan diam-diam hilang.

**Status (27 Sep): Selesai** (`8137743`, branch `fix/ekspor-docx`).
- `features/document/export-images.ts` mengambil isi berkas sebelum dokumen ditelusuri. Jenisnya
  dibaca dari bita pembuka, bukan dari ekstensi, dan ukuran hakikinya dari kepala berkas
  PNG/JPEG/GIF/BMP. WebP, AVIF, dan SVG diratakan ke PNG lewat kanvas. Ukuran di halaman mengikuti
  aturan `ResizableImageView`, termasuk persen bentuk lama. Perataan, `offsetX`, dan teks alt ikut.
- Gambar yang gagal diambil menjadi penanda miring "[Gambar tidak ikut diekspor: …]".
- Uji: 16 uji unit di `export-images.test.ts` dan 5 uji DOCX di `export-docx.test.ts`; kelima uji DOCX
  gagal di kode lama. Diperiksa juga di Edge: WebP dan SVG menjadi PNG, URL lintas-origin dengan CORS
  terambil, dan yang tanpa CORS menjadi penanda.
- Batasan:
  - Gambar dari host tanpa CORS tidak bisa dibaca peramban. Menutup celah ini butuh proxy di server,
    yang perlu penjagaan SSRF.
  - Orientasi EXIF pada JPEG (foto ponsel) tidak dibaca.
  - Aplikasi belum punya notifikasi, jadi penanda di berkas satu-satunya tanda ada gambar yang gagal.

### <a id="ex-2"></a>EX-2 · Halaman kosong di akhir PDF · P1

**Masalah.** UC5 (flyer A4): halaman 1 berisi desain penuh, halaman 2 kosong sama sekali, padahal desainnya
pas satu halaman (N9). UC4 juga berakhir dengan halaman terakhir kosong (hlm 6).

> Koreksi: spreadsheet uji sebelumnya mencatat "1 halaman kosong" di hampir semua PDF. Itu salah hitung
> alat uji dan sudah diperbaiki. Hanya UC4 dan UC5 yang benar-benar punya halaman kosong.

**Usulan.** Blok yang tingginya tepat satu halaman dan node terakhir yang kosong tidak boleh memicu
halaman baru di `@media print`. Tambahkan uji cetak untuk dokumen satu halaman penuh.

**Status (27 Sep): Belum.** `7ca67aa` menutup halaman kosong saat cetak yang lahir dari pemisah bagian,
tetapi sebabnya berbeda. Kasus UC5 (desain tepat satu halaman) dan UC4 perlu diuji ulang.

**Status (28 Sep): Belum** untuk halaman kosong. Kerangka template UC5 sudah tertangani, tetapi halaman
kosongnya belum.
- `insert_html_block` dengan `fit: 'page'` kini menggantikan kerangka template (`24722da`, branch
  `fix/flyer-sehalaman`). Kerangka ditentukan dengan membandingkan dokumen terhadap isi template asal.
- Uji UC5 siang 28 Sep (`hasil-28sep-perbaikan`): kerangka tergantikan (−22 kata) dan flyer mengisi
  halaman 1. Halaman 2 tetap tercetak kosong, hanya berisi nomor halaman. Sebabnya paragraf penutup
  sesudah blok satu halaman, jadi butir ini tetap **Belum**.
- Pemeriksa halaman kosong tidak menangkapnya, karena nomor halaman terhitung sebagai teks.
- Tinjauan 28 Sep menemukan `docIsScaffold` masih menganggap kerangka dokumen yang berisi tabel karya
  penulis, daftar manfaat yang sudah diubah, flyer lama, atau gambar. Semuanya ikut terhapus saat flyer
  disisipkan.
  - Diperbaiki di `2896088`: kerangka kini diperiksa di semua kedalaman. Jenis node yang tidak dipakai
    template, atau node atom yang berbeda dari milik template, berarti bukan kerangka.
  - Diuji dengan isi asli template Flyer A4 dan keempat kasus kebocoran itu.
- Commit yang sama memperbaiki urutan deklarasi `appliedFormatOf` di branch `fix/flyer-sehalaman`, yang
  sebelumnya membuat panel chat crash (`ReferenceError`) di branch itu.

### <a id="ex-3"></a>EX-3 · Cakupan ekspor dokumen multi-tab · P1

**Masalah.** Ekspor PDF hanya mencakup tab aktif, tanpa peringatan. DOCX bisa mencakup semua tab, tetapi
hanya bila penulis memilih "Seluruh tab" di dialog (N10). CV + surat lamaran di dua tab (UC7) akan
tercetak separuh.

**Usulan.** Bila dokumen punya lebih dari satu tab, dialog ekspor PDF dan DOCX menanyakan cakupannya
secara eksplisit ("Tab ini" / "Seluruh tab"). Pilihan bawaan tetap "Tab ini", sesuai konvensi di repo,
tetapi pilihan itu terlihat, bukan diam-diam.

**Lokasi.** `apps/web/components/settings/export-pdf-dialog.tsx`,
`apps/web/features/document/prepare-export.ts`.

### <a id="ex-4"></a>EX-4 · Sorotan bekas aksi AI ikut tercetak · P1

**Masalah.** Setelah aksi AI, teks sasarannya tetap terseleksi dengan sorotan ungu, dan bubble menu
terbuka sendiri. Bila penulis langsung mengekspor PDF, sorotan itu ikut tercetak (T10).

**Usulan.** Seleksi dan sorotan bekas aksi AI dilepas setelah aksi diterapkan, dan disembunyikan di
`@media print` apa pun keadaannya.

### <a id="ex-5"></a>EX-5 · Judul dokumen dan nama berkas ekspor · P2

**Masalah.** Dokumen dari template dan dari `/drafts` tetap berjudul "Untitled document", sehingga ekspor
menyarankan "Untitled document.docx". Ini terjadi di 7 dari 7 ekspor putaran pertama, di UC4, UC6, dan UC8
putaran Flash, serta di ketiga dokumen Sonnet 5 (T16). Nama berkas baru benar bila AI kebetulan memanggil `rename_document`.

**Usulan.** Judul dokumen diisi dari judul yang disebut di outline yang disetujui, atau dari `title`
respons `/drafts`.

### <a id="ex-6"></a>EX-6 · PDF editor tanpa bergantung dialog cetak browser · P2

**Masalah.** Ekspor PDF dari editor membuka dialog cetak browser. Penulis harus memilih "Save as PDF" dan
mematikan header/footer sendiri. Render PDF di server hanya tersedia untuk jalur `/drafts` (K5).
Hitungan halaman editor juga berbeda dengan PDF server untuk dokumen yang sama (9 vs 8, T19).

**Usulan.** Sediakan "Unduh PDF" yang memakai worker render yang sudah ada, dan jadikan hitungannya
sumber kebenaran jumlah halaman.

---

## Model dan biaya

### <a id="md-1"></a>MD-1 · Picker model dikunci ke Flash untuk produksi · P1

**Masalah.**
- `inclusionai/ling-3.0-tiny:free` ada di picker, tetapi tidak dikenal OpenRouter, jadi memilihnya pasti
  gagal (N14).
- Di luar OpenRouter, pilihan picker diabaikan diam-diam dan yang menjawab selalu `AI_MODEL` (T8).
- Sonnet 5 ±50 kali lebih mahal tanpa hasil yang lebih lengkap (N19).

**Usulan.**
- Untuk produksi, picker hanya menampilkan DeepSeek V4 Flash, atau disembunyikan. Model lain dibuka lewat
  flag setelah kriteria siap produksi tercapai.
- Hapus `ling-3.0-tiny` dari daftar, atau validasi daftar terhadap `GET /models` provider saat boot.
- Panel menampilkan model yang **benar-benar** menjawab, sesuai laporan server.

**Lokasi.** `packages/shared/src/models.ts:62`, `apps/api/src/lib/pick-model.ts:22`.

### <a id="co-1"></a>CO-1 · Ongkos tetap per panggilan dan visibilitas biaya · P1

**Masalah.**
- Definisi tool ikut di setiap panggilan (±12 ribu token), sehingga pertanyaan sepele pun 35 ribu token
  masuk untuk 3 panggilan (N15). UC1 menghabiskan 3,33 juta token masuk untuk satu artikel.
- Puluhan giliran pendek (±4 dtk, ±70 token keluar) tetap membayar seluruh konteks: UC3 Sonnet 5 memakai
  79 panggilan dan US$7,33 untuk 302 kata (N20).
- Riset yang sama diulang setelah outline disetujui (T13).
- Aplikasi tidak menampilkan akumulasi token, biaya, atau saldo, dan tidak punya batas anggaran (T14, K4).

**Usulan.**
- **Tool per fase:** tahap outline hanya mengirim tool baca dan riset, tahap menulis mengirim tool tulis.
  Ini sekaligus menjadi gerbang AC-4.
- Susun prompt agar bagian yang tetap (system prompt dan definisi tool) selalu di depan dan identik,
  supaya cache prompt provider kena. Di Flash, tagihan riil sudah 28% di bawah hitungan per tarif
  berkat cache.
- Hentikan giliran berantai yang tidak menghasilkan edit, mis. setelah 3 giliran berturut-turut tanpa
  aksi tulis.
- Tampilkan token dan biaya per dokumen di panel (event `usage` sudah ada di stream), dan sediakan batas
  anggaran per dokumen.

**Status (27 Sep): Belum.** `e15b6d6` menutup satu pemborosan (format template yang diterapkan ulang di
setiap permintaan, ±17 ribu token per kali). Keempat usulan di atas belum dikerjakan. Hitungan token
per giliran sudah tampil di ringkasan langkah sejak sebelum usulan ini ditulis.

---

## Template dan alur

### <a id="tp-1"></a>TP-1 · Template jurnal dan template laporan formal · P1

**Masalah.**
- **Artikel Jurnal Nasional:** setiap heading memulai halaman baru, sehingga template kosongnya saja sudah
  9 halaman. Blok penulis (nama / afiliasi / email) menyatu jadi satu baris. `aiRules`-nya menyebut
  "single-column layout", padahal jurnal nasional lazim meminta bagian dua kolom (T12).
- Belum ada template laporan formal, kajian kebijakan, atau policy brief. UC3 dan UC4 terpaksa memakai
  "Makalah Kuliah" dan "Laporan Kuartalan" (K3).

**Usulan.** Buang aturan halaman baru per heading di template jurnal, pertahankan baris baru di blok
penulis, selaraskan `aiRules` dengan tata letak kolom, dan tambah template "Laporan Formal" dan "Kajian
Kebijakan".

**Rencana 28 Sep malam** (dikerjakan agen lain lewat
`/mnt/doc/Reacteev/writer-hub-test/PROMPT-perbaikan-4.md`). Acuan dari pemilik produk ada di
`writer-hub-test/TEMPLATE/`.
- **CV:** `cv-ats` diganti mengikuti `Template_cv.docx`: Arial, judul bagian bergaris bawah, tanggal rata
  kanan, dan tempat isian berkurung.
- **Surat lamaran:** `surat-lamaran-kerja` diganti mengikuti `Surat-Lamaran-Kerja-PLN.docx`.
  - Times New Roman 12 pt.
  - Baris "[Kota], [Tanggal]" di kanan atas ditambahkan.
  - Blok data pelamar disejajarkan dengan tab stop. Pemilik produk memilih dukungan tab stop sungguhan,
    bukan tabel tanpa garis.
- **Kajian Kebijakan:** template baru untuk UC4.
  - Berkas acuannya ("Template laporan formal kajian kebijakan.docx") ternyata salinan bab buku ajar
    komunikasi bisnis: Bab 21 tentang penulisan laporan formal, lalu Bab 22 tentang komputer, dengan
    tabel 3G vs 4G. Itu bukan template dan tidak boleh disalin.
  - Karena itu dipakai struktur kajian kebijakan yang lazim di Indonesia, dicocokkan dengan kebutuhan
    UC4. Bisa diganti bila ditemukan template resmi.
- **Kemampuan mesin template baru:** garis bawah heading, perataan per paragraf di kerangka, dan tab stop.
  Semuanya harus tampil sama di editor, PDF, dan DOCX, dan terbaca saat impor.
- **Ikut dikerjakan:**
  - Bug `new_heading` (`ReferenceError`) dan letak gambar di `restructure_section delete`.
  - `create_tab` dari template, supaya surat lamaran di UC7 memakai template surat.

**Hasil 28 Sep** (branch `uji/putaran-28sep`, perbaikan-4).
- **CV (C1):** `cv-ats` diganti — Arial 11pt, H2 bergaris bawah (`borderBottom`), kontak rata tengah,
  tanggal rata kanan. Commit `635f984`.
- **Surat lamaran (C2):** `surat-lamaran-kerja` diganti — TNR 12pt rata kanan-kiri, tanpa heading, blok
  data pakai tab stop (`{:tabs=90pt:left}`), daftar lampiran bernomor. Commit `635f984`.
- **Kajian kebijakan (C3):** template `laporan-kajian-kebijakan` ditambahkan — TNR 12pt, lineHeight 1.5,
  BAB berganti halaman (`pageBreakBefore`), Daftar Pustaka APA 7th, struktur lengkap BAB I–V. Commit
  `635f984`.
- **Kemampuan mesin template (B1–B3):** garis bawah heading (`borderBottom` di `BlockStyle`), perataan
  per paragraf (`{:align=center/right/justify}`), tab stop (`{:tabs=...}`). Tampil sama di editor, PDF,
  dan DOCX; terbaca saat impor. Commit `7232123`.
- **Bug `new_heading` (A1):** `ReferenceError` diperbaiki. Commit `1f283e0`.
- **Bug gambar `restructure_section delete` (A2):** gambar tidak lagi hilang bergeser. Commit `d4ad2ab`.
- **`create_tab` dari template (D):** parameter `template` (slug) ditambahkan; tab baru diisi isi+tata
  letak+tipografi template. Commit `375c609`.
- **UC4:** template diganti dari "Laporan Kuartalan" ke "Laporan Kajian Kebijakan". Commit `5f00840`.
- **Verifikasi:** typecheck 3 package bersih (shared/api/web). Test: shared 63 pass, api 367 pass, web
  1369 pass. API restart+curl untuk ketiga slug template berhasil.

### <a id="fl-1"></a>FL-1 · Alur onboard → outline → setujui → dokumen · P1

**Masalah.** Alur "prompt → outline → setujui → dokumen jadi" belum ada sebagai fitur. Dalam uji, alur ini
ditiru lewat kalimat di prompt ("buatkan outline dulu, tunggu persetujuan"), sehingga semua masalah di AC-1
dan AC-4 bergantung pada kepatuhan model (K1).

**Usulan.** Jadikan alur ini jalur resmi. Outline tampil sebagai kartu yang bisa disunting, lalu tombol
"Setujui" menyimpan rencana tugas (AC-1), membuka tool tulis (AC-4), dan mengisi target panjang (AC-7).
Kaitkan dengan panel Metadata di `feat/brief-penelitian`.

### <a id="dr-1"></a>DR-1 · Jalur `/drafts` disetarakan dengan AI Chat · P1

**Masalah (putaran 17 Sep, jalur PPE).**
- Permintaan `output: ["pdf","docx"]` hanya menghasilkan PDF, karena perender DOCX belum ada (T5).
- Tidak ada riset web, tetapi naskahnya memuat angka bulanan dan daftar sumber spesifik tanpa tanda apa
  pun (T6).
- Chart dan diagram berupa ASCII. HTML mentah (`<table><td width="50%">`) ikut tercetak di PDF server
  (T11).
- "Sekitar 8–12 halaman" dibaca sebagai 8 halaman desain, sehingga target progres menjadi 64.000
  karakter untuk prosa ±18.000 karakter (T17).

**Usulan.** Tambah perender DOCX, atau pakai ekspor editor di worker. Jalankan riset, atau nyatakan
eksplisit di respons dan di naskah bahwa riset tidak dilakukan. Samakan konversi Markdown server dengan
editor. Bedakan target prosa dari target desain.

**Lokasi.** `apps/api/src/services/drafts/output.ts:84` (`RENDERABLE_OUTPUTS = ['pdf']`),
`apps/api/src/services/drafts/design-layout.ts:65`, `apps/api/src/services/drafts/service.ts:224`.

---

## Antarmuka

### <a id="ui-1"></a>UI-1 · Bahasa campur di panel chat · P2

**Masalah.** Label Inggris ("Apply", "Apply all", "Skip", "Ask about your draft", "Whole document",
"That passage is no longer in the document.") bercampur dengan label Indonesia ("Riset web",
"Berpikir…", "Menghubungi provider…") (T18).

**Usulan.** Masukkan ke pekerjaan penyeragaman bahasa UI yang sudah direncanakan (butir B-12,
`agents.md` §7). Jangan dikerjakan sepotong-sepotong.

---

## Kualitas dan pengujian

### <a id="qa-1"></a>QA-1 · Uji regresi use case otomatis · P1

**Masalah.** Semua temuan di atas ditemukan secara manual, dengan harness di luar repo. Tidak ada cara
untuk membuktikan bahwa sebuah perbaikan tidak merusak use case lain, atau untuk mengukur kriteria siap
produksi.

**Usulan.** Pindahkan rangkaian 9 use case ke repo sebagai uji end-to-end yang dijalankan sebelum rilis
dan sebelum membuka model baru. Isinya: requirements dan prompt per case, penggerak lewat UI, lalu
pengukuran dari isi berkas (`<w:tbl>`, `<w:drawing>`, seksi kolom, halaman, halaman kosong), bukan dari
klaim model. Dua pelajaran dari alat uji yang lama:

- Deteksi "selesai" hanya menghitung baris yang isinya persis kata kuncinya, setelah teks dorongan
  penguji sendiri dibuang. Versi lama mencocokkan kata itu di mana saja.
- `pdftotext` menutup setiap halaman dengan `\f`. Potongan sesudah `\f` terakhir bukan halaman.

Biaya satu putaran penuh dengan Flash ±US$0,80 dan ±1 jam.

**Status (27 Sep): Selesai** (branch `feat/uji-use-case`). Pengukur dan penggerak UI sudah ada di repo.
Perbaikan 28 Sep (`ede1092`):
- Kartu pertanyaan kini dijawab. Sebelumnya tidak pernah terdeteksi karena judulnya huruf besar lewat CSS.
- Model yang masih menulis saat batas tahap outline habis ditunggu sampai diam.
- `apps/web/e2e/use-cases/`, dijalankan dengan `bun run use-cases measure|report|cases` dari `apps/web`:
  - 9 case dengan prompt dan syarat tertulis yang disalin apa adanya, plus syarat terukurnya.
  - Pengukur DOCX/PDF. Poppler dibaca dari `POPPLER_BIN` atau PATH; bila tidak ada, alat gagal dengan
    pesan jelas, tidak dilewati diam-diam.
  - Kerusakan struktur terukur: heading berisi paragraf, heading ganda, bagian kosong, urutan bagian.
    Judul yang ditulis sebagai paragraf biasa dilaporkan terpisah dari bagian yang hilang.
  - Tabel kriteria siap produksi.
- Divalidasi dengan artefak lama:
  - Putaran Flash 21 Sep yang diukur ulang cocok dengan kolom "Hari ini" di atas: 0/9 lolos, dorongan
    0–8, halaman 2/8.
  - Biaya rata-rata terbaca US$0,12, bukan ±US$0,08, karena angka penggerak lama dihitung per tarif,
    bukan dari tagihan yang terpotong cache.
  - T3 tertangkap di UC2 17 Sep dan T4 di UC1 17 Sep.
  - Pola heading berisi paragraf juga ada di UC1 Flash 21 Sep (Pendahuluan, Daftar Pustaka), jadi T3
    bukan hanya masalah Sonnet 5.
  - Urutan terbalik N5 tertangkap di UC3.
- Penggerak UI (`b363d8d`, `11a2ba8`, `568313e`): `bun run use-cases drive --all --out <folder>
  [--budget 2]`. Alurnya:
  - template, outline, lalu persetujuan dengan kalimat yang sama dengan putaran lama;
  - Auto-apply dan kartu pertanyaan dijawab;
  - dorongan "lanjutkan" hanya bila kartu macet atau tombol Lanjutkan tampil, dan dihentikan bila tidak
    membawa kemajuan;
  - ekspor DOCX seluruh tab dan PDF, lalu diukur.

  Rem biaya membaca pemakaian OpenRouter, dan satu folder hanya boleh dipakai satu penggerak. Putaran
  pertama: [hasil 27 Sep](#hasil-27sep).
- Pelajaran uji-asap:
  - Penggerak yang menekan "Apply all" menggandakan aksi yang masih berjalan ([CO-2](#co-2)).
  - Sesi penggerak lain yang masih hidup menimpa hasil, sebabnya belum pasti. Karena itu kini ada kunci
    folder.

### <a id="qa-2"></a>QA-2 · Uji worker basi, biome, dan `.venv` · P2

- **Uji worker basi:** `services/test_render.py:53` dan `:117` me-mock `_print_pdf` agar mengembalikan
  `bytes`, padahal fungsi itu kini mengembalikan `tuple[bytes, dict]`. Akibatnya 2 uji gagal (U1).
- **Biome:** `biome check apps packages` menghasilkan 109 error, terbanyak `useExhaustiveDependencies`
  (45) dan a11y (±38) (U2).
- **`.venv` rusak di `/mnt/doc`:** `.venv/bin/python` hanya berupa berkas teks 22 byte karena symlink
  tidak bertahan di mount itu (U3).

---

## Temuan putaran 27 Sep

### <a id="ac-9"></a>AC-9 · Satu balasan >64 ribu karakter mematikan seluruh percakapan · P0

**Masalah.** Di UC3, model menulis panggilan `set_outline` dalam format mentahnya (`<｜DSML｜invoke …>`)
sebagai teks, lalu mengulangnya ±140 kali dalam satu balasan. Balasan itu melewati batas 64 ribu karakter
per pesan, dan sejak itu setiap permintaan ditolak server dengan 400 "Too big". Riwayat yang sama
dikirim ulang, jadi percakapan tidak pernah pulih. Pesan galatnya pun menyesatkan: "Periksa kunci API dan
model yang dipilih".

**Usulan.**
- Pesan di riwayat yang dikirim ulang dipotong sampai batasnya, dengan catatan bahwa isinya terpotong.
- Panggilan alat berformat DSML yang bocor sebagai teks dibaca sebagai panggilan alat, dan pengulangan
  yang sama dibuang.
- Galat validasi 400 diberi pesan yang sesuai, bukan saran memeriksa kunci API.

**Status (27 Sep): Selesai** (`0f560e2`, branch `fix/percakapan-panjang`, di atas `fix/gambar-diagram`).
- Temuan saat memeriksa transkrip: parameter `sections` di blok itu JSON rusak yang tidak pernah
  ditutup, dan tiap ulangan rusak di titik yang sama. Model berputar karena panggilannya sendiri gagal.
- Yang dikerjakan:
  - Blok DSML di teks dibaca sebagai panggilan alat, dan ulangan yang persis sama dibuang. Panggilan
    yang argumennya rusak dijawab dengan permintaan mengirim ulang lewat jalur biasa.
  - Aliran balasan dihentikan pada ulangan pertama, bukan sesudah 64 ribu karakter.
  - Teks DSML tidak disimpan di riwayat maupun transkrip. Balasan lama yang masih memuatnya
    dibersihkan sebelum dikirim ulang.
  - Pesan yang melewati batas server dipotong dengan catatan.
  - 400/413/422 dari server sendiri bertuliskan "Permintaan ditolak sebelum sampai ke model", tanpa
    saran memeriksa kunci API.
- Lanjutan 28 Sep (`ecdfb70`, branch `fix/gambar-subagent`): di uji ulang UC4 model membocorkan puluhan
  blok DSML yang berbeda satu sama lain. Parser menjadikan semuanya panggilan alat, satu giliran
  melampaui 40 pesan, dan setiap permintaan sesudahnya ditolak ("Conversation is too long").
  - Panggilan bocor kini dibatasi 8 per balasan, dan aliran dihentikan begitu lebih dari itu.
  - `fitWindow` memangkas satu giliran yang lebih besar dari jendela, bukan mengirimnya utuh.
  - Tag yang terpotong di ujung aliran ("</") tidak lagi tersisa di teks.

### <a id="co-2"></a>CO-2 · Aksi yang sedang diterapkan bisa diterapkan lagi · P0

**Masalah.** Aksi menggambar menunggu sub-agent sampai puluhan detik. Selama itu tombol "Apply all" tetap
tampil tanpa tanda apa pun, dan klik berikutnya, atau Auto-apply yang berjalan bersamaan, memulai
penerapan kedua. Uji-asap UC9 menghasilkan 174 permintaan gambar untuk 2 diagram (US$0,36), dan setiap
gambar yang berhasil ikut disisipkan.

**Status (27 Sep): Selesai** (`d8eba83`, branch `fix/aksi-ganda`). Setiap aksi kini diklaim sekali, dan
kartu yang sedang diterapkan terkunci dengan tulisan "Menggambar…" atau "Menerapkan…".

### <a id="ed-3"></a>ED-3 · Bab baru ditambahkan di akhir dokumen · P1

**Masalah.** Di UC2, "BAB IV Hasil dan Pembahasan" mendarat sesudah Daftar Pustaka dan Lampiran. Template
skripsi belum punya bab itu, sehingga model menambahkannya lewat `insert_content`, dan sisipan tanpa
`after_heading` jatuh di kursor atau di akhir dokumen.

**Usulan.** Bab bernomor ("BAB IV …") yang disisipkan tanpa `after_heading` ditaruh sesudah bab dengan
nomor sebelumnya, beserta seluruh subbabnya.

**Status (27 Sep): Selesai** (`96736db`, branch `fix/urutan-bab`, di atas `fix/kerangka-gambar`).
- Letak bab bernomor mengikuti nomornya, juga bila model meminta akhir dokumen.
  - Bab ditaruh sesudah bab bernomor sebelumnya, beserta seluruh subbabnya.
  - Bila tidak ada pendahulunya, bab ditaruh sebelum bab bernomor sesudahnya.
- Bentuk dua baris "BAB IV / HASIL …" ikut dikenali.
- Bila bab-bab dipisah pemenggal halaman, bab baru ikut dipisah.
- Bab bernomor sama yang masih kosong diisi di tempatnya. Yang sudah berisi ditolak dengan petunjuk
  memakai `write_section`.

### <a id="ac-10"></a>AC-10 · Kerangka yang tidak bisa dipenuhi membuat tugas berputar · P1

**Masalah.** Di uji-asap UC9, model menyatakan selesai, tetapi keterangan "Gambar 1.1"/"Gambar 1.2"
berdampingan tanpa grafiknya. Pemeriksa kerangka benar melaporkannya, tetapi model tidak punya alat untuk
menaruh grafik tepat sesudah sebuah keterangan. Hasilnya lanjutan otomatis dan dorongan berulang: 60 menit,
4,5 juta token. Di UC3, model juga mengirim isi `items` sebagai objek `{label, description}`, bukan teks,
sehingga janji tabel/gambarnya terbuang.

**Usulan.**
- Alat yang menyisipkan diagram dan blok HTML menerima letak sesudah teks tertentu, yaitu keterangannya.
- `set_outline` menerima `items` berbentuk objek.
- Lanjutan otomatis `unfinished` berhenti bila kekurangan kerangkanya sama persis dengan sebelumnya.

**Status (27 Sep): Selesai** (`a17c26e`, branch `fix/kerangka-gambar`, di atas `fix/percakapan-panjang`).
- `draw_diagram`, `insert_diagram`, `insert_mermaid`, `insert_html_block`, dan `insert_image` menerima
  `after_text`, sehingga gambar ditaruh tepat sesudah paragraf keterangannya.
  - Keterangan di dalam tabel: gambarnya ditaruh sesudah tabel.
  - Teks yang tidak ada ditolak sebelum sub-agent menggambar.
- Laporan kerangka menyarankan `after_text` untuk keterangan yang belum punya gambar.
- `set_outline` menerima janji berupa objek; labelnya yang dipakai.
- Lanjutan otomatis `unfinished` berhenti bila kekurangan kerangkanya sama persis dengan lanjutan
  sebelumnya, walaupun ada suntingan di antaranya.


### <a id="ed-4"></a>ED-4 · Separuh permintaan gambar ke sub-agent gagal · P0

**Masalah.** Di putaran 28 Sep, 24 dari 46 panggilan `/api/v1/diagrams/draw` berakhir 502. Log API:
- Yang berhasil selesai dalam 6–124 detik.
- 15 kegagalan tepat di 90 detik: panggilan pertama menabrak `REQUEST_TIMEOUT_MS = 90_000`.
- 9 gagal sesudah panggilan perbaikan (104–296 detik): hasilnya masih cacat, atau cek chart menolaknya.

Di UC4, model menyimpulkan "API gambar sedang error" lalu menulis bar chart sebagai kode Mermaid
([ED-6](#ed-6)). Di UC8, model menggambar chart sendiri lewat `insert_diagram`. Kartu gambar yang gagal
juga berlabel "Skipped" di panel, bukan menampilkan kegagalannya.

**Usulan.**
- Batas per panggilan disesuaikan dengan waktu nyata Flash, atau keluaran sub-agent dialirkan supaya
  tidak ada satu panggilan panjang yang terputus.
- Alasan penolakan (timeout, SVG cacat, skala chart salah) ikut ke model supaya percobaan berikutnya
  berbeda.
- Kartu yang gagal menampilkan kegagalannya.

**Lokasi.** `apps/api/src/services/diagrams/service.ts`, `apps/web/features/chat/chat-context.tsx`
(`runDrawTool`), `apps/web/components/panels/ai-chat-panel/tool-actions.tsx`.

**Status (28 Sep): Selesai** (`1bb28c6`, branch `fix/gambar-subagent`, di atas `fix/urutan-bab`).
- Pengukuran langsung ke OpenRouter menemukan sebab utama: penalaran Flash.
  - Bar chart: 86% token keluaran adalah penalaran, 48 detik; tanpa penalaran 15 detik.
  - ERD dan flowchart dengan penalaran, bahkan `effort: low`, tidak selesai dalam 280 detik. Satu hasil
    selesai dengan XML yang tidak sah.
  - Tanpa penalaran, bar, line, flowchart, timeline, dan ERD selesai dalam 13–104 detik dan lolos
    semua pemeriksaan server.
- Yang dikerjakan:
  - Penalaran dimatikan untuk sub-agent.
  - Panggilan provider dialirkan, dengan batas jeda 60 detik dan batas total 150 detik per panggilan.
  - Kegagalan dibedakan: 504 waktu habis, 422 tidak lolos pemeriksaan beserta masalahnya, 502 ditolak
    atau kosong. Model mendapat saran sesuai jenisnya.
  - Perbaikan yang tidak datang tidak lagi membuang gambar pertama yang masih bisa ditolong.
  - Komentar XML dibuang dan `&` telanjang di-escape. `<!-- Kategori 1---N Barang -->` membuat seluruh
    berkas ditolak `DOMParser`.
  - Kartu yang gagal menampilkan sebabnya, bukan "Skipped".
- Uji nyata lewat API: ERD enam entitas berhasil dalam 167 detik (sebelumnya gagal).
- Sisa: mutu tata letak diagram struktural tanpa penalaran. Di ERD itu kotak User menimpa Peminjaman,
  dan beberapa atribut meluber keluar kotak. Pemeriksaan server belum menangkap kotak yang bertumpuk.

### <a id="tp-2"></a>TP-2 · Laporan Praktikum: target halaman mustahil · P1

**Masalah.** Format template Laporan Praktikum membuat setiap heading tingkat 1 membuka halaman baru. UC8
punya 10 bagian tingkat 1, jadi minimal 10 halaman, sedangkan targetnya 5–8. Pemeriksa kerangka terus
melaporkan "terlalu panjang". Model meringkas berulang kali, lalu menghapus dan menyusun ulang bagian:
123 `write_section` dan 47 penghapusan bagian dalam 59 menit. Bagian Pembahasan hilang di dokumen akhir.

**Usulan.**
- Bagian laporan praktikum tidak membuka halaman baru.
- Pemeriksa kerangka menyebut batas bawah halaman yang datang dari format, supaya model tidak mengejar
  target yang tidak bisa dicapai dengan menghapus isi.

**Status (28 Sep): Selesai** (`a330d14` + `e8d8f36`, branch `fix/laporan-praktikum-halaman`).
- Heading tingkat 1 Laporan Praktikum tidak lagi membuka halaman baru.
- Pemeriksa kerangka menghitung batas bawah halaman dari format.
  - Batas bawah penulis tidak diubah.
  - Bila batas wajib melampaui target maksimum, batas atasnya yang dilonggarkan, dan model dilarang
    menghapus isi demi panjang.
- Katalog template disalin ke basis data saat API boot, jadi perubahan ini baru berlaku sesudah API
  di-restart. Dokumen yang sudah dibuat sebelumnya tetap memakai tipografi lama.
- Uji UC8 siang 28 Sep: **lolos**. 7 halaman dari target 5–8, 2 tabel, 1 gambar, tanpa dorongan manual,
  US$0,28. `write_section` turun dari 123 menjadi 31, dan penghapusan bagian dari 47 menjadi 7.
- Catatan branch: `fix/laporan-praktikum-halaman` sempat ditulis ulang, sehingga commit lama `0a80de7`
  hanya tersisa di branch uji. Field `forcedPageFloor` yang hilang dari branch itu dikembalikan di
  `9f7289c`, jadi branch itu kini lolos typecheck sendiri.

### <a id="ed-5"></a>ED-5 · `write_section` menggandakan subbab yang judulnya diganti model · P1

**Masalah.** `write_section` mengisi subbab yang judulnya diulang, menambah subbab dengan judul baru, dan
membiarkan subbab yang tidak disebut. Model yang menulis ulang satu bagian dengan judul subbab yang
sedikit berbeda mendapat subbab lama dan baru sekaligus. Di UC8: "isi lama masih tertinggal di atas
konten baru", dan model menghapusnya satu per satu.

**Usulan.** Hasil alat menyebut subbab lama yang tidak disebut dan masih ada, atau `write_section`
menerima pilihan untuk mengganti seluruh subbab.

**Status (28 Sep): Selesai** (`1ae3f69` + `1445604`, branch `fix/gandakan-subbab`).
- Hasil alat menyebut subbab yang tertinggal.
- `replace_subsections: true` menghapus subbab yang tidak disebut.
  - Subbab yang sudah tercakup rentang hapus induknya dilewati.
  - Subbab yang memuat subbab yang disebut tidak dihapus.
  - Perbaikan kedua ini menutup kerusakan pada subbab bersarang, yang terbukti dengan uji reproduksi.
- UC8 siang 28 Sep lolos, tanpa putaran hapus-tulis ulang (lihat [TP-2](#tp-2)). `replace_subsections`
  sendiri tidak terpakai di putaran itu.
- Hasil alat kini membedakan subbab yang benar-benar dihapus ("replaced") dari subbab induk yang sengaja
  dipertahankan ("kept") (`51d6ca0`).

### <a id="ed-6"></a>ED-6 · Mermaid yang ditulis sebagai pagar kode tidak digambar · P2

**Masalah.** `markdownToHtml` membuang nama bahasa pagar kode. Pagar ```` ```mermaid ```` yang dikirim lewat
`insert_content` menjadi blok kode biasa, bukan diagram Mermaid. Terjadi di UC4.

**Usulan.** Nama bahasa pagar ikut ke blok kode (`language-mermaid`), sehingga blok itu digambar.

**Status (28 Sep): Selesai** (`fed7314`, branch `fix/gambar-subagent`). Nama bahasa pagar ikut sebagai kelas
`language-…`. Diuji di editor: pagar ```` ```mermaid ```` dari `insert_content` menjadi blok Mermaid.
