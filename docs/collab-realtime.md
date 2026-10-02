# Kolaborasi real-time (SHL-5)

Keputusan pemesan (3 Okt 2026): dokumen cloud yang dibuka di beberapa peramban atau perangkat saling melihat
perubahan secara langsung, tanpa saling menimpa, plus kehadiran (kursor dan nama kolaborator). Dokumen ini mencatat
rancangannya dan alasan setiap keputusan. Status: **tahap 1 selesai** (server, tiket, pustaka klien, uji), **tahap 2
belum** (pengikatan ke editor, kehadiran di UI, uji dua peramban).

## Masalah yang ditutup

- **SHL-5.** Sinkron cloud dulu berupa `PUT /tabs/:id` seluruh isi tab tanpa versi: yang terakhir menulis menang, dan
  suntingan peramban lain hilang tanpa peringatan.
- **SHL-6.** "Simpan ke cloud" pada tab kedua membuat dokumen server terpisah; tab baru di dokumen cloud tidak ikut
  tersimpan.
- **SHL-7.** Simpanan yang gagal saat luring tidak pernah dicoba ulang.

## Gambaran

```
peramban A ──┐  wss /api/v1/collab/ws/<tabServer>?ticket=…&epoch=…
peramban B ──┼──► proses API 1 ─┐            ┌─► Postgres: collab_documents (kepala, epoch, state vector turunan)
             │                  ├─ Redis ────┤             collab_updates  (log pembaruan Yjs, hanya ditambah)
peramban C ──┴──► proses API 2 ─┘  pub/sub   └─► document_tabs.content (JSON, DITURUNKAN dari state Yjs)
```

- **Satu room per tab server.** Isi tab di klien sudah berupa satu `Y.XmlFragment` per tab, dan tab adalah satuan yang
  dibaca server (AI chat, draf, ekspor, share). Room per dokumen akan memaksa setiap peramban memuat semua tab.
- **Protokol y-websocket standar** (`y-protocols` sync + awareness), jadi klien memakai `WebsocketProvider` apa
  adanya. Dua pesan tambahan (nilai di `@writer-hub/shared` `COLLAB_MESSAGE`):
  - `status` (100, server → klien): `{ state: 'waiting' | 'seed' | 'ready', epoch, role, readOnly }`.
  - `seed` (101, klien → server): satu pembaruan Yjs berisi naskah awal.
- **Websocket Bun native, dirutekan lewat Hono** (`apps/api/src/collab/server.ts`, rute
  `routes/v1/collab.route.ts`). Penangan websocket milik sendiri, bukan pembungkus `hono/bun`: pembungkus itu
  memberi `message.buffer` tanpa offset, tidak punya `drain`, dan tidak memberi kendali atas batas pesan.

## Autentikasi: tiket berumur pendek

Peramban tidak bisa memanggil API dengan tanda tangan server (HMAC `PP_API_KEY` hanya ada di BFF), dan websocket
tidak membawa header buatan. Jadi:

1. Peramban → BFF `POST /api/collab/ticket { tabId, shareToken? }` (`apps/web/app/api/collab/ticket/route.ts`).
2. BFF → API, bertanda tangan seperti rute lain:
   - `POST /api/v1/collab/tickets` (authMiddleware): pemilik tab → peran `editor`.
   - `POST /api/v1/collab/shared/:token/tickets` (tanpa sesi, seperti `GET /shares/:token`): peran mengikuti
     tautan berbagi; tautan `restricted` ditolak (sama dengan perilaku share hari ini).
3. API menjawab `CollabTicket`: tiket `base64url(klaim).HMAC-SHA256` (klaim: tab, dokumen, pemegang, id pengguna,
   nama, peran, kedaluwarsa), `epoch` saat ini, `wsUrl`, dan nama untuk kehadiran.
4. Peramban membuka `wsUrl/<tabId>?ticket=…&epoch=…`.

Keputusan terkait:

- **Umur tiket 60 dtk (`COLLAB_TICKET_TTL_S`) hanya untuk membuka sambungan.** Sambungan yang sudah hidup tidak ikut
  putus; ia ditutup 4401 setelah `COLLAB_REAUTH_S` (bawaan 1 jam) supaya klien mengambil tiket baru. Itu batas atas
  lamanya akses yang dicabut (token login kedaluwarsa, tab dipindah) masih berlaku.
- **Tiket ada di query** (diminta pemesan). Ia bisa tercatat di log akses ingress. Mitigasinya umur pendek dan cakupan
  satu tab; bila perlu, matikan pencatatan query string untuk jalur ini di ingress.
- **Penolakan disampaikan setelah upgrade sebagai kode tutup**, bukan status HTTP: peramban tidak pernah
  memperlihatkan status handshake yang gagal, sedangkan klien harus bisa membedakan "ambil tiket baru" dari "jaringan
  putus".
- **Viewer dan commenter hanya menerima.** Pembaruan dari sambungan tanpa hak tulis dibuang di server, tidak pernah
  sampai ke room, log, maupun klien lain. Awareness tetap boleh (kehadiran). Commenter belum punya anotasi di Yjs.
- **Tautan berbagi berperan `editor` memberi hak tulis** kepada siapa pun yang memegang tautannya, seperti "anyone with
  the link can edit". Hari ini halaman share masih hanya-baca, jadi kemampuan ini baru terpakai bila tahap berikutnya
  memakainya. **Perlu persetujuan pemesan.**
- Kunci tiket `COLLAB_TICKET_SECRET` terpisah dari rahasia lain (bisa dirotasi sendiri). Kosong = kolaborasi mati:
  tiket dijawab 503 dan klien tetap memakai simpanan lama.

Kode tutup (`COLLAB_CLOSE`): 4401 tiket/otorisasi ulang, 4403 tidak berhak, 4404 tab dihapus, 4409 generasi state
berbeda, 4400 pesan rusak, 4503 kolaborasi tidak tersedia, 1012 server berhenti rapi. Rentang 4400-4499 tidak
disambung ulang otomatis oleh y-websocket; `CollabSession` yang memutuskan.

## Persistensi

- `collab_documents` (satu baris per tab yang sudah kolaboratif): `epoch`, `content_sv`, `seeded_by`.
- `collab_updates`: log pembaruan Yjs, hanya ditambah. Pembaruan dari klien dikumpulkan ±100 ms lalu ditulis sebagai
  satu baris (gabungan `Y.mergeUpdates`).
- **Tidak ada baca-ubah-tulis state per ketikan.** Naskah 20 MB yang ditulis ulang setiap 100 ms akan menenggelamkan
  Postgres; log yang hanya ditambah aman ditulis banyak proses sekaligus karena pembaruan Yjs komutatif dan
  idempoten.
- **Pemadatan** menggabungkan log satu tab menjadi satu baris (lewat Y.Doc ber-GC, jadi isi yang dihapus ikut
  dipadatkan) lalu menghapus PERSIS id yang digabung - bukan rentang id: baris yang ditulis proses lain di tengah
  jalan, atau yang id-nya lebih kecil tapi baru ter-commit, tetap utuh. Kunci advisory per tab mencegah dua proses
  memadatkan bersamaan. Dijalankan saat room dilepas (≥ 20 baris baru) dan selagi aktif (setiap 500 baris).
- `(tab_id, epoch)` di log merujuk kepala dengan `ON DELETE CASCADE`: reset membuang lognya, dan tulisan susulan dari
  generasi lama ditolak kunci asing (room lalu memutus kliennya dengan 4409) - tidak pernah tercampur ke generasi baru.
- Migrasi: `apps/api/src/db/migrations/0028_collab_realtime.sql`.

## Generasi state (epoch)

Menggabungkan dua Y.Doc yang tidak berbagi riwayat menggandakan seluruh naskah. Itu bisa terjadi bila state di server
dibuang lalu disemai ulang (pulihkan versi, draf), sementara sebuah peramban masih memegang salinan lama. Karena itu:

- Setiap state punya `epoch` (UUID) yang dibuat saat disemai.
- Klien mengirim epoch salinannya saat menyambung (`''` = tanpa salinan). Tidak cocok → 4409 `epoch:<yang berlaku>`;
  klien membuang Y.Doc itu (setelah memberi kesempatan mencadangkannya, event `discard`) lalu mulai dengan Y.Doc baru
  (event `doc`).
- Salinan lokal disimpan di IndexedDB per **(tab, epoch)**, jadi dua generasi tidak pernah berbagi basis data.
- BroadcastChannel y-websocket dimatikan: ia melewati pemeriksaan epoch. Tab peramban lain menyinkron lewat server.

## Penyemaian tanpa duplikasi

Tab server yang belum punya state Yjs harus diisi dari isi yang sudah ada, dan dua klien yang menyemai bersamaan akan
menggandakan naskah. Server tidak punya skema editor, jadi yang menyemai adalah klien:

1. Room yang belum disemai menahan semua klien di status `waiting`; pembaruan mereka dibuang dan sync step 1 mereka
   ditahan.
2. Server memilih SATU sambungan penulis (yang paling jarang diminta lebih dulu) dan mengambil kunci Redis
   `<prefix>seed:<tab>` (20 dtk). Klien itu menerima `status: seed`.
3. Klien membangun isi di Y.Doc sementara dan mengirimnya sebagai pesan `seed` - tidak pernah langsung ke Y.Doc yang
   tersinkron, supaya semaian yang ditolak tidak tertinggal di salinan lokal.
4. Server menulis kepala + semaian dalam satu transaksi dengan `INSERT … ON CONFLICT DO NOTHING` pada kunci primer.
   **Inilah gerbangnya**, bukan kunci Redis: walau dua instance sama-sama meminta kliennya menyemai, hanya satu yang
   menang; yang kalah membuang semaiannya dan mengambil hasilnya dari log.
5. Semua klien yang menunggu menerima `ready` dan sync step 2 berisi semaian.

Penyemai yang diam digantikan setelah kuncinya habis. Sumber isi adalah keputusan klien (tahap 2), dengan aturan:
`reason: 'initial'` → salinan lokal tab bila ada (persis, tanpa lewat JSON), selain itu JSON server; `reason: 'reset'`
→ selalu JSON server (salinan lokal sudah basi).

## Isi untuk pembaca sisi server (`document_tabs.content`)

Dipilih: **server menurunkan JSON dari state Yjs**, dan **PUT isi untuk tab kolaboratif diabaikan** (judul, emoji,
bahasa, tata letak tetap tersimpan).

- PUT dari satu peramban hanyalah salinan peramban itu. Menerimanya berarti kembali ke "yang terakhir menulis menang".
  Mengabaikannya hanya bila "room aktif" tidak cukup: room yang sedang tidak dimuat pun punya state yang lebih benar
  daripada PUT dari tab peramban lama.
- Konverter tanpa skema (`@writer-hub/shared/collab-json`) membaca pengodean y-prosemirror apa adanya. Bedanya dengan
  `node.toJSON()` hanya atribut bernilai bawaan null yang tidak tertulis; pembaca yang memakai skema mengisinya
  kembali. Uji di `apps/web/features/collab/collab-json.test.ts` memastikan hasilnya sama persis dengan jalur
  y-prosemirror + skema sungguhan untuk naskah kaya (tabel, daftar bersarang, mark bertumpuk berhash, simpul khusus).
- Diturunkan 2 dtk setelah tenang, paling lambat 10 dtk (`COLLAB_DERIVE_*`), setelah antrean tulis habis. Juga
  menyentuh `documents.updated_at` dan snapshot versi berkala (setiap 10 menit, seperti PUT dulu).
- **Penjaga state vector:** turunan hanya menimpa bila state vector-nya mencakup turunan tersimpan
  (`collab_documents.content_sv`, dikunci `FOR UPDATE`). Proses yang tertinggal satu pesan pub/sub tidak bisa
  menimpa isi yang lebih baru; ia justru tahu dirinya tertinggal, mengejar dari log, lalu menurunkan ulang.
- Jalur server yang menulis isi sendiri - pulihkan versi, draf - menulis isi DAN membuang state Yjs dalam satu
  transaksi (`writeTabContentFromServer`), lalu room yang hidup memutus kliennya (4409). Satu transaksi itu penting:
  turunan room yang menyelip di antaranya akan menimpa isi baru, dan penyemai berikutnya mengisi room dari isi yang
  salah.

## Banyak proses dan replika

- **Tidak perlu sticky session.** Setiap instance yang memegang room berlangganan kanal Redis
  `<COLLAB_REDIS_PREFIX>room:<tab>`; pembaruan dan awareness diteruskan ke instance lain.
- Pembaruan diterbitkan SETELAH tercatat di Postgres, dan room yang baru dimuat berlangganan DULU baru membaca log.
  Setiap pembaruan pasti ada di salah satunya: di log yang terbaca, atau di pesan yang tiba setelah langganan aktif.
- Pub/sub paling-banyak-sekali. Celahnya ditutup: ioredis mengantre perintah selama putus; setelah langganan pulih
  setiap room mengejar dari log; dan penjaga state vector pada turunan mendeteksi room yang tertinggal.
- Kanal pub/sub berlaku lintas indeks DB Redis, jadi lingkungan yang berbagi satu Redis wajib memakai awalan berbeda.
- Klien baru di satu instance meminta awareness instance lain (`query-awareness`), jadi kolaborator di proses lain
  langsung terlihat, bukan setelah pembaruan awareness berikutnya (±15 dtk).

## Siklus hidup room

- Dimuat saat sambungan pertama datang; dilepas `COLLAB_ROOM_IDLE_S` (30 dtk) setelah sambungan terakhir pergi -
  setelah antrean tulis habis, isinya diturunkan, dan lognya dipadatkan.
- Berhenti rapi (SIGTERM): port ditutup dulu, room disimpan, klien diputus 1012 (pindah replika). Urutan ini penting:
  klien yang diputus langsung menyambung ulang, dan bila port masih mendengar, `server.stop(true)` Bun menggantung
  sampai proses dibunuh (ditemukan saat uji, 15 dtk per proses).
- `bun --hot` (stack dev): manajer room dan bus Redis disimpan di globalThis; generasi lama dimatikan saat modul
  dievaluasi ulang.

## Klien (`apps/web/features/collab`)

- `session.ts` - `CollabSession`, tanpa React: tiket (diperbarui sendiri pada 4401 dan menjelang habis), epoch,
  salinan lokal, penyemaian, fase untuk UI (`connecting`, `waiting`, `seeding`, `syncing`, `synced`, `offline`,
  `denied`, `gone`, `unavailable`). Epoch salinan dipasang ke parameter sambungan begitu `ready` diterima, supaya
  sambung-ulang otomatis y-websocket tidak pernah membawa generasi lama ke room yang sudah disemai ulang.
- `seed.ts` - isi awal dari JSON server (dengan skema editor) atau salinan persis fragmen lokal.
- `mirror.ts` - cermin satu arah Y.Doc tab → Y.Doc besar (pratinjau, ekspor, riwayat, daftar dokumen). Lewat diff
  (`updateYFragment`), bukan tulis ulang, dengan asal transaksi sendiri yang diabaikan penyimpan cloud lama. Naskah
  dibaca lewat konverter tanpa skema karena `yXmlFragmentToProseMirrorRootNode` menghapus simpul tidak sah dari Y.Doc
  sumbernya - di sini Y.Doc yang tersinkron ke semua orang.
- `local-store.ts` - IndexedDB per (tab, epoch): suntingan luring tersimpan dan terkirim saat tersambung lagi.
- `presence.ts` - nama dan warna kolaborator untuk awareness.

## SHL-6 dan SHL-7 (`apps/web/features/sync`)

- Dokumen lokal yang satu tabnya sudah di cloud adalah dokumen cloud (`cloud-plan.ts`): "Simpan ke cloud" pada tab
  lain membuat tab server di dokumen server yang sama, dan tab baru/duplikat/yang tertinggal ditautkan otomatis,
  satu per satu (posisi tab server dihitung `max + 1`; pembuatan bersamaan bisa bentrok).
- Simpanan dan penautan yang gagal karena jaringan dicoba ulang 2, 4, 8 … 60 dtk, dan semuanya dicoba saat itu juga
  ketika peramban kembali online (`retry.ts`). Naskah kebesaran (413) tidak dicoba ulang otomatis.

## Uji

- `apps/api`: `bun test` - tiket, protokol, state vector, room (penyimpanan dan bus di memori: konvergensi, viewer,
  semaian tunggal termasuk dua instance yang sama-sama meminta, penyemai diam diganti, epoch, fan-out, penjaga turunan,
  reset, pesan rusak). Ujung-ke-ujung dengan proses API sungguhan:
  `COLLAB_IT_DATABASE_URL=postgresql://…/writer_hub_kolab COLLAB_IT_REDIS_DB=1 bun test src/collab/collab.integration.test.ts`.
- `apps/web`: konverter vs skema sungguhan, semaian, cermin, protokol, rencana simpan cloud, coba ulang; dan
  `CollabSession` melawan API sungguhan (`features/collab/session.integration.test.ts`, variabel yang sama).
- Tanpa `COLLAB_IT_DATABASE_URL` uji ujung-ke-ujung dilewati dan itu diumumkan di keluaran.

## Tahap 2 (belum)

- Mengikat `Collaboration` di `tiptap-editor.tsx`/`extensions.ts` ke `CollabSession.doc` untuk tab yang tertaut,
  termasuk mengikat ulang saat event `doc`, dan editor hanya-baca untuk viewer/selama `waiting`.
- Kehadiran: `@tiptap/extension-collaboration-caret` versi 3.29.x (sama dengan inti Tiptap) dengan
  `CollabSession.provider`.
- Cermin ke Y.Doc besar, sumber semaian sesuai aturan di atas, cadangan versi lokal pada event `discard`, PUT hanya
  metadata untuk tab kolaboratif, pemulihan versi lewat Yjs dari UI.
- Uji dua peramban (harness Playwright) dan SHL-6/SHL-7 di UI.
- Di luar cakupan sekarang: judul dokumen, daftar/urutan tab, dan komentar masih lewat PUT ("yang terakhir menang");
  menghapus tab lokal tidak menghapus tab servernya (perilaku lama).
