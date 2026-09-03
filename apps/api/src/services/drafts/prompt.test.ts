import { describe, expect, test } from 'bun:test'
import {
	buildDraftMessages,
	DRAFT_FLYER_PROMPT,
	DRAFT_SYSTEM_PROMPT,
	languagePrompt,
	tonePrompt,
} from './prompt'

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

describe('bentuk naskah yang diminta', () => {
	/*
	 * Keluhan yang melahirkan ini: permintaan "buatkan flyer" lewat API draf
	 * selalu keluar sebagai dokumen berjudul dan berparagraf, karena
	 * satu-satunya bentuk yang dikenal jalur ini adalah dokumen. Pemanggil
	 * eksternal sering hanya meneruskan kalimat penggunanya, jadi bawaannya
	 * harus membiarkan model memilih.
	 */
	test('bawaan menawarkan rancangan sebagai pengecualian', () => {
		const system = systemOf({ prompt: 'Buatkan flyer aksi' }, null)

		expect(system).toContain(DRAFT_SYSTEM_PROMPT)
		expect(system).toContain('EXCEPTION')
		expect(system).toContain('flyer, poster, pamphlet')
	})

	test('kind flyer hanya berisi aturan rancangan', () => {
		const system = systemOf({ prompt: 'Buatkan flyer aksi', kind: 'flyer' }, null)

		expect(system).toContain(DRAFT_FLYER_PROMPT)
		expect(system).not.toContain(DRAFT_SYSTEM_PROMPT)
	})

	test('kind document menutup pintu keluarnya', () => {
		const system = systemOf({ prompt: 'Buatkan flyer aksi', kind: 'document' }, null)

		expect(system).toContain(DRAFT_SYSTEM_PROMPT)
		expect(system).not.toContain('EXCEPTION')
	})

	/*
	 * Template sudah menyatakan bentuknya sendiri lewat kerangka dan aturannya.
	 * Menawarkan rancangan di atasnya berarti dua perintah yang bertentangan,
	 * dan yang dikorbankan adalah kerangka yang justru dipilih pemanggil.
	 */
	test('template menutupnya juga', () => {
		const system = systemOf({ prompt: 'Buatkan flyer aksi' }, null, ['Ini flyer A4.'])

		expect(system).toContain('Ini flyer A4.')
		expect(system).not.toContain('EXCEPTION')
	})

	test('rancangan tidak membawa aturan prosa', () => {
		const system = systemOf({ prompt: 'Buatkan flyer', kind: 'flyer', words: 800, tone: 'formal' }, null)

		expect(system).not.toContain('800 words')
		expect(system).toContain('inline <svg>')
	})
})
