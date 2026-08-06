/**
 * Tipe bersama untuk lapisan sesi.
 *
 * Berdiri sendiri tanpa impor apa pun supaya `ydoc.ts` dan `session-context`
 * bisa memakainya tanpa saling menunjuk - keduanya butuh bentuk komentar yang
 * sama, dan lingkaran impor di antara keduanya akan tumbuh diam-diam.
 */

export interface CommentReply {
	author: string
	text: string
	at: number
}

/** Satu utas komentar; jangkarnya adalah mark bernama sama di dalam naskah. */
export interface CommentThread {
	id: string
	/** Kutipan teks saat komentar dibuat - dipakai kalau mark-nya hilang. */
	quote: string
	replies: CommentReply[]
	resolved: boolean
	createdAt: number
}
