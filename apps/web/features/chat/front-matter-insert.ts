import type { Node as PMNode, Schema } from '@tiptap/pm/model'
import type { Transaction } from '@tiptap/pm/state'
import {
	FRONT_MATTER,
	type FrontMatterSpec,
	frontMatterFields,
	frontMatterNodes,
	type WorkKind,
} from '@writer-hub/shared'
import { PAGE_BREAK_NODE } from '@/features/editor/page-break'

export type FrontMatterRequest = 'cover' | 'approval' | 'both'

const LABELS = new Set(Object.values(FRONT_MATTER).map((spec) => spec.label))
const APPROVAL_TITLE = 'HALAMAN PENGESAHAN'

const textOf = (node: PMNode | null | undefined) => node?.textContent.trim() ?? ''

/*
 * Isian yang kosong tetap tampil sebagai teks contoh berkurung. Yang bersifat
 * pribadi - nama, NIM, NIP - disebut ke model supaya ia tahu itu bagian
 * penulis, bukan untuk dikarang.
 */
function unfilled(values: Readonly<Record<string, string>>): string[] {
	return frontMatterFields('Judul')
		.filter((field) => field.placeholder && !values[field.key]?.trim())
		.map((field) => field.label)
}

/**
 * Sampul dan/atau halaman pengesahan baku, di awal dokumen - di mana pun
 * kursornya. Sampul yang sudah ada tidak digandakan: dikenali dari baris
 * pertamanya ("SKRIPSI", "TESIS"...) dan halaman pengesahan dari judulnya.
 *
 * Pengesahan jatuh tepat sesudah sampul. Pindah halaman sesudahnya tidak
 * ditambahkan bila yang menyusul adalah judul BAB (tingkat 1) - templat
 * akademik sudah memulai tiap BAB di halaman baru, dan dua pemenggal
 * berurutan menjadi halaman kosong di Word.
 */
export function insertFrontMatter(
	tr: Transaction,
	schema: Schema,
	request: FrontMatterRequest,
	kind: WorkKind,
	values: Readonly<Record<string, string>>,
): { ok: boolean; message: string } {
	const spec: FrontMatterSpec = FRONT_MATTER[kind]
	const pageBreak = () => schema.nodes[PAGE_BREAK_NODE].create()
	const build = (part: 'cover' | 'approval') =>
		frontMatterNodes(part, spec, values).map((json) => schema.nodeFromJSON(json))

	const done: string[] = []
	const skipped: string[] = []

	const hasCover = () => LABELS.has(textOf(tr.doc.firstChild))
	const hasApproval = () => {
		let found = false
		tr.doc.forEach((node) => {
			if (textOf(node) === APPROVAL_TITLE) found = true
		})
		return found
	}

	if (request !== 'approval') {
		if (hasCover()) skipped.push('cover')
		else {
			tr.insert(0, [...build('cover'), pageBreak()])
			done.push('cover')
		}
	}

	if (request !== 'cover') {
		if (hasApproval()) skipped.push('approval page')
		else {
			// Sesudah pemenggal pertama bila dokumen dibuka sampul; di awal bila tidak.
			let at = 0
			if (hasCover()) {
				tr.doc.forEach((node, offset) => {
					if (at === 0 && node.type.name === PAGE_BREAK_NODE) at = offset + node.nodeSize
				})
			}
			const next = tr.doc.resolve(at).nodeAfter
			const chapterFollows = next?.type.name === 'heading' && Number(next.attrs.level) === 1
			tr.insert(at, [...build('approval'), ...(chapterFollows ? [] : [pageBreak()])])
			done.push('approval page')
		}
	}

	if (done.length === 0) {
		return {
			ok: false,
			message: `The document already has its ${skipped.join(' and ')}. Edit it in place instead of inserting another.`,
		}
	}

	const missing = unfilled(values)
	return {
		ok: true,
		message: [
			`Inserted the ${done.join(' and ')} at the start of the document.`,
			skipped.length > 0 ? `Already there, left as is: ${skipped.join(', ')}.` : '',
			missing.length > 0
				? `Still showing [bracketed] placeholders for the writer to fill in: ${missing.join(', ')}. Never invent names, ID numbers or dates for them.`
				: '',
		]
			.filter(Boolean)
			.join(' '),
	}
}
