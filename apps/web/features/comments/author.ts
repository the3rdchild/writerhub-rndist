'use client'

/**
 * Identitas penulis komentar.
 *
 * Belum ada akun di aplikasi ini, jadi identitasnya lahir di peramban: satu id
 * acak yang bertahan di localStorage. Nama tampilan diambil dari Pengaturan dan
 * dicatat sebagai salinan pada tiap komentar - kalau nanti pemiliknya berganti
 * nama, komentar lama tetap terbaca seperti saat ditulis, sementara `authorId`
 * yang tetap itulah yang menyatukannya jadi satu orang.
 *
 * Begitu akun sungguhan datang, id lokal ini tinggal dipetakan sekali ke id
 * akun - bentuk datanya tidak perlu berubah lagi.
 */

const AUTHOR_ID_KEY = 'writer-hub-author-id'

/** Warna avatar; dipilih dari id supaya orang yang sama selalu berwarna sama. */
const AVATAR_COLORS = [
	'#e11d48',
	'#ea580c',
	'#ca8a04',
	'#16a34a',
	'#0891b2',
	'#2563eb',
	'#7c3aed',
	'#db2777',
] as const

function randomId(): string {
	if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
	return `u_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

/**
 * Id penulis di peramban ini, dibuat sekali lalu dipakai seterusnya.
 *
 * Mode privat dan kuota penuh tidak dianggap kegagalan: pengguna tetap dapat
 * id yang sah untuk sesi ini, hanya tidak bertahan sampai kunjungan berikutnya.
 */
export function localAuthorId(): string {
	if (typeof window === 'undefined') return 'anonymous'

	try {
		const stored = window.localStorage.getItem(AUTHOR_ID_KEY)
		if (stored) return stored

		const created = randomId()
		window.localStorage.setItem(AUTHOR_ID_KEY, created)
		return created
	} catch {
		return randomId()
	}
}

/** Satu atau dua huruf awal nama, untuk avatar bundar. */
export function authorInitials(name: string): string {
	const words = name.trim().split(/\s+/).filter(Boolean)
	if (words.length === 0) return '?'
	if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
	return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

/** Warna avatar untuk sebuah identitas; nama dipakai kalau id belum ada. */
export function authorColor(key: string): string {
	let hash = 0
	for (let index = 0; index < key.length; index += 1) {
		hash = (hash * 31 + key.charCodeAt(index)) >>> 0
	}
	return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}
