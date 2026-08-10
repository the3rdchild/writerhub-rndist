/**
 * Penyelarasan judul dokumen antara Y.Doc lokal dan baris server.
 *
 * Dipisah jadi fungsi murni karena inilah bagian yang paling mudah rusak tanpa
 * ketahuan: keliru menilai siapa yang berubah hanya terlihat sebagai "nama
 * dokumen punya hidup sendiri di tiap halaman", bukan sebagai galat.
 */

export interface TitleSide {
	title: string
	/**
	 * Kapan judulnya terakhir diubah. Lokal dari `DocMeta.titleUpdatedAt`,
	 * server dari `updatedAt` barisnya.
	 *
	 * PENTING: jangan pernah mengisi ini dengan waktu sunting dokumen.
	 * `DocMeta.updatedAt` naik pada tiap ketukan lewat `touchTab`, jadi
	 * memakainya membuat sisi yang sedang diketik hampir selalu menang dan
	 * rename dari halaman lain tidak pernah teradopsi.
	 */
	titleUpdatedAt: number
}

export type TitleResolution = 'adopt-server' | 'push-local' | 'none'

/**
 * Siapa yang menang antara judul lokal dan judul server.
 *
 * Perbandingannya tiga arah, memakai `base` - judul saat keduanya terakhir
 * tersinkron (`SyncLinkage.lastDocTitle`) - sebagai leluhur bersama. Dengan
 * leluhur itu, "siapa yang berubah" bisa dijawab pasti, tanpa menebak lewat
 * stempel waktu:
 *
 * - hanya server yang bergeser dari base → adopsi judul server;
 * - hanya lokal yang bergeser → kirim judul lokal;
 * - keduanya bergeser → bentrok sungguhan, barulah stempel waktu rename
 *   dipakai, dan seri dimenangkan lokal karena itu yang sedang dilihat.
 *
 * `base` boleh `undefined` untuk dokumen yang belum pernah tersinkron; saat itu
 * tidak ada leluhur, jadi keduanya dianggap bergeser.
 */
export function resolveTitle(
	local: TitleSide,
	server: TitleSide,
	base: string | undefined,
): TitleResolution {
	if (local.title === server.title) return 'none'

	const localMoved = base === undefined || local.title !== base
	const serverMoved = base === undefined || server.title !== base

	if (serverMoved && !localMoved) return 'adopt-server'
	if (localMoved && !serverMoved) return 'push-local'

	return server.titleUpdatedAt > local.titleUpdatedAt ? 'adopt-server' : 'push-local'
}
