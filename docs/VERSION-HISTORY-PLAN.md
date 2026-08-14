# Rencana Implementasi: Document Version History (Fitur I, Tier V2)

**PRD:** "Snapshot draft per waktu, bisa diff & restore."
**FR:** Sistem menyimpan riwayat versi dokumen dan memungkinkan pemulihan ke versi lampau.
**Tech note PRD:** Tiptap Snapshot berbayar - bangun sendiri. Referensi: ddoc.

Dokumen ini merinci desain §4 `docs/FEATURE-GAP-PRD.md` menjadi langkah implementasi.
Prasyarat (A+B) sudah selesai: dokumen user tersimpan server-side dengan autosave.

## Keputusan yang sudah dikonfirmasi

1. **Tampilan:** mode layar penuh ala Google Docs (lihat gambar referensi) - panah kembali,
   preview read-only, sidebar kanan daftar versi. Tombol akses di kanan-atas TopBar,
   **samping tombol Bagikan**.
2. **Diff:** highlight inline di dokumen preview (bukan daftar perubahan), dengan toggle
   "Sorot perubahan". Versi terpilih dibandingkan terhadap **draft aktif**.
   Ini menjawab "apa yang berubah kalau saya pulihkan versi ini?" - berbeda dari Google Docs
   yang menyorot perubahan versi itu terhadap versi sebelumnya. Konsekuensi yang perlu diterima:
   makin tua versi yang dipilih, makin banyak selisihnya, dan karena teks tambahan dirender
   sebagai marker (bukan teks inline) versi lama akan tampak dipenuhi marker hijau. Kalau nanti
   terasa mengganggu, pembanding tinggal diganti ke "versi sebelumnya" tanpa mengubah util diff.
3. **Pemicu snapshot:** `manual` (beri nama versi) + `interval` (otomatis ~10 menit saat ada
   perubahan) + `pre_restore` (otomatis sebelum restore). `pre_translate` menyusul bersama
   fitur C - kolom trigger sudah menampungnya.
4. Format konten: **ProseMirror JSON** (§5.1 gap doc). Retensi: versi `interval` dibatasi
   50 terakhir per dokumen; `manual`/`pre_restore` tidak dipangkas.
5. Versi hanya ada untuk dokumen yang tersimpan di server. Tab lokal: tombol riwayat
   **disabled** dengan tooltip "Simpan ke cloud untuk mengaktifkan riwayat versi".
6. Tidak ada nama author (identitas hanya string `owner_id`) - entri versi menampilkan
   waktu, label, dan jenis trigger saja.

---

## 1. Backend (`apps/api`)

### 1.1 Skema baru `document_versions` (migrasi 0005)

File `src/db/schemas/document-version.ts`, ekspor di `schemas/index.ts`:

```ts
export const versionTriggerEnum = pgEnum('version_trigger', ['manual', 'interval', 'pre_translate', 'pre_restore'])

document_versions:
  id           uuid pk defaultRandom
  document_id  uuid notNull FK -> documents.id (onDelete: 'cascade')
  content      jsonb notNull                // ProseMirror JSON, format sama dgn documents.content
  trigger      version_trigger notNull
  label        varchar(255) nullable        // nama versi opsional dari user (manual)
  word_count   integer notNull default 0
  created_by   varchar(255)                 // userId pemicu
  created_at   timestamp(3) with tz         // tanpa updated_at - versi immutable
```

Migrasi via `bun run db:generate` (murni DDL baru, tanpa backfill - tidak perlu hand-edit).

### 1.2 Repository

`src/repository/document-version.ts` (pola `repository/document.ts`, fungsi module-level):

- `findVersionsByDocument(documentId)` - metadata (tanpa `content`), `created_at desc`.
- `findVersionById(versionId, documentId)` - lengkap dengan `content`.
- `insertVersion(values)`.
- `findLatestVersion(documentId)` - untuk keputusan interval; **ikut mengambil `content`**
  supaya penjaga "konten identik" di §1.4 bisa bekerja (satu baris, aman).
- `pruneIntervalVersions(documentId, keep = 50)` - hapus versi `trigger='interval'`
  di luar 50 terbaru. Pakai bentuk `OFFSET`, dan **filter yang sama harus ada di DELETE luar**,
  bukan hanya di subquery:
  ```sql
  DELETE FROM document_versions
  WHERE document_id = $1 AND "trigger" = 'interval' AND id IN (
    SELECT id FROM document_versions
    WHERE document_id = $1 AND "trigger" = 'interval'
    ORDER BY created_at DESC OFFSET 50
  );
  ```
  (`trigger` adalah kata kunci Postgres. Drizzle mengutipnya otomatis, tapi tiap query manual
  - termasuk saat memeriksa hasil lewat `psql` di §5 - harus mengutipnya sendiri.)
- `countWords(content)` bukan repository - helper murni di service (rekursi JSON,
  jumlahkan `node.text` dipisah spasi).

### 1.3 Service + route

`src/services/versions/` (`dto.ts` + `service.ts`, pola `services/documents/`):

- `list()` - `GET /documents/:id/versions` → `VersionSummary[]`
  `{ id, trigger, label, wordCount, createdAt }` (epoch ms, konsisten dengan documents).
  Verifikasi dokumen milik user dulu (`findDocumentById`), 404 bila bukan.
- `getById()` - `GET /documents/:id/versions/:versionId` → `VersionDetail` (+ `content`).
- `create()` - `POST /documents/:id/versions` body `{ label?: string }` → snapshot dari
  `documents.content` saat ini dengan `trigger='manual'`. 201.
- `restore()` - `POST /documents/:id/versions/:versionId/restore`:
  1. `INSERT` versi `pre_restore` dari `documents.content` saat ini.
  2. `UPDATE documents SET content = <content versi>` (updated_at ikut berubah via `$onUpdateFn`).
  3. Return `{ restored: VersionSummary, preRestoreVersionId }`. Idempoten: mengulang call
     menghasilkan pre_restore baru lagi (aman, tidak destructive).

`src/routes/v1/documents.route.ts` - tambah 4 sub-route di router documents yang sudah ada
(otomatis pakai `authMiddleware`):

```
GET    /:id/versions
GET    /:id/versions/:versionId
POST   /:id/versions
POST   /:id/versions/:versionId/restore
```

### 1.4 Snapshot interval otomatis

Dipicu backend di `DocumentsService.update()` (titik yang pasti dilewati autosave):

```
setelah updateDocument() sukses:
  latest = findLatestVersion(documentId)          // ikut ambil content
  jika tidak ada latest ATAU now - latest.created_at > 10 menit:
      konten = body.content ?? document.content
      jika latest ada DAN konten identik dengan latest.content: lewati
      insertVersion({ document_id, content: konten,
                      trigger: 'interval', created_by: userId, word_count })
      pruneIntervalVersions(documentId)
```

- Konstanta `INTERVAL_SNAPSHOT_MS = 10 * 60_000` di service.
- **Penjaga "konten identik" itu wajib, bukan optimasi.** `sync-context` mengirim `content` pada
  setiap PUT, dan PUT juga terjadi untuk perubahan yang tidak menyentuh naskah: ganti nama tab,
  ganti emoji, ganti bahasa, tambah/selesaikan komentar (semuanya lewat `updateTab` → menandai
  tab kotor). Tanpa penjaga ini, dokumen yang tidak disunting selama sehari tetap melahirkan
  versi kembar tiap kali ada sentuhan metadata, dan lini masa penuh entri "Otomatis" yang
  isinya sama persis. Perbandingannya cukup `JSON.stringify` atas satu baris `latest` - kedua
  sisi diserialisasi oleh jalur yang sama sehingga urutan kuncinya stabil. (Kalau kelak
  terasa mahal untuk dokumen besar, barulah tambahkan kolom `content_hash`.)
- Catatan: versi pertama sebuah dokumen baru tercipta pada autosave berikutnya, bukan saat
  create - dapat diterima (dokumen baru ≈ kosong). Kalau mau, `create()` sekalian insert
  versi `interval` pertama - **diputuskan: ya**, murah dan membuat timeline tidak pernah kosong.

---

## 2. Proxy Next (`apps/web/app/api`)

`app/api/documents/[id]/versions/route.ts` - `GET`, `POST`.
`app/api/documents/[id]/versions/[versionId]/route.ts` - `GET`.
`app/api/documents/[id]/versions/[versionId]/restore/route.ts` - `POST`.

Pola persis `app/api/documents/[id]/route.ts` (nested params `Promise<{ id, versionId }>`).

---

## 3. Frontend (`apps/web`)

### 3.1 Layer data `features/versions/`

- `types.ts`: `VersionSummary`, `VersionDetail` (`content: JSONContent`), `VersionTrigger`.
- `api.ts` (pola `features/documents/api.ts`): `listVersions`, `getVersion`,
  `createVersion(label?)`, `restoreVersion(documentId, versionId)`.
- `use-versions.ts`: `useQuery({ queryKey: ['versions', documentId], staleTime: 0 })`,
  invalidasi setelah create/restore.

### 3.2 Util diff `features/versions/diff.ts` - komponen baru, bukan reuse

Konteks (koreksi gap doc §4): **belum ada diff engine** - `ChangeListPanel` hanya me-render
`changes[]` buatan LLM. Util ini menerima dua dokumen arbitrer:

**Koreksi penting terhadap perkiraan awal: pemetaan offset → posisi ProseMirror TIDAK perlu
dibangun.** Repo sudah punya `features/document/tiptap-offsets.ts` yang persis melakukan itu,
dan sudah dipakai di enam tempat (`suggestion-highlight.ts`, `tiptap-editor.tsx`,
`chat/tools.ts`, `apply-text.ts`, `selection.ts`):

- `buildTextIndex(doc: PMNode): { text, segments }` - merangkai teks polos dari dokumen
  (satu baris per textblock, dipisah `\n`) sekaligus peta baliknya.
- `textRangeToPM(index, offset, length): { from, to } | null` - offset teks → rentang PM.

Karena itu langkah kerjanya menyusut jadi:

1. **Teks polos kedua sisi lewat jalur yang sama.** Untuk versi (yang berbentuk `JSONContent`,
   bukan editor): `schema.nodeFromJSON(json)` → `buildTextIndex(node).text`. Skemanya ambil dari
   `buildSchema()` di `features/sync/serialize.ts` - **ekspor fungsi itu** (sekarang privat).
   Untuk draft: sumbernya `fragmentToJSON(doc, tabId)`, bukan instance editor - lihat catatan
   di §3.3 soal editor yang tidak lagi terpasang di mode riwayat.
   Memakai `buildTextIndex` untuk kedua sisi menjamin teksnya sekarakter pun tidak berbeda dari
   yang dipakai pemeta posisi nanti; menulis traversal JSON sendiri justru mengundang selisih
   satu `\n` yang menggeser seluruh sorotan.
2. **Diff word-level** memakai paket **`diff` (jsdiff)** - `diffWordsWithSpace(versionText,
   draftText)` menghasilkan potongan `{ added, removed, value }`; akumulasi panjang menjadi
   daftar `{ offset, length, kind: 'removed' }` dan `{ offset, kind: 'added', words }` dalam
   koordinat **teks versi terpilih**. Potongan `added` tidak punya panjang di koordinat versi -
   ia hanya punya titik sisip (lihat §3.4).
3. **Pecah rentang di batas blok.** Rentang `removed` yang melintasi `\n` harus dipotong per
   blok sebelum dipetakan. `textRangeToPM` memetakan kedua ujung secara terpisah, jadi rentang
   lintas blok menghasilkan dekorasi yang ikut menutupi celah antar paragraf.
4. **Dependency baru: `bun add diff` di `apps/web`. Tanpa `@types/diff`** - paket `diff` v9
   sudah membawa tipenya sendiri (`types: libcjs/index.d.ts`), dan `@types/diff` kini hanya stub
   yang ditandai deprecated ("diff provides its own type definitions"). Memasangnya justru
   menimbulkan konflik deklarasi. Ini satu-satunya penambahan dependensi fitur ini.
   Alternatif `prosemirror-changeset` ditolak: API-nya low-level (dirancang untuk plugin
   internal Tiptap Snapshot), sedangkan kebutuhan kita hanya rentang teks untuk dekorasi.
5. Test `diff.test.ts` (`bun test`): insert/hapus/ubah kata, dokumen multi-paragraf, rentang
   yang melintasi batas blok, dokumen identik → nol rentang, dan salah satu sisi kosong.

Konsekuensi untuk penjadwalan: bagian yang tadinya "tertinggi" tinggal menyisakan logika diff
murni di atas string - sisanya kode yang sudah terbukti jalan di produksi (lihat §6).

### 3.3 Mode layar penuh `VersionHistoryView`

- State buka/tutup di context kecil `features/versions/version-context.tsx`
  (`versionMode: { documentId, serverTitle } | null`), provider di dalam `SyncProvider`
  (butuh linkage untuk tahu tab aktif tersimpan di server).
- `components/layout/workspace-page.tsx`: bila `versionMode` aktif, render
  `<VersionHistoryView>` **menggantikan** seluruh workspace (bukan overlay z-index - pola
  halaman standalone, tapi state tetap di memori sehingga kembali itu instan).
- **Konsekuensi yang harus disadari:** mengganti workspace berarti `<DocumentEditor />` ikut
  lepas, dan `EditorInstanceProvider` menerima `onReady(null)` - di dalam mode riwayat
  `useEditorInstance().editor` bernilai `null`. Jadi **draft untuk pembanding diff tidak boleh
  diambil dari instance editor.** Ambil dari Y.Doc: `fragmentToJSON(doc, activeId)`
  (`features/sync/serialize.ts`), yang tetap tersedia terlepas dari editor terpasang atau tidak
  dan selalu memuat keadaan terkini. Ini juga alasan alur restore (§3.6) tetap aman: `saveToCloud`
  memang sudah jatuh ke `fragmentToJSON` ketika editor tidak ada.
- Layout (mengikuti gambar referensi):
  - **Header kiri:** tombol `←` kembali + tanggal versi terpilih (atau "Versi saat ini").
  - **Area utama:** preview read-only.
  - **Sidebar kanan:** judul "Riwayat versi", daftar berkelompok waktu
    (Hari ini / Kemarin / 7 hari terakhir / Lebih lama - `Intl.DateTimeFormat('id-ID')`),
    entri teratas tetap "Versi saat ini". Tiap entri: waktu, label atau badge trigger
    (`manual` → label/ikon pin, `interval` → "Otomatis", `pre_restore` → "Sebelum pemulihan"),
    word count.
  - **Kanan bawah:** checkbox "Sorot perubahan" (default aktif) + tombol
    **"Pulihkan versi ini"** (primary, hanya saat versi lampau terpilih).

### 3.4 Preview read-only + highlight

- Editor kedua read-only: `buildEditorExtensions({ geometry: pageGeometry() })` **tanpa**
  `collaboration` (editor sendiri, bukan fragmen Yjs) + `editable: false` - preseden persis:
  `app/share/[token]/page.tsx:41-56`, termasuk `setContent(content, { emitUpdate: false })`
  saat konten berubah. `emitUpdate: false` bukan detail kosmetik: tanpanya tiap pergantian versi
  menembakkan `onUpdate`.
- Plugin dekorasi baru `features/versions/version-diff-highlight.ts` (pola
  `features/document/suggestion-highlight.ts` - `PluginKey` + `Decoration.inline`, dekorasi
  dibangun ulang dari `newState.doc` saat meta masuk, bukan disimpan sebagai posisi tetap):
  - `removed` (ada di versi, hilang di draft) → latar merah muda + coretan.
  - `added` (ada di draft, tidak di versi) → tidak punya rentang di versi; dirender sebagai
    **widget marker** hijau di titik sisip (tooltip "N kata ditambahkan di versi saat ini")
    - pendekatan sederhana iterasi pertama; sorot inline penuh untuk teks tambahan berarti
    merender teks yang tidak ada di dokumen preview, itu fase berikutnya bila diminta.
  - **Prasyarat kecil untuk marker itu:** widget butuh posisi tunggal, sedangkan
    `textRangeToPM` mengembalikan `null` untuk rentang nol-panjang (`if (to <= from) return null`).
    Jadi `textPosToPM` di `tiptap-offsets.ts` - sekarang privat - perlu **diekspor**.
    Menyiasatinya dengan `textRangeToPM(index, offset, 1).from` salah di ujung blok: karakter
    berikutnya bisa berada di paragraf lain.
- Plugin ini dipasang **hanya di editor preview**, bukan lewat `buildEditorExtensions`.
  Perlu diingat `SuggestionHighlight` dan `SelectionHighlight` sudah ikut di daftar ekstensi
  bawaan (`extensions.ts:80-81`), jadi editor preview membawa keduanya - tidak masalah karena
  tak ada yang mengirimi mereka meta, tapi jangan sampai `PluginKey` baru bertabrakan nama.
- Toggle checkbox memasang/melepas dekorasi (meta plugin, pola `selection-highlight.ts`).

### 3.5 Tombol akses di TopBar

`components/layout/top-bar.tsx` - `HeaderButton` ikon `History` (lucide) tepat **sebelum**
tombol Bagikan. `disabled` bila `linkage[activeId]` tidak ada (tab lokal), tooltip
"Simpan ke cloud untuk mengaktifkan riwayat versi". `onClick` → buka `versionMode` dengan
`serverId` tab aktif.

### 3.6 Alur restore

1. User pilih versi → "Pulihkan versi ini" → `ConfirmDialog`
   ("Draft saat ini disimpan otomatis sebagai versi 'Sebelum pemulihan'").
2. **Flush dulu:** `await saveToCloud(activeId)` agar `documents.content` di server = keadaan
   editor terkini (pre_restore menangkap state yang benar). **Bila flush gagal, batalkan
   restore** dan tampilkan galat - melanjutkan berarti `pre_restore` membekukan naskah lama
   dan suntingan terakhir user hilang tanpa jejak. `saveToCloud` sendiri tidak melempar
   (ia menelan error jadi status `'error'`), jadi perlu memeriksa `syncStatus(activeId)`
   sesudahnya, atau ubah `saveToCloud` supaya me-rethrow.
3. `restoreVersion(documentId, versionId)`.
4. Ambil ulang dokumen (`getDocument`) → tulis ke fragmen tab aktif.
   **Perhatian:** `jsonToFragment(doc, tabId, json)` mengunci `LOCAL_ORIGIN` di dalam
   transaksinya sendiri dan tidak menerima parameter origin. Dipanggil apa adanya, tulisan itu
   terbaca sebagai suntingan pengguna → tab ditandai kotor → autosave menembakkan PUT balik atas
   naskah yang baru saja ditulis server. Bungkus dalam transaksi luar:
   `doc.transact(() => jsonToFragment(doc, tabId, content), SYNC_ORIGIN)` - Yjs mengabaikan
   origin transaksi bersarang sehingga origin luar yang berlaku. (Pola yang sama dipakai
   `openFromLibrary` di `sync-context.tsx`.) Alternatif yang lebih jujur: tambahkan parameter
   origin opsional ke `jsonToFragment`.
5. Tutup mode riwayat, invalidasi `['versions', documentId]` dan `['documents']`.

### 3.7 "Beri nama versi ini"

Di sidebar mode riwayat: tombol/plus "Beri nama versi ini" → dialog input kecil →
`createVersion(label)` → entri `manual` muncul di puncak daftar.

---

## 4. Yang tidak berubah / di luar scope

- `services/worker`: nol perubahan.
- `pre_translate` trigger: kolom enum sudah siap, diisi nanti oleh fitur C.
- Share, comments, kolaborasi V3: tidak disentuh. Saat O datang, snapshot interval bisa
  pindah ke sisi server dari Y.Doc tanpa mengubah skema/API.
- Optimasi ukuran jsonb (kompresi/delta antar versi interval) - tidak di iterasi pertama.

## 5. Verifikasi

1. `bun run --filter @writer-hub/api typecheck`, `bun run --filter @writer-hub/web typecheck`.
2. `bun test` di `apps/web` - termasuk `diff.test.ts` baru.
3. `bun run db:generate` → migrasi 0005 → `db:migrate`. Catatan: container `api-migrate` di
   `docker-compose.yml:74` menjalankan `db:push`, bukan `db:migrate`. Untuk 0005 keduanya setara
   (murni DDL, tanpa backfill), jadi tidak memblokir - tapi selisih ini perlu dibereskan sebelum
   ada migrasi berdata berikutnya.
4. Smoke E2E (API + web dev seperti sesi sebelumnya):
   - Buat dokumen via proxy → versi `interval` pertama ada.
   - PUT dua kali dengan jeda/dimodifikasi `created_at` bila perlu → versi interval bertambah.
   - POST manual dengan label → muncul di list.
   - POST restore → `documents.content` tertimpa konten versi, versi `pre_restore` tercipta.
   - Hapus dokumen → versi ikut terhapus (cascade).
5. Manual di browser: buka riwayat dari TopBar, pilih versi, highlight berubah sesuai diff,
   restore, editor kembali ke konten versi dan timeline menunjukkan entri pre_restore.

## 6. Estimasi kompleksitas (untuk penjadwalan)

| Bagian | Risiko |
|---|---|
| Skema + CRUD versi + interval snapshot | Rendah - pola persis fitur A/B |
| Mode layar penuh + sidebar + preview read-only | Rendah-sedang - preseden share page |
| Util diff + dekorasi | **Sedang** (turun dari "tertinggi" setelah §3.2 dikoreksi) - pemetaan offset → posisi PM sudah ada dan terpakai di 6 tempat (`tiptap-offsets.ts`); yang benar-benar baru hanya logika diff di atas string + pemecahan rentang di batas blok. Mitigasi tetap: util terisolasi + test unit |
| Titik integrasi yang mudah terlewat | **Sedang** - tiga hal yang tidak kelihatan dari desain: editor lepas di mode riwayat (§3.3), `jsonToFragment` mengunci `LOCAL_ORIGIN` (§3.6), dan PUT metadata melahirkan versi kembar (§1.4). Ketiganya sudah dijawab di rencana ini |

---

## Iterasi 2: versi lokal + Ctrl+S (fitur C ditunda)

Fitur C (File Translator) dikeluarkan sementara dari roadmap (butuh worker + parser baru);
trigger `pre_translate` tetap disiapkan. Konsekuensinya, riwayat versi tidak boleh lagi
menunggu cloud: iterasi ini membuat versioning bekerja **local-first**.

### Keputusan (dikonfirmasi)

1. **Ctrl+S cerdas sesuai status tab.** Tab terhubung cloud → flush autosave sekarang
   (`saveToCloud`, PUT). Tab lokal → buat snapshot versi lokal (trigger `interval`,
   tanpa label) sebagai titik simpan cepat. Versi manual berlabel tetap lewat
   "Beri nama versi ini".
2. **Penyimpanan versi lokal: store IndexedDB khusus** (bukan di dalam Y.Doc).
   Database `writer-hub-versions`, object store `versions` (key `id`, index `tabId`),
   isi snapshot ProseMirror JSON. Bentuk entri meniru `VersionSummary`/`VersionDetail`
   server, sehingga UI riwayat yang sama dipakai untuk lokal dan cloud.
3. **Saat "Simpan ke cloud": hanya konten terkini yang diunggah.** Riwayat versi di
   server mulai dari nol (versi `interval` pertama dari `DocumentsService.create()`);
   versi lokal tetap di browser sebagai arsip, tidak dihapus, tidak diunggah.

### Desain

- **`features/versions/local-store.ts`** (baru): wrapper IndexedDB mentah (tanpa
  dependency; pola promise kecil di atas `indexedDB.open`). Fungsi:
  `listLocalVersions(tabId)`, `getLocalVersion(tabId, id)`, `insertLocalVersion(entry)`,
  `pruneLocalIntervalVersions(tabId, keep = 50)`, `deleteLocalVersionsForTab(tabId)`.
  Test dengan fake-indexeddb bila sudah ada di dep; kalau tidak, test logika murni saja
  (jangan menambah dependency test baru).
- **Sumber versi terpadu** di `features/versions/`: `versionMode` diperluas jadi
  `{ tabId, documentId: string | null, title }` - `documentId` null berarti sumber lokal.
  Hook `useVersions`/`useVersion` bercabang: `documentId` ada → API server (sekarang);
  null → local store. Bentuk data identik, jadi `VersionHistoryView` tidak berubah
  kecuali alur restore dan tombol akses.
- **Snapshot interval lokal:** di `VersionProvider`, dengar `doc.on('update')` (blacklist
  origin yang sama dengan sync-context). Untuk tab lokal aktif: bila belum ada versi sama
  sekali → buat versi `interval` pertama; bila versi terakhir > 10 menit dan konten
  berubah → buat versi `interval` + prune. Konstanta sama dengan backend (10 menit).
- **Restore lokal:** ConfirmDialog → insert versi `pre_restore` (konten fragmen saat ini)
  → `jsonToFragment` konten versi dengan `SYNC_ORIGIN` → invalidate. Tanpa flush/cloud.
- **Ctrl+S:** hook keydown global di workspace (Ctrl/Cmd+S, `preventDefault`), dilewatkan
  saat mode riwayat terbuka. Tab terhubung → `saveToCloud(activeId)`; tab lokal →
  `insertLocalVersion` trigger `interval` (selalu, tanpa penjaga 10 menit - ini aksi
  eksplisit user).
- **TopBar:** tombol History tidak lagi disabled untuk tab lokal; tooltip disesuaikan
  ("Riwayat versi").
- **Prune saat tab dihapus:** efek prune linkage di sync-context diperluas untuk ikut
  `deleteLocalVersionsForTab`.

### Yang tidak berubah

- Backend (server versioning tetap seperti iterasi 1; dokumen cloud tetap memakai API).
- Alur "Simpan ke cloud": tidak mengunggah versi lokal (keputusan 3).

### Verifikasi

- Typecheck + `bun test` (test store/diff yang relevan).
- Manual browser: tab lokal → edit → tunggu/Ctrl+S → buka History → versi lokal tampil,
  diff & restore jalan tanpa server; tab cloud tetap memakai versi server.
