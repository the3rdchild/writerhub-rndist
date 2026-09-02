import type { DocNode, ProseMirrorDoc } from '@/services/drafts/markdown-doc'
import { markdownToDoc } from '@/services/drafts/markdown-doc'
import type { BuiltinTemplateDefinition } from './catalog/definition'

function headingText(node: DocNode): string | null {
	if (node.type !== 'heading') return null
	return (node.content ?? [])
		.map((child) => child.text ?? '')
		.join('')
		.trim()
}

/**
 * Mengkompilasi kerangka Markdown sebuah template menjadi dokumen ProseMirror.
 * Template berkolom mendapat satu node `sectionBreak` menerus pembawa atribut
 * kolomnya - sama persis dengan yang ditulis perintah `setSectionColumns` di
 * editor - disisipkan sebelum `columnsBeforeHeading`, atau di awal dokumen
 * bila kolomnya mencakup seluruh isi.
 */
export function compileTemplateContent(definition: BuiltinTemplateDefinition): ProseMirrorDoc {
	const doc = markdownToDoc(definition.markdown)
	const columns = definition.spec.layout.columns
	if (!columns) return doc

	const breakNode: DocNode = {
		type: 'sectionBreak',
		attrs: { pageSetup: null, columns, continuous: true },
	}

	let at = 0
	if (definition.columnsBeforeHeading) {
		at = doc.content.findIndex((node) => headingText(node) === definition.columnsBeforeHeading)
		if (at === -1) {
			throw new Error(
				`Template "${definition.slug}": heading "${definition.columnsBeforeHeading}" tidak ada di kerangkanya`,
			)
		}
	}

	return { type: 'doc', content: [...doc.content.slice(0, at), breakNode, ...doc.content.slice(at)] }
}
