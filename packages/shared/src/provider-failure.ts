/**
 * Sebab kegagalan panggilan ke provider AI, dalam bentuk yang bisa diperiksa
 * program - pemanggil tidak perlu mencocokkan kalimat galat untuk memutuskan
 * apakah sesuatu layak dicoba lagi.
 *
 * Kosakata ini lahir di jalur penulisan draf, lalu ternyata dibutuhkan chat
 * juga. Ia tinggal di sini karena isinya pengetahuan tentang **provider**,
 * bukan tentang draf: `DraftErrorCode` memperluasnya dengan sebab yang memang
 * hanya ada di sana, dan chat memakainya apa adanya.
 */
export type ProviderErrorCode =
	/** Provider AI tidak bisa dihubungi sama sekali (DNS, jaringan, koneksi ditolak). */
	| 'provider_unreachable'
	/** Provider membalas galat: kunci ditolak, model tidak dikenal, permintaan ditolak. */
	| 'provider_rejected'
	/** Kuota atau rate limit provider habis - layak dicoba lagi nanti. */
	| 'quota_exceeded'
	/** Melewati batas waktu, atau prosesnya berhenti di tengah jalan. */
	| 'timeout'
	| 'unknown'

/**
 * Sebab yang biasanya hilang sendiri kalau dicoba lagi sebentar kemudian.
 *
 * Kredensial yang ditolak tidak termasuk: mengulangnya tidak pernah berhasil
 * dan hanya menunda kabar buruknya. Kuota habis juga tidak - ia memang layak
 * dicoba **nanti**, tapi bukan dalam hitungan detik.
 */
const TRANSIENT: readonly ProviderErrorCode[] = ['timeout', 'provider_unreachable']

export function isTransientProviderError(code: ProviderErrorCode): boolean {
	return TRANSIENT.includes(code)
}

/** Pola galat jaringan yang muncul sebelum permintaan sempat dijawab. */
const UNREACHABLE = /fetch failed|unable to connect|econnrefused|enotfound|eai_again|network|dns/i

/**
 * Kode status HTTP dari provider menjadi sebab.
 */
export function providerCodeFromStatus(status: number): ProviderErrorCode {
	if (status === 429) return 'quota_exceeded'
	return 'provider_rejected'
}

/**
 * Galat apa pun menjadi sebab.
 *
 * `TimeoutError` dan `AbortError` sengaja diperiksa lewat `name`, bukan lewat
 * pesannya: keduanya datang sebagai `DOMException` yang pesannya ditentukan
 * runtime - "The operation timed out." dari Bun adalah kalimat yang sempat
 * bocor sampai ke layar pengguna karena tidak ada yang menerjemahkannya.
 */
export function classifyProviderError(error: unknown): ProviderErrorCode {
	if (!(error instanceof Error)) return 'unknown'

	if (error.name === 'TimeoutError' || error.name === 'AbortError') return 'timeout'
	if (UNREACHABLE.test(error.message) || UNREACHABLE.test(String(error.cause ?? ''))) {
		return 'provider_unreachable'
	}
	return 'unknown'
}
