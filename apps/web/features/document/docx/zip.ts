import { unzipSync } from 'fflate'

export interface DocxArchive {
	bytes: (path: string) => Uint8Array | null
	text: (path: string) => string | null
	paths: () => string[]
}

export function openDocx(data: Uint8Array): DocxArchive {
	let entries: Record<string, Uint8Array>
	try {
		entries = unzipSync(data)
	} catch (cause) {
		throw new Error('Berkas ini bukan DOCX yang sah - isinya tidak bisa dibuka', { cause })
	}

	const decoder = new TextDecoder('utf-8')

	return {
		bytes: (path) => entries[path] ?? null,
		text: (path) => {
			const found = entries[path]
			return found ? decoder.decode(found) : null
		},
		paths: () => Object.keys(entries),
	}
}

export function resolvePath(base: string, target: string): string {
	if (target.startsWith('/')) return target.slice(1)

	const directory = base.includes('/') ? base.slice(0, base.lastIndexOf('/')) : ''
	const segments = directory ? directory.split('/') : []

	for (const segment of target.split('/')) {
		if (segment === '.' || segment === '') continue
		if (segment === '..') segments.pop()
		else segments.push(segment)
	}
	return segments.join('/')
}
