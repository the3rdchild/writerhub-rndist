import { ACADEMIC_NUMBERING, FIRST_CHAPTER_TITLE, FRONT_MATTER, frontMatterNodes } from '@writer-hub/shared'
import type { DocNode, ProseMirrorDoc } from '@/services/drafts/markdown-doc'
import { markdownToDoc } from '@/services/drafts/markdown-doc'
import type { BuiltinTemplateDefinition } from './catalog/definition'
import { columnBreak, withColumnsBefore } from './section-columns'
import { withTocBlocks } from './toc-blocks'

/**
 * Mengkompilasi kerangka Markdown sebuah template menjadi dokumen ProseMirror.
 *
 * Dua hal yang tidak bisa dinyatakan Markdown disisipkan sesudahnya: blok
 * daftar isi di bawah judul yang memanggilnya (`toc-blocks.ts`), dan pembatas
 * section pembawa kolom.
 * Template berkolom mendapat pembatas section pembawanya: tepat sebelum
 * `columnsBeforeHeading` bila badan berkolomnya mulai di tengah, atau di awal
 * dokumen bila seluruh isinya memang berkolom.
 */
export function compileTemplateContent(definition: BuiltinTemplateDefinition): ProseMirrorDoc {
	const doc = withBodyNumbering(
		withFrontMatter(withTocBlocks(markdownToDoc(definition.markdown)), definition),
		definition,
	)
	const columns = definition.spec.layout.columns
	if (!columns) return doc

	if (!definition.columnsBeforeHeading) {
		return { type: 'doc', content: [columnBreak(columns), ...doc.content] }
	}

	const result = withColumnsBefore(doc, definition.columnsBeforeHeading, columns)
	if (!result) {
		throw new Error(
			`Template "${definition.slug}": heading "${definition.columnsBeforeHeading}" tidak ada di kerangkanya`,
		)
	}
	return result
}

/**
 * Sampul dan halaman pengesahan baku di depan kerangka karya akademik,
 * masing-masing satu halaman. Isinya teks contoh berkurung ("[Nama
 * Penyusun]") yang diganti metadata saat dokumen dibuat.
 *
 * Pindah halaman sesudah pengesahan dihilangkan bila judul tingkat 1 memang
 * sudah memulai halaman baru: dua pemenggal berurutan menjadi halaman kosong
 * di Word.
 */
function withFrontMatter(doc: ProseMirrorDoc, definition: BuiltinTemplateDefinition): ProseMirrorDoc {
	const kind = definition.spec.frontMatter
	if (!kind) return doc

	const spec = FRONT_MATTER[kind]
	const first = doc.content[0]
	const chapterBreaks = definition.spec.layout.typography?.headings?.[1]?.pageBreakBefore === true
	const breakAfter = !(chapterBreaks && first?.type === 'heading' && first.attrs?.level === 1)
	const pageBreak: DocNode = { type: 'pageBreak' }

	return {
		type: 'doc',
		content: [
			...(frontMatterNodes('cover', spec) as DocNode[]),
			pageBreak,
			...(frontMatterNodes('approval', spec) as DocNode[]),
			...(breakAfter ? [pageBreak] : []),
			...doc.content,
		],
	}
}

const textOf = (node: DocNode): string =>
	node.type === 'text' ? String(node.text ?? '') : (node.content ?? []).map(textOf).join('')

/**
 * Pemisah bagian tepat di depan BAB I, membawa penomoran badan naskah: angka
 * mulai 1. Bagian depannya bernomor romawi lewat aturan tab
 * (`templateDocumentLayout`). Pemenggal halaman yang ada di sana digantikan -
 * pemisah bagian sudah membuka lembar baru.
 */
function withBodyNumbering(doc: ProseMirrorDoc, definition: BuiltinTemplateDefinition): ProseMirrorDoc {
	if (!definition.spec.frontMatter) return doc
	const at = doc.content.findIndex(
		(node) =>
			node.type === 'heading' &&
			node.attrs?.level === 1 &&
			FIRST_CHAPTER_TITLE.test(textOf(node).replace(/\s+/g, ' ').trim()),
	)
	if (at <= 0) return doc

	const sectionBreak: DocNode = {
		type: 'sectionBreak',
		attrs: { pageSetup: { pageNumbering: ACADEMIC_NUMBERING.body }, columns: null, continuous: false },
	}
	const start = doc.content[at - 1]?.type === 'pageBreak' ? at - 1 : at
	return { ...doc, content: [...doc.content.slice(0, start), sectionBreak, ...doc.content.slice(at)] }
}
