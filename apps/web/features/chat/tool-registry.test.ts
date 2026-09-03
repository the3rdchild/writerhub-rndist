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
			'get_template_rules',
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

describe('apply_template_format', () => {
	const tool = EDITOR_TOOLS.find((item) => item.name === 'apply_template_format')

	test('terdaftar sebagai alat tulis', () => {
		expect(tool).toBeDefined()
		expect(tool?.kind).toBe('write')
	})

	test('slug template wajib diisi', () => {
		expect(tool?.parameters.required).toEqual(['template'])
		expect(tool?.parameters.properties.template).toBeDefined()
	})

	/*
	 * Alasan alat ini ada: dokumen kosong berangkat dari margin 1 inci, dan
	 * model yang menebak angka format skripsi sendiri lewat set_page_setup
	 * menghasilkan dokumen yang tampak hampir benar. Deskripsinya harus
	 * mengatakan itu, karena deskripsi inilah satu-satunya yang dibaca model.
	 */
	test('deskripsinya mengarahkan menjauh dari menebak angka sendiri', () => {
		expect(tool?.description).toContain('set_page_setup')
		expect(tool?.description).toContain('margins')
	})

	test('contoh slug-nya nyata, bukan karangan', () => {
		const description = tool?.parameters.properties.template.description ?? ''
		expect(description).toContain('skripsi-s1')
	})
})

describe('insert_html_block', () => {
	const tool = EDITOR_TOOLS.find((item) => item.name === 'insert_html_block')

	/*
	 * Bingkainya menutup jaringan rapat-rapat, jadi ikon tidak bisa datang dari
	 * mana pun kecuali ditulis sendiri. Deskripsi lamanya cuma bilang gambar
	 * harus ber-URI `data:` - kalimat yang terbaca seperti larangan gambar, dan
	 * mendorong model memakai emoji sebagai ikon. Inline SVG harus disebut
	 * eksplisit, karena deskripsi inilah satu-satunya yang dibaca model.
	 */
	test('menyebut inline SVG sebagai cara membuat ikon', () => {
		expect(tool?.description).toContain('inline <svg>')
	})

	test('menutup jalan yang tidak akan berhasil', () => {
		// Tidak ada yang bisa dimuat lewat URL, dan `<img>` berisi SVG rapuh di
		// jalur ekspor DOCX.
		expect(tool?.description).toContain('NOTHING loads from a URL')
		expect(tool?.description).toContain('data:image/svg+xml')
	})
})

describe('insert_toc', () => {
	const tool = EDITOR_TOOLS.find((item) => item.name === 'insert_toc')

	/*
	 * Deskripsi inilah satu-satunya yang dibaca model. Tanpa larangan yang
	 * tegas ia mengetik daftar isi sebagai paragraf berisi titik-titik dan
	 * nomor halaman tebakan - dan tipografi akademik yang rata kanan-kiri
	 * meregangkan titik itu sampai nomornya berpencar ke tengah baris.
	 */
	test('melarang mengetik daftar isi sebagai teks biasa', () => {
		expect(tool?.description).toContain('NEVER')
		expect(tool?.description.toLowerCase()).toContain('dot leaders')
	})

	test('menyebut dirinya satu-satunya cara yang benar', () => {
		expect(tool?.description).toContain('ONLY correct way')
	})
})
