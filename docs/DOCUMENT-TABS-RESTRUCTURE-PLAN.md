# Rencana Restrukturisasi — Project ▸ Dokumen ▸ Tab

Memperbaiki kesalahan pemodelan yang membuat "tab" dan "dokumen" jadi satu hal yang sama,
lalu membangun alur Projects di atasnya. Ini prasyarat yang membuat fitur G (Projects) benar-benar
berarti — bukan penambahan fitur baru.

## 1. Masalah yang diperbaiki

Diverifikasi di kode, bukan dugaan:

| # | Temuan | Bukti |
|---|---|---|
| 1 | **Import DOCX menimpa tab aktif.** Bukan tab baru, bukan dokumen baru — naskah yang sedang ditulis hilang | `features/document/import-context.tsx:73-74` — `editor.commands.setContent(result.content)` |
| 2 | **Judul melekat pada tab**, tidak ada lapisan dokumen di atasnya | `TabMeta.title` di `features/sessions/ydoc.ts:35-43` |
| 3 | **Ekspor hanya tab aktif** | `exportDocx(editor, …)` bekerja atas satu instance editor |
| 4 | **Tabel `documents` di server sebenarnya tabel tab** — satu tab ↔ satu baris | `SyncLinkage` 1:1 di `features/sync/sync-context.tsx` |

Akibat (4): Library, Projects, riwayat versi, share, dan Aktivitas AI semuanya beroperasi di
tingkat tab. `documents.project_id` mengelompokkan tab, bukan dokumen — jadi "proyek berisi
dokumen" belum pernah benar-benar ada.

## 2. Model target

```
Project ──▶ Dokumen ──────────────▶ Tab
"Skripsi"   "Bab 4 Pembahasan"      Tab 1 · Tab 2 · Tab 3
            judul, project_id       naskah, riwayat versi,
            ekspor 1 berkas         share, glosarium
```

## 3. Keputusan yang sudah dikonfirmasi

1. **Tab disimpan di tabel `document_tabs` terpisah**, bukan array jsonb di dalam dokumen —
   autosave satu tab tidak mengirim ulang seluruh dokumen.
2. **Riwayat versi, share, dan glosarium tetap melekat pada TAB.** Hanya ekspor dan Projects yang
   naik ke tingkat dokumen.
3. **Migrasi: tiap tab yang ada sekarang jadi dokumen berisi satu tab.**
4. **Ekspor menawarkan pilihan: seluruh tab atau tab terpilih.**
5. **Dokumen dibuat otomatis** — pengguna tetap bisa langsung mengetik tanpa memilih dokumen dulu.

### Konsekuensi yang diterima (dari keputusan 2)

"Pulihkan dokumen ke keadaan kemarin" tidak ada — pemulihan versi selalu per tab. Untuk dokumen
lima tab, memulihkan seluruhnya berarti lima kali restore. Ini harga dari migrasi yang jauh lebih
murah (§4.1); bisa ditambahkan belakangan sebagai "restore semua tab" di atas skema yang sama.

---

## 4. Skema & migrasi

### 4.1 Keputusan 2 membuat migrasinya nyaris tanpa risiko

Tiga tabel menunjuk `documents.id` hari ini:

| Tabel | Kolom | Maknanya sekarang |
|---|---|---|
| `document_versions` | `document_id` | versi dari satu naskah = satu tab |
| `shares` | `document_id` | dokumen sumber share |
| `pool_request` | `document_id` | dokumen tempat job dijalankan |

Karena versi/share/aktivitas **tetap per tab**, ketiganya harus tetap menunjuk baris yang sama
seperti sekarang. Jadi jalur migrasinya bukan "pindahkan data", melainkan **ganti nama tabelnya**:

```
documents (lama)  ──rename──▶  document_tabs
                  ──baru────▶  documents (induk)
```

Seluruh UUID yang sudah tersimpan di tiga tabel itu **tetap valid tanpa disentuh**. Tidak ada
backfill FK, tidak ada risiko tautan putus. Ini keuntungan langsung dari keputusan 2 — opsi
"semua naik ke tingkat dokumen" akan menuntut pemetaan ulang ketiganya.

### 4.2 Migrasi 0009 — wajib ditulis tangan

> ⚠️ **`bun run db:generate` TIDAK boleh dipakai untuk migrasi ini.** drizzle-kit tidak mengenali
> penggantian nama tabel; ia akan menghasilkan `DROP TABLE documents` + `CREATE TABLE
> document_tabs` — seluruh dokumen pengguna hilang. Sama berbahayanya dengan `db:push` yang
> dipakai `docker-compose.yml:74` di jalur dev.
>
> Tulis SQL-nya sendiri, daftarkan manual di `meta/_journal.json`, dan **uji di database salinan
> lebih dulu** (pola yang dipakai saat memverifikasi migrasi 0004).

```sql
-- 1. Tabel lama jadi tabel tab. FK dari document_versions/shares/pool_request ikut terbawa.
ALTER TABLE documents RENAME TO document_tabs;

-- 2. Induk baru.
CREATE TABLE documents (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   varchar(255) NOT NULL,
  title      text NOT NULL,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX documents_owner_idx ON documents (owner_id, updated_at DESC);

-- 3. Satu dokumen induk per tab lama; judul, pemilik, proyek, dan waktu ikut pindah.
INSERT INTO documents (id, owner_id, title, project_id, updated_at, created_at)
SELECT gen_random_uuid(), owner_id, title, project_id, updated_at, created_at FROM document_tabs;
--    (pemetaannya disimpan lewat kolom sementara di langkah 4)

-- 4. Tab menunjuk induknya.
ALTER TABLE document_tabs ADD COLUMN document_id uuid;
ALTER TABLE document_tabs ADD COLUMN position    integer NOT NULL DEFAULT 0;
-- ... UPDATE korelatif memasangkan tiap tab ke induk yang baru dibuat ...
ALTER TABLE document_tabs ALTER COLUMN document_id SET NOT NULL;
ALTER TABLE document_tabs ADD CONSTRAINT document_tabs_document_id_fk
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE;

-- 5. project_id naik ke induk; tab tidak lagi memilikinya.
ALTER TABLE document_tabs DROP COLUMN project_id;
```

Cara paling aman untuk langkah 3–4 adalah satu statement `WITH … INSERT … RETURNING` yang
memetakan balik seperti backfill di migrasi 0004 — di sana polanya sudah terbukti.

`ON DELETE CASCADE` di langkah 4: menghapus dokumen menghapus tabnya. Versi dan share milik tab
itu ikut lewat cascade yang sudah ada.

### 4.3 Bentuk akhir

```
projects        1 ──▶ n  documents
documents       1 ──▶ n  document_tabs        (content jsonb, position, title, emoji, language)
document_tabs   1 ──▶ n  document_versions    (tidak berubah)
document_tabs   1 ──▶ n  shares               (tidak berubah)
document_tabs   0 ──▶ n  pool_request         (tidak berubah)
```

Nama kolom `document_id` di tiga tabel itu kini menunjuk tab. **Ganti namanya jadi `tab_id`** di
lapisan Drizzle dan DTO supaya tidak menyesatkan pembaca berikutnya — kolom fisiknya boleh tetap,
tapi jangan biarkan namanya berbohong. Kalau memilih mengganti kolom fisiknya sekalian, lakukan di
migrasi yang sama.

---

## 5. Model lokal (Y.Doc)

Struktur sekarang: `tabsRoot(doc)` = `{ order: Y.Array<string>, meta: Y.Map<...> }`, naskah tiap tab
di `doc.getXmlFragment(tabId)` (`ydoc.ts:63-84`).

**Naskahnya tidak perlu dipindah.** Fragment tetap `doc.getXmlFragment(tabId)` dengan id yang sama;
hanya pohon metadatanya yang bertambah satu tingkat:

```
docsRoot(doc) = { order: Y.Array<docId>, meta: Y.Map<docId, { title, projectId, tabOrder }> }
tabsRoot(doc) = { meta: Y.Map<tabId, TabMeta> }        // tanpa order global lagi
```

Urutan tab pindah ke `tabOrder` milik masing-masing dokumen. Karena fragment tidak tersentuh,
`serialize.ts`, riwayat versi lokal (`features/versions/local-store.ts`), dan `SyncLinkage` tetap
bekerja atas `tabId` seperti sekarang.

**Migrasi lokal** berjalan sekali saat hidrasi, pola `migrate-legacy.ts` yang sudah ada: tiap tab di
`order` lama jadi satu dokumen berisi tab itu, judul disalin ke dokumen.

---

## 6. Perubahan alur

### 6.1 Import — memperbaiki bug perusak naskah

`loadDocx` sekarang **menimpa tab aktif**. Diganti jadi:

1. Buat **dokumen baru**, judulnya nama berkas tanpa ekstensi.
2. Buat satu tab di dalamnya, isi dengan hasil `importDocx`.
3. Aktifkan dokumen + tab itu.

**Impor banyak berkas sekaligus** → satu dokumen berisi N tab, satu tab per berkas, urut nama
berkas. Ini yang membuat "satu riwayat bisa punya lebih dari satu tab" terasa alami sejak awal.

Jalur PDF/TXT (`dispatch({ type: 'setFile' })` → worker) mengikuti aturan yang sama.

Perbaikan ini berdiri sendiri dan **bisa dirilis lebih dulu** tanpa menunggu restrukturisasi:
cukup ganti "timpa tab aktif" jadi "buat tab baru". Lihat M0 di §8.

### 6.2 Ekspor — pilihan seluruh/terpilih

Dialog ekspor mendapat pilihan: **seluruh tab** (digabung berurutan, dipisah page break) atau
**tab terpilih** (kotak centang per tab; bawaan = tab aktif).

Dua jalur ekspor punya kendala berbeda dan **tidak sama biayanya**:

| Format | Mekanisme sekarang | Yang dibutuhkan |
|---|---|---|
| DOCX | `exportDocx(editor, …)` membaca `editor.state.doc` | **Refactor**: terima `PMNode[]` alih-alih `Editor`. Naskah tab non-aktif diambil dari `fragmentToJSON` + `buildSchema().nodeFromJSON` — keduanya sudah ada di `features/sync/serialize.ts` |
| PDF | `window.print()` atas halaman yang sedang dirender (`export-pdf-dialog.tsx:42-46`) | **Lebih berat**: hanya tab aktif yang ada di DOM. Perlu merender tab terpilih ke area cetak tersembunyi lebih dulu |

Karena itu ekspor DOCX multi-tab dijadwalkan lebih dulu; PDF menyusul di tahap terpisah.

### 6.3 Navigasi

| Tempat | Sekarang | Menjadi |
|---|---|---|
| Judul di TopBar | judul tab aktif | **judul dokumen** |
| Sidebar tab kiri | semua tab | tab milik dokumen aktif, dengan "+ Tab" |
| "Riwayat" di nav menu | tab terakhir | **dokumen terakhir** |
| `/library` | daftar tab | daftar dokumen (jumlah tab sebagai info) |
| Sidebar proyek di `/library` | mengelompokkan tab | mengelompokkan dokumen |

Nama tab disunting di sidebar tab (sudah bisa hari ini), bukan di TopBar.

### 6.4 Dokumen otomatis

Membuka aplikasi tanpa dokumen apa pun membuat dokumen "Untitled" berisi satu tab, **lokal saja** —
persis perilaku sekarang, hanya bertambah satu tingkat di metadata. Naik ke server saat "Simpan ke
cloud", yang kini membuat baris `documents` **dan** `document_tabs`.

---

## 7. Dampak pada fitur yang sudah rilis

| Fitur | Dampak |
|---|---|
| **A — Autosave** | `SyncLinkage` tetap per tab (`serverId` = `document_tabs.id`). Ditambah `documentId` induk supaya judul dokumen ikut tersinkron |
| **B — Library** | Query berubah dari daftar tab jadi daftar dokumen + hitungan tab |
| **G — Projects** | `project_id` pindah ke `documents`. Semua UI proyek tetap, isinya jadi benar |
| **I — Riwayat versi** | **Tidak berubah** — tetap per tab |
| **F — Aktivitas AI** | `pool_request.document_id` tetap menunjuk tab; daftar aktivitas menaikkan judul lewat join ke `documents` supaya tetap terbaca manusia |
| **Share** | **Tidak berubah** — tetap membagikan satu tab |
| **H — AI Memory** | Tidak tersentuh (per user) |
| **L — Glosarium** (rencana) | Tetap per tab sesuai keputusan 2. `GLOSSARY-MAKER-PLAN.md` §2 menyebut `document_id` — **baca sebagai `tab_id`** setelah restrukturisasi ini; "angkat ke proyek" tetap berlaku lewat `documents.project_id` |

---

## 8. Tahapan

| # | Isi | Selesai bila |
|---|---|---|
| **M0** | **Perbaiki bug import** — buat tab baru, jangan timpa tab aktif | Impor DOCX tidak lagi menghapus naskah yang sedang ditulis. Berdiri sendiri, bisa rilis duluan |
| **M1** | Migrasi 0009 ditulis tangan + diuji di DB salinan; skema Drizzle & rename `document_id`→`tab_id` | Data lama utuh; versi/share/aktivitas tetap tertaut |
| **M2** | Endpoint dokumen & tab: CRUD dokumen, CRUD tab, reorder | Diverifikasi lewat `fetch` langsung |
| **M3** | Model lokal Y.Doc bertingkat + migrasi hidrasi | Tab lama muncul sebagai dokumen 1-tab, naskah utuh |
| **M4** | Sync: linkage per tab + judul dokumen | Autosave tetap jalan, dokumen baru naik ke cloud dengan tabnya |
| **M5** | UI: TopBar, sidebar tab, Riwayat, Library, sidebar proyek | Tiga tingkat terlihat dan bisa dinavigasi |
| **M6** | Import multi-berkas → satu dokumen banyak tab | Impor 3 berkas menghasilkan 1 dokumen 3 tab |
| **M7** | Ekspor DOCX: seluruh/terpilih | Satu berkas berisi tab terpilih berurutan |
| **M8** | Ekspor PDF multi-tab | Sama untuk PDF |

M0 tidak bergantung apa pun dan sebaiknya dikerjakan lebih dulu — ia memperbaiki kehilangan data
yang bisa terjadi hari ini.

---

## 9. Verifikasi

1. `bun run typecheck` + `bun test`.
2. **Migrasi diuji di database salinan** sebelum menyentuh dev: buat dokumen + versi + share +
   entri aktivitas, jalankan 0009, lalu pastikan ketiganya masih tertaut ke tab yang benar dan
   `documents` induk terbentuk satu per tab. Ini pola yang sama dengan verifikasi migrasi 0004,
   termasuk menjalankan versi lama untuk membuktikan bahayanya nyata.
3. Unit test: migrasi lokal Y.Doc (tab lama → dokumen 1-tab), dan perakitan ekspor multi-tab
   (fungsi murni: daftar tab → `PMNode[]`).
4. Smoke E2E: buat dokumen → tambah 3 tab → autosave → riwayat versi per tab → share satu tab →
   ekspor seluruh tab → pindahkan dokumen ke proyek → hapus dokumen (tab, versi, share ikut).
5. Manual: impor DOCX saat sedang menulis — naskah lama **harus** utuh.

## 10. Risiko

| Bagian | Risiko |
|---|---|
| Migrasi 0009 | **Tertinggi.** Ditulis tangan, menyentuh tabel inti, dan `db:generate`/`db:push` akan merusaknya. Mitigasi: uji di salinan, dan bereskan `db:push` vs `db:migrate` di compose (catatan lama yang belum digarap) |
| Model lokal Y.Doc | **Sedang-tinggi.** Data pengguna ada di IndexedDB; migrasi hidrasi hanya sekali dan tidak bisa diulang kalau salah. Tulis defensif, jangan hapus struktur lama sampai yang baru terbaca |
| UI tiga tingkat | **Sedang.** Menyentuh TopBar, sidebar tab, nav, Library sekaligus |
| Ekspor PDF multi-tab | **Sedang.** Berbasis DOM, bukan JSON — perlu render tersembunyi |
| Import multi-berkas | **Rendah** |

## 11. Yang sengaja tidak dikerjakan

- **Restore seluruh dokumen sekaligus** — konsekuensi keputusan 2, bisa ditambahkan nanti tanpa
  migrasi baru.
- **Memindahkan tab antar dokumen** — masuk akal, tapi bukan bagian dari perbaikan ini.
- **Share seluruh dokumen** — share tetap per tab.
