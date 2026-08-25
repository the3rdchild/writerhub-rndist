const DAY_MS = 24 * 60 * 60_000
export function groupOf(createdAt: number): string {
	const now = new Date()
	const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
	if (createdAt >= startOfToday) return 'Hari ini'
	if (createdAt >= startOfToday - DAY_MS) return 'Kemarin'
	if (createdAt >= startOfToday - 7 * DAY_MS) return '7 hari terakhir'
	return 'Lebih lama'
}
export const GROUP_ORDER = ['Hari ini', 'Kemarin', '7 hari terakhir', 'Lebih lama']
