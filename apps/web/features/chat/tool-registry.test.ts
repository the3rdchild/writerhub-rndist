import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import {
	ACTIVE_SKILLS,
	ALL_TOOLS,
	EDITOR_TOOLS,
	isReadTool,
	RESEARCH_TOOLS,
	SKILL_TOOLS,
	skillFilePath,
	toProviderTools,
} from '@writer-hub/shared'

const executor = readFileSync(new URL('./tools.ts', import.meta.url), 'utf8')

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
			'rename_document',
			'rename_tab',
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
			rename_document: ['title'],
			rename_tab: ['title'],
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
		expect(names).toHaveLength(EDITOR_TOOLS.length + SKILL_TOOLS.length)
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

describe('alat penamaan', () => {
	/*
	 * Alasan alat ini ada: tanpanya model menjawab bahwa mengganti judul di luar
	 * kemampuannya dan menyuruh penulis mengetik sendiri - padahal judul adalah
	 * hal pertama yang diminta setelah dokumen jadi. Deskripsinya harus
	 * mengatakan itu, karena deskripsi inilah satu-satunya yang dibaca model.
	 */
	test('rename_document menutup jawaban "tidak bisa"', () => {
		const tool = EDITOR_TOOLS.find((item) => item.name === 'rename_document')
		expect(tool?.kind).toBe('write')
		expect(tool?.description).toContain('Untitled document')
		expect(tool?.description).toContain('never answer that renaming is beyond your tools')
	})

	test('rename_tab memakai tab aktif saat tab_id tidak disebut', () => {
		const tool = EDITOR_TOOLS.find((item) => item.name === 'rename_tab')
		expect(tool?.kind).toBe('write')
		expect(tool?.parameters.required ?? []).not.toContain('tab_id')
		const tabId = tool?.parameters.properties.tab_id as { description: string } | undefined
		expect(tabId?.description).toContain('Defaults to the active tab')
	})

	test('keduanya dibedakan supaya tidak tertukar', () => {
		expect(EDITOR_TOOLS.find((item) => item.name === 'rename_document')?.description).toContain('rename_tab')
		expect(EDITOR_TOOLS.find((item) => item.name === 'rename_tab')?.description).toContain('rename_document')
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

describe('alat header/footer & penomoran halaman', () => {
	/*
	 * Alasan alat ini ada: tanpanya model menjawab bahwa header, footer dan
	 * nomor halaman "tidak tercakup alat yang tersedia" - padahal fiturnya ada
	 * di editor, tinggal tidak terjangkau dari chat. Deskripsi inilah
	 * satu-satunya yang dibaca model, jadi jalan yang benar harus tertulis di
	 * sana: token {page} di dalam header/footer, bukan angka yang diketik.
	 */
	const furniture = EDITOR_TOOLS.find((item) => item.name === 'set_header_footer')
	const numbering = EDITOR_TOOLS.find((item) => item.name === 'set_page_numbering')

	test('keduanya alat tulis', () => {
		expect(furniture?.kind).toBe('write')
		expect(numbering?.kind).toBe('write')
		expect(isReadTool('set_header_footer')).toBe(false)
		expect(isReadTool('set_page_numbering')).toBe(false)
	})

	test('set_header_footer menutup jawaban "tidak bisa"', () => {
		expect(furniture?.description).toContain('{page}')
		expect(furniture?.description).toContain('{pages}')
		expect(furniture?.description).toContain('NEVER type a page number')
		expect(furniture?.parameters.required).toEqual(['slot'])
	})

	test('varian halaman pertama & genap tersedia', () => {
		const variant = furniture?.parameters.properties.variant as { enum?: string[] } | undefined
		expect(variant?.enum).toEqual(expect.arrayContaining(['default', 'first', 'even']))
	})

	test('penomoran memakai kosakata cakupan yang sama dengan alat tata letak', () => {
		const scope = numbering?.parameters.properties.scope as { enum?: string[] } | undefined
		expect(scope?.enum).toEqual(expect.arrayContaining(['tab', 'from_here', 'this_page']))
	})

	test('penomoran menyebut pasangannya - angka tanpa wadah tidak tampil', () => {
		expect(numbering?.description).toContain('set_header_footer')
		expect(numbering?.parameters.required ?? []).toHaveLength(0)
	})

	test('get_page_setup melaporkan perabot dan penomorannya', () => {
		const read = EDITOR_TOOLS.find((item) => item.name === 'get_page_setup')
		expect(read?.description).toContain('header/footer')
		expect(read?.description).toContain('numbered')
	})
})

/*
 * Alat yang dideklarasikan tapi tidak punya cabang pelaksana gagal diam-diam:
 * model memanggilnya, `switch` jatuh ke default, dan yang terlihat pengguna
 * hanyalah permintaan yang tidak terjadi apa-apa. Sudah pernah terjadi -
 * `convert_to_html_block` sempat terdaftar tanpa pelaksananya.
 */
describe('setiap alat punya pelaksana', () => {
	test.each(EDITOR_TOOLS.map((tool) => tool.name))('%s ditangani di tools.ts', (name) => {
		expect(executor).toContain(`case '${name}'`)
	})
})

describe('convert_to_html_block', () => {
	const tool = EDITOR_TOOLS.find((item) => item.name === 'convert_to_html_block')

	test('terdaftar sebagai alat tulis', () => {
		expect(tool?.kind).toBe('write')
	})

	/*
	 * Alasan alat ini ada: tanpanya, satu-satunya cara merender HTML yang sudah
	 * ada di dokumen adalah membacanya utuh lalu mengirimnya kembali lewat
	 * insert_html_block - menulis ulang rancangan yang sudah jadi. Satu
	 * permintaan konversi sempat menghabiskan dua menit karenanya.
	 */
	test('deskripsinya melarang jalan memutar yang mahal itu', () => {
		expect(tool?.description).toContain('NEVER')
		expect(tool?.description).toContain('insert_html_block')
	})

	test('tidak menerima HTML - ia mencarinya sendiri', () => {
		expect(tool?.parameters.properties.html).toBeUndefined()
		expect(tool?.parameters.required ?? []).toEqual([])
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

describe('alat skill', () => {
	test('selalu dikirim ke model, tidak seperti alat riset', () => {
		const names = toProviderTools().map((tool) => (tool as { function: { name: string } }).function.name)
		expect(names).toContain('read_skill')
	})

	test('alat baca, jadi model boleh memanggilnya sendiri', () => {
		expect(isReadTool('read_skill')).toBe(true)
	})

	test('hanya skill yang overlaynya sudah ada yang ditawarkan', () => {
		const tool = SKILL_TOOLS.find((entry) => entry.name === 'read_skill')
		const allowed = (tool as { parameters: { properties: { name: { enum: string[] } } } }).parameters
			.properties.name.enum
		expect(allowed).toEqual(ACTIVE_SKILLS.map((skill) => skill.name))
	})

	test('jalur berkas hanya terbentuk dari katalog', () => {
		expect(skillFilePath('scientific-writing')).toBe('scientific-writing/SKILL.md')
		expect(skillFilePath('scientific-writing', 'evidence-audit')).toBe('scientific-writing/evidence-audit.md')
		expect(skillFilePath('scientific-writing', '../../../etc/passwd')).toBeNull()
		expect(skillFilePath('scientific-writing', 'evidence-audit.md')).toBeNull()
		expect(skillFilePath('../../../etc/passwd')).toBeNull()
		expect(skillFilePath('tidak-ada')).toBeNull()
	})
})

describe('read_section tanpa indeks heading', () => {
	/*
	 * Dokumen yang isinya satu rancangan, satu diagram, atau satu tabel tidak
	 * punya heading sama sekali. Sebelum ini tidak ada satu pun alat yang bisa
	 * membacanya: `read_section` menuntut indeks yang tidak ada, dan `find_text`
	 * hanya mengembalikan cuplikan. Model menghabiskan seluruh anggaran
	 * penelusurannya untuk menemukan itu, lalu gilirannya mati tanpa menyunting
	 * apa pun.
	 */
	test('heading_index tidak lagi wajib', () => {
		const tool = ALL_TOOLS.find((entry) => entry.name === 'read_section')
		expect(tool?.parameters.required ?? []).not.toContain('heading_index')
	})

	test('deskripsinya menyebut kapan indeksnya dilewati', () => {
		const tool = ALL_TOOLS.find((entry) => entry.name === 'read_section')
		expect(tool?.description).toContain('no headings')
	})
})
