const DAY_MS = 24 * 60 * 60_000

export function groupOf(createdAt: number): string {
	const now = new Date()
	const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
	if (createdAt >= startOfToday) return 'Today'
	if (createdAt >= startOfToday - DAY_MS) return 'Kemarin'
	if (createdAt >= startOfToday - 7 * DAY_MS) return 'Last 7 days'
	return 'Older'
}

export const GROUP_ORDER = ['Today', 'Kemarin', 'Last 7 days', 'Older']
