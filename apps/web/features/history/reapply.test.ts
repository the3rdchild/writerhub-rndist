import { describe, expect, test } from 'bun:test'
import { canOpenInPanel, canReapply, panelForFeature } from './reapply'

describe('kelayakan entri aktivitas', () => {
	test('riset web tidak punya panel', () => {
		expect(canOpenInPanel('research')).toBe(false)
	})

	test('entri tanpa fitur tidak punya panel', () => {
		expect(canOpenInPanel(null)).toBe(false)
	})

	test('modul AI tetap punya panel', () => {
		expect(canOpenInPanel('grammar')).toBe(true)
		expect(canOpenInPanel('ai_detector')).toBe(true)
		expect(canOpenInPanel('humanizer')).toBe(true)
	})

	test('riset web tidak bisa diterapkan ulang', () => {
		expect(canReapply('research')).toBe(false)
	})

	test('proofreader punya nama panel sendiri', () => {
		expect(panelForFeature('grammar')).toBe('proofreader')
		expect(panelForFeature('plagiarism')).toBe('plagiarism')
	})
})
