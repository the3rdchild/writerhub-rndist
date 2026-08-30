# PRD — Endpoint Dokumen Eksternal (PPE AI Chat)

Status: **Terimplementasi** · Disusun 30 Agustus 2026 · Baseline kode `a0eb6aa` (branch `main`)

Dokumen ini adalah kontrak untuk tim **PPE AI Chat** yang mengintegrasikan produk mereka dengan
WritingHub: dari percakapan "buatkan X", PPE AI Chat memanggil satu endpoint WritingHub dan
menerima balasan berupa **tautan ke dokumen WritingHub yang baru dibuat** — bukan teks mentah.

Terkait: `CHAT-TONE-PLAN.md` (field `tone` di body chat dipakai juga oleh endpoint ini).

---

## 1. Tujuan & konteks

PPE AI Chat adalah produk terpisah di luar repo ini. Saat penggunanya meminta sebuah dokumen
("buatkan draf akademik tentang X"), PPE AI Chat memanggil WritingHub dari sisi server mereka.
WritingHub membuat dokumen (beserta tab pertama dan share link-nya) lalu membalas URL yang
langsung bisa dibuka penerima.

Dua mode dalam satu endpoint:

- **`markdown`** — konten sudah jadi di sisi PPE AI Chat; WritingHub hanya menyimpannya sebagai
  dokumen. Tidak ada panggilan LLM, tidak ada kuota AI yang terpakai.
- **`prompt`** — instruksi bebas; WritingHub memanggil LLM (jalur kredensial yang sama dengan
  AI Chat) untuk menghasilkan draf Markdown, lalu menyimpannya.

## 2. Endpoint

```
POST /api/v1/external/documents
```

Terdaftar di `apps/api/src/routes/v1/external.route.ts`, di belakang `authMiddleware` yang sama
dengan seluruh endpoint lain — tidak ada skema auth baru.

## 3. Autentikasi

Mengikuti `AUTH_MODE` (`docs/design.md` §6):

| Mode | Perilaku |
|---|---|
| `none` (lokal) | Pemeriksaan dilewati; dokumen dibuat sebagai `local-dev`. |
| `pp` (produksi) | Wajib header klien **`pp-extended`**: `x-client: pp-extended`, `x-pp-api-key` (HMAC-SHA256 hex atas timestamp, kunci `PP_API_KEY`), `x-pp-timestamp` (milidetik, toleransi 5 menit), `Authorization: Bearer <token pengguna>`, dan `x-pp-user-id`. |

Keputusan: **tidak ada client id baru** (`ppe-ai-chat` sempat dipertimbangkan). PPE AI Chat
adalah bagian ekosistem PP dan sudah memegang `PP_API_KEY`; menambah cabang baru di middleware
berarti menyentuh penanganan auth tanpa menambah keamanan. `x-pp-user-id` wajib di mode `pp`
karena dokumen butuh pemilik — tanpanya permintaan dibalas 401 "User tidak dikenal".

Mode `prompt` tambahan memakai jalur `authorizeAndResolveProvider`
(`services/job-submission.service.ts`): bearer diverifikasi ke admin-ppe untuk resolusi provider
dan kuota, persis seperti endpoint AI lain. Bila admin-ppe tidak menyediakan provider, kredensial
cadangan `AI_BASE_URL`/`AI_API_KEY` dipakai (di mode `none`, cadangan inilah satu-satunya).

## 4. Request

```json
{
	"title": "Draf Akademik: Kopi",
	"prompt": "Buatkan draf akademik tentang dampak kopi terhadap fokus",
	"tone": "academic"
}
```

| Field | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `title` | string (1–500) | ya | Judul dokumen dan tab pertama. |
| `markdown` | string (1–100.000) | salah satu | Konten sudah jadi, langsung disimpan. |
| `prompt` | string (1–8.000) | salah satu | Instruksi bebas; server membuatkan drafnya. |
| `tone` | enum `REWRITE_TONE_IDS` (`academic`/`formal`/`casual`/`natural`) | tidak | Hanya berpengaruh di mode `prompt`; disuntik ke system prompt lewat `tonePrompt` dan menang atas preferensi tersimpan. Di mode `markdown` diterima tapi diabaikan. |

Tepat salah satu dari `markdown`/`prompt` harus ada; keduanya sekaligus atau keduanya kosong
dibalas 400.

## 5. Response sukses — `201`

```json
{
	"message": "sukses",
	"data": {
		"documentId": "3f2b…",
		"title": "Draf Akademik: Kopi",
		"token": "uQ1…",
		"url": "https://writerhub.example.com/share/uQ1…"
	}
}
```

- `url` adalah **URL absolut** ke halaman share publik — inilah tautan yang diberikan ke
  pengguna PPE AI Chat.
- Host-nya dibentuk dari env **`WEB_APP_URL`** (default `http://localhost:3000`). Env ini baru;
  alasannya: selama ini API hanya mengembalikan path relatif `/share/<token>` dan apps/web
  membentuk URL absolut di browser lewat `window.location.origin`. Klien eksternal bukan browser,
  jadi host web harus dikonfigurasi di sisi API. `WEB_APP_URL` bukan URL API — API tahu dirinya
  lewat `SERVICE_URL`.
- Share link selalu `access: "anyone"`, `role: "viewer"` — penerima cukup bisa membaca.

## 6. Error

| Status | Kapan |
|---|---|
| 400 | Validasi zod gagal: `title` kosong, `markdown`+`prompt` dua-duanya/tidak ada, `tone` di luar enum. Juga: provider admin-ppe tidak menyediakan model untuk plan pengguna. |
| 401 | Header auth hilang/salah (HMAC, timestamp basi, client tak dikenal), bearer tak sah, atau `x-pp-user-id` tidak ada di mode `pp`. |
| 403 | Kuota habis (dari `ensureToolQuota`). |
| 502 | Mode `prompt`: provider AI tidak dapat dihubungi, menolak, atau membalas tanpa isi. |
| 503 | Mode `prompt`: tidak ada kredensial provider sama sekali (admin-ppe maupun `AI_API_KEY`). |
| 500 | Kegagalan tak terduga (basis data, dsb.) — pesan generik, detail hanya di log. |

Bentuk body error mengikuti standar repo: `{ "message": string, "errors": string[] }`.

## 7. Batasan yang disengaja

1. **Share link tidak bisa dikonfigurasi per permintaan** — selalu `anyone`/`viewer`. Diperluas
   hanya bila PPE AI Chat benar-benar butuh.
2. **Dokumen selalu masuk proyek default** pemilik; tidak ada parameter `projectId`.
3. **Konversi Markdown→ProseMirror dilakukan di server** oleh
   `services/external-documents/markdown-content.ts`, subset sintaks yang sama dengan
   `markdownToHtml` milik apps/web (heading, paragraf, tebal/miring/kode/tautan, daftar, kutipan,
   garis, blok kode, tabel, matematika `$…$`). Sintaks di luar subset itu disimpan sebagai teks
   polos, tidak ditolak.
4. **Tidak ada streaming** — mode `prompt` menunggu draf selesai (timeout 90 detik) sebelum
   membalas. PPE AI Chat perlu timeout sisi mereka di atas itu.
5. **Tone di mode `markdown` diabaikan** — konten sudah jadi, tidak ada yang perlu diatur
   register-nya.

## 8. Peta implementasi

| Berkas | Peran |
|---|---|
| `apps/api/src/routes/v1/external.route.ts` | Deklarasi rute + `authMiddleware` |
| `apps/api/src/services/external-documents/service.ts` | Orkestrasi: validasi → (LLM) → dokumen+tab → share → response |
| `apps/api/src/services/external-documents/dto.ts` | Skema zod & tipe response |
| `apps/api/src/services/external-documents/completion.ts` | Satu panggilan chat-completion non-streaming (transport) |
| `apps/api/src/services/external-documents/markdown-content.ts` | Konversi murni Markdown → dokumen ProseMirror |
| `apps/api/src/repository/share.ts` | Insert share (dipakai juga `ShareService` setelah refactor kecil) |
| `apps/api/src/config/env.ts` | `WEB_APP_URL` baru |
| `apps/api/src/services/chat/service.ts` | `pickModel` kini diekspor untuk pemilihan model |

Yang diuji otomatis (`bun:test`, di sebelah kodenya): validasi DTO dan konversi Markdown.
Bagian yang menyentuh jaringan/basis data (service end-to-end) belum punya pola mocking di
`apps/api`, jadi diverifikasi manual.
