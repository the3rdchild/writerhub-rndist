'use client'

import type { AnalysisFeature, ToolCall } from '@writer-hub/shared'
import type { Editor } from '@tiptap/react'
import type { PanelId } from '@/features/analysis/panel-context'
import { COMMENT_MARK } from '@/features/comments/comment-mark'
import { buildTextIndex, textRangeToPM } from '@/features/document/tiptap-offsets'
import { replaceTextRange } from '@/features/editor/apply-text'
import { toEditorContent } from '@/features/editor/markdown'
import { MATH_BLOCK, MATH_INLINE, stripDelimiters } from '@/features/editor/math'
import {
	INCH,
	PAGE_SIZES,
	type PageSetup,
	clampMargins,
} from '@/features/editor/page-geometry'
import { TOC_BLOCK, type TocBlockAttrs, type TocListKind } from '@/features/editor/toc-block'
import type { CommentThread } from '@/features/sessions/types'
import { countWords } from '@/lib/utils'
import { editorPlainText } from '@/features/editor/text-content'

/**
 * Menjalankan alat yang diminta AI, di browser - karena editornya ada di sini.
 *
 * Alat baca dijalankan langsung dan hasilnya dikembalikan ke model, jadi ia
 * bisa membaca kerangka dokumen lalu memutuskan langkah berikutnya sendiri.
 * Alat tulis tidak: ia hanya diuraikan jadi kalimat, dan baru dijalankan kalau
 * pengguna menekan Apply.
 */

// ── alat baca ──────────────────────────────────────────────────────────────

interface Heading {
	index: number
	level: number
	text: string
	pos: number
}

function headings(editor: Editor): Heading[] {
	const found: Heading[] = []

	editor.state.doc.descendants((node, pos) => {
		if (node.type.name === 'heading') {
			found.push({
				index: found.length,
				level: node.attrs.level ?? 1,
				text: node.textContent.trim(),
				pos,
			})
		}
		return false
	})

	return found
}

/** Batas bawah sebuah bagian: heading berikutnya yang setara atau lebih tinggi. */
function sectionEnd(editor: Editor, list: Heading[], at: number): number {
	const current = list[at]
	for (let index = at + 1; index < list.length; index += 1) {
		if (list[index].level <= current.level) return list[index].pos
	}
	return editor.state.doc.content.size
}

const SNIPPET_RADIUS = 80
const MAX_HITS = 8
const MAX_SECTION_CHARS = 6_000
/** Batas teks satu tab yang dibaca lintas bab (read_tab). */
const MAX_TAB_CHARS = 20_000

/**
 * Yang dibutuhkan alat baca di luar editor: tata letak, daftar tab, komentar.
 * Dirakit chat-context dari sumbernya masing-masing (Y.Doc, bukan state basi).
 */
export interface ReadToolContext {
	editor: Editor
	/** Jumlah halaman dari plugin paginasi. */
	pageCount: number
	setup: PageSetup
	/** Tab pada dokumen aktif; id untuk read_tab, label untuk dikenali model. */
	tabs: { id: string; label: string; active: boolean }[]
	/** Teks polos sebuah tab; null bila id-nya tidak dikenal. */
	readTab: (tabId: string) => string | null
	comments: CommentThread[]
}

export function runReadTool(context: ReadToolContext, call: ToolCall): string {
	const { editor } = context
	switch (call.name) {
		case 'get_outline': {
			const list = headings(editor)
			if (list.length === 0) return 'The document has no headings.'
			return list
				.map((heading) => `${heading.index}. ${'#'.repeat(heading.level)} ${heading.text}`)
				.join('\n')
		}

		case 'read_section': {
			const list = headings(editor)
			const at = Number(call.arguments.heading_index)
			if (!Number.isInteger(at) || at < 0 || at >= list.length) {
				return `No heading with index ${call.arguments.heading_index}. Call get_outline first.`
			}

			const text = editor.state.doc.textBetween(list[at].pos, sectionEnd(editor, list, at), '\n', ' ')
			// Dipotong daripada membanjiri jendela konteks: model bisa meminta
			// bagian berikutnya kalau memang perlu.
			return text.length > MAX_SECTION_CHARS
				? `${text.slice(0, MAX_SECTION_CHARS)}\n…(truncated)`
				: text
		}

		case 'find_text': {
			const query = String(call.arguments.query ?? '')
			if (!query) return 'Empty query.'

			const { text } = buildTextIndex(editor.state.doc)
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
			const plain = editorPlainText(editor)
			const perLevel = new Map<number, number>()
			let tables = 0
			let images = 0
			let formulas = 0
			editor.state.doc.descendants((node) => {
				if (node.type.name === 'heading') {
					const level = (node.attrs.level as number) ?? 1
					perLevel.set(level, (perLevel.get(level) ?? 0) + 1)
				} else if (node.type.name === 'table') tables += 1
				else if (node.type.name === 'image') images += 1
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
				`Tables: ${tables}, images: ${images}, formulas: ${formulas}`,
			].join('\n')
		}

		case 'get_selection': {
			const { from, to, empty } = editor.state.selection
			if (empty) return 'No text is currently selected.'
			const text = editor.state.doc.textBetween(from, to, '\n', ' ')
			return `Selection (${from}..${to}):\n${text}`
		}

		case 'get_page_setup': {
			const { setup } = context
			const cm = (px: number) => Math.round((px / INCH) * 2.54 * 100) / 100
			const sizeLabel =
				setup.size === 'custom'
					? `custom (${setup.customWidth ?? 0}×${setup.customHeight ?? 0}px)`
					: (PAGE_SIZES[setup.size]?.label ?? setup.size)
			return [
				`Size: ${sizeLabel}, ${setup.orientation}`,
				`Margins (cm): top ${cm(setup.margins.top)}, bottom ${cm(setup.margins.bottom)}, left ${cm(setup.margins.left)}, right ${cm(setup.margins.right)}`,
				`Page color: ${setup.pageColor ?? 'theme default'}`,
				`Pageless: ${setup.pageless ? 'yes' : 'no'}`,
			].join('\n')
		}

		case 'list_tabs': {
			if (context.tabs.length === 0) return 'The document has no tabs.'
			return context.tabs
				.map((tab) => `${tab.id} — ${tab.label}${tab.active ? ' (active)' : ''}`)
				.join('\n')
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
					return `- "${thread.quote}" — ${first} (${thread.replies.length} repl${thread.replies.length === 1 ? 'y' : 'ies'})`
				})
				.join('\n')
		}

		// plan/think dicegat chat-context untuk efek lini masanya; sampai di sini
		// berarti tidak ada UI yang mendengarkan - jawab seadanya.
		case 'plan':
		case 'think':
			return 'OK.'

		default:
			return `Unknown read tool: ${call.name}`
	}
}

/** Label baris langkah lini masa untuk alat baca (§B1.3) - apa yang sedang dibuka. */
export function readToolLabel(editor: Editor, call: ToolCall): string {
	switch (call.name) {
		case 'get_outline':
			return 'Membaca kerangka dokumen'
		case 'read_section': {
			const at = Number(call.arguments.heading_index)
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
		case 'list_tabs':
			return 'Mendaftar tab dokumen'
		case 'read_tab': {
			const tabId = String(call.arguments.tab_id ?? '')
			return `Membaca tab ${tabId.slice(0, 12)}`
		}
		case 'get_comments':
			return 'Membaca komentar terbuka'
		default:
			return `Menjalankan ${call.name}`
	}
}

/**
 * Ringkasan satu baris dari hasil alat baca (§B1.2 `tool_result.summary`) -
 * cukup untuk mengenali hasilnya saat baris langkah dibuka, tanpa menyalin
 * isi penuhnya ke lini masa.
 */
export function summarizeToolResult(result: string): string {
	const lines = result.split('\n')
	const first = lines[0].slice(0, 100)
	return lines.length > 1 ? `${first} … (+${lines.length - 1} baris)` : first
}

// ── alat tulis ─────────────────────────────────────────────────────────────

export interface WriteToolContext {
	editor: Editor
	// Bentuk utasnya diambil dari sumbernya, bukan disalin ulang di sini: salinan
	// lama mematok `replies: []`, dan itulah yang membuat isi komentar buatan AI
	// hilang tanpa satu pun keluhan dari pemeriksa tipe.
	addComment: (thread: CommentThread) => void
	openPanel: (panel: PanelId) => void
	runModule: (feature: AnalysisFeature) => void
	/** Tata letak yang berlaku + penuliskannya (A1) - untuk set_page_setup. */
	setup: PageSetup
	setPageSetup: (setup: PageSetup, scope: 'document' | 'tab') => void
	/** Buat tab baru berisi naskah awal (create_tab). */
	createTab: (title: string | undefined, markdown: string | undefined) => void
}

export interface ToolOutcome {
	ok: boolean
	message: string
}

/** Kalimat pendek untuk kartu aksi - apa yang akan terjadi kalau Apply ditekan. */
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
			return `Set page layout${parts.length > 0 ? ` - ${parts.join(', ')}` : ''}`
		}
		case 'insert_toc': {
			const kind = call.arguments.list_kind
			return kind === 'gambar' ? 'Insert list of figures' : kind === 'tabel' ? 'Insert list of tables' : 'Insert table of contents'
		}
		case 'set_toc_options':
			return 'Update table-of-contents settings'
		case 'insert_mermaid':
			return 'Insert Mermaid diagram'
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
		case 'restructure_section':
			return `${String(call.arguments.action ?? '')} section ${call.arguments.heading_index ?? '?'}`
		case 'insert_image':
			return 'Insert image'
		case 'create_tab':
			return `Create tab “${String(call.arguments.title ?? '').slice(0, 40) || 'baru'}”`
		default:
			return call.name
	}
}

const ANALYSIS_MODULES: readonly string[] = ['ai_detector', 'ai_rewriter', 'humanizer', 'plagiarism']

export function applyWriteTool(context: WriteToolContext, call: ToolCall): ToolOutcome {
	const { editor } = context

	switch (call.name) {
		case 'insert_content': {
			const markdown = String(call.arguments.markdown ?? '')
			if (!markdown.trim()) return { ok: false, message: 'Nothing to insert.' }

			const chain = editor.chain().focus()
			if (call.arguments.position === 'end') chain.setTextSelection(editor.state.doc.content.size)
			chain.insertContent(toEditorContent(markdown)).run()

			return { ok: true, message: 'Inserted.' }
		}

		case 'replace_text': {
			const find = String(call.arguments.find ?? '')
			const replace = String(call.arguments.replace ?? '')
			if (!find) return { ok: false, message: 'Nothing to find.' }

			// offset/length nol memaksa pencarian lewat teks aslinya - model tidak
			// pernah tahu offset, ia hanya bisa mengutip.
			const ok = replaceTextRange(editor, { offset: 0, length: 0, expected: find }, replace)
			return ok
				? { ok: true, message: 'Replaced.' }
				: { ok: false, message: 'That passage is no longer in the document.' }
		}

		case 'insert_math': {
			const latex = stripDelimiters(String(call.arguments.latex ?? ''))
			if (!latex) return { ok: false, message: 'Nothing to insert.' }

			// Pembatas $ dibuang kalau model tetap mengirimnya - instruksinya sudah
			// menyebut tanpa $, tapi model tidak selalu menurut.
			editor.chain().focus().setMath(latex, call.arguments.display === true).run()
			return { ok: true, message: 'Formula inserted.' }
		}

		case 'insert_page_break':
			editor.chain().focus().setPageBreak().run()
			return { ok: true, message: 'Page break inserted.' }

		case 'add_comment': {
			const quote = String(call.arguments.quote ?? '')
			const body = String(call.arguments.body ?? '')
			if (!quote || !body) return { ok: false, message: 'Comment needs a quote and a body.' }

			const index = buildTextIndex(editor.state.doc)
			const at = index.text.indexOf(quote)
			if (at === -1) return { ok: false, message: 'That passage is no longer in the document.' }

			const range = textRangeToPM(index, at, quote.length)
			if (!range) return { ok: false, message: 'Could not anchor the comment.' }

			const id = `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
			editor
				.chain()
				.focus()
				.setTextSelection(range)
				.setMark(COMMENT_MARK, { commentId: id })
				.run()

			// `body` adalah isi komentarnya - ia masuk sebagai kalimat pertama utas,
			// bukan dibuang setelah divalidasi. Penulisnya ditulis apa adanya:
			// pembaca berhak tahu catatan ini datang dari asisten, bukan dari rekan.
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
			const next: PageSetup = { ...context.setup, margins: { ...context.setup.margins } }

			if (typeof args.size === 'string' && args.size in PAGE_SIZES) {
				next.size = args.size as PageSetup['size']
			}
			if (args.orientation === 'portrait' || args.orientation === 'landscape') {
				next.orientation = args.orientation
			}
			const marginsCm = args.margins_cm
			if (marginsCm && typeof marginsCm === 'object') {
				const toPx = (cm: number) => Math.round((cm / 2.54) * INCH)
				const input = marginsCm as Record<string, unknown>
				for (const side of ['top', 'bottom', 'left', 'right'] as const) {
					const value = Number(input[side])
					if (Number.isFinite(value) && value >= 0) next.margins[side] = toPx(value)
				}
			}
			if (typeof args.page_color === 'string') next.pageColor = args.page_color || null
			if (typeof args.pageless === 'boolean') next.pageless = args.pageless

			// clampMargins yang sama dengan dialog Penyiapan halaman: area teks
			// tidak pernah hilang seberapa pun angka yang dikirim model.
			next.margins = clampMargins(next.margins, next)

			const scope = args.scope === 'tab' ? 'tab' : 'document'
			context.setPageSetup(next, scope)
			return { ok: true, message: scope === 'tab' ? 'Tab layout updated.' : 'Document layout updated.' }
		}

		case 'insert_toc': {
			const attrs = tocAttrsFromArgs(call.arguments)
			editor.chain().focus().insertToc(attrs).run()
			return { ok: true, message: 'Table of contents inserted.' }
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

		case 'insert_mermaid': {
			const source = String(call.arguments.source ?? '').trim()
			if (!source) return { ok: false, message: 'Nothing to insert.' }
			editor
				.chain()
				.focus()
				.insertContent({
					type: 'codeBlock',
					attrs: { language: 'mermaid' },
					content: [{ type: 'text', text: source }],
				})
				.run()
			return { ok: true, message: 'Diagram inserted.' }
		}

		case 'insert_table': {
			const rows = Math.max(1, Math.min(50, Number(call.arguments.rows) || 0))
			const cols = Math.max(1, Math.min(12, Number(call.arguments.cols) || 0))
			const header = call.arguments.header_row !== false
			editor.chain().focus().insertTable({ rows, cols, withHeaderRow: header }).run()
			return { ok: true, message: `Table ${rows}×${cols} inserted.` }
		}

		case 'apply_paragraph_style': {
			const find = String(call.arguments.find ?? '')
			if (!find) return { ok: false, message: 'Nothing to find.' }
			const range = findExactRange(editor, find)
			if (!range) return { ok: false, message: 'That passage is no longer in the document.' }

			const isHeading = call.arguments.style === 'heading'
			const level = Math.max(1, Math.min(9, Number(call.arguments.level) || 1))
			const typeName = isHeading ? 'heading' : 'paragraph'

			const { tr, schema } = editor.state
			const seen: number[] = []
			editor.state.doc.nodesBetween(range.from, range.to, (node, pos) => {
				if (node.isTextblock) {
					seen.push(pos)
					return false
				}
				return true
			})
			for (const pos of seen) {
				const node = tr.doc.nodeAt(pos)
				if (!node) continue
				tr.setNodeMarkup(pos, schema.nodes[typeName], {
					...node.attrs,
					...(isHeading ? { level } : {}),
				})
			}
			if (seen.length === 0) return { ok: false, message: 'No paragraph covers that passage.' }
			editor.view.dispatch(tr)
			return { ok: true, message: isHeading ? `Heading ${level} applied.` : 'Paragraph style applied.' }
		}

		case 'format_text': {
			const find = String(call.arguments.find ?? '')
			if (!find) return { ok: false, message: 'Nothing to find.' }
			const range = findExactRange(editor, find)
			if (!range) return { ok: false, message: 'That passage is no longer in the document.' }

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
				editor.view.dispatch(
					editor.state.tr.setNodeMarkup(from, undefined, { ...node.attrs, level: next }),
				)
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
				// Setelah pemotongan, sasaran di bawah rentang bergeser sejauh isinya.
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

			editor.chain().focus().setImage({ src, alt: String(call.arguments.alt ?? '') || null }).run()
			return { ok: true, message: 'Image inserted.' }
		}

		case 'create_tab': {
			const title = typeof call.arguments.title === 'string' ? call.arguments.title : undefined
			const markdown = typeof call.arguments.markdown === 'string' ? call.arguments.markdown : undefined
			context.createTab(title, markdown)
			return { ok: true, message: `Tab "${title ?? 'baru'}" created.` }
		}

		default:
			return { ok: false, message: `Unknown tool: ${call.name}` }
	}
}

/** Petakan argumen model ke atribut blok TOC (§A5.2); yang tak disebut tak diubah. */
function tocAttrsFromArgs(args: Record<string, unknown>): Partial<TocBlockAttrs> {
	const attrs: Partial<TocBlockAttrs> = {}
	const listKind = args.list_kind ?? args.listKind
	if (listKind === 'isi' || listKind === 'gambar' || listKind === 'tabel') {
		attrs.listKind = listKind as TocListKind
	}
	if (args.style === 'plain' || args.style === 'dotted' || args.style === 'link') attrs.style = args.style
	if (typeof args.show_page_numbers === 'boolean') attrs.showPageNumbers = args.show_page_numbers
	if (args.tab_leader === 'none' || args.tab_leader === 'dots' || args.tab_leader === 'dashes' || args.tab_leader === 'line') {
		attrs.tabLeader = args.tab_leader
	}
	if (Number.isFinite(Number(args.min_level))) attrs.minLevel = Number(args.min_level)
	if (Number.isFinite(Number(args.max_level))) attrs.maxLevel = Number(args.max_level)
	if (Number.isFinite(Number(args.indent_cm))) {
		attrs.indentPerLevel = Math.round((Number(args.indent_cm) / 2.54) * INCH)
	}
	return attrs
}

/** Rentang PM dari kemunculan pertama sebuah kutipan persis. */
function findExactRange(editor: Editor, find: string): { from: number; to: number } | null {
	const index = buildTextIndex(editor.state.doc)
	const at = index.text.indexOf(find)
	if (at === -1) return null
	return textRangeToPM(index, at, find.length)
}

/**
 * Penyaring URL gambar (§B3.2): hanya http(s) publik. Literal alamat
 * privat/loopback/link-local ditolak di sini; validasi pasca-DNS yang penuh
 * milik fetch_url di sisi server (fase riset web).
 */
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
			a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)
		if (privateRange) return 'Private or link-local addresses are not allowed.'
	}
	return null
}
