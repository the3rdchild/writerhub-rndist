import { describe, expect, test } from 'bun:test'
import { EDITOR_TOOLS, isReadTool } from '@writer-hub/shared'

/**
 * Registri alat (§B3.2): penjaga kontrak antara prompt, provider, dan
 * eksekutor. Yang paling mahal salahnya di sini adalah `kind` - alat tulis
 * yang tercatat `read` akan dijalankan langsung tanpa Apply.
 */

describe('registri alat editor', () => {
	test('nama alat unik', () => {
		const names = EDITOR_TOOLS.map((tool) => tool.name)
		expect(new Set(names).size).toBe(names.length)
	})

	test('alat baru B3 terdaftar dengan kind yang benar', () => {
		const reads = [
			'get_document_stats',
			'get_selection',
			'get_page_setup',
			'list_tabs',
			'read_tab',
			'get_comments',
			'plan',
			'think',
		]
		const writes = [
			'set_page_setup',
			'insert_toc',
			'set_toc_options',
			'insert_mermaid',
			'insert_table',
			'apply_paragraph_style',
			'format_text',
			'restructure_section',
			'insert_image',
			'create_tab',
		]

		for (const name of reads) expect(isReadTool(name)).toBe(true)
		for (const name of writes) expect(isReadTool(name)).toBe(false)
	})

	test('tidak ada alat tak dikenal yang menyusup', () => {
		// Kriteria §B3.4 no. 4: alat tulis tak pernah menyentuh naskah tanpa
		// Apply. Pengaman pertamanya adalah daftar ini sendiri - nama yang tidak
		// dikenal dianggap write oleh isReadTool (undefined !== 'read').
		expect(isReadTool('alat_karangan_model')).toBe(false)
	})

	test('argumen wajib tercantum di parameters.required', () => {
		const required: Record<string, string[]> = {
			read_tab: ['tab_id'],
			plan: ['steps'],
			think: ['thought'],
			insert_mermaid: ['source'],
			insert_table: ['rows', 'cols'],
			apply_paragraph_style: ['find', 'style'],
			format_text: ['find'],
			restructure_section: ['heading_index', 'action'],
			insert_image: ['src'],
		}

		for (const [name, keys] of Object.entries(required)) {
			const tool = EDITOR_TOOLS.find((item) => item.name === name)
			expect(tool?.parameters.required ?? []).toEqual(expect.arrayContaining(keys))
		}
	})
})
