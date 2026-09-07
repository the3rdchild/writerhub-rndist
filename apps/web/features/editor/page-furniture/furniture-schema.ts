/**
 * Skema & ekstensi untuk isi header/footer kaya (T5).
 *
 * Satu set ekstensi sengaja dipisah dari `extensions.ts` editor utama: isi
 * perabot halaman hanya boleh membawa blok ringan (paragraf, mark, gambar) —
 * tanpa paginasi, TOC, kolom, atau section break — supaya editor kecil di
 * dalam kanvas tidak ikut memikul beban mesin dokumen, dan isi yang tersimpan
 * di ydoc tidak pernah berisi node yang tidak bisa dirender statis.
 */

import { type Extensions, getSchema, type JSONContent } from '@tiptap/core'
import Placeholder from '@tiptap/extension-placeholder'
import TextAlign from '@tiptap/extension-text-align'
import { DOMSerializer, type Schema } from '@tiptap/pm/model'
import StarterKit from '@tiptap/starter-kit'
import { yXmlFragmentToProseMirrorRootNode } from 'y-prosemirror'
import type * as Y from 'yjs'
import { ResizableImage, type ResizableImageOptions } from '@/features/editor/resizable-image'
import type { PageFurnitureLine } from './model'

export function furnitureExtensions(placeholder?: string): Extensions {
	return [
		StarterKit.configure({
			blockquote: false,
			bulletList: false,
			codeBlock: false,
			heading: false,
			horizontalRule: false,
			listItem: false,
			listKeymap: false,
			orderedList: false,
			link: false,
			trailingNode: false,
			dropcursor: false,
			gapcursor: false,
			undoRedo: false,
		}),
		TextAlign.configure({ types: ['paragraph'] }),
		ResizableImage.configure({ inline: false, allowBase64: true } satisfies ResizableImageOptions),
		...(placeholder ? [Placeholder.configure({ placeholder })] : []),
	]
}

let cachedSchema: Schema | null = null

export function furnitureSchema(): Schema {
	/* Skema tidak pernah berubah selama proses hidup, jadi cukup dibangun sekali. */
	// biome-ignore lint/suspicious/noAssignInExpressions: memoisasi sekali jalan
	return (cachedSchema ??= getSchema(furnitureExtensions()))
}

/**
 * HTML statis sebuah fragmen — dipakai semua lembar kecuali yang sedang
 * disunting. Token {page}/{pages} dibiarkan apa adanya; pemakaian tiap lembar
 * menggantinya dengan nomornya sendiri.
 */
export function fragmentToHtml(fragment: Y.XmlFragment): string {
	const schema = furnitureSchema()
	const node = yXmlFragmentToProseMirrorRootNode(fragment, schema)
	const dom = DOMSerializer.fromSchema(schema).serializeFragment(node.content)
	const wrap = document.createElement('div')
	wrap.appendChild(dom)
	return wrap.innerHTML
}

/** JSON isi fragmen — untuk ekspor DOCX dan pembacaan di luar React. */
export function fragmentToJSON(fragment: Y.XmlFragment): JSONContent[] {
	const node = yXmlFragmentToProseMirrorRootNode(fragment, furnitureSchema())
	const blocks = (node.toJSON().content ?? []) as JSONContent[]
	return blocks.filter((block) => Boolean(block) && block.type !== 'text')
}

/** Baris lama menjadi paragraf dengan perataan yang sama — migrasi tanpa kehilangan. */
export function lineToJSON(line: PageFurnitureLine): JSONContent {
	return {
		type: 'paragraph',
		attrs: { textAlign: line.align === 'left' ? null : line.align },
		...(line.text ? { content: [{ type: 'text', text: line.text }] } : {}),
	}
}

/**
 * Turunkan baris lama dari isi editor — dipakai menjaga `pageFurniture`
 * (teks polos + perataan paragraf pertama) tetap hidup untuk tampilan
 * baca-saja, sinkronisasi API, dan ekspor lawas.
 */
export function jsonToLine(blocks: JSONContent[]): PageFurnitureLine | null {
	const pieces: string[] = []
	let align: PageFurnitureLine['align'] | null = null

	const textOfRuns = (content: JSONContent[] | undefined): string => {
		const out: string[] = []
		for (const node of content ?? []) {
			if (node.type === 'text' && node.text) out.push(node.text)
			else if (node.type === 'hardBreak') out.push(' ')
			else if (node.type === 'image') out.push(node.attrs?.alt ? String(node.attrs.alt) : '')
		}
		return out.join('')
	}

	for (const block of blocks) {
		if (block.type !== 'paragraph') continue
		if (align === null) {
			const raw = block.attrs?.textAlign
			align = raw === 'center' || raw === 'right' ? raw : 'left'
		}
		pieces.push(textOfRuns(block.content))
	}

	const text = pieces.join(' ').replace(/\s+/g, ' ').trim()
	return text ? { text, align: align ?? 'left' } : null
}
