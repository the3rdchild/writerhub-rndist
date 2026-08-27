import { describe, expect, test } from 'bun:test'
import { ALL_TOOLS, EDITOR_TOOLS, isReadTool, RESEARCH_TOOLS, toProviderTools } from '@writer-hub/shared'

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

	test('alat tata letak A6 terdaftar sebagai write', () => {
		const layout = [
			'set_alignment',
			'set_indent',
			'set_spacing',
			'set_font',
			'toggle_list',
			'set_columns',
			'insert_footnote',
		]
		for (const name of layout) {
			expect(EDITOR_TOOLS.find((tool) => tool.name === name)).toBeDefined()
			expect(isReadTool(name)).toBe(false)
		}
	})

	test('alat tata letak berlingkup dokumen tidak mewajibkan find', () => {
		for (const name of ['set_alignment', 'set_indent', 'set_spacing', 'set_font', 'set_columns']) {
			const tool = EDITOR_TOOLS.find((item) => item.name === name)
			expect(tool?.parameters.required ?? []).not.toContain('find')
		}
		expect(EDITOR_TOOLS.find((t) => t.name === 'toggle_list')?.parameters.required).toContain('find')
		expect(EDITOR_TOOLS.find((t) => t.name === 'insert_footnote')?.parameters.required).toContain('quote')
	})

	test('tidak ada alat tak dikenal yang menyusup', () => {
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

describe('alat section (§P8&P9)', () => {
	const enumOf = (tool: string, param: string): string[] =>
		(
			EDITOR_TOOLS.find((item) => item.name === tool)?.parameters.properties[param] as
				| { enum?: string[] }
				| undefined
		)?.enum ?? []

	test('insert_section_break adalah alat tulis tanpa argumen wajib', () => {
		const tool = EDITOR_TOOLS.find((item) => item.name === 'insert_section_break')
		expect(tool).toBeDefined()
		expect(isReadTool('insert_section_break')).toBe(false)
		expect(tool?.parameters.required ?? []).toHaveLength(0)
	})

	test('cakupan per-section tersedia di set_page_setup dan set_columns', () => {
		expect(enumOf('set_page_setup', 'scope')).toEqual(
			expect.arrayContaining(['document', 'tab', 'from_here', 'this_page']),
		)
		expect(enumOf('set_columns', 'scope')).toEqual(
			expect.arrayContaining(['passage', 'from_here', 'this_page']),
		)
	})

	test('cakupan memakai satu kosakata yang sama di kedua alat', () => {
		const shared = ['from_here', 'this_page']
		for (const scope of shared) {
			expect(enumOf('set_page_setup', 'scope')).toContain(scope)
			expect(enumOf('set_columns', 'scope')).toContain(scope)
		}
	})

	test('set_columns tetap tidak mewajibkan find setelah scope ditambahkan', () => {
		const tool = EDITOR_TOOLS.find((item) => item.name === 'set_columns')
		expect(tool?.parameters.required ?? []).toEqual(['count'])
	})
})

describe('alat riset web', () => {
	test('nama tidak bentrok dengan alat editor', () => {
		const names = ALL_TOOLS.map((tool) => tool.name)
		expect(new Set(names).size).toBe(names.length)
	})

	test('keduanya alat baca - tidak pernah butuh Apply', () => {
		expect(RESEARCH_TOOLS.every((tool) => tool.kind === 'read')).toBe(true)
		expect(isReadTool('web_search')).toBe(true)
		expect(isReadTool('fetch_url')).toBe(true)
	})

	test('tidak dikirim ke model saat mode riset mati', () => {
		const names = toProviderTools().map((tool) => (tool as { function: { name: string } }).function.name)
		expect(names).toHaveLength(EDITOR_TOOLS.length)
		expect(names).not.toContain('web_search')
	})

	test('dikirim ke model saat mode riset menyala', () => {
		const names = toProviderTools({ research: true }).map(
			(tool) => (tool as { function: { name: string } }).function.name,
		)
		expect(names).toContain('web_search')
		expect(names).toContain('fetch_url')
	})
})
