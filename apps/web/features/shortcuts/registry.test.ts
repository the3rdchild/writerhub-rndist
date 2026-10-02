import { describe, expect, test } from 'bun:test'
import { formatKeys, matchAppShortcut, splitKeys } from './registry'

function keydown(init: KeyboardEventInit & { code: string }): KeyboardEvent {
	return { key: '', altKey: false, shiftKey: false, ctrlKey: false, metaKey: false, ...init } as KeyboardEvent
}

describe('pintasan dengan tombol minus (TKS-15)', () => {
	test('"Mod--" terbelah menjadi Mod + "-"', () => {
		expect(splitKeys('Mod--')).toEqual({ modifiers: ['Mod'], key: '-' })
		expect(splitKeys('Mod-Shift-k')).toEqual({ modifiers: ['Mod', 'Shift'], key: 'k' })
		expect(splitKeys('-')).toEqual({ modifiers: [], key: '-' })
	})

	test('label menulis Ctrl+- dan ⌘-, bukan Ctrl++', () => {
		expect(formatKeys('Mod--', false)).toBe('Ctrl+-')
		expect(formatKeys('Mod--', true)).toContain('⌘')
		expect(formatKeys('Mod--', true).endsWith('-')).toBe(true)
	})

	test('Ctrl+- dikenali sebagai Perkecil', () => {
		const matched = matchAppShortcut(keydown({ code: 'Minus', ctrlKey: true }), false)
		expect(matched?.id).toBe('view.zoomOut')
	})
})
