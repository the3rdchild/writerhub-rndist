import type { JSONContent } from '@tiptap/core'
import { diffWordsWithSpace } from 'diff'
import { buildTextIndex } from '@/features/document/tiptap-offsets'
import { buildSchema } from '@/features/sync/serialize'

export interface VersionDiffRange {
	offset: number
	length: number
	kind: 'added' | 'removed'
	words?: string
}

export function versionPlainText(json: JSONContent): string {
	return buildTextIndex(buildSchema().nodeFromJSON(json)).text
}

export function computeVersionDiff(versionText: string, draftText: string): VersionDiffRange[] {
	const ranges: VersionDiffRange[] = []
	let offset = 0

	for (const part of diffWordsWithSpace(versionText, draftText)) {
		if (part.added) {
			if (!part.value.trim()) continue
			const last = ranges[ranges.length - 1]
			if (last && last.kind === 'added' && last.offset === offset) {
				last.words = (last.words ?? '') + part.value
			} else {
				ranges.push({ offset, length: 0, kind: 'added', words: part.value })
			}
			continue
		}

		if (part.removed) {
			let start = 0
			for (let i = 0; i < part.value.length; i++) {
				if (part.value[i] !== '\n') continue
				if (i > start) {
					ranges.push({ offset: offset + start, length: i - start, kind: 'removed' })
				}
				start = i + 1
			}
			if (part.value.length > start) {
				ranges.push({ offset: offset + start, length: part.value.length - start, kind: 'removed' })
			}
			offset += part.value.length
			continue
		}

		offset += part.value.length
	}

	return ranges
}

export function diffVersionDocuments(version: JSONContent, draft: JSONContent): VersionDiffRange[] {
	return computeVersionDiff(versionPlainText(version), versionPlainText(draft))
}
