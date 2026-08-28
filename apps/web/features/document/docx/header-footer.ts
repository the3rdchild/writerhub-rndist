import type { PageFurniture, PageFurnitureLine } from '@/features/editor/page-furniture/model'
import { readRelationships } from './parse'
import type { XmlParser } from './xml'
import { attr, child, children, descend, tagName, val } from './xml'
import { type DocxArchive, resolvePath } from './zip'

/**
 * Pembaca header/footer DOCX menjadi PageFurniture.
 *
 * Meniru warisan antar-section Word secara longgar: referensi pertama yang
 * ditemukan untuk tiap (slot, varian) dipakai untuk seluruh dokumen — pola
 * yang dipakai templat satu-jenis perabot (mis. IEEE). Section yang tidak
 * punya referensi memang mewarisi section sebelumnya, jadi referensi pertama
 * adalah dasar yang benar.
 */

const VARIANTS: Record<string, 'default' | 'first' | 'even'> = {
	default: 'default',
	first: 'first',
	even: 'even',
}

function relsPathOf(part: string): string {
	const slash = part.lastIndexOf('/')
	return slash === -1 ? `_rels/${part}.rels` : `${part.slice(0, slash)}/_rels/${part.slice(slash + 1)}.rels`
}

function alignOf(paragraph: Element): PageFurnitureLine['align'] {
	const jc = val(child(child(paragraph, 'pPr'), 'jc'))
	if (jc === 'center') return 'center'
	if (jc === 'right' || jc === 'end') return 'right'
	return 'left'
}

const CONTAINERS = new Set(['hyperlink', 'sdt', 'sdtContent', 'smartTag', 'ins'])

/** Ambil teks paragraf pertama yang tidak kosong; field PAGE jadi token {page}. */
function lineOf(root: Element): PageFurnitureLine | null {
	for (const paragraph of children(root, 'p')) {
		const pieces: string[] = []
		let page = false

		const walk = (element: Element): void => {
			for (const node of children(element)) {
				const name = tagName(node)
				if (name === 'r') {
					for (const run of children(node)) {
						const runName = tagName(run)
						if (runName === 't') pieces.push(run.textContent ?? '')
						else if (runName === 'instrText' && (run.textContent ?? '').includes('PAGE')) page = true
					}
				} else if (CONTAINERS.has(name)) {
					walk(node)
				}
			}
		}
		walk(paragraph)

		if (page) pieces.push('{page}')
		const text = pieces.join('').replace(/\s+/g, ' ').trim()
		if (text) return { text, align: alignOf(paragraph) }
	}
	return null
}

function collectReferences(
	sectPr: Element,
	archive: DocxArchive,
	parse: XmlParser,
	mainPart: string,
	relationships: ReturnType<typeof readRelationships>,
	found: PageFurniture,
): void {
	for (const reference of children(sectPr)) {
		const name = tagName(reference)
		if (name !== 'headerReference' && name !== 'footerReference') continue

		const slot = name === 'headerReference' ? 'header' : 'footer'
		const variant = VARIANTS[attr(reference, 'type') ?? 'default'] ?? 'default'
		if (found[slot]?.[variant]) continue

		const id = attr(reference, 'id')
		if (!id) continue
		const relationship = relationships.get(id)
		if (!relationship || relationship.external) continue

		const source = archive.text(resolvePath(mainPart, relationship.target))
		if (!source) continue

		const line = lineOf(parse(source))
		if (!line) continue
		const slotLines = found[slot] ?? {}
		slotLines[variant] = line
		found[slot] = slotLines
	}
}

/**
 * Baca seluruh referensi header/footer dari semua sectPr dokumen utama.
 * Mengembalikan null bila tidak ada satu pun yang bisa dibaca.
 */
export function readFurniture(
	archive: DocxArchive,
	parse: XmlParser,
	mainPart: string,
): PageFurniture | null {
	const source = archive.text(mainPart)
	if (!source) return null
	const body = descend(parse(source), 'body')
	if (!body) return null

	const relsSource = archive.text(relsPathOf(mainPart))
	const relationships = relsSource ? readRelationships(parse(relsSource)) : new Map()

	const found: PageFurniture = {}
	const collect = (sectPr: Element) =>
		collectReferences(sectPr, archive, parse, mainPart, relationships, found)

	const visit = (parent: Element): void => {
		for (const node of children(parent)) {
			const name = tagName(node)
			if (name === 'p') {
				const sectPr = descend(node, 'pPr', 'sectPr')
				if (sectPr) collect(sectPr)
			} else if (name === 'sectPr') {
				collect(node)
			} else if (name === 'sdt') {
				const content = child(node, 'sdtContent')
				if (content) visit(content)
			}
		}
	}
	visit(body)

	const hasAny =
		Object.values(found.header ?? {}).some(Boolean) || Object.values(found.footer ?? {}).some(Boolean)
	return hasAny ? found : null
}
