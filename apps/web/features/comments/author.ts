'use client'
const AUTHOR_ID_KEY = 'writer-hub-author-id'
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
export function authorInitials(name: string): string {
	const words = name.trim().split(/\s+/).filter(Boolean)
	if (words.length === 0) return '?'
	if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
	return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}
export function authorColor(key: string): string {
	let hash = 0
	for (let index = 0; index < key.length; index += 1) {
		hash = (hash * 31 + key.charCodeAt(index)) >>> 0
	}
	return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}
