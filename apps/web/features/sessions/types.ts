/**
 * Tipe bersama untuk lapisan sesi.
 *
 * Berdiri sendiri tanpa impor apa pun supaya `ydoc.ts` dan `session-context`
 * bisa memakainya tanpa saling menunjuk - keduanya butuh bentuk komentar yang
 * sama, dan lingkaran impor di antara keduanya akan tumbuh diam-diam.
 */

export interface CommentReply {
	author: string
	/**
	 * Penulis sebagai identitas, bukan sekadar nama tampilan.
	 *
	 * Nama bisa diganti kapan saja di Pengaturan, jadi ia tidak layak jadi kunci:
	 * begitu mode kolaborasi datang, "balasan siapa" harus tetap terjawab benar
	 * untuk balasan yang ditulis sebelum pemiliknya berganti nama. Opsional
	 * karena balasan lama lahir sebelum field ini ada.
	 */
	authorId?: string
	text: string
	at: number
}

/**
 * Usulan perubahan atas teks yang dikomentari.
 *
 * Satu per utas, bukan daftar: usulan yang bertumpuk pada rentang yang sama
 * harus dijawab berurutan supaya "teks lama" pada usulan kedua bukan kalimat
 * yang sudah tidak ada lagi. Mengusulkan lagi berarti mengganti usulan
 * sebelumnya, dan itu keputusan yang sadar - bukan antrean yang diam-diam
 * tumbuh.
 */
export interface CommentSuggestion {
	/** Teks pengganti yang diusulkan. */
	text: string
	author: string
	authorId?: string
	at: number
	/** Kosong selama usulannya belum dijawab. */
	status?: 'accepted' | 'rejected'
	decidedAt?: number
	/** Teks yang benar-benar tergantikan; dicatat pada saat diterima. */
	replaced?: string
}

/** Satu utas komentar; jangkarnya adalah mark bernama sama di dalam naskah. */
export interface CommentThread {
	id: string
	/** Kutipan teks saat komentar dibuat - dipakai kalau mark-nya hilang. */
	quote: string
	/** Pembuka utas. Opsional: utas lama lahir sebelum penulis dicatat. */
	author?: string
	authorId?: string
	replies: CommentReply[]
	/** Usulan perubahan yang sedang atau pernah menempel pada utas ini. */
	suggestion?: CommentSuggestion
	resolved: boolean
	createdAt: number
}
