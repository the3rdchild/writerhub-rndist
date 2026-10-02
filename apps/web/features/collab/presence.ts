/**
 * Identitas kolaborator di awareness (kursor dan daftar orang yang hadir).
 * Warna diturunkan dari id (dan kunci sesi, bila ada) supaya stabil tanpa
 * harus disimpan di mana pun.
 */

/** Cukup kontras untuk kursor dan label di atas latar putih maupun gelap. */
export const PRESENCE_COLORS = [
	'#d1453b',
	'#1f7a5a',
	'#2f6fde',
	'#a24bd1',
	'#c26a00',
	'#0f8a9d',
	'#b8336a',
	'#5b6c00',
] as const

function hash(text: string): number {
	let value = 2166136261
	for (let index = 0; index < text.length; index += 1) {
		value ^= text.charCodeAt(index)
		value = Math.imul(value, 16777619)
	}
	return value >>> 0
}

export function presenceColor(id: string): string {
	return PRESENCE_COLORS[hash(id) % PRESENCE_COLORS.length]
}

export interface PresenceUser {
	name: string
	color: string
}

/**
 * `sessionKey` membedakan dua tab peramban milik orang yang sama: tanpa itu
 * keduanya tampil dengan nama DAN warna yang sama, dan kursor siapa yang mana
 * tidak bisa dibedakan.
 */
export function presenceUser(user: { id: string; name: string }, sessionKey = ''): PresenceUser {
	return { name: user.name.trim() || 'Guest', color: presenceColor(`${user.id}:${sessionKey}`) }
}
