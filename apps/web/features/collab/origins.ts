/**
 * Asal transaksi cermin tab kolaboratif di Y.Doc besar (`mirror.ts`).
 * Terpisah supaya penyimpan cloud lama bisa mengenalinya tanpa ikut memuat
 * mesin cermin. Isi tab kolaboratif sudah sampai ke server lewat websocket,
 * jadi tulisan cermin tidak boleh memicu PUT naskah.
 */
export const COLLAB_MIRROR_ORIGIN = 'collab-mirror'

/**
 * Asal transaksi di Y.Doc SESI saat suntingan salinan lokal tab baru dibawa ke
 * sesinya (`CollabProvider`). Bukan cermin: pembaruan ini harus terkirim ke
 * room seperti suntingan biasa.
 */
export const COLLAB_CARRY_ORIGIN = 'collab-carry'
