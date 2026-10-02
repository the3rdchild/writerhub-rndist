/**
 * Asal transaksi cermin tab kolaboratif di Y.Doc besar (`mirror.ts`).
 * Terpisah supaya penyimpan cloud lama bisa mengenalinya tanpa ikut memuat
 * mesin cermin. Isi tab kolaboratif sudah sampai ke server lewat websocket,
 * jadi tulisan cermin tidak boleh memicu PUT naskah.
 */
export const COLLAB_MIRROR_ORIGIN = 'collab-mirror'
