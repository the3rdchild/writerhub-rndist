'use client'

import type { AnalysisFeature, ToolCall } from '@writer-hub/shared'
import type { Editor } from '@tiptap/react'
import type { PanelId } from '@/features/analysis/panel-context'
import { COMMENT_MARK } from '@/features/comments/comment-mark'
import { buildTextIndex, textRangeToPM } from '@/features/document/tiptap-offsets'
import { replaceTextRange } from '@/features/editor/apply-text'
import { toEditorContent } from '@/features/editor/markdown'
import { stripDelimiters } from '@/features/editor/math'

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

export function runReadTool(editor: Editor, call: ToolCall): string {
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

		default:
			return `Unknown read tool: ${call.name}`
	}
}

// ── alat tulis ─────────────────────────────────────────────────────────────

export interface WriteToolContext {
	editor: Editor
	addComment: (thread: {
		id: string
		quote: string
		replies: []
		resolved: boolean
		createdAt: number
	}) => void
	openPanel: (panel: PanelId) => void
	runModule: (feature: AnalysisFeature) => void
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

			context.addComment({
				id,
				quote: quote.slice(0, 300),
				replies: [],
				resolved: false,
				createdAt: Date.now(),
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

		default:
			return { ok: false, message: `Unknown tool: ${call.name}` }
	}
}
