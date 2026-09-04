import { describe, expect, test } from 'bun:test'
import type { StyleMemory } from '@writer-hub/shared'
import {
	buildSystemPrompt,
	memoryPrompt,
	NARRATIVE_GUIDANCE,
	RESEARCH_GUIDANCE,
	RESEARCH_OFF_NOTICE,
	SYSTEM_PROMPT,
	TASK_BOUNDARY_GUIDANCE,
	TOOL_GUIDANCE,
} from './prompts'

const dasar = { withTools: true, research: false, memory: null } as const

describe('perangkaian prompt sistem', () => {
	test('selalu dibuka instruksi dasar dan ditutup batas tugas', () => {
		const prompt = buildSystemPrompt(dasar)

		expect(prompt.startsWith(SYSTEM_PROMPT)).toBe(true)
		expect(prompt.endsWith(TASK_BOUNDARY_GUIDANCE)).toBe(true)
	})

	test('panduan tool hanya ikut saat tool aktif', () => {
		expect(buildSystemPrompt({ ...dasar, withTools: true })).toContain(TOOL_GUIDANCE)
		expect(buildSystemPrompt({ ...dasar, withTools: false })).not.toContain(TOOL_GUIDANCE)
	})

	test('panduan naratif ikut bersama panduan tool', () => {
		// Ia menjelaskan alat editor - tanpa alat, tidak ada yang bisa dipanggil.
		expect(buildSystemPrompt({ ...dasar, withTools: true })).toContain(NARRATIVE_GUIDANCE)
		expect(buildSystemPrompt({ ...dasar, withTools: false })).not.toContain(NARRATIVE_GUIDANCE)
	})

	test('panduan naratif menyuruh tipografi dijalankan setelah naskah ada', () => {
		/*
		 * set_font, set_indent dan kawan-kawan tanpa "find" hanya menjangkau
		 * paragraf yang sudah ada saat dipanggil. Urutannya bukan gaya penulisan
		 * prompt, melainkan syarat supaya panggilannya tidak sia-sia.
		 */
		const sampul = NARRATIVE_GUIDANCE.indexOf('Insert the cover')
		const tipografi = NARRATIVE_GUIDANCE.indexOf('set_font to a serif body face')

		expect(sampul).toBeGreaterThan(-1)
		expect(tipografi).toBeGreaterThan(sampul)
	})

	test('riset aktif dan nonaktif memakai pemberitahuan yang berbeda', () => {
		const aktif = buildSystemPrompt({ ...dasar, research: true })
		const mati = buildSystemPrompt({ ...dasar, research: false })

		expect(aktif).toContain(RESEARCH_GUIDANCE)
		expect(aktif).not.toContain(RESEARCH_OFF_NOTICE)
		expect(mati).toContain(RESEARCH_OFF_NOTICE)
		expect(mati).not.toContain(RESEARCH_GUIDANCE)
	})

	test('memori kosong tidak meninggalkan paragraf hampa', () => {
		// Bagian dirangkai dengan join('\n\n'), jadi bagian kosong yang lolos
		// filter akan tampak sebagai tiga baris baru berturut-turut.
		expect(buildSystemPrompt({ ...dasar, memory: null })).not.toContain('\n\n\n')
		expect(buildSystemPrompt({ ...dasar, memory: {} as StyleMemory })).not.toContain('\n\n\n')
	})

	test('preferensi gaya pengguna ikut disisipkan', () => {
		const memory = {
			tone: 'formal',
			language: 'Indonesia',
			glossary: ['Ransel', 'WritingHub'],
			notes: 'hindari jargon',
		} as StyleMemory

		const prompt = buildSystemPrompt({ ...dasar, memory })

		expect(prompt).toContain('Tone: formal')
		expect(prompt).toContain('Reply in Indonesia by default.')
		expect(prompt).toContain('Ransel, WritingHub')
		expect(prompt).toContain('hindari jargon')
	})

	test('aturan template duduk sesudah memori gaya dan lenyap bila kosong', () => {
		const memory = { tone: 'formal' } as StyleMemory
		const prompt = buildSystemPrompt({
			...dasar,
			memory,
			templateRules: ['Cite as bracketed numbers: [1], [2].'],
		})

		expect(prompt).toContain('- Cite as bracketed numbers: [1], [2].')
		expect(prompt.indexOf('Tone: formal')).toBeLessThan(prompt.indexOf('Cite as bracketed numbers'))

		/*
		 * Yang harus lenyap adalah **bloknya**, bukan setiap kata "template".
		 * Prompt dasarnya menyebut nama alat `apply_template_format` dan
		 * `get_template_rules` dan memang selalu menyebutnya - mencocokkan kata
		 * lepas membuat uji ini gagal karena alasan yang tidak ia maksud.
		 */
		expect(buildSystemPrompt({ ...dasar, templateRules: [] })).not.toContain(
			'This document was created from a template',
		)
		expect(buildSystemPrompt({ ...dasar, templateRules: undefined })).not.toContain('\n\n\n')
	})
})

describe('blok memori', () => {
	test('memori tanpa satu pun preferensi menghasilkan teks kosong', () => {
		expect(memoryPrompt(null)).toBe('')
		expect(memoryPrompt({} as StyleMemory)).toBe('')
		expect(memoryPrompt({ glossary: [] } as unknown as StyleMemory)).toBe('')
	})
})
