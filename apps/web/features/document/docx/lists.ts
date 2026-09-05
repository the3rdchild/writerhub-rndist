/**
 * Merangkai paragraf bernomor Word menjadi list bertingkat.
 *
 * Word tidak menyimpan list sebagai wadah: tiap paragraf hanya membawa
 * `numId` + `ilvl`. Modul ini menyusun ulang wadahnya dari rangkaian itu.
 */
import type { JSONContent } from '@tiptap/core'

/** Info sementara pada paragraf bernomor; dipakai wrapListBlocks lalu dibuang. */
export interface ListTag {
	numId: number
	ilvl: number
	format: string
	value: number
	indent: number
}

/** Atribut HTML `type` untuk orderedList sesuai format penomoran Word. */
function listTypeOf(format: string): string | undefined {
	switch (format) {
		case 'lowerLetter':
			return 'a'
		case 'upperLetter':
			return 'A'
		case 'lowerRoman':
			return 'i'
		case 'upperRoman':
			return 'I'
		default:
			return undefined
	}
}

/** Indentasi paragraf tidak relevan di dalam listItem (tata letaknya milik list). */
export function withoutListIndents(attrs: Record<string, unknown>): Record<string, unknown> {
	const { indentLeft, indentRight, indentFirstLine, ...rest } = attrs
	return rest
}

interface ListContext {
	numId: number
	ilvl: number
	indent: number
	node: JSONContent
	item: JSONContent | null
}

const ATOM_BLOCKS = new Set(['mathBlock', 'image'])

function listOf(tag: ListTag): JSONContent {
	if (tag.format === 'bullet') return { type: 'bulletList', content: [] }

	const attrs: Record<string, unknown> = {}
	const type = listTypeOf(tag.format)
	if (type) attrs.type = type
	// List yang lanjut setelah terputus memulai dari angka terakhirnya.
	if (tag.value !== 1) attrs.start = tag.value
	return { type: 'orderedList', ...(Object.keys(attrs).length > 0 ? { attrs } : {}), content: [] }
}

/**
 * Gabungkan paragraf bertanda `_list` berurutan menjadi node list bertingkat.
 * Aturan penempatan (meniru Word):
 * - numId sama + ilvl sama → satu list; ilvl lebih dalam → list anak.
 * - numId berbeda dengan indentasi lebih dalam → list anak pada item sebelumnya
 *   (penulis Word kerfa memakai instance penomoran terpisah untuk sub-list).
 * - Paragraf tak bernomor yang menjorok setidaknya sedalam item terbuka dianggap
 *   paragraf lanjutan dan ikut item itu (pola "keterangan di bawah item" ala Word).
 * - Blok atom (rumus, gambar) di antara item masuk ke item yang sedang terbuka;
 *   blok lain menutup list (nomor lanjut diteruskan lewat atribut start).
 */
export function wrapListBlocks(blocks: JSONContent[]): JSONContent[] {
	const out: JSONContent[] = []
	const stack: ListContext[] = []

	const openAt = (tag: ListTag, parent: ListContext | null): ListContext => {
		const context: ListContext = { ...tag, node: listOf(tag), item: null }
		if (parent) (parent.item?.content as JSONContent[]).push(context.node)
		else out.push(context.node)
		return context
	}

	const appendItem = (context: ListContext, paragraph: JSONContent): void => {
		const item: JSONContent = { type: 'listItem', content: [paragraph] }
		;(context.node.content as JSONContent[]).push(item)
		context.item = item
	}

	for (const block of blocks) {
		const tag = block.type === 'paragraph' ? (block.attrs?._list as ListTag | undefined) : undefined

		if (tag) {
			const { _list, ...rest } = block.attrs as Record<string, unknown>
			const paragraph: JSONContent = {
				type: 'paragraph',
				...(Object.keys(rest).length > 0 ? { attrs: rest } : {}),
				...(block.content ? { content: block.content } : {}),
			}

			// Cari konteks yang bisa menampung paragraf ini.
			for (;;) {
				const top = stack[stack.length - 1]
				if (!top) {
					const context = openAt(tag, null)
					stack.push(context)
					appendItem(context, paragraph)
					break
				}

				if (top.numId === tag.numId) {
					if (top.ilvl === tag.ilvl) {
						appendItem(top, paragraph)
						break
					}
					if (top.ilvl < tag.ilvl) {
						const context = openAt(tag, top)
						stack.push(context)
						appendItem(context, paragraph)
						break
					}
					stack.pop()
					continue
				}

				if (tag.indent > top.indent) {
					const context = openAt(tag, top)
					stack.push(context)
					appendItem(context, paragraph)
					break
				}
				stack.pop()
			}
			continue
		}

		// Paragraf lanjutan: tak bernomor tapi menjorok sedalam item terbuka
		// (mis. "Indicators for … as follows." di bawah item SWOT) — ikut item itu.
		if (block.type === 'paragraph' && stack.length > 0) {
			const top = stack[stack.length - 1] as ListContext
			const indent = Number(block.attrs?.indentLeft) || 0
			if (indent > 0 && indent >= top.indent && top.item) {
				const rest = withoutListIndents(block.attrs as Record<string, unknown>)
				;(top.item.content as JSONContent[]).push({
					type: 'paragraph',
					...(Object.keys(rest).length > 0 ? { attrs: rest } : {}),
					...(block.content ? { content: block.content } : {}),
				})
				continue
			}
		}

		// Blok atom mengikuti item yang sedang terbuka (rumus/gambar milik item itu).
		if (block.type !== undefined && ATOM_BLOCKS.has(block.type) && stack.length > 0) {
			const top = stack[stack.length - 1] as ListContext
			;(top.item?.content as JSONContent[]).push(block)
			continue
		}

		stack.length = 0
		out.push(block)
	}

	return out
}
