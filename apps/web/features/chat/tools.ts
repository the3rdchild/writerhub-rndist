'use client'

import type { JSONContent } from '@tiptap/core'
import { NodeSelection, Selection } from '@tiptap/pm/state'
import type { Editor } from '@tiptap/react'
import {
	type AnalysisFeature,
	type DocumentTypography,
	PAGE_NUMBER_POSITIONS,
	type PageNumberFormat,
	type PageNumbering,
	type PageNumberPosition,
	type TemplateSpec,
	type ToolCall,
	type WorkKind,
} from '@writer-hub/shared'
import type { PanelId } from '@/features/analysis/panel-context'
import { COMMENT_MARK } from '@/features/comments/comment-mark'
import { resolveSpan } from '@/features/document/suggestions'
import { buildTextIndex, textRangeToPM } from '@/features/document/tiptap-offsets'
import { placeSectionNumbering } from '@/features/editor/academic-numbering'
import { DEFAULT_HTML_BLOCK_ATTRS, HTML_BLOCK } from '@/features/editor/html-block'
import { escapeNodeSelection, positionAfterTable } from '@/features/editor/insert-point'
import { toEditorContent } from '@/features/editor/markdown'
import { MATH_BLOCK, MATH_INLINE, stripDelimiters } from '@/features/editor/math'
import { PAGE_BREAK_NODE } from '@/features/editor/page-break'
import type {
	FurnitureSlot,
	FurnitureVariant,
	PageFurniture,
	PageFurnitureLine,
} from '@/features/editor/page-furniture/model'
import { clampMargins, INCH, PAGE_SIZES, type PageSetup, pageGeometry } from '@/features/editor/page-geometry'
import { SECTION_BREAK_NODE } from '@/features/editor/section-break'
import { isSectionScope, sectionRange } from '@/features/editor/section-scope'
import { clampedAttrs, TOC_BLOCK, type TocBlockAttrs, type TocListKind } from '@/features/editor/toc-block'
import type { CommentThread } from '@/features/sessions/types'
import { countWords } from '@/lib/utils'
import {
	afterBlockAt,
	type FigurePlan,
	type FigureSlot,
	figureNote,
	figureOf,
	insideFigure,
	keepFigures,
	parseFigureLine,
	placeFigures,
	readableText,
	SVG_IN_PROSE,
	svgInProse,
} from './figures'
import { insertFrontMatter } from './front-matter-insert'
import { blockSummary, htmlCandidates } from './html-block-candidates'
import { applyAcademicNumbering } from './numbering-apply'
import { setBlockStyle } from './paragraph-style'
import { promoteSectionTitles } from './section-titles'
import {
	chapterSlot,
	type DocHeading,
	docHeadings,
	dropLeadingTitle,
	emptyChapterFor,
	planSectionWrite,
	planTextReplace,
	sameTitle,
	sectionIsEmpty,
} from './section-write'

/**
 * Rantai untuk alat yang menyisipkan sesuatu di kursor - lihat
 * `escapeNodeSelection` untuk kenapa langkah tambahan itu perlu.
 */
function insertChain(editor: Editor) {
	return editor
		.chain()
		.focus()
		.command(({ tr }) => {
			escapeNodeSelection(tr)
			return true
		})
}

function headings(editor: Editor): DocHeading[] {
	return docHeadings(editor.state.doc)
}

function sectionEnd(editor: Editor, list: DocHeading[], at: number): number {
	const current = list[at]
	for (let index = at + 1; index < list.length; index += 1) {
		if (list[index].level <= current.level) return list[index].pos
	}
	return editor.state.doc.content.size
}

/*
 * Aksi dalam satu gelombang diterapkan berurutan terhadap naskah terkini,
 * tetapi `find`-nya ditulis model sebelum aksi sebelumnya mengubah teks itu.
 * Pesannya menyebut sebab itu supaya model membaca ulang, bukan menyerah.
 */
const PASSAGE_GONE =
	'That passage is no longer in the document - an earlier edit in this batch may have changed it. Read the section again (read_section or find_text) and retry with its current text.'

/** Bagian yang isinya dibuat aplikasi (insert_toc), bukan ditulis. */
const GENERATED_SECTION = /^daftar\s+(isi|tabel|gambar)\b|^(table of contents|list of (figures|tables))$/i

/** Heading sasaran `write_section`: dari indeks outline, atau dari judulnya bila unik. */
function sectionTarget(list: readonly DocHeading[], args: Record<string, unknown>): number | string {
	const title = cleanTitle(args.heading)
	const asked = args.heading_index
	if (asked !== undefined && asked !== null) {
		const at = Number(asked)
		if (!Number.isInteger(at) || !list[at])
			return `No heading with index ${asked}. Call get_outline and use an index it lists.`
		if (title && !sameTitle(list[at].text, title)) {
			return `Heading ${at} is "${list[at].text}", not "${title}". Call get_outline and use a matching index.`
		}
		return at
	}
	if (!title) return 'Name the section: pass heading exactly as get_outline lists it.'
	const matches = list.filter((heading) => sameTitle(heading.text, title))
	if (matches.length === 0) {
		return `No heading "${title}" in the document. Call get_outline and use a heading exactly as listed; a section that does not exist yet goes in with insert_content.`
	}
	if (matches.length > 1) {
		return `"${title}" appears ${matches.length} times (indexes ${matches.map((heading) => heading.index).join(', ')}). Pass heading_index to choose one.`
	}
	return matches[0].index
}

/** Menulis isi satu bagian menurut `planSectionWrite`, dalam satu transaksi. */
function writeSection(editor: Editor, at: number, markdown: string): ToolOutcome {
	const title = headings(editor)[at]?.text ?? ''
	if (GENERATED_SECTION.test(title)) {
		return { ok: false, message: `"${title}" is generated by insert_toc; do not write it by hand.` }
	}
	if (svgInProse(markdown)) return { ok: false, message: SVG_IN_PROSE }
	const plan = planSectionWrite(editor.state.doc, at, markdown)
	if (!plan.ok) return plan

	// Gambar di isi lama tidak ikut terhapus - lihat `figures.ts`.
	const counter = { next: 0 }
	const kept: FigurePlan[] = []
	const slots: FigureSlot[] = []
	const chain = editor.chain()
	for (const edit of plan.edits) {
		const figures = keepFigures(editor.state.doc, edit.from, edit.to, edit.markdown, counter)
		kept.push(figures)
		slots.push(...figures.slots)
		chain.insertContentAt({ from: edit.from, to: edit.to }, toEditorContent(figures.markdown))
	}
	chain
		.command(({ tr }) => {
			placeFigures(tr, slots)
			return true
		})
		.run()

	const notes = [
		plan.filled.length > 0 && `filled ${plan.filled.map((text) => `"${text}"`).join(', ')}`,
		plan.added.length > 0 && `added ${plan.added.map((text) => `"${text}"`).join(', ')}`,
	].filter(Boolean)
	return {
		ok: true,
		message: `Wrote the section "${title}"${notes.length > 0 ? `; ${notes.join('; ')}` : ''}.${figureNote(kept)}`,
	}
}

/** Baris `[Figure: …]` di sisipan baru tidak menunjuk gambar mana pun - dibuang, bukan dicetak. */
function withoutFigureLines(markdown: string): string {
	let fenced = false
	return markdown
		.split('\n')
		.filter((line) => {
			if (line.trim().startsWith('```')) fenced = !fenced
			return fenced || !parseFigureLine(line)
		})
		.join('\n')
}

const SNIPPET_RADIUS = 80
const MAX_HITS = 8
const MAX_SECTION_CHARS = 6_000
const MAX_TAB_CHARS = 20_000
/** Batas judul di API dokumen; judul dari model dipotong sebelum sampai ke sana. */
const MAX_TITLE_CHARS = 500

export interface ReadToolContext {
	editor: Editor
	pageCount: number
	setup: PageSetup
	tabs: { id: string; label: string; active: boolean }[]
	readTab: (tabId: string) => string | null
	comments: CommentThread[]
	/** Template asal dokumen aktif; null untuk dokumen kosong. */
	template: { name: string; slug: string; spec: TemplateSpec } | null
	/** Header/footer tab aktif sebagai baris teks; null bila tab tanpa perabot. */
	furniture: PageFurniture | null
}

export function runReadTool(context: ReadToolContext, call: ToolCall): string {
	const { editor } = context
	switch (call.name) {
		case 'get_outline': {
			const list = headings(editor)
			const outline =
				list.length === 0
					? 'The document has no headings.'
					: list.map((heading) => `${heading.index}. ${'#'.repeat(heading.level)} ${heading.text}`).join('\n')

			// Bentuk dokumen ikut, bukan cuma judulnya: rancangan satu halaman
			// tidak punya judul sama sekali, dan kerangka kosong membuat model
			// membaca isinya berkali-kali demi menebak apa yang ada di sana.
			const blocks = blockSummary(editor.state.doc)
			return blocks ? `${outline}\n\n${blocks}` : outline
		}

		case 'read_section': {
			const list = headings(editor)
			const asked = call.arguments.heading_index

			/*
			 * Tanpa indeks berarti "dari awal dokumen", dan itu bukan kemudahan.
			 *
			 * Dokumen yang isinya satu rancangan, satu diagram, atau satu tabel
			 * tidak punya heading sama sekali - dan dulu itu berarti **tidak ada
			 * satu pun alat yang bisa membacanya**. `read_section` menuntut
			 * indeks yang tidak ada, `find_text` hanya mengembalikan cuplikan
			 * berjari-jari tetap. Model yang diminta memperbaiki diagram
			 * menghabiskan seluruh anggaran penelusurannya untuk menemukan itu,
			 * lalu gilirannya mati tanpa menyunting apa pun.
			 */
			if (asked === undefined || asked === null) {
				const whole = readableText(editor.state.doc)
				return whole.length > MAX_SECTION_CHARS ? `${whole.slice(0, MAX_SECTION_CHARS)}\n…(truncated)` : whole
			}

			const at = Number(asked)
			if (!Number.isInteger(at) || at < 0 || at >= list.length) {
				return `No heading with index ${call.arguments.heading_index}. Call get_outline first, or omit heading_index to read from the top.`
			}

			const text = readableText(editor.state.doc, list[at].pos, sectionEnd(editor, list, at))
			return text.length > MAX_SECTION_CHARS ? `${text.slice(0, MAX_SECTION_CHARS)}\n…(truncated)` : text
		}

		case 'find_text': {
			const query = String(call.arguments.query ?? '')
			if (!query) return 'Empty query.'

			// Teks yang sama dengan `read_section`: sumber SVG diagram bukan naskah.
			const text = readableText(editor.state.doc)
			const hits: string[] = []
			let from = text.toLowerCase().indexOf(query.toLowerCase())

			while (from !== -1 && hits.length < MAX_HITS) {
				const start = Math.max(0, from - SNIPPET_RADIUS)
				const end = Math.min(text.length, from + query.length + SNIPPET_RADIUS)
				hits.push(`…${text.slice(start, end).replace(/\n/g, ' ')}…`)
				from = text.toLowerCase().indexOf(query.toLowerCase(), from + query.length)
			}

			if (hits.length === 0) return `"${query}" does not appear in the document.`
			return `${hits.length} match(es):\n${hits.join('\n')}`
		}

		case 'get_document_stats': {
			// Sumber SVG diagram bukan kata: dua ratus baris `<rect …>` terhitung
			// ribuan kata dan membuat naskah tampak jauh lebih panjang dari aslinya.
			const plain = readableText(editor.state.doc, 0, editor.state.doc.content.size, 'omit')
			const perLevel = new Map<number, number>()
			let tables = 0
			let images = 0
			let diagrams = 0
			let designs = 0
			let formulas = 0
			editor.state.doc.descendants((node) => {
				const figure = figureOf(node)
				if (figure) {
					if (figure.kind === 'image') images += 1
					else if (figure.kind.endsWith('diagram')) diagrams += 1
					else designs += 1
					return false
				}
				if (node.type.name === 'heading') {
					const level = (node.attrs.level as number) ?? 1
					perLevel.set(level, (perLevel.get(level) ?? 0) + 1)
				} else if (node.type.name === 'table') tables += 1
				else if (node.type.name === MATH_BLOCK || node.type.name === MATH_INLINE) formulas += 1
				return true
			})

			const headingSummary =
				perLevel.size === 0
					? 'no headings'
					: [...perLevel.entries()]
							.sort(([a], [b]) => a - b)
							.map(([level, count]) => `H${level}:${count}`)
							.join(', ')

			return [
				`Words: ${countWords(plain)}`,
				`Characters: ${plain.length}`,
				`Pages: ${context.pageCount}`,
				`Headings: ${headingSummary}`,
				`Tables: ${tables}, images: ${images}, diagrams: ${diagrams}, design blocks: ${designs}, formulas: ${formulas}`,
			].join('\n')
		}

		case 'get_selection': {
			const { from, to, empty } = editor.state.selection
			if (empty) return 'No text is currently selected.'
			const text = readableText(editor.state.doc, from, to)
			return `Selection (${from}..${to}):\n${text}`
		}

		case 'get_page_setup': {
			const { setup } = context
			const cm = (px: number) => Math.round((px / INCH) * 2.54 * 100) / 100
			return [
				pageSummary(setup),
				`Margins (cm): top ${cm(setup.margins.top)}, bottom ${cm(setup.margins.bottom)}, left ${cm(setup.margins.left)}, right ${cm(setup.margins.right)}`,
				'insert_html_block with fit "page" fills the whole sheet, bleeding past the margins.',
				`Page color: ${setup.pageColor ?? 'theme default'}`,
				furnitureSummary(context.furniture),
				numberingSummary(setup.pageNumbering),
			].join('\n')
		}

		case 'get_template_rules': {
			const template = context.template
			if (!template) return 'This document was created without a template; no format rules apply.'
			const { spec } = template
			const required = spec.structure.filter((item) => item.required).map((item) => item.heading)
			const optional = spec.structure.filter((item) => !item.required).map((item) => item.heading)
			return [
				`Template: ${template.name} (${template.slug})`,
				`Citation style: ${spec.format.citationStyle}; heading scheme: ${spec.format.headingScheme}; language: ${spec.format.language}.`,
				spec.format.abstractWords
					? `Abstract length: ${spec.format.abstractWords[0]}-${spec.format.abstractWords[1]} words.`
					: null,
				required.length > 0 ? `Required sections, in order: ${required.join(' → ')}` : null,
				optional.length > 0 ? `Optional sections: ${optional.join(', ')}` : null,
				spec.layout.columns ? `Body layout: ${spec.layout.columns.count} columns.` : null,
				'Format rules:',
				...spec.aiRules.map((rule) => `- ${rule}`),
			]
				.filter(Boolean)
				.join('\n')
		}

		case 'list_tabs': {
			if (context.tabs.length === 0) return 'The document has no tabs.'
			return context.tabs.map((tab) => `${tab.id} - ${tab.label}${tab.active ? ' (active)' : ''}`).join('\n')
		}

		case 'read_tab': {
			const tabId = String(call.arguments.tab_id ?? '')
			const text = context.readTab(tabId)
			if (text === null) return `No tab with id ${tabId}. Call list_tabs first.`
			if (!text.trim()) return 'That tab is empty.'
			return text.length > MAX_TAB_CHARS ? `${text.slice(0, MAX_TAB_CHARS)}\n…(truncated)` : text
		}

		case 'get_comments': {
			const open = context.comments.filter((thread) => !thread.resolved)
			if (open.length === 0) return 'No unresolved comments.'
			return open
				.map((thread) => {
					const first = thread.replies[0]?.text ?? ''
					return `- "${thread.quote}" - ${first} (${thread.replies.length} repl${thread.replies.length === 1 ? 'y' : 'ies'})`
				})
				.join('\n')
		}
		case 'plan':
		case 'think':
			return 'OK.'

		default:
			return `Unknown read tool: ${call.name}`
	}
}

export function readToolLabel(editor: Editor, call: ToolCall): string {
	switch (call.name) {
		case 'get_outline':
			return 'Membaca kerangka dokumen'
		case 'read_section': {
			const asked = call.arguments.heading_index
			if (asked === undefined || asked === null) return 'Membaca naskah dari awal'
			const at = Number(asked)
			const heading = Number.isInteger(at) ? headings(editor)[at] : undefined
			return heading ? `Membaca bagian "${heading.text.slice(0, 48)}"` : 'Membaca bagian naskah'
		}
		case 'find_text':
			return `Mencari "${String(call.arguments.query ?? '').slice(0, 48)}"`
		case 'get_document_stats':
			return 'Menghitung statistik dokumen'
		case 'get_selection':
			return 'Membaca teks yang disorot'
		case 'get_page_setup':
			return 'Membaca tata letak halaman'
		case 'get_template_rules':
			return 'Membaca aturan format template'
		case 'list_tabs':
			return 'Mendaftar tab dokumen'
		case 'read_tab': {
			const tabId = String(call.arguments.tab_id ?? '')
			return `Membaca tab ${tabId.slice(0, 12)}`
		}
		case 'get_comments':
			return 'Membaca komentar terbuka'
		case 'update_brief':
			return 'Memperbarui metadata'
		case 'set_outline':
			return 'Mencatat kerangka tulisan'
		default:
			return `Menjalankan ${call.name}`
	}
}

/**
 * Letak gambar menurut `after_text`: posisi sesudah paragrafnya, null bila
 * tidak diminta (di kursor), atau kalimat galat bila teksnya tidak ada.
 */
export function figurePlacement(editor: Editor, args: Record<string, unknown>): number | null | string {
	const text = typeof args.after_text === 'string' ? args.after_text.trim() : ''
	if (!text) return null
	const index = buildTextIndex(editor.state.doc)
	const span = resolveSpan(index.text, text, 0)
	const range = span ? textRangeToPM(index, span.offset, span.length) : null
	if (!range) {
		return `Not carried out: "${text}" is not in the document. Quote the caption exactly as read_section shows it, or write the caption first.`
	}
	return afterBlockAt(editor.state.doc, range.to)
}

/** Menyisipkan satu blok gambar di `at`, atau di kursor bila `at` null. */
function insertFigure(editor: Editor, content: JSONContent, at: number | null): boolean {
	if (at === null) return insertChain(editor).insertContent(content).run()
	return editor.chain().insertContentAt(at, content).run()
}

/**
 * Menaruh gambar dari sub-agent ke dalam dokumen.
 *
 * Dipisahkan dari `applyWriteTool` karena jalurnya memang berbeda: alat tulis
 * lain selesai seketika, yang ini baru punya isi sesudah satu panggilan
 * jaringan. Yang disimpan tetap sumbernya - blok kode berbahasa `diagram` -
 * jadi penulis bisa menyuntingnya persis seperti diagram yang ditulis model
 * sendiri.
 *
 * Diagram tidak pernah masuk ke sel tabel: tanpa letak yang diminta, kursor
 * yang tertinggal di sel terakhir sesudah tabel disisipkan diganti posisi
 * sesudah tabelnya.
 */
export function insertDiagramBlock(editor: Editor, svg: string, at: number | null = null): void {
	insertFigure(
		editor,
		{ type: 'codeBlock', attrs: { language: 'diagram' }, content: [{ type: 'text', text: svg }] },
		at ?? positionAfterTable(editor.state.selection),
	)
}

const PLACED = (at: number | null) => (at === null ? '' : ' It sits right after the text you named.')

/**
 * Menimpa isi satu blok diagram di tempatnya.
 *
 * Menimpa, bukan menyisipkan yang baru: penulis yang minta satu warna diubah
 * mengharapkan diagramnya berubah, bukan mendapat dua diagram yang hampir sama
 * dan harus menghapus salah satunya sendiri.
 */
export function replaceDiagramBlock(editor: Editor, pos: number, svg: string): boolean {
	const node = editor.state.doc.nodeAt(pos)
	if (!node || node.type.name !== 'codeBlock') return false

	const from = pos + 1
	const to = pos + node.nodeSize - 1
	return editor
		.chain()
		.focus()
		.command(({ tr }) => {
			tr.replaceWith(from, to, editor.schema.text(svg))
			return true
		})
		.run()
}

export function summarizeToolResult(result: string): string {
	const lines = result.split('\n')
	const first = lines[0].slice(0, 100)
	return lines.length > 1 ? `${first} … (+${lines.length - 1} baris)` : first
}

/**
 * Geometri halaman dalam satu baris, untuk model.
 *
 * Dipakai dua tempat sekaligus: konteks editor yang ikut di **setiap**
 * permintaan chat, dan alat `get_page_setup`. Satu perumus supaya keduanya
 * tidak mungkin menyebut ukuran yang berbeda - rancangan HTML satu halaman
 * bersandar pada angka ini, dan salah orientasi saja sudah cukup membuat
 * flyer potret ditulis dengan tata letak lanskap.
 */
export function pageSummary(setup: PageSetup): string {
	const label =
		setup.size === 'custom'
			? `custom ${setup.customWidth ?? 0}x${setup.customHeight ?? 0}px`
			: (PAGE_SIZES[setup.size]?.label ?? setup.size)
	if (setup.pageless) return `${label}, pageless (no fixed sheet)`

	const geometry = pageGeometry(setup)
	const sheet = `${Math.round(geometry.width)}x${Math.round(geometry.height)}px`
	const content = `${Math.round(geometry.contentWidth)}x${Math.round(geometry.contentHeight)}px`
	return `${label} ${setup.orientation}; sheet ${sheet}, content box ${content} (96dpi)`
}

const FURNITURE_VARIANT_LABEL: Record<FurnitureVariant, string> = {
	default: 'every other page',
	first: 'first page',
	even: 'even pages',
}

/**
 * Header/footer tab aktif dalam beberapa baris, untuk model.
 *
 * Hanya baris teksnya - isi kaya (gambar, format) diringkas jadi teksnya juga
 * lewat `pageFurniture`, yang memang dijaga tetap sinkron oleh penyuntingnya.
 */
function furnitureSummary(furniture: PageFurniture | null): string {
	const lines: string[] = []
	for (const slot of ['header', 'footer'] as FurnitureSlot[]) {
		for (const variant of ['default', 'first', 'even'] as FurnitureVariant[]) {
			const line = furniture?.[slot]?.[variant]
			if (!line) continue
			lines.push(`${slot} (${FURNITURE_VARIANT_LABEL[variant]}, ${line.align}): ${line.text}`)
		}
	}
	return lines.length === 0
		? 'Header/footer: none - set_header_footer writes one, with {page} for the page number.'
		: `Header/footer:\n${lines.map((line) => `- ${line}`).join('\n')}`
}

function numberingSummary(numbering: PageNumbering | undefined): string {
	const rule = numbering ?? { format: 'decimal' as PageNumberFormat, restart: 'continue' as const }
	const restart =
		typeof rule.restart === 'number' ? `starts at ${rule.restart}` : 'continues from the section before'
	const shown = rule.show === false ? 'hidden' : 'shown where a {page} token appears'
	return `Page numbering (first section): ${rule.format}, ${restart}, ${shown}. Later sections may differ; set_page_numbering changes it.`
}

export interface WriteToolContext {
	editor: Editor
	addComment: (thread: CommentThread) => void
	openPanel: (panel: PanelId) => void
	runModule: (feature: AnalysisFeature) => void
	setup: PageSetup
	setPageSetup: (setup: PageSetup, scope: 'document' | 'tab') => void
	setTypography: (typography: DocumentTypography, scope: 'document' | 'tab') => void
	/**
	 * Spec template yang sudah diambil saat panggilan alatnya tiba.
	 *
	 * Penerapan alat tulis berjalan sinkron - hasilnya dipakai langsung oleh
	 * kartu usulan - sedangkan mengambil spec butuh jaringan. Karena itu
	 * pengambilannya dilakukan lebih awal, di `runTurn` yang memang asinkron,
	 * dan yang tersisa di sini tinggal membacanya.
	 */
	templateSpecs: Map<string, TemplateSpec>
	createTab: (title: string | undefined, markdown: string | undefined) => void
	/** Mengganti judul dokumen aktif - nama yang tampil di atas editor. */
	renameDocument: (title: string) => ToolOutcome
	/** Mengganti label satu tab; `tabId` kosong berarti tab yang sedang dibuka. */
	renameTab: (tabId: string | undefined, title: string) => ToolOutcome
	/**
	 * Menulis satu baris header/footer tab aktif; `line` null menghapusnya.
	 *
	 * Isinya hidup di ydoc, bukan di dokumen editor - itulah kenapa ia lewat
	 * konteks alih-alih lewat `editor` seperti alat tulis lainnya.
	 */
	setFurnitureLine: (
		slot: FurnitureSlot,
		variant: FurnitureVariant,
		line: PageFurnitureLine | null,
	) => ToolOutcome
	/** Halaman pertama memakai perabotnya sendiri (kosong) - sampul tanpa nomor. */
	setFirstPageSeparate: (separate: boolean) => ToolOutcome
	/**
	 * Jenis karya dan isian sampul dokumen aktif: identitas template, judul dan
	 * jenis karya dari brief. Dibaca saat alatnya dijalankan, bukan saat
	 * diusulkan - penulis boleh melengkapi metadata sebelum menerapkannya.
	 */
	frontMatter: () => { kind: WorkKind; values: Record<string, string> }
	/** Format template yang sudah diterapkan ke dokumen ini, bila ada. */
	appliedFormat: () => string | null
	markFormatApplied: (slug: string) => void
	/** Header/footer tab aktif saat ini. */
	furniture: () => PageFurniture | null
	/** Penomoran karya ilmiah sudah dipasang - pemasangan otomatis tidak mengulanginya. */
	markNumberingPreset: (preset: 'academic' | 'academic-body') => void
}

export interface ToolOutcome {
	ok: boolean
	message: string
}

export function describeToolCall(call: ToolCall): string {
	switch (call.name) {
		case 'insert_content': {
			const markdown = String(call.arguments.markdown ?? '')
			const firstLine = markdown.split('\n')[0]?.slice(0, 60) ?? ''
			const kind = markdown.includes('|') && markdown.includes('---') ? 'table' : 'content'
			return `Insert ${kind}${firstLine ? ` - ${firstLine}…` : ''}`
		}
		case 'replace_text':
			return `Replace “${String(call.arguments.find ?? '').slice(0, 48)}…”`
		case 'write_section': {
			const heading = cleanTitle(call.arguments.heading).slice(0, 48)
			return heading
				? `Write the section “${heading}”`
				: `Write section ${call.arguments.heading_index ?? '?'}`
		}
		case 'insert_math':
			return `Insert formula ${String(call.arguments.latex ?? '').slice(0, 40)}`
		case 'insert_page_break':
			return 'Insert a page break'
		case 'add_comment':
			return `Comment on “${String(call.arguments.quote ?? '').slice(0, 40)}…”`
		case 'run_module':
			return `Run ${String(call.arguments.module ?? '')}`
		case 'set_page_setup': {
			const parts = [
				String(call.arguments.size ?? '').toUpperCase() || null,
				call.arguments.orientation === 'landscape' ? 'landscape' : null,
				call.arguments.pageless === true ? 'pageless' : null,
			].filter(Boolean)
			const where =
				call.arguments.scope === 'this_page'
					? ' for this page'
					: call.arguments.scope === 'from_here'
						? ' from here on'
						: ''
			return `Set page layout${where}${parts.length > 0 ? ` - ${parts.join(', ')}` : ''}`
		}
		case 'set_header_footer': {
			const slot = call.arguments.slot === 'footer' ? 'footer' : 'header'
			const text = String(call.arguments.text ?? '').trim()
			const variant = String(call.arguments.variant ?? 'default')
			const where = variant === 'first' ? ' (first page)' : variant === 'even' ? ' (even pages)' : ''
			return text ? `Set ${slot}${where} - “${text.slice(0, 40)}”` : `Clear the ${slot}${where}`
		}
		case 'set_page_numbering': {
			if (call.arguments.preset === 'academic')
				return 'Set academic page numbering (i, ii… then 1, 2… from BAB I)'
			const parts = [
				call.arguments.format ? String(call.arguments.format) : null,
				typeof call.arguments.start_at === 'number' ? `start at ${call.arguments.start_at}` : null,
				call.arguments.show === false ? 'hidden' : null,
				call.arguments.show_on_first_page === false ? 'not on the first page' : null,
				typeof call.arguments.position === 'string' ? String(call.arguments.position) : null,
			].filter(Boolean)
			const where = call.arguments.from_heading
				? ` from "${String(call.arguments.from_heading).slice(0, 40)}"`
				: call.arguments.scope === 'this_page'
					? ' for this page'
					: call.arguments.scope === 'from_here'
						? ' from here on'
						: ''
			return `Set page numbering${where}${parts.length > 0 ? ` - ${parts.join(', ')}` : ''}`
		}
		case 'insert_section_break': {
			const parts = [
				String(call.arguments.size ?? '').toUpperCase() || null,
				call.arguments.orientation === 'landscape' ? 'landscape' : null,
				Number(call.arguments.columns) > 1 ? `${call.arguments.columns} columns` : null,
			].filter(Boolean)
			return `Start a new section${parts.length > 0 ? ` - ${parts.join(', ')}` : ''}`
		}
		case 'insert_toc': {
			const kind = call.arguments.list_kind
			return kind === 'gambar'
				? 'Insert list of figures'
				: kind === 'tabel'
					? 'Insert list of tables'
					: 'Insert table of contents'
		}
		case 'set_toc_options':
			return 'Update table-of-contents settings'
		case 'apply_template_format':
			return `Apply document format: ${call.arguments.template ?? '?'}`
		case 'insert_mermaid':
			return 'Insert Mermaid diagram'
		case 'insert_diagram':
			return 'Insert editorial diagram'
		case 'draw_diagram':
			return `Draw ${String(call.arguments.type ?? 'diagram')} diagram`
		case 'redraw_diagram':
			return `Redraw diagram: ${String(call.arguments.change ?? '').slice(0, 60)}`
		case 'insert_html_block':
			return 'Insert HTML design block'
		case 'convert_to_html_block':
			return 'Render existing HTML as a design block'
		case 'insert_table':
			return `Insert table ${call.arguments.rows ?? '?'}×${call.arguments.cols ?? '?'}`
		case 'apply_paragraph_style':
			return call.arguments.style === 'heading'
				? `Make “${String(call.arguments.find ?? '').slice(0, 40)}…” a heading ${call.arguments.level ?? ''}`
				: `Make “${String(call.arguments.find ?? '').slice(0, 40)}…” a paragraph`
		case 'format_text': {
			const marks = ['bold', 'italic', 'underline', 'strike', 'highlight', 'color'].filter(
				(key) => call.arguments[key],
			)
			return `Format “${String(call.arguments.find ?? '').slice(0, 40)}…” (${marks.join(', ')})`
		}
		case 'set_alignment':
			return `Align ${scopeLabel(call)} ${String(call.arguments.align ?? '')}`
		case 'set_indent': {
			const parts = [
				call.arguments.left_cm !== undefined ? `left ${call.arguments.left_cm}cm` : null,
				call.arguments.right_cm !== undefined ? `right ${call.arguments.right_cm}cm` : null,
				call.arguments.first_line_cm !== undefined ? `first line ${call.arguments.first_line_cm}cm` : null,
			].filter(Boolean)
			return `Indent ${scopeLabel(call)} (${parts.join(', ') || 'no change'})`
		}
		case 'set_spacing': {
			const parts = [
				call.arguments.line_height !== undefined ? `line ${call.arguments.line_height}` : null,
				call.arguments.space_before_pt !== undefined ? `before ${call.arguments.space_before_pt}pt` : null,
				call.arguments.space_after_pt !== undefined ? `after ${call.arguments.space_after_pt}pt` : null,
			].filter(Boolean)
			return `Space ${scopeLabel(call)} (${parts.join(', ') || 'no change'})`
		}
		case 'set_font': {
			const parts = [
				call.arguments.family ? String(call.arguments.family) : null,
				call.arguments.size_pt !== undefined ? `${call.arguments.size_pt}pt` : null,
			].filter(Boolean)
			return `Font of ${scopeLabel(call)} → ${parts.join(' ') || 'no change'}`
		}
		case 'toggle_list':
			return call.arguments.kind === 'none'
				? `Turn “${String(call.arguments.find ?? '').slice(0, 40)}…” back into paragraphs`
				: `Make “${String(call.arguments.find ?? '').slice(0, 40)}…” a ${call.arguments.kind} list`
		case 'set_columns':
			return Number(call.arguments.count) <= 1
				? `Remove columns from ${scopeLabel(call)}`
				: `Lay ${scopeLabel(call)} out in ${call.arguments.count} columns`
		case 'insert_footnote':
			return `Footnote on “${String(call.arguments.quote ?? '').slice(0, 40)}…”`
		case 'restructure_section':
			return `${String(call.arguments.action ?? '')} section ${call.arguments.heading_index ?? '?'}`
		case 'insert_image':
			return 'Insert image'
		case 'create_tab':
			return `Create tab “${String(call.arguments.title ?? '').slice(0, 40) || 'baru'}”`
		case 'rename_document':
			return `Rename the document to “${String(call.arguments.title ?? '').slice(0, 40)}”`
		case 'rename_tab':
			return `Rename ${call.arguments.tab_id ? `tab ${String(call.arguments.tab_id).slice(0, 12)}` : 'this tab'} to “${String(call.arguments.title ?? '').slice(0, 40)}”`
		/* Pertanyaan tidak pernah menjadi kartu aksi - chat menggambarnya sendiri -
		 * tapi ringkasan langkah dan riwayat tetap butuh kalimatnya. */
		case 'ask_user': {
			const count = Array.isArray(call.arguments.questions) ? call.arguments.questions.length : 0
			return `Ask the writer ${count === 1 ? 'a question' : `${count} questions`}`
		}
		case 'request_brief':
			return 'Ask the writer to fill in the research brief'
		case 'insert_template_part':
			return call.arguments.part === 'cover'
				? 'Insert the cover page'
				: call.arguments.part === 'approval'
					? 'Insert the approval page'
					: 'Insert the cover and approval pages'
		default:
			return call.name
	}
}

/**
 * Judul yang dikirim model dirapikan sebelum dipakai: satu baris, tanpa spasi
 * berlebih, dan tidak melebihi batas judul yang diterima server.
 */
function cleanTitle(value: unknown): string {
	return String(value ?? '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, MAX_TITLE_CHARS)
}

/** Letak nomor dari argumen alat; yang tidak disebut ikut aturan sebelumnya. */
function positionsOf(
	args: Record<string, unknown>,
	base: PageNumbering,
): { position?: PageNumberPosition; openingPosition?: PageNumberPosition } {
	const placed = (value: unknown): PageNumberPosition | undefined =>
		PAGE_NUMBER_POSITIONS.includes(value as PageNumberPosition) ? (value as PageNumberPosition) : undefined
	const position = placed(args.position) ?? base.position
	const openingPosition = placed(args.opening_position) ?? base.openingPosition
	return { ...(position ? { position } : {}), ...(openingPosition ? { openingPosition } : {}) }
}

function scopeLabel(call: ToolCall): string {
	const find = String(call.arguments.find ?? '')
	return find ? `“${find.slice(0, 32)}…”` : 'the whole document'
}

/* Satuan panduan penulisan → piksel 96 dpi, satuan yang dipakai atribut node. */
const PX_PER_CM = 96 / 2.54

const PX_PER_PT = 96 / 72

function layoutRange(editor: Editor, call: ToolCall): { from: number; to: number } | null {
	const find = typeof call.arguments.find === 'string' ? call.arguments.find : ''
	if (!find.trim()) return { from: 0, to: editor.state.doc.content.size }
	return findExactRange(editor, find)
}

function cmToPx(cm: number): number {
	return Math.round((cm / 2.54) * INCH)
}

function pageSetupFromArgs(args: Record<string, unknown>, base: PageSetup): PageSetup {
	const next: PageSetup = { ...base, margins: { ...base.margins } }

	if (typeof args.size === 'string' && args.size in PAGE_SIZES) {
		next.size = args.size as PageSetup['size']
	}
	if (args.orientation === 'portrait' || args.orientation === 'landscape') {
		next.orientation = args.orientation
	}
	if (args.margins_cm && typeof args.margins_cm === 'object') {
		const input = args.margins_cm as Record<string, unknown>
		for (const side of ['top', 'bottom', 'left', 'right'] as const) {
			const value = Number(input[side])
			if (Number.isFinite(value) && value >= 0) next.margins[side] = cmToPx(value)
		}
	}
	if (typeof args.page_color === 'string') next.pageColor = args.page_color || null
	if (typeof args.pageless === 'boolean') next.pageless = args.pageless
	next.margins = clampMargins(next.margins, next)
	return next
}

function pageSetupPatch(args: Record<string, unknown>, base: PageSetup): Partial<PageSetup> | null {
	const merged = pageSetupFromArgs(args, base)
	const patch: Partial<PageSetup> = {}

	if (typeof args.size === 'string' && args.size in PAGE_SIZES) patch.size = merged.size
	if (args.orientation === 'portrait' || args.orientation === 'landscape') {
		patch.orientation = merged.orientation
	}
	if (args.margins_cm && typeof args.margins_cm === 'object') patch.margins = merged.margins

	return Object.keys(patch).length > 0 ? patch : null
}

function columnsFromArgs(count: number, gapCm: unknown): { count: number; gap?: number } | null {
	if (count < 2) return null
	const gap = Number(gapCm)
	return Number.isFinite(gap) && gap > 0 ? { count, gap: cmToPx(gap) } : { count }
}

const PAGE_NUMBER_FORMATS: readonly string[] = [
	'decimal',
	'lower-roman',
	'upper-roman',
	'lower-alpha',
	'upper-alpha',
]

const ANALYSIS_MODULES: readonly string[] = ['ai_detector', 'ai_rewriter', 'humanizer', 'plagiarism']

const SELECTION_NEUTRAL_TOOLS: readonly string[] = [
	'set_alignment',
	'set_indent',
	'set_spacing',
	'set_font',
	'toggle_list',
	'set_columns',
	'format_text',
	'apply_paragraph_style',
]

export function applyWriteTool(context: WriteToolContext, call: ToolCall): ToolOutcome {
	const { editor } = context
	const before = { from: editor.state.selection.from, to: editor.state.selection.to }
	const sizeBefore = editor.state.doc.content.size

	const outcome = runWriteTool(context, call)

	if (SELECTION_NEUTRAL_TOOLS.includes(call.name) && editor.state.doc.content.size === sizeBefore) {
		editor.commands.setTextSelection(before)
	}

	return outcome
}

function runWriteTool(context: WriteToolContext, call: ToolCall): ToolOutcome {
	const { editor } = context

	switch (call.name) {
		case 'insert_content': {
			const markdown = withoutFigureLines(String(call.arguments.markdown ?? ''))
			if (!markdown.trim()) return { ok: false, message: 'Nothing to insert.' }
			if (svgInProse(markdown)) return { ok: false, message: SVG_IN_PROSE }

			/*
			 * Sisipan di kursor adalah tebakan: kursor berada di mana pun sisipan
			 * terakhir berakhir. Naskah panjang ditulis tidak berurutan - halaman
			 * judul, lalu bab, lalu daftar pustaka, lalu kembali ke kata
			 * pengantar - jadi `after_heading` menaruhnya di akhir bagian yang
			 * disebut, di mana pun kursornya.
			 */
			const section = cleanTitle(call.arguments.after_heading)
			if (section) {
				const list = headings(editor)
				const at = list.findIndex((heading) => sameTitle(heading.text, section))
				if (at === -1) {
					return {
						ok: false,
						message: `No heading "${section}" in the document. Call get_outline and use a heading exactly as listed.`,
					}
				}
				/* Pindah halaman yang menutup bagian itu tetap menutupnya: sisipan
				 * jatuh sebelum pemenggal, bukan sesudahnya - kalau tidak, pemenggal
				 * bawaan sisipan bertemu pemenggal lama dan lahirlah halaman kosong. */
				let end = sectionEnd(editor, list, at)
				for (;;) {
					const before = editor.state.doc.resolve(end).nodeBefore
					if (before?.type.name !== PAGE_BREAK_NODE) break
					end -= before.nodeSize
				}
				// Judul bagian itu sendiri yang diulang di awal hanya menjadi duplikat.
				const body = dropLeadingTitle(markdown, list[at].text)
				if (!body.trim()) return { ok: false, message: 'Nothing to insert besides the heading itself.' }
				// Bagian yang masih kosong diisi, bukan ditambahi di bawah paragraf kosong template.
				if (sectionIsEmpty(editor.state.doc, at)) return writeSection(editor, at, body)
				editor
					.chain()
					.insertContentAt(end, toEditorContent(promoteSectionTitles(body)))
					.run()
				return { ok: true, message: `Inserted at the end of "${list[at].text}".` }
			}

			/* Bab yang sudah ada dan masih kosong diisi di tempatnya, bukan
			 * digandakan di kursor atau di akhir dokumen - lihat `emptyChapterFor`. */
			const chapter = emptyChapterFor(editor.state.doc, markdown)
			if (chapter !== null) {
				const outcome = writeSection(editor, chapter, markdown)
				return outcome.ok
					? {
							ok: true,
							message: `The document already had an empty "${headings(editor)[chapter].text}" section; wrote the content there instead of adding a second heading. ${outcome.message}`,
						}
					: outcome
			}

			/* Bab bernomor punya tempat yang pasti menurut nomornya - lihat `chapterSlot`. */
			const slot = chapterSlot(editor.state.doc, promoteSectionTitles(markdown))
			if (slot?.kind === 'existing') {
				if (!slot.empty) {
					return {
						ok: false,
						message: `Not carried out: the document already has "${slot.title}" (index ${slot.index}) with content. Rewrite it with write_section, or give the new chapter the next free number.`,
					}
				}
				if (!slot.body.trim()) return { ok: false, message: 'Nothing to insert besides the chapter heading.' }
				const outcome = writeSection(editor, slot.index, slot.body)
				return outcome.ok
					? {
							ok: true,
							message: `The document already had an empty "${slot.title}"; wrote the content there instead of adding a second chapter with that number. ${outcome.message}`,
						}
					: outcome
			}
			if (slot) {
				editor.chain().insertContentAt(slot.pos, toEditorContent(slot.markdown)).run()
				return {
					ok: true,
					message: `Inserted ${slot.side} "${slot.neighbour}", where the chapter number puts it.`,
				}
			}

			/*
			 * "Akhir dokumen" adalah sesudah blok terakhir, bukan kursor di teks
			 * terakhir: kalau naskah berakhir dengan daftar bernomor, kursor itu
			 * ada di butir terakhirnya, dan KATA PENGANTAR yang disisipkan di sana
			 * menjadi butir daftar di bawah Saran BAB V. Sisipan berjudul di
			 * dalam daftar atau kutipan keluar ke sesudah bloknya, dengan alasan
			 * yang sama.
			 */
			const html = toEditorContent(promoteSectionTitles(markdown))
			if (call.arguments.position === 'end') {
				// Paragraf kosong penutup dokumen tetap penutup - sisipan jatuh
				// sebelumnya, bukan meninggalkannya sebagai celah di antara bagian.
				const { doc } = editor.state
				const last = doc.lastChild
				const trailingEmpty = last?.type.name === 'paragraph' && last.content.size === 0
				editor
					.chain()
					.insertContentAt(doc.content.size - (trailingEmpty ? last.nodeSize : 0), html)
					.run()
				return { ok: true, message: 'Inserted at the end of the document.' }
			}
			const { $from } = editor.state.selection
			if ($from.depth > 1 && /^\s*#{1,6}\s/m.test(markdown)) {
				editor.chain().insertContentAt($from.after(1), html).run()
				return { ok: true, message: 'Inserted after the list the cursor was in.' }
			}
			insertChain(editor).insertContent(html).run()

			return { ok: true, message: 'Inserted.' }
		}

		case 'replace_text': {
			const find = String(call.arguments.find ?? '')
			const replace = String(call.arguments.replace ?? '')
			if (!find) return { ok: false, message: 'Nothing to find.' }
			if (find.split('\n').some((line) => parseFigureLine(line))) {
				return {
					ok: false,
					message:
						'Not carried out: find includes a [Figure: …] line, and a figure is not text. Replace the text before or after it on its own, or rewrite the section with write_section and keep the figure line there.',
				}
			}

			const index = buildTextIndex(editor.state.doc)
			const span = resolveSpan(index.text, find, 0)
			const range = span ? textRangeToPM(index, span.offset, span.length) : null
			if (!range) return { ok: false, message: PASSAGE_GONE }

			if (svgInProse(replace)) return { ok: false, message: SVG_IN_PROSE }
			if (insideFigure(editor.state.doc, range.from) || insideFigure(editor.state.doc, range.to)) {
				return {
					ok: false,
					message:
						'Not carried out: that passage is inside a figure, not in the text. Change a diagram with redraw_diagram.',
				}
			}

			// Heading yang tersentuh tetap heading - lihat `planTextReplace`.
			const plan = planTextReplace(editor.state.doc, range.from, range.to, replace)
			if (!plan.ok) return plan
			const figures = keepFigures(editor.state.doc, plan.from, plan.to, plan.markdown)
			editor
				.chain()
				.insertContentAt({ from: plan.from, to: plan.to }, toEditorContent(figures.markdown))
				.command(({ tr }) => {
					placeFigures(tr, figures.slots)
					return true
				})
				.run()
			return { ok: true, message: `Replaced.${figureNote([figures])}` }
		}

		case 'write_section': {
			const markdown = String(call.arguments.markdown ?? '')
			if (!markdown.trim()) return { ok: false, message: 'Nothing to write.' }
			const target = sectionTarget(headings(editor), call.arguments)
			if (typeof target === 'string') return { ok: false, message: target }
			return writeSection(editor, target, markdown)
		}

		case 'insert_math': {
			const latex = stripDelimiters(String(call.arguments.latex ?? ''))
			if (!latex) return { ok: false, message: 'Nothing to insert.' }
			insertChain(editor)
				.setMath(latex, call.arguments.display === true)
				.run()
			return { ok: true, message: 'Formula inserted.' }
		}

		case 'insert_page_break':
			insertChain(editor).setPageBreak().run()
			return { ok: true, message: 'Page break inserted.' }

		case 'add_comment': {
			const quote = String(call.arguments.quote ?? '')
			const body = String(call.arguments.body ?? '')
			if (!quote || !body) return { ok: false, message: 'Comment needs a quote and a body.' }

			const index = buildTextIndex(editor.state.doc)
			const at = index.text.indexOf(quote)
			if (at === -1) return { ok: false, message: PASSAGE_GONE }

			const range = textRangeToPM(index, at, quote.length)
			if (!range) return { ok: false, message: 'Could not anchor the comment.' }

			const id = `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
			editor.chain().focus().setTextSelection(range).setMark(COMMENT_MARK, { commentId: id }).run()
			const at_ = Date.now()
			context.addComment({
				id,
				quote: quote.slice(0, 300),
				author: 'AI Assistant',
				authorId: 'ai-assistant',
				replies: [{ author: 'AI Assistant', authorId: 'ai-assistant', text: body, at: at_ }],
				resolved: false,
				createdAt: at_,
			})
			context.openPanel('comments')
			return { ok: true, message: 'Comment added.' }
		}

		case 'run_module': {
			const module = String(call.arguments.module ?? '')
			if (module === 'proofreader') {
				context.openPanel('proofreader')
				return { ok: true, message: 'Proofreader opened.' }
			}
			if (!ANALYSIS_MODULES.includes(module)) {
				return { ok: false, message: `Unknown module: ${module}` }
			}

			context.runModule(module as AnalysisFeature)
			return { ok: true, message: `${module} started.` }
		}

		case 'set_page_setup': {
			const args = call.arguments
			const next = pageSetupFromArgs(args, context.setup)
			if (isSectionScope(args.scope)) {
				const range = sectionRange(editor, args.scope)
				if (!range) {
					return { ok: false, message: 'Could not tell which page that is; the document has no pages yet.' }
				}
				editor.chain().focus().applySectionSetup(next, range, context.setup).run()
				return {
					ok: true,
					message:
						args.scope === 'this_page'
							? 'Layout changed for this page only.'
							: 'Layout changed from here onwards.',
				}
			}

			const scope = args.scope === 'tab' ? 'tab' : 'document'
			context.setPageSetup(next, scope)
			return { ok: true, message: scope === 'tab' ? 'Tab layout updated.' : 'Document layout updated.' }
		}

		case 'set_header_footer': {
			const args = call.arguments
			if (args.slot !== 'header' && args.slot !== 'footer') {
				return { ok: false, message: 'slot must be "header" or "footer".' }
			}
			const slot: FurnitureSlot = args.slot
			const variant: FurnitureVariant =
				args.variant === 'first' || args.variant === 'even' ? args.variant : 'default'
			const align: PageFurnitureLine['align'] =
				args.align === 'center' || args.align === 'right' ? args.align : 'left'
			const text = String(args.text ?? '').trim()

			return context.setFurnitureLine(slot, variant, text ? { text, align } : null)
		}

		case 'set_page_numbering': {
			const args = call.arguments

			if (args.preset === 'academic') {
				const outcome = applyAcademicNumbering(context)
				if (outcome.ok) context.markNumberingPreset(outcome.front ? 'academic' : 'academic-body')
				return { ok: outcome.ok, message: outcome.message }
			}

			/* Sampul tanpa nomor adalah sumbunya sendiri: ia berlaku untuk tab utuh
			 * dan tidak menyentuh deret angkanya, jadi diterapkan lebih dulu dan
			 * boleh berdiri sendiri tanpa argumen penomoran lain. */
			let firstPage = ''
			if (typeof args.show_on_first_page === 'boolean') {
				const outcome = context.setFirstPageSeparate(args.show_on_first_page === false)
				if (!outcome.ok) return outcome
				firstPage =
					args.show_on_first_page === false
						? ' The first page now has its own empty header/footer, so it carries no number.'
						: ' The first page follows the same header/footer as the rest.'
			}

			const base = context.setup.pageNumbering ?? {
				format: 'decimal' as PageNumberFormat,
				restart: 'continue',
			}
			const startAt = Number(args.start_at)
			const next: PageNumbering = {
				format: PAGE_NUMBER_FORMATS.includes(String(args.format))
					? (args.format as PageNumberFormat)
					: base.format,
				restart:
					args.continue_numbering === true
						? 'continue'
						: Number.isFinite(startAt) && args.start_at !== undefined
							? Math.max(0, Math.floor(startAt))
							: base.restart,
				show: typeof args.show === 'boolean' ? args.show : base.show !== false,
				...positionsOf(args, base),
			}

			/*
			 * Mulai dari sebuah judul, bukan dari kursor: model tidak memegang
			 * kursor, dan "from_here" dulu menaruh pergantian romawi-ke-angka di
			 * mana pun sisipan terakhirnya berakhir.
			 */
			const fromHeading = cleanTitle(args.from_heading)
			if (fromHeading) {
				const target = headings(editor).find((heading) => sameTitle(heading.text, fromHeading))
				if (!target) {
					return {
						ok: false,
						message: `No heading "${fromHeading}" in the document. Call get_outline and use a heading exactly as listed.`,
					}
				}
				const { tr, schema } = editor.state
				placeSectionNumbering(tr, schema, target.pos, next)
				editor.view.dispatch(tr)
				return { ok: true, message: `Page numbering changed from "${target.text}" onwards.${firstPage}` }
			}

			if (isSectionScope(args.scope)) {
				const range = sectionRange(editor, args.scope)
				if (!range) {
					return { ok: false, message: 'Could not tell which page that is; the document has no pages yet.' }
				}
				editor.chain().focus().applySectionSetup({ pageNumbering: next }, range, context.setup).run()
				return {
					ok: true,
					message:
						(args.scope === 'this_page'
							? 'Page numbering changed for this page only.'
							: 'Page numbering changed from here onwards.') + firstPage,
				}
			}

			context.setPageSetup({ ...context.setup, pageNumbering: next }, 'tab')
			return { ok: true, message: `Page numbering updated for this tab.${firstPage}` }
		}

		case 'insert_section_break': {
			const args = call.arguments
			const type = editor.state.schema.nodes[SECTION_BREAK_NODE]
			if (!type) return { ok: false, message: 'This editor has no sections.' }

			const count = Number(args.columns)
			const attrs = {
				pageSetup: pageSetupPatch(args, context.setup),
				columns: Number.isInteger(count) ? columnsFromArgs(count, args.gap_cm) : null,
			}
			insertChain(editor).setSectionBreak(attrs).run()
			return { ok: true, message: 'Section break inserted.' }
		}

		case 'insert_template_part': {
			const { kind: fallback, values } = context.frontMatter()
			const kind = WORK_KINDS.includes(call.arguments.kind as WorkKind)
				? (call.arguments.kind as WorkKind)
				: fallback
			const request =
				call.arguments.part === 'cover' || call.arguments.part === 'approval' ? call.arguments.part : 'both'
			const { tr, schema } = editor.state
			const outcome = insertFrontMatter(tr, schema, request, kind, values)
			if (outcome.ok) editor.view.dispatch(tr)
			return outcome
		}

		case 'insert_toc': {
			const attrs = tocAttrsFromArgs(call.arguments)
			const kind = attrs.listKind ?? 'isi'
			const placement = tocPlacement(editor, kind, cleanTitle(call.arguments.after_heading))
			if ('error' in placement) return { ok: false, message: placement.error }

			editor
				.chain()
				.insertContentAt(placement.at, { type: TOC_BLOCK, attrs: clampedAttrs({ ...attrs, listKind: kind }) })
				.run()
			/* Blok yang baru disisipkan tidak dibiarkan terpilih: ketikan penulis
			 * berikutnya akan menggantikannya (lihat click-past-node-selection.ts). */
			const { state } = editor
			if (state.selection instanceof NodeSelection) {
				// Blok teks sesudahnya - pemenggal halaman di sana pun blok yang bisa terpilih.
				const $after = state.doc.resolve(state.selection.to)
				const text = Selection.findFrom($after, 1, true) ?? Selection.findFrom($after, -1, true)
				if (text) editor.view.dispatch(state.tr.setSelection(text))
			}
			return { ok: true, message: `${TOC_TITLE_LABEL[kind]} inserted under "${placement.heading}".` }
		}

		case 'set_toc_options': {
			const kindFilter = call.arguments.list_kind
			const matches: { pos: number; attrs: Record<string, unknown> }[] = []
			editor.state.doc.descendants((node, pos) => {
				if (node.type.name !== TOC_BLOCK) return true
				if (!kindFilter || node.attrs.listKind === kindFilter) matches.push({ pos, attrs: node.attrs })
				return false
			})

			const target = matches[Number(call.arguments.index) || 0]
			if (!target) return { ok: false, message: 'No matching table-of-contents block.' }

			const patch = tocAttrsFromArgs(call.arguments)
			editor.view.dispatch(
				editor.state.tr.setNodeMarkup(target.pos, undefined, { ...target.attrs, ...patch }),
			)
			return { ok: true, message: 'Table-of-contents settings updated.' }
		}

		case 'apply_template_format': {
			const slug = String(call.arguments.template ?? '').trim()
			const spec = slug ? context.templateSpecs.get(slug) : undefined
			if (!spec) return { ok: false, message: `Template "${slug}" tidak dikenal.` }
			/*
			 * Sekali saja. Penulis boleh mengatur ulang margin atau hurufnya
			 * sesudah itu, dan penerapan ulang diam-diam menimpa semuanya.
			 */
			if (context.appliedFormat() === slug && call.arguments.reapply !== true) {
				return {
					ok: false,
					message: `The ${slug} format is already applied to this document, and the writer may have adjusted margins or fonts since. Not applied again - carry on with the writing. Re-apply only when the writer explicitly asks to reset the format, with reapply: true.`,
				}
			}

			const { pageSetup, typography } = spec.layout
			context.markFormatApplied(slug)
			context.setPageSetup(pageSetup, 'document')
			if (typography) context.setTypography(typography, 'document')

			const cmOf = (px: number) => Math.round((px / INCH) * 2.54 * 10) / 10
			const margins = `${cmOf(pageSetup.margins.top)}/${cmOf(pageSetup.margins.right)}/${cmOf(pageSetup.margins.bottom)}/${cmOf(pageSetup.margins.left)} cm`
			const font = typography ? `, ${typography.baseFont.sizePt}pt spasi ${typography.lineHeight}` : ''

			/*
			 * Aturan menulisnya ikut dikembalikan di sini, bukan diserahkan ke
			 * `get_template_rules`: alat itu membaca slug template dari ringkasan
			 * dokumen **server**, sedangkan dokumen yang baru diformat lewat jalur
			 * ini boleh jadi belum pernah tersinkron. Menyuruh model memanggilnya
			 * akan dijawab "dokumen ini dibuat tanpa template" - padahal formatnya
			 * baru saja diterapkan.
			 */
			return {
				ok: true,
				message: [
					`Format ${slug} diterapkan: margin ${margins}${font}.`,
					`Citation style: ${spec.format.citationStyle}; heading scheme: ${spec.format.headingScheme}.`,
					...spec.aiRules.map((rule) => `- ${rule}`),
				].join('\n'),
			}
		}

		case 'insert_html_block': {
			const html = String(call.arguments.html ?? '').trim()
			if (!html) return { ok: false, message: 'Nothing to insert.' }

			const fit = call.arguments.fit === 'page' ? 'page' : 'embed'
			const height = Number(call.arguments.height)
			const at = figurePlacement(editor, call.arguments)
			if (typeof at === 'string') return { ok: false, message: at }
			/*
			 * Hasil rantainya dilaporkan apa adanya. Sebelumnya alat ini selalu
			 * menjawab "ok", jadi sisipan yang gagal tetap muncul di lini masa
			 * sebagai "Applied" - dan model melanjutkan seolah sampulnya ada.
			 */
			const inserted =
				at === null
					? insertChain(editor)
							.insertHtmlBlock({ html, fit, ...(height ? { height } : {}) })
							.run()
					: insertFigure(
							editor,
							{
								type: HTML_BLOCK,
								attrs: { ...DEFAULT_HTML_BLOCK_ATTRS, html, fit, ...(height ? { height } : {}) },
							},
							at,
						)
			if (!inserted) return { ok: false, message: 'The design block could not be inserted here.' }

			return {
				ok: true,
				message: `${fit === 'page' ? 'Full-page HTML design inserted.' : 'HTML design block inserted.'}${PLACED(at)}`,
			}
		}

		case 'convert_to_html_block': {
			const candidates = htmlCandidates(editor.state.doc)
			if (candidates.length === 0) {
				let diagrams = 0
				editor.state.doc.descendants((node) => {
					if (node.type.name === 'codeBlock' && figureOf(node)) diagrams += 1
					return !figureOf(node)
				})
				return {
					ok: false,
					message:
						diagrams > 0
							? 'No unrendered HTML in this document. The diagrams in it are already rendered figures and need no conversion; change one with redraw_diagram.'
							: 'No HTML-looking block found in this document. Use insert_html_block to create a new design.',
				}
			}

			const at = Number(call.arguments.index)
			const chosen = candidates[Number.isInteger(at) && at >= 0 ? at : 0]
			if (!chosen) return { ok: false, message: `No candidate with index ${call.arguments.index}.` }

			const fit = call.arguments.fit === 'embed' ? 'embed' : 'page'
			/*
			 * Diganti lewat rentangnya dalam satu rantai, bukan disisipkan lalu
			 * yang lama dihapus: HTML yang pecah bisa mencakup puluhan blok, dan
			 * dua langkah terpisah meninggalkan satu keadaan antara yang terlihat
			 * di kanvas semua orang yang sedang membuka dokumen itu.
			 */
			editor
				.chain()
				.focus()
				.deleteRange({ from: chosen.from, to: chosen.to })
				.insertContentAt(chosen.from, {
					type: HTML_BLOCK,
					attrs: { ...DEFAULT_HTML_BLOCK_ATTRS, html: chosen.html, fit },
				})
				.run()

			const where = chosen.source === 'codeBlock' ? 'a code block' : 'loose text blocks'
			return {
				ok: true,
				message: `Converted ${where} into a ${fit === 'page' ? 'full-page' : 'inline'} design block.`,
			}
		}

		case 'insert_mermaid': {
			const source = String(call.arguments.source ?? '').trim()
			if (!source) return { ok: false, message: 'Nothing to insert.' }
			const at = figurePlacement(editor, call.arguments)
			if (typeof at === 'string') return { ok: false, message: at }
			insertFigure(
				editor,
				{ type: 'codeBlock', attrs: { language: 'mermaid' }, content: [{ type: 'text', text: source }] },
				at,
			)
			return { ok: true, message: `Diagram inserted.${PLACED(at)}` }
		}

		/*
		 * Disisipkan mentah, tanpa disaring lebih dulu.
		 *
		 * Penyaringnya berjalan saat blok itu digambar (`diagram-svg.ts`), dan di
		 * situlah tempatnya: sumber yang tersimpan harus tetap sama dengan yang
		 * ditulis, supaya penulis melihat - dan bisa memperbaiki - apa yang
		 * sebenarnya ditolak. Menyaring di sini justru membuat penolakan itu
		 * lenyap tanpa jejak sebelum siapa pun sempat membacanya.
		 */
		case 'insert_diagram': {
			const source = String(call.arguments.source ?? '').trim()
			if (!source) return { ok: false, message: 'Nothing to insert.' }
			const at = figurePlacement(editor, call.arguments)
			if (typeof at === 'string') return { ok: false, message: at }
			insertDiagramBlock(editor, source, at)
			return { ok: true, message: `Diagram inserted.${PLACED(at)}` }
		}

		case 'insert_table': {
			const rows = Math.max(1, Math.min(50, Number(call.arguments.rows) || 0))
			const cols = Math.max(1, Math.min(12, Number(call.arguments.cols) || 0))
			const header = call.arguments.header_row !== false
			insertChain(editor).insertTable({ rows, cols, withHeaderRow: header }).run()
			return { ok: true, message: `Table ${rows}×${cols} inserted.` }
		}

		case 'apply_paragraph_style': {
			const find = String(call.arguments.find ?? '')
			if (!find) return { ok: false, message: 'Nothing to find.' }
			const range = findExactRange(editor, find)
			if (!range) return { ok: false, message: PASSAGE_GONE }

			const isHeading = call.arguments.style === 'heading'
			const level = Math.max(1, Math.min(9, Number(call.arguments.level) || 1))
			const typeName = isHeading ? 'heading' : 'paragraph'

			const { tr, schema } = editor.state
			const changed = setBlockStyle(tr, range, schema.nodes[typeName], isHeading ? { level } : {})
			if (changed === 0) return { ok: false, message: 'No paragraph covers that passage.' }
			editor.view.dispatch(tr)
			return { ok: true, message: isHeading ? `Heading ${level} applied.` : 'Paragraph style applied.' }
		}

		case 'format_text': {
			const find = String(call.arguments.find ?? '')
			if (!find) return { ok: false, message: 'Nothing to find.' }
			const range = findExactRange(editor, find)
			if (!range) return { ok: false, message: PASSAGE_GONE }

			const { tr, schema } = editor.state
			const marks: [string, Record<string, unknown>?][] = []
			if (call.arguments.bold) marks.push(['bold'])
			if (call.arguments.italic) marks.push(['italic'])
			if (call.arguments.underline) marks.push(['underline'])
			if (call.arguments.strike) marks.push(['strike'])
			if (call.arguments.highlight) marks.push(['highlight', { color: String(call.arguments.highlight) }])
			if (call.arguments.color) marks.push(['textStyle', { color: String(call.arguments.color) }])
			if (marks.length === 0) return { ok: false, message: 'No formatting requested.' }

			let applied = 0
			for (const [name, attrs] of marks) {
				const markType = schema.marks[name]
				if (!markType) continue
				tr.addMark(range.from, range.to, markType.create(attrs))
				applied += 1
			}
			if (applied === 0) return { ok: false, message: 'None of those marks exist in this editor.' }
			editor.view.dispatch(tr)
			return { ok: true, message: 'Formatted.' }
		}
		case 'set_alignment': {
			const align = String(call.arguments.align ?? '')
			if (!['left', 'center', 'right', 'justify'].includes(align)) {
				return { ok: false, message: `Unknown alignment: ${align}` }
			}
			const range = layoutRange(editor, call)
			if (!range) return { ok: false, message: PASSAGE_GONE }

			const ok = editor.chain().focus().setTextSelection(range).setTextAlign(align).run()
			return ok
				? { ok: true, message: `Aligned ${align}.` }
				: { ok: false, message: 'Nothing there could be aligned.' }
		}

		case 'set_indent': {
			const range = layoutRange(editor, call)
			if (!range) return { ok: false, message: PASSAGE_GONE }

			const patch: { left?: number; right?: number; firstLine?: number } = {}
			if (call.arguments.left_cm !== undefined) patch.left = Number(call.arguments.left_cm) * PX_PER_CM
			if (call.arguments.right_cm !== undefined) patch.right = Number(call.arguments.right_cm) * PX_PER_CM
			if (call.arguments.first_line_cm !== undefined) {
				patch.firstLine = Number(call.arguments.first_line_cm) * PX_PER_CM
			}
			if (Object.keys(patch).length === 0) return { ok: false, message: 'No indent given.' }
			if (Object.values(patch).some((value) => !Number.isFinite(value))) {
				return { ok: false, message: 'Indents must be numbers, in centimeters.' }
			}

			const ok = editor.chain().focus().setTextSelection(range).setBlockIndent(patch).run()
			return ok
				? { ok: true, message: 'Indent applied.' }
				: { ok: false, message: 'Nothing there could be indented.' }
		}

		case 'set_spacing': {
			const range = layoutRange(editor, call)
			if (!range) return { ok: false, message: PASSAGE_GONE }

			const lineHeight = call.arguments.line_height
			const before = call.arguments.space_before_pt
			const after = call.arguments.space_after_pt
			if (lineHeight === undefined && before === undefined && after === undefined) {
				return { ok: false, message: 'No spacing given.' }
			}

			const chain = editor.chain().focus().setTextSelection(range)
			if (lineHeight !== undefined) {
				const value = Number(lineHeight)
				if (!Number.isFinite(value) || value <= 0) {
					return { ok: false, message: 'line_height must be a positive multiplier.' }
				}
				chain.setLineHeight(String(value))
			}
			if (before !== undefined || after !== undefined) {
				chain.setBlockSpace({
					...(before !== undefined ? { before: Number(before) * PX_PER_PT } : {}),
					...(after !== undefined ? { after: Number(after) * PX_PER_PT } : {}),
				})
			}

			const ok = chain.run()
			return ok
				? { ok: true, message: 'Spacing applied.' }
				: { ok: false, message: 'Nothing there could be spaced.' }
		}

		case 'set_font': {
			const range = layoutRange(editor, call)
			if (!range) return { ok: false, message: PASSAGE_GONE }

			const family = typeof call.arguments.family === 'string' ? call.arguments.family.trim() : ''
			const size = call.arguments.size_pt
			if (!family && size === undefined) return { ok: false, message: 'No font given.' }

			const chain = editor.chain().focus().setTextSelection(range)
			if (family) chain.setFontFamily(family)
			if (size !== undefined) {
				const value = Number(size)
				if (!Number.isFinite(value) || value <= 0) {
					return { ok: false, message: 'size_pt must be a positive number of points.' }
				}
				chain.setFontSize(`${value}pt`)
			}

			const ok = chain.run()
			return ok
				? { ok: true, message: 'Font applied.' }
				: { ok: false, message: 'Font could not be applied.' }
		}

		case 'toggle_list': {
			const find = String(call.arguments.find ?? '')
			if (!find) return { ok: false, message: 'Nothing to find.' }
			const range = findExactRange(editor, find)
			if (!range) return { ok: false, message: PASSAGE_GONE }

			const kind = String(call.arguments.kind ?? '')
			const chain = editor.chain().focus().setTextSelection(range)
			if (kind === 'bullet') {
				if (!editor.isActive('bulletList')) chain.toggleBulletList()
			} else if (kind === 'ordered') {
				if (!editor.isActive('orderedList')) chain.toggleOrderedList()
			} else if (kind === 'none') {
				if (editor.isActive('bulletList')) chain.toggleBulletList()
				else if (editor.isActive('orderedList')) chain.toggleOrderedList()
			} else {
				return { ok: false, message: `Unknown list kind: ${kind}` }
			}

			const ok = chain.run()
			return ok
				? { ok: true, message: kind === 'none' ? 'Turned back into paragraphs.' : `${kind} list applied.` }
				: { ok: false, message: 'That passage could not become a list.' }
		}

		case 'set_columns': {
			const count = Number(call.arguments.count)
			if (!Number.isInteger(count) || count < 1 || count > 3) {
				return { ok: false, message: 'count must be 1, 2 or 3.' }
			}
			if (isSectionScope(call.arguments.scope)) {
				const scoped = sectionRange(editor, call.arguments.scope)
				if (!scoped) {
					return { ok: false, message: 'Could not tell which page that is; the document has no pages yet.' }
				}
				const ok = editor
					.chain()
					.focus()
					.applySectionColumns(columnsFromArgs(count, call.arguments.gap_cm), scoped, context.setup)
					.run()
				return ok
					? {
							ok: true,
							message:
								count === 1
									? 'Columns removed for that section.'
									: `${count} columns applied to that section.`,
						}
					: { ok: false, message: 'The column layout could not be changed.' }
			}

			const range = layoutRange(editor, call)
			if (!range) return { ok: false, message: PASSAGE_GONE }

			const chain = editor.chain().focus().setTextSelection(range)
			const ok = count === 1 ? chain.unsetColumns().run() : chain.setColumns(count).run()
			return ok
				? { ok: true, message: count === 1 ? 'Columns removed.' : `${count} columns applied.` }
				: { ok: false, message: 'The column layout could not be changed.' }
		}

		case 'insert_footnote': {
			const quote = String(call.arguments.quote ?? '')
			const body = String(call.arguments.body ?? '')
			if (!quote) return { ok: false, message: 'Nothing to find.' }
			if (!body.trim()) return { ok: false, message: 'The footnote has no text.' }

			const range = findExactRange(editor, quote)
			if (!range) return { ok: false, message: PASSAGE_GONE }

			const footnoteType = editor.state.schema.nodes.footnote
			if (!footnoteType) return { ok: false, message: 'This editor has no footnotes.' }
			const ok = editor
				.chain()
				.focus()
				.setTextSelection(range.to)
				.insertFootnote(`fn-${Date.now()}`)
				.command(({ tr, dispatch }) => {
					if (dispatch)
						tr.insert(tr.doc.content.size, footnoteType.create(null, editor.state.schema.text(body)))
					return true
				})
				.run()

			return ok
				? { ok: true, message: 'Footnote added.' }
				: { ok: false, message: 'The footnote could not be inserted.' }
		}

		case 'restructure_section': {
			const list = headings(editor)
			const at = Number(call.arguments.heading_index)
			if (!Number.isInteger(at) || at < 0 || at >= list.length) {
				return { ok: false, message: `No heading with index ${call.arguments.heading_index}.` }
			}

			const from = list[at].pos
			const to = sectionEnd(editor, list, at)
			const action = String(call.arguments.action ?? '')

			if (action === 'promote' || action === 'demote') {
				const node = editor.state.doc.nodeAt(from)
				if (!node) return { ok: false, message: 'Section not found.' }
				const level = (node.attrs.level as number) ?? 1
				const next = action === 'promote' ? Math.max(1, level - 1) : Math.min(9, level + 1)
				editor.view.dispatch(editor.state.tr.setNodeMarkup(from, undefined, { ...node.attrs, level: next }))
				return { ok: true, message: `Heading is now level ${next}.` }
			}

			if (action === 'delete') {
				editor.view.dispatch(editor.state.tr.delete(from, to))
				return { ok: true, message: 'Section deleted.' }
			}

			if (action === 'move_before') {
				const targetIndex = Number(call.arguments.target_index)
				if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= list.length) {
					return { ok: false, message: 'move_before needs a valid target_index.' }
				}
				const targetPos = list[targetIndex].pos
				if (targetPos >= from && targetPos < to) {
					return { ok: false, message: 'Cannot move a section into itself.' }
				}

				const { tr } = editor.state
				const slice = editor.state.doc.slice(from, to)
				tr.delete(from, to)
				const insertAt = targetPos > to ? targetPos - (to - from) : targetPos
				tr.insert(insertAt, slice.content)
				editor.view.dispatch(tr)
				return { ok: true, message: 'Section moved.' }
			}

			return { ok: false, message: `Unknown action: ${action}` }
		}

		case 'insert_image': {
			const src = String(call.arguments.src ?? '')
			const verdict = publicImageUrl(src)
			if (verdict) return { ok: false, message: verdict }

			const at = figurePlacement(editor, call.arguments)
			if (typeof at === 'string') return { ok: false, message: at }
			const alt = String(call.arguments.alt ?? '') || null
			if (at === null) insertChain(editor).setImage({ src, alt }).run()
			else insertFigure(editor, { type: 'image', attrs: { src, alt } }, at)
			return { ok: true, message: `Image inserted.${PLACED(at)}` }
		}

		case 'create_tab': {
			const title = typeof call.arguments.title === 'string' ? call.arguments.title : undefined
			const markdown = typeof call.arguments.markdown === 'string' ? call.arguments.markdown : undefined
			context.createTab(title, markdown)
			return { ok: true, message: `Tab "${title ?? 'baru'}" created.` }
		}

		case 'rename_document': {
			const title = cleanTitle(call.arguments.title)
			if (!title) return { ok: false, message: 'A title is required.' }
			return context.renameDocument(title)
		}

		case 'rename_tab': {
			const title = cleanTitle(call.arguments.title)
			if (!title) return { ok: false, message: 'A title is required.' }
			const tabId = typeof call.arguments.tab_id === 'string' ? call.arguments.tab_id.trim() : ''
			return context.renameTab(tabId || undefined, title)
		}

		default:
			return { ok: false, message: `Unknown tool: ${call.name}` }
	}
}

const WORK_KINDS: readonly WorkKind[] = ['skripsi', 'tesis', 'disertasi', 'proposal']

const TOC_TITLE_LABEL: Record<TocListKind, string> = {
	isi: 'Table of contents',
	gambar: 'List of figures',
	tabel: 'List of tables',
}

/* Judul yang lazim di atas tiap jenis daftar, Indonesia dan Inggris. */
const TOC_HEADINGS: Record<TocListKind, RegExp> = {
	isi: /^(daftar isi|table of contents|contents)$/i,
	gambar: /^(daftar gambar|list of figures)$/i,
	tabel: /^(daftar tabel|list of tables)$/i,
}

/**
 * Tempat daftar isi: tepat di bawah judulnya ("Daftar Isi"), bukan di kursor.
 *
 * Model menulis naskah panjang dalam beberapa gelombang dan baru ingat daftar
 * isi di tengah jalan; dulu blok itu mendarat di mana pun kursor berada -
 * pernah di tengah BAB V. Tanpa judul yang bisa dijadikan patokan, lebih baik
 * menolak dan menyuruh model membuat judulnya di tempat yang benar daripada
 * menebak.
 */
function tocPlacement(
	editor: Editor,
	kind: TocListKind,
	afterHeading: string,
): { at: number; heading: string } | { error: string } {
	let existing = false
	editor.state.doc.descendants((node) => {
		if (node.type.name === TOC_BLOCK && (node.attrs.listKind ?? 'isi') === kind) existing = true
		return !existing
	})
	if (existing) {
		return {
			error: `The document already has a ${TOC_TITLE_LABEL[kind].toLowerCase()} block. Change it with set_toc_options instead of inserting another.`,
		}
	}

	const list = headings(editor)
	const anchor = afterHeading
		? list.find((heading) => sameTitle(heading.text, afterHeading))
		: list.find((heading) => TOC_HEADINGS[kind].test(heading.text.replace(/\s+/g, ' ').trim()))
	if (!anchor) {
		return {
			error: afterHeading
				? `No heading "${afterHeading}" in the document. Call get_outline and use a heading exactly as listed.`
				: `No "Daftar ${kind === 'isi' ? 'Isi' : kind === 'gambar' ? 'Gambar' : 'Tabel'}" heading to place it under. Insert that heading where the list belongs first (insert_content with after_heading), then call insert_toc again - it goes directly under the heading.`,
		}
	}

	const node = editor.state.doc.nodeAt(anchor.pos)
	return { at: anchor.pos + (node?.nodeSize ?? 0), heading: anchor.text }
}

function tocAttrsFromArgs(args: Record<string, unknown>): Partial<TocBlockAttrs> {
	const attrs: Partial<TocBlockAttrs> = {}
	const listKind = args.list_kind ?? args.listKind
	if (listKind === 'isi' || listKind === 'gambar' || listKind === 'tabel') {
		attrs.listKind = listKind as TocListKind
	}
	if (args.style === 'plain' || args.style === 'dotted' || args.style === 'link') attrs.style = args.style
	if (typeof args.show_page_numbers === 'boolean') attrs.showPageNumbers = args.show_page_numbers
	if (
		args.tab_leader === 'none' ||
		args.tab_leader === 'dots' ||
		args.tab_leader === 'dashes' ||
		args.tab_leader === 'line'
	) {
		attrs.tabLeader = args.tab_leader
	}
	if (Number.isFinite(Number(args.min_level))) attrs.minLevel = Number(args.min_level)
	if (Number.isFinite(Number(args.max_level))) attrs.maxLevel = Number(args.max_level)
	if (Number.isFinite(Number(args.indent_cm))) {
		attrs.indentPerLevel = Math.round((Number(args.indent_cm) / 2.54) * INCH)
	}
	return attrs
}

function findExactRange(editor: Editor, find: string): { from: number; to: number } | null {
	const index = buildTextIndex(editor.state.doc)
	const at = index.text.indexOf(find)
	if (at === -1) return null
	return textRangeToPM(index, at, find.length)
}

function publicImageUrl(src: string): string | null {
	let url: URL
	try {
		url = new URL(src)
	} catch {
		return 'That is not a valid URL.'
	}
	if (url.protocol !== 'https:' && url.protocol !== 'http:') return 'Only http(s) URLs are allowed.'

	const host = url.hostname.toLowerCase()
	if (host === 'localhost' || host.endsWith('.local') || host === '::1' || host === '[::1]') {
		return 'Loopback addresses are not allowed.'
	}
	const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
	if (ipv4) {
		const [a, b] = [Number(ipv4[1]), Number(ipv4[2])]
		const privateRange =
			a === 10 ||
			a === 127 ||
			a === 0 ||
			(a === 172 && b >= 16 && b <= 31) ||
			(a === 192 && b === 168) ||
			(a === 169 && b === 254)
		if (privateRange) return 'Private or link-local addresses are not allowed.'
	}
	return null
}
