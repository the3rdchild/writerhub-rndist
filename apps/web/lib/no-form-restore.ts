/**
 * Firefox memulihkan state kontrol form saat MUAT ULANG, sebelum satu baris skrip
 * pun jalan: kontrol yang tadinya dinonaktifkan lalu dinyalakan skrip akan datang
 * kembali dalam keadaan menyala, walau HTML dari server menuliskan `disabled`.
 *
 * Di sini akibatnya nyata. Tombol bilah alat lahir `disabled` (editornya belum
 * ada) dan React mencopotnya begitu editor hidup; sesudah muat ulang, DOM-nya
 * sudah menyala duluan sementara React masih menghidrasi versi yang nonaktif —
 * React melaporkannya sebagai ketidakcocokan hidrasi dan, seperti bunyi pesannya,
 * TIDAK menambalnya: sesaat tombol-tombol itu terlihat redup tapi sebenarnya
 * bisa diklik, sampai render berikutnya membetulkannya.
 *
 * `autocomplete="off"` mematikan pemulihan itu per kontrol. Diukur langsung di
 * Firefox 153 (profil bersih, tanpa ekstensi) dengan halaman uji berisi empat
 * kontrol; sesudah muat ulang, keadaan saat parse: tombol polos `false`
 * (dipulihkan menyala), tombol ber-`autocomplete="off"` `true` (utuh), `input`
 * polos `false`, dan kontrol yang tidak pernah disentuh skrip `true` — jadi
 * pemulihannya memang hanya mengenai kontrol yang state-nya sempat berubah.
 * Chromium tidak pernah melakukan ini; atributnya diabaikan di sana.
 *
 * Disebar sebagai objek, bukan ditulis sebagai atribut langsung: `autoComplete`
 * bukan bagian dari `ButtonHTMLAttributes` di tipe React (HTML membakukannya
 * untuk input/select/textarea/form saja), sementara DOM-nya tetap menuliskannya.
 */
export const NO_FORM_RESTORE = { autoComplete: 'off' } as const
