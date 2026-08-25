import type { JSONContent } from '@tiptap/core'
import { createNumberer, readNumbering } from './numbering'
import { bodyOf, type ParseContext, type PageSetupPatch, readBody, readRelationships, readTheme } from './parse'
import { readStyles } from './properties'
import { type DocxArchive, openDocx, resolvePath } from './zip'
import { createXmlParser, type XmlParser } from './xml'

export type { PageSetupPatch } from './parse'
export interface ImportWarning {
	message: string
}

export interface DocxImport {
	content: JSONContent
	pageSetup?: PageSetupPatch
	warnings: ImportWarning[]
}

const OFFICE_DOCUMENT = 'officeDocument'
const DEFAULT_MAIN_PART = 'word/document.xml'
function relsPathOf(part: string): string {
	const slash = part.lastIndexOf('/')
	return slash === -1 ? `_rels/${part}.rels` : `${part.slice(0, slash)}/_rels/${part.slice(slash + 1)}.rels`
}
function mainPartOf(archive: DocxArchive, parse: XmlParser): string {
	const source = archive.text('_rels/.rels')
	if (!source) return DEFAULT_MAIN_PART

	try {
		for (const [, relationship] of readRelationships(parse(source))) {
			if (relationship.external || !relationship.type.endsWith(`/${OFFICE_DOCUMENT}`)) continue

			const target = resolvePath('', relationship.target)
			if (archive.bytes(target)) return target
		}
	} catch {
	}
	return DEFAULT_MAIN_PART
}
function partByType(
	archive: DocxArchive,
	parse: XmlParser,
	mainPart: string,
	suffix: string,
): Element | null {
	const source = archive.text(relsPathOf(mainPart))
	if (!source) return null

	try {
		for (const [, relationship] of readRelationships(parse(source))) {
			if (relationship.external || !relationship.type.endsWith(`/${suffix}`)) continue

			const content = archive.text(resolvePath(mainPart, relationship.target))
			if (content) return parse(content)
		}
	} catch {
		return null
	}
	return null
}
const SKIPPED_LABELS: Record<string, string> = {
	drawing: 'gambar',
	pict: 'gambar',
	'merged-cell': 'sel gabungan tabel',
	'kolom-bagian-pertama': 'kolom di bagian pertama dokumen',
	object: 'objek tertanam',
	oMath: 'rumus',
	oMathPara: 'rumus',
}

function warningsFor(skipped: Map<string, number>, archive: DocxArchive): ImportWarning[] {
	const warnings: ImportWarning[] = []

	const counted = new Map<string, number>()
	const unknown: string[] = []
	for (const [name, count] of skipped) {
		const label = SKIPPED_LABELS[name]
		if (label) counted.set(label, (counted.get(label) ?? 0) + count)
		else unknown.push(name)
	}

	for (const [label, count] of counted) {
		warnings.push({ message: `${count} ${label} belum ikut terbawa dan akan menyusul.` })
	}

	if (unknown.length > 0) {
		warnings.push({ message: `Bagian yang tidak dikenali dilewati: ${unknown.sort().join(', ')}.` })
	}

	const hasHeaderFooter = archive
		.paths()
		.some((path) => /^word\/(header|footer)\d*\.xml$/.test(path))
	if (hasHeaderFooter) {
		warnings.push({
			message: 'Header, footer, dan nomor halaman tidak punya padanan di editor ini, jadi tidak ikut terbawa.',
		})
	}

	return warnings
}
export async function readDocx(data: Uint8Array): Promise<DocxImport> {
	const archive = openDocx(data)
	const parse = await createXmlParser()

	const mainPart = mainPartOf(archive, parse)
	const source = archive.text(mainPart)
	if (!source) throw new Error('DOCX ini tidak berisi bagian dokumen utama')

	const body = bodyOf(parse(source))
	if (!body) throw new Error('Bagian utama DOCX ini tidak punya badan dokumen')

	const relationshipsSource = archive.text(relsPathOf(mainPart))
	const numberingRoot = partByType(archive, parse, mainPart, 'numbering')
	const context: ParseContext = {
		styles: readStyles(partByType(archive, parse, mainPart, 'styles')),
		theme: readTheme(partByType(archive, parse, mainPart, 'theme')),
		numberer: createNumberer(readNumbering(numberingRoot)),
		relationships: relationshipsSource ? readRelationships(parse(relationshipsSource)) : new Map(),
		skipped: new Map(),
		archive,
		mainPart,
	}

	const { blocks, pageSetup } = readBody(body, context)

	return {
		content: { type: 'doc', content: blocks.length > 0 ? blocks : [{ type: 'paragraph' }] },
		pageSetup,
		warnings: warningsFor(context.skipped, archive),
	}
}
