import { describe, expect, test } from 'bun:test'
import { nextThinkingWord, THINKING_WORDS } from './thinking-words'

describe('nextThinkingWord', () => {
	test('mengambil dari daftar', () => {
		expect(THINKING_WORDS).toContain(nextThinkingWord() as (typeof THINKING_WORDS)[number])
	})

	test('tidak mengulang kata yang sedang tampil', () => {
		for (const current of THINKING_WORDS) {
			for (const roll of [0, 0.5, 0.999]) {
				expect(nextThinkingWord(current, () => roll)).not.toBe(current)
			}
		}
	})
})
