const DAY_MS = 24 * 60 * 60_000

/**
 * Kelompok waktu ala Google Docs: Hari ini / Kemarin / 7 hari terakhir /
 * Lebih lama. Dipakai bersama oleh riwayat versi (fitur I) dan Aktivitas AI
 * (fitur F) - diangkat ke sini supaya tidak diduplikasi.
 */
export function groupOf(createdAt: number): string {
	const now = new Date()
	const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
	if (createdAt >= startOfToday) return 'Hari ini'
	if (createdAt >= startOfToday - DAY_MS) return 'Kemarin'
	if (createdAt >= startOfToday - 7 * DAY_MS) return '7 hari terakhir'
	return 'Lebih lama'
}

/** Urutan tampil kelompok, terbaru di atas. */
export const GROUP_ORDER = ['Hari ini', 'Kemarin', '7 hari terakhir', 'Lebih lama']
