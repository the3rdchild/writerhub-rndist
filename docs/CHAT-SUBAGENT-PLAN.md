# Rencana Implementasi — Sub-agent di AI Chat

Status: **rancangan, belum dikerjakan** · Disusun 10 September 2026 · Baseline kode
`72c495f` (branch `feat/agent-skills`)

Prasyarat: `docs/CHAT-TRANSCRIPT-PLAN.md` T2 (§4 di bawah menjelaskan kenapa).
Pemakai pertama: `docs/DIAGRAM-DESIGN-PLAN.md`.

---

## 1. Masalah yang dipecahkan

Sebagian pekerjaan yang diminta penulis bersifat **produksi**, bukan percakapan:
menggambar diagram, menyusun rancangan, menghasilkan berkas. Pekerjaan seperti itu
menghasilkan keluaran panjang dan mekanis — ratusan baris SVG, misalnya — dan
model utama membayarnya tiga kali:

1. Ia mengerjakannya sambil memikul seluruh dokumen dan seluruh katalog alat.
2. Keluarannya masuk ke konteks percakapan.
3. **Dan konteks itu dibayar lagi di setiap giliran sesudahnya.** Penulis yang
   menyisipkan tiga diagram lalu bertanya hal sepele akan menunggu lama untuk
   jawaban satu kalimat, tanpa tahu kenapa.

Butir ketiga yang terbesar dan paling sering diabaikan. Alasan menjual sub-agent
bukan "render lebih cepat" — satu diagram tetap butuh waktu yang kurang lebih
sama — melainkan **percakapan tidak melambat**.

---

## 2. Keputusan yang sudah dikonfirmasi

1. **Dua langkah, bukan satu.** Model utama menyusun spesifikasi; sub-agent
   mengerjakannya.
2. **Keluaran besar tidak pernah melewati konteks utama.** Sub-agent membalas
   **dua hal berbeda**: hasil ke klien, tanda terima pendek ke model.
3. **Sub-agent tidak melihat dokumen.** Model utama yang merangkumnya jadi spec.
4. **Kegagalan meninggalkan bekas yang terlihat**, bukan diam.
5. **Revisi tidak dilempar ke model utama secara baku** — ada tool kedua untuk
   itu (§5).
6. Model sub-agent **boleh** berbeda, tapi dimulai sama dengan chat lalu
   diturunkan setelah kualitasnya terlihat.

---

## 3. Tempatnya sudah ada

`apps/web/features/chat/remote-tools.ts` adalah peta alat yang dijalankan
**server**, bukan browser:

```ts
const ENDPOINT: Record<string, string> = {
  web_search: '/api/research/search',
  fetch_url: '/api/research/extract',
  read_skill: '/api/skills/read',
}
```

Menambah `draw_diagram → /api/diagrams/draw` adalah satu baris di peta itu, plus
satu service di `apps/api` yang memanggil provider dengan system prompt sempit:
skill yang relevan + spec, tanpa dokumen, tanpa katalog alat editor.

Presedennya matang di `/drafts`: `apps/api/src/services/drafts/runner.ts`
menjalankan generasi di luar siklus HTTP dengan progress sendiri, dan
`design-repair.ts` menambal keluaran model secara deterministik sebelum disimpan.
Pola "model kedua yang sempit + tambalan deterministik" bukan hal baru di repo ini.

### 3.1 Jebakan yang membatalkan seluruh manfaatnya

`RemoteToolResult.text` **masuk ke konteks model utama**. Kalau hasil sub-agent
dikembalikan lewat jalur itu, penghematan yang jadi alasan seluruh rancangan ini
hilang — ia cuma pindah tempat.

Yang benar: endpoint mengembalikan **dua** hal.

| Ke | Isi |
|---|---|
| Klien | Hasil utuh (mis. SVG), disisipkan langsung ke editor |
| Model | Tanda terima pendek: apa yang dibuat, ukurannya, judul dan deskripsi yang benar-benar digambar |

Klien sudah memegang respons mentah sebelum teks itu diberikan ke model, jadi ini
bisa dilakukan tanpa mengubah kontrak SSE.

### 3.2 Kategori alat yang baru

Semua alat di `remote-tools.ts` hari ini berjenis `read`: mengembalikan teks,
tidak menyentuh editor. Yang ini **hibrida** — panggilan server + penyisipan
lokal. Itu kategori baru, bukan sekadar entri baru di peta, dan `runRemoteReadTool`
perlu jalur terpisah untuknya.

---

## 4. Kenapa T2 transkrip adalah prasyarat

Transkrip kronologis murni rusak begitu ada pekerjaan paralel: sub-agent selesai
belakangan, jadi barisnya akan muncul di bawah teks yang ditulis setelah ia
dimulai — urutan yang salah.

Karena itu `TurnPart` tidak boleh sekadar "append". Yang dibutuhkan: **baris
disisipkan saat pekerjaan dimulai, diperbarui di tempat saat selesai.** Chat
VS Code tidak punya masalah ini karena alurnya sekuensial; begitu ada sub-agent,
kita punya.

Kalau sub-agent mendarat lebih dulu, ia **memperburuk** persis keluhan yang T2
perbaiki.

---

## 5. Revisi — kenapa tidak dilempar ke model utama

"Ubah warna node itu jadi biru" adalah momen **paling mungkin** keluaran besar
masuk ke konteks utama: model utama harus membaca 400 baris SVG untuk mengganti
satu atribut, dan sejak itu setiap giliran membawanya.

Karena itu tool kedua, `redraw_diagram`: klien mengirim hasil lama + instruksi
perubahan ke server, sub-agent merevisi, konteks utama cuma menerima tanda terima.
Model utama tetap yang memutuskan dan yang bicara ke penulis; ia hanya tidak
pernah memegang keluarannya.

Lemparan ke model utama tetap ada, sebagai **jalur terakhir**: kalau penulis sudah
menyunting hasilnya sendiri, atau sub-agent gagal dua kali.

---

## 6. Risiko yang harus dijawab implementasinya

**Sub-agent buta terhadap dokumen.** Spec dari model utama adalah satu-satunya
sumber. Kalau spec-nya miskin, hasilnya salah — dan model utama tidak akan pernah
tahu, karena ia tidak melihat hasilnya. Itu sebabnya tanda terima wajib memuat
judul dan deskripsi yang **benar-benar** dihasilkan sub-agent, bukan sekadar
"berhasil".

**Gagal diam.** Sub-agent yang gagal sesudah model utama selesai bicara tidak
punya siapa-siapa untuk melapor. Statusnya harus tampil di UI, bukan hanya di
konteks percakapan. Baris yang bisa diperbarui (§4) adalah tempatnya.

**Sanitasi di server.** Karena keluaran lahir di server untuk semua jalur, penjaga
dipasang satu kali di sana, sebelum apa pun dikirim ke klien.

---

## 7. Generalisasi

Slotnya menggeneralisasi — satu entri di `ENDPOINT` plus satu service per
sub-agent (dokumen, math, rancangan, kode). Yang murah adalah mekanismenya.

Yang mahal, dan **harus diulang utuh** untuk tiap sub-agent: kontrak spec-nya
sendiri, jalur kegagalannya sendiri, dan tanda terima yang cukup informatif
supaya model utama bisa mengoreksi tanpa melihat hasilnya.

Karena itu: buktikan dengan satu sub-agent lebih dulu — diagram — sampai ke
kertas, baru tambah yang lain.

---

## 8. Yang belum diputuskan

- Model untuk sub-agent (`pickModel` / `env.AI_MODEL`). Mulai sama dengan chat;
  turunkan setelah kualitasnya terlihat.
- Apakah pekerjaan sub-agent perlu progress bertahap seperti `/drafts`, atau
  cukup satu baris "sedang menggambar" sampai selesai.
- Batas waktu dan perilaku saat penulis mengirim pesan baru sementara sub-agent
  masih berjalan.
