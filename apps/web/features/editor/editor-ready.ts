/**
 * Penanda "aman disentuh" untuk aplikasi editor.
 *
 * Saudara kandung `data-export-ready` yang sudah dipakai worker render: sama-sama
 * dipasang di `<body>` supaya penunggunya cukup mengenal satu pemilih sederhana,
 * tanpa perlu tahu struktur halaman ini sama sekali.
 *
 * Perlunya nyata, bukan kenyamanan uji. Input impor ikut terkirim di HTML SSR,
 * jadi ia sudah ada sejak byte pertama — jauh sebelum React memasang
 * penangannya. Otomasi yang menunggu "elemennya muncul" akan memasang berkas
 * lebih cepat daripada aplikasinya siap mendengar, event `change`-nya hilang
 * tanpa jejak, dan gagalnya diam-diam: tidak ada galat, hanya tidak terjadi
 * apa-apa. Penanda ini memberi sinyal yang jujur untuk ditunggu.
 */
export const EDITOR_READY_ATTRIBUTE = 'data-editor-ready'
