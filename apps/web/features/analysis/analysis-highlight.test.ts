import { describe, expect, test } from 'bun:test'
import { aiScoreLevel } from './analysis-highlight'

describe('aiScoreLevel', () => {
	test('skor rendah mendapat sorotan kuning lembut', () => {
		expect(aiScoreLevel(0)).toBe('ai-low')
		expect(aiScoreLevel(39)).toBe('ai-low')
	})

	test('skor menengah mendapat sorotan oranye', () => {
		expect(aiScoreLevel(40)).toBe('ai-medium')
		expect(aiScoreLevel(70)).toBe('ai-medium')
	})

	test('skor tinggi mendapat sorotan merah', () => {
		expect(aiScoreLevel(71)).toBe('ai-high')
		expect(aiScoreLevel(100)).toBe('ai-high')
	})

	test('skor yang diturunkan setelah accept turun tingkatnya', () => {
		// acceptedScore di panel membulatkan score * 0.25, minimal 5.
		expect(aiScoreLevel(Math.max(5, Math.round(90 * 0.25)))).toBe('ai-low')
	})
})
