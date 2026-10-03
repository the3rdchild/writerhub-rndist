import { describe, expect, test } from 'bun:test'
import type { JSONContent } from '@tiptap/core'
import { buildSchema } from '@/features/sync/serialize'
import {
	defaultBulletStyle,
	defaultNumberingType,
	orderedListAt,
	previousOrderedList,
} from './list-numbering'

const item = (text: string): JSONContent => ({
	type: 'listItem',
	content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})
const ordered = (start: number, ...texts: string[]): JSONContent => ({
	type: 'orderedList',
	attrs: { start },
	content: texts.map(item),
})

function docOf(...content: JSONContent[]) {
	return buildSchema().nodeFromJSON({ type: 'doc', content })
}

function posOf(doc: ReturnType<typeof docOf>, text: string): number {
	let at = -1
	doc.descendants((node, pos) => {
		if (at < 0 && node.isText && node.text === text) at = pos + 1
	})
	return at
}

describe('penomoran bawaan per tingkat', () => {
	test('1. → a. → i. → 1. dan ● → ○ → ■ → ●', () => {
		expect([0, 1, 2, 3].map(defaultNumberingType)).toEqual(['1', 'a', 'i', '1'])
		expect([0, 1, 2, 3].map(defaultBulletStyle)).toEqual(['disc', 'circle', 'square', 'disc'])
	})
})

describe('daftar di kursor', () => {
	test('orderedListAt menemukan daftar terdalam', () => {
		const doc = docOf(ordered(4, 'Satu', 'Dua'))
		const list = orderedListAt(doc.resolve(posOf(doc, 'Dua')))
		expect(list?.node.attrs.start).toBe(4)
		expect(list?.pos).toBe(0)
		expect(orderedListAt(docOf({ type: 'paragraph' }).resolve(1))).toBeNull()
	})

	test('previousOrderedList melewati paragraf sela dan memilih yang terdekat', () => {
		const doc = docOf(
			ordered(1, 'A'),
			ordered(5, 'B', 'C'),
			{ type: 'paragraph', content: [{ type: 'text', text: 'sela' }] },
			ordered(1, 'D'),
		)
		const list = orderedListAt(doc.resolve(posOf(doc, 'D')))
		const previous = list ? previousOrderedList(doc, list) : null
		expect(previous?.node.attrs.start).toBe(5)
		expect(previous?.node.childCount).toBe(2)
		const first = orderedListAt(doc.resolve(posOf(doc, 'A')))
		expect(first ? previousOrderedList(doc, first) : 'x').toBeNull()
	})
})
