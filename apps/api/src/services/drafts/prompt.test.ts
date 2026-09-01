import { describe, expect, test } from 'bun:test'
import { buildDraftMessages, DRAFT_SYSTEM_PROMPT, languagePrompt, tonePrompt } from './prompt'

const request = { prompt: 'Buatkan ringkasan rapat kemarin' }

function systemOf(...args: Parameters<typeof buildDraftMessages>): string {
	return buildDraftMessages(...args)[0].content
}

describe('tonePrompt', () => {
	test('memakai instruksi dari daftar tone bersama', () => {
		expect(tonePrompt('academic')).toContain('academic and scholarly')
	})

	test('kosong kalau tone tidak diminta', () => {
		expect(tonePrompt(undefined)).toBe('')
	})
})

describe('languagePrompt', () => {
	test('bahasa eksplisit disebut apa adanya', () => {
		expect(languagePrompt('Indonesian')).toContain('in Indonesian')
	})

	test('tanpa bahasa, naskah mengikuti bahasa permintaan', () => {
		expect(languagePrompt(undefined)).toContain('same language as the request')
	})
})

describe('buildDraftMessages', () => {
	test('pesan pertama system, pesan kedua permintaan penggunanya', () => {
		const messages = buildDraftMessages(request, null)

		expect(messages).toHaveLength(2)
		expect(messages[0].role).toBe('system')
		expect(messages[0].content).toContain(DRAFT_SYSTEM_PROMPT)
		expect(messages[1]).toEqual({ role: 'user', content: 'Buatkan ringkasan rapat kemarin' })
	})

	test('tone permintaan ikut masuk ke prompt system', () => {
		expect(systemOf({ ...request, tone: 'casual' }, null)).toContain('casual and conversational')
	})

	test('memori gaya pengguna ikut terbawa', () => {
		expect(systemOf(request, { glossary: ['WritingHub'] })).toContain('WritingHub')
	})

	test('bagian yang kosong tidak meninggalkan paragraf hampa', () => {
		expect(systemOf(request, null)).not.toContain('\n\n\n')
	})
})
