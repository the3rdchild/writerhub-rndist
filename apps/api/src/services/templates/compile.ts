import type { ProseMirrorDoc } from '@/services/drafts/markdown-doc'
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
	const doc = withTocBlocks(markdownToDoc(definition.markdown))
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
