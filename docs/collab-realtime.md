# Kolaborasi real-time (SHL-5)

Keputusan pemesan (3 Okt 2026): dokumen cloud yang dibuka di beberapa peramban atau perangkat saling melihat
perubahan secara langsung, tanpa saling menimpa, plus kehadiran (kursor dan nama kolaborator). Dokumen ini mencatat
rancangannya dan alasan setiap keputusan. Status: **tahap 1 selesai** (server, tiket, pustaka klien, uji); **tahap 2
selesai di kode** (editor terikat ke sesi, kehadiran, cermin, cadangan, halaman berbagi langsung, indikator); uji dua
peramban menunggu slot server dev (skrip siap: `writer-hub-test/uji-editor-02okt/alat/kolab-0*.ts`).

Keputusan pemesan yang sudah disetujui (3 Okt): tautan `editor` boleh menyunting siapa pun pemegangnya; isi tab
kolaboratif milik server (PUT naskah ditolak 409, tidak dibuang diam-diam); pulihkan versi/draf me-reset state, dengan cadangan salinan lokal
WAJIB dan pemberitahuan; SHL-6 membawa semua tab dokumen ke cloud; "yang terakhir menang" selama transisi; tiket di
query dengan umur 60 dtk; batas laju tiket tautan; identitas kehadiran dipaksakan server.

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
  the link can edit" (disetujui pemesan). Halaman `/share/<token>` kini langsung: viewer melihat perubahan seketika
  tanpa bisa menyunting, tautan `editor` bisa menyunting.
- **Mengubah atau mencabut tautan berbagi** memutus sambungan yang masuk lewat tautan itu (4401, pesan bus
  `share-changed`), jadi peran baru atau penolakan berlaku seketika, bukan setelah otorisasi ulang sejam kemudian.
  Setiap sambungan lewat tautan juga diperiksa ulang saat dibuka (`checkShareGrant`): tiket tamu membawa peran dan
  akses (`acc`) tautan saat dibuat, dan tiket yang masih sah (±60 dtk) tetapi berasal dari sebelum perubahan
  ditolak 4401 (ambil tiket baru) atau 4403 bila tautannya sudah dicabut. Tanpa itu, sambungan ulang dengan tiket
  terakhir membawa peran lama sampai otorisasi ulang berikutnya.
- **Batas laju tiket pemilik** per pengguna (`RATE_LIMIT_COLLAB_TICKETS_PER_MIN`, bawaan 120/menit); klien yang
  tiketnya terus ditolak (4401) mencoba ulang dengan jeda bertambah (0,5 → 15 dtk) dan berhenti sebagai `denied`
  setelah 6 penolakan beruntun tanpa sinkron di antaranya.
- **Batas laju tiket tautan** per tautan (`RATE_LIMIT_SHARE_TICKETS_PER_MIN`, bawaan 120/menit): rute itu tanpa sesi,
  jadi yang dihitung adalah tautannya.
- **Identitas di kehadiran dipaksakan server.** y-protocols mempercayai klien sepenuhnya; server menimpa `user.name`
  setiap keadaan awareness dengan nama dari tiket (tamu tautan selalu "Guest") dan mencap penanda pemilik (`_owner`,
  hash subjek tiket). Entri untuk clientID yang keadaannya sudah ada - milik sambungan di instance MANA PUN, karena
  penandanya ikut menyeberang lewat bus - dibuang kecuali dari pemegang tiket yang sama (klien yang menyambung
  ulang, juga ke instance lain). Klien baru dihitung terhadap batas 4 per sambungan sambil disaring, jadi satu pesan
  tidak bisa melewatinya. Warna tetap pilihan klien.
- Kunci tiket `COLLAB_TICKET_SECRET` terpisah dari rahasia lain (bisa dirotasi sendiri). Kosong = kolaborasi mati:
  tiket dijawab 503 dan klien tetap memakai simpanan lama.

Kode tutup (`COLLAB_CLOSE`): 4401 tiket/otorisasi ulang, 4403 tidak berhak, 4404 tab dihapus, 4409 generasi state
berbeda, 4400 pesan rusak, 4503 kolaborasi tidak tersedia, 1012 server berhenti rapi. Rentang 4400-4499 tidak
disambung ulang otomatis oleh y-websocket; `CollabSession` yang memutuskan.

## Persistensi

- `collab_documents` (satu baris per tab yang sudah kolaboratif): `epoch`, `content_sv` (tanda isi turunan
  terakhir: `Y.encodeSnapshot`, yaitu state vector **dan** delete set), `seeded_by`.
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
2. Server memilih SATU sambungan penulis - pemilik lebih dulu daripada tamu tautan berbagi, lalu yang paling jarang
   diminta - dan mengambil kunci Redis `<prefix>seed:<tab>` (20 dtk). Klien itu menerima `status: seed`. Tamu
   tautan baru dipilih bila 1,5 dtk tidak ada pemilik yang menunggu (`shareSeedGraceMs`): setelah pulihkan versi
   semua klien kembali ke room kosong, dan pemilik - yang lebih dulu membuang salinan IndexedDB-nya - biasanya
   tiba belakangan.
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

Dipilih: **server menurunkan JSON dari state Yjs**, dan **PUT isi untuk tab kolaboratif ditolak 409**
(`collab_active`) - tidak pernah 200 sambil dibuang diam-diam. Klien mengulang tanpa `content`; judul, emoji, bahasa,
dan tata letak tetap tersimpan.

- PUT dari satu peramban hanyalah salinan peramban itu. Menerimanya berarti kembali ke "yang terakhir menulis menang".
  Menolaknya hanya bila "room aktif" tidak cukup: room yang sedang tidak dimuat pun punya state yang lebih benar
  daripada PUT dari tab peramban lama.
- Ditolak TERANG, bukan dibuang: dulu jawaban 200 membuat peramban yang suntingannya belum masuk room (login habis,
  websocket diblokir) mengira semuanya tersimpan.
- Bila kolaborasi **tidak dikonfigurasi** (`COLLAB_TICKET_SECRET` kosong), PUT isi diterima dan state Yjs tab itu
  dibuang dalam transaksi yang sama, supaya saat kolaborasi menyala lagi room disemai ulang dari isi itu.
- Konverter tanpa skema (`@writer-hub/shared/collab-json`) membaca pengodean y-prosemirror apa adanya. Bedanya dengan
  `node.toJSON()` hanya atribut bernilai bawaan null yang tidak tertulis; pembaca yang memakai skema mengisinya
  kembali. Uji di `apps/web/features/collab/collab-json.test.ts` memastikan hasilnya sama persis dengan jalur
  y-prosemirror + skema sungguhan untuk naskah kaya (tabel, daftar bersarang, mark bertumpuk berhash, simpul khusus).
- Diturunkan 2 dtk setelah tenang, paling lambat 10 dtk (`COLLAB_DERIVE_*`), setelah antrean tulis habis. Juga
  menyentuh `documents.updated_at` dan snapshot versi berkala (setiap 10 menit, seperti PUT dulu).
- **Penjaga tanda isi:** turunan hanya menimpa bila tandanya mencakup turunan tersimpan - setiap sisipan (state
  vector) dan setiap hapusan (delete set) - (`collab_documents.content_sv`, dikunci `FOR UPDATE`). State vector
  saja tidak cukup: hapusan Yjs tidak menaikkannya, sehingga "hapus paragraf lalu berhenti mengetik" tidak pernah
  diturunkan, dan proses yang punya sisipan lebih baru tetapi belum menerima hapusan itu menulis isi tanpa
  hapusannya. Proses yang tertinggal tahu dirinya tertinggal, mengejar dari log, lalu menurunkan ulang. Setiap
  perubahan yang diterapkan room (dari klien, bus, atau log) menjadwalkan turunan, dan room yang dimuat
  menurunkan ulang bila tanda log berbeda dari yang tersimpan; turunan ganda dari beberapa proses berakhir
  `unchanged`. Tanda versi lama (state vector polos) dianggap tidak diketahui dan ditimpa turunan berikutnya.
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
- Pembaruan atau semaian di atas 256 KB (gambar base64 yang ditempel, naskah panjang) diterbitkan sebagai rujukan
  baris log (`update-ref`/`seeded-ref`); penerima mengambil barisnya dari Postgres. Redis memutus pelanggan yang
  antrean keluarannya melewati `client-output-buffer-limit pubsub` (bawaan 32 MB, atau 8 MB selama 60 dtk).
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
- `apps/web`: konverter vs skema sungguhan, semaian, cermin, protokol, pengikatan, cadangan, rencana simpan cloud,
  coba ulang; dan `CollabSession` melawan API sungguhan (`features/collab/session.integration.test.ts`, variabel yang
  sama) termasuk muat ulang saat luring.
- Tanpa `COLLAB_IT_DATABASE_URL` uji ujung-ke-ujung dilewati dan itu diumumkan di keluaran.
- Dua peramban (Edge, profil sementara): `alat/kolab-01-dua-peramban.ts` (konvergen + kursor, viewer tautan, luring →
  online, muat ulang tanpa duplikasi, pulihkan versi saat pihak lain menyunting) dan `alat/kolab-02-tab-baru-luring.ts`
  (SHL-6/SHL-7) di `writer-hub-test/uji-editor-02okt`, dengan `UJI_BASE` mengarah ke server dev jalur ini.

### Angka (3 Okt 2026, mesin pengembang, `API_PROCESSES=2`, satu tab)

Klien y-websocket di satu proses Bun; setiap klien menulis paragraf berpenanda. Latensi = sejak sebuah suntingan
dibuat sampai tiba di SETIAP klien lain.

| Klien × suntingan (jeda) | Pengiriman | p50 | p95 | p99 | maks | Konvergen | Baris log |
|---|---:|---:|---:|---:|---:|---|---:|
| 10 × 20 (150 ms) | 1.800 | 37 ms | 107 ms | 109 ms | 111 ms | ya | 49 |
| 25 × 30 (100 ms) | 18.000 | 8 ms | 105 ms | 109 ms | 115 ms | ya | 60 |
| 50 × 20 (200 ms) | 49.000 | 11 ms | 108 ms | 113 ms | 124 ms | ya | 75 |
| 100 × 10 (200 ms) | 99.000 | 151 ms | 370 ms | 457 ms | 512 ms | ya | 37 |

Semua pengiriman tiba, semua salinan identik, dan isi turunan di server memuat semua suntingan. Sambungan di proses
yang sama menerima seketika; antar-proses ±100 ms - itulah jeda tulis ke log (`flushMs` di `collab/settings.ts`),
karena pembaruan baru diterbitkan ke Redis setelah tercatat. Pada 100 klien sebagian latensi milik klien uji sendiri
(100 provider di satu event loop).

## Tahap 2: editor, kehadiran, cadangan

- **Pengikatan** (`features/collab/collab-context.tsx`, dipasang di dalam `SyncProvider`): sesi untuk tab cloud
  aktif. `local` = tab lokal atau kolaborasi tidak tersedia (editor terikat ke Y.Doc besar seperti dulu); `pending` =
  sesi belum memegang isi (editor menampilkan salinan lokal, hanya-baca); `live` = editor terikat ke Y.Doc sesi.
  Di aplikasi utama, sesi yang sudah memegang isi **tetap** `live` walau kolaborasinya berhenti (login habis →
  `denied`, `unavailable`): suntingannya masuk ke Y.Doc sesi, tersimpan di salinan kolaborasi lokal, dan terkirim
  sebagai pembaruan Yjs saat tersambung lagi (dulu editor kembali ke Y.Doc besar dan suntingannya hilang).
  Editor dibuat ulang lewat `key` saat tab atau ikatannya berganti; fokus dan kursornya dibawa ke editor pengganti
  tab yang sama. Hak sunting mengikuti peran sesi; untuk pemilik dianggap `editor` sebelum tiket pertama, supaya
  salinan lokal bisa disunting luring.
- **Suntingan di salinan lokal tab cloud** saat editornya tidak terikat ke sesi (`local-edits.ts`) ditandai, tahan
  muat ulang, dan membuat status simpan tab itu tidak "tersimpan". Saat sesinya memegang isi, salinan itu dibandingkan
  dengan isi server sebelum cermin menimpanya dan dicadangkan bila berbeda ("Local copy kept before live sync",
  dengan pemberitahuan). PUT tab itu tetap mengirim naskahnya; bila server memegangnya secara kolaboratif ia
  menolak (409) dan PUT diulang tanpa naskah.
- **Tab baru dari salinan peramban ini** (simpan ke cloud, tab baru di dokumen cloud; `freshTabs` di
  `features/sync`): editor tetap di salinan lokal tanpa jeda hanya-baca selama sesinya menyambung dan menyemai dari
  salinan itu. Saat sesi memegang isi dan penulis berhenti mengetik 0,7 dtk (paling lambat 5 dtk), suntingan sejak
  semaian dibawa ke Y.Doc sesi lewat diff, lalu editor diserahkan ke sesi. Tab yang ditinggalkan sebelum diserahkan
  tetap membawa suntingannya ke sesi sebelum sesinya ditutup.
- **Muat ulang saat luring**: salinan lokal (IndexedDB per tab+epoch) dimuat sebelum tiket diminta, jadi tab cloud
  langsung `live`. Bila ternyata basi, server menolak (4409) dan salinannya dicadangkan. Tab cloud yang belum pernah
  tersambung di peramban ini dan dibuka saat luring kembali ke salinan lokal yang bisa disunting (`local`).
- **Sambungan pertama di peramban ini**: salinan lokal tab dibandingkan dengan isi server sebelum cermin menimpanya;
  bila berbeda (suntingan luring, PUT lama yang gagal, perangkat lain sudah menyunting), salinan itu dicadangkan
  sebagai "Local copy kept before live sync" dengan pemberitahuan. Bila tab itu justru disemai dari salinan lokal,
  isinya sama dan tidak ada cadangan.
- **Tab yang ditinggalkan** dengan suntingan yang mungkin belum terkirim (luring/menyambung) tetap tersambung di latar
  tanpa kehadiran, lalu dilepas 2 dtk setelah tersinkron (paling banyak 5). Tab lain hanya tersambung saat dibuka.
- **Kehadiran**: `@tiptap/extension-collaboration-caret` 3.29.2; kursor dan label nama berwarna (gaya di
  `globals.css`, bagian kolaborasi; tidak ikut tercetak). Avatar kolaborator di indikator bilah atas.
- **Cermin**: Y.Doc sesi → fragmen tab di Y.Doc besar, lewat diff, 0,8-4 dtk. Y.Doc yang dibuang tidak disalin lagi.
  Hanya **satu halaman per tab** yang mencermin (Web Locks, `mirror-leader.ts`): setiap tab peramban punya salinan
  Y.Doc besar sendiri yang tersimpan ke IndexedDB yang sama, dan dua halaman yang sama-sama mencermin perubahan
  yang sama membuat item Yjs berbeda untuk isi yang sama - setelah muat ulang naskahnya ganda. Halaman yang
  mendapat giliran mengejar dulu tulisan halaman lain (`fetchUpdates` pada penyimpan Y.Doc besar, dikenali dari
  asal transaksi muatnya) sebelum mencermin. Halaman lain tetap menyunting lewat Y.Doc sesinya sendiri; hanya
  salinan Y.Doc besarnya (pratinjau, ekspor) yang tertinggal sampai ia mendapat giliran.
- **Semaian**: `initial` → salinan persis tab lokal; `reset` → naskah server. Halaman tautan berbagi SELALU menyemai
  dari naskah server yang diambil saat diminta (`share-seed.ts`), tidak pernah dari muatan halaman: muatan itu
  basi setelah pemilik memulihkan versi, dan semaian darinya menimpa versi yang baru dipulihkan. Bila naskah
  server tidak terambil, tamu tidak menyemai.
- **Cadangan WAJIB** saat salinan dibuang (`backup.ts`): versi lokal + versi di riwayat tab server berlabel
  "Unsynced copy kept before reset" (`POST /tabs/:id/versions` kini menerima `content`), lalu pemberitahuan. Bila
  riwayat server tidak terjangkau (atau tamu tautan), teksnya bisa disalin dari pemberitahuan. Versi bernama dan
  "sebelum pemulihan" di server kini memotret isi dari log Yjs, bukan `document_tabs.content` yang bisa tertinggal.
- **PUT naskah berhenti** untuk tab yang sesinya sedang menerima suntingan; yang tetap dikirim judul, ikon, bahasa,
  dan tata letak.
- **Pengaman lain**: paragraf penutup dan migrasi kolom lama tidak menanggapi perubahan dari kolaborator (dua klien
  yang melakukannya bersamaan menghasilkan paragraf/struktur ganda); viewer tidak menambah paragraf penutup.
- **Indikator** (English): `Connecting…`, `Preparing…`, `Syncing…`, `Live`, `Offline`, `· View only`.

### Masih "yang terakhir menang" (lewat PUT), dan batasan

- Judul dokumen, daftar dan urutan tab, komentar, header/footer (perabot halaman), dan tata letak/tipografi tetap
  lewat PUT per tab/dokumen. Tab yang ditambahkan kolaborator tidak muncul di peramban lain sampai dokumen dibuka
  ulang dari Library.
- Pratinjau tab lain di panel tab mengikuti cermin; tab yang tidak sedang dibuka tidak tersambung, jadi pratinjaunya
  bisa tertinggal dari suntingan kolaborator sampai tab itu dibuka.
- Menghapus tab lokal tidak menghapus tab servernya (perilaku lama).
- Pulihkan versi oleh siapa pun membuat SEMUA klien yang membuka tab itu (termasuk yang memulihkan) mencadangkan
  salinannya dan menerima pemberitahuan.
