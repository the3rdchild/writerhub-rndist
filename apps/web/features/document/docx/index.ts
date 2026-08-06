/**
 * Membaca DOCX jadi dokumen Tiptap.
 *
 * Sebelumnya pekerjaan ini diserahkan ke mammoth. Mammoth menghasilkan HTML
 * yang bersih dan semantis - dan itu justru masalahnya: ia sengaja membuang
 * seluruh format langsung. Untuk mengubah DOCX jadi artikel web itu keputusan
 * yang benar, tapi di sini dokumennya masuk ke pengolah kata, dan orang
 * mengharapkan naskahnya tampil seperti saat ia meninggalkannya di Word.
 *
 * Yang juga tidak bisa dilakukan mammoth: mewarisi sifat dari definisi gaya.
 * Gaya seperti "Caption Tabel" menyimpan tebal dan rata-tengahnya di
 * styles.xml, bukan di paragrafnya, jadi lewat mammoth caption-caption itu
 * datang sebagai teks biasa.
 */

import type { JSONContent } from '@tiptap/core'
import { bodyBlocks, bodyOf, type ParseContext, readRelationships, readTheme } from './parse'
import { readStyles } from './properties'
import { type DocxArchive, openDocx } from './zip'
import { createXmlParser, type XmlParser } from './xml'

/** Yang hilang saat mengimpor, dan alasannya. */
export interface ImportWarning {
	message: string
}

export interface DocxImport {
	content: JSONContent
	/** Hal yang tidak punya padanan di editor ini; ditunjukkan, bukan disembunyikan. */
	warnings: ImportWarning[]
}

const OFFICE_DOCUMENT = 'officeDocument'
const DEFAULT_MAIN_PART = 'word/document.xml'

/** Jalur relatif di dalam arsip, diselesaikan terhadap direktori pemiliknya. */
function resolvePath(base: string, target: string): string {
	if (target.startsWith('/')) return target.slice(1)

	const directory = base.includes('/') ? base.slice(0, base.lastIndexOf('/')) : ''
	const segments = directory ? directory.split('/') : []

	for (const segment of target.split('/')) {
		if (segment === '.' || segment === '') continue
		if (segment === '..') segments.pop()
		else segments.push(segment)
	}
	return segments.join('/')
}

/** Berkas rels milik sebuah bagian. */
function relsPathOf(part: string): string {
	const slash = part.lastIndexOf('/')
	return slash === -1 ? `_rels/${part}.rels` : `${part.slice(0, slash)}/_rels/${part.slice(slash + 1)}.rels`
}

/**
 * Bagian utama dokumen, dibaca dari daftar hubungan.
 *
 * Hampir selalu `word/document.xml`, tapi tidak dijanjikan begitu - Word
 * sesekali menamainya `document2.xml` setelah dokumen dipulihkan dari
 * kerusakan. Menebak namanya berarti berkas semacam itu gagal dibuka.
 */
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
		// Daftar hubungan yang rusak bukan alasan menolak seluruh berkas selama
		// bagian utamanya ada di tempat yang biasa.
	}
	return DEFAULT_MAIN_PART
}

/** Bagian bertipe tertentu yang ditunjuk oleh bagian utama. */
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
		// Bagian pendukung yang rusak tidak boleh menggagalkan seluruh impor;
		// tanpa styles.xml naskahnya tetap terbaca, hanya kehilangan gayanya.
		return null
	}
	return null
}

/**
 * Menerjemahkan elemen yang dilewati jadi kalimat yang bisa dibaca.
 *
 * Nama elemen OOXML tidak berarti apa-apa bagi penulis naskah, jadi yang
 * ditampilkan adalah bendanya - "tabel", "gambar" - beserta jumlahnya, supaya
 * jelas seberapa besar yang hilang.
 */
const SKIPPED_LABELS: Record<string, string> = {
	tbl: 'tabel',
	drawing: 'gambar',
	pict: 'gambar',
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

/** Membaca berkas DOCX yang sudah berada di memori. */
export async function readDocx(data: Uint8Array): Promise<DocxImport> {
	const archive = openDocx(data)
	const parse = await createXmlParser()

	const mainPart = mainPartOf(archive, parse)
	const source = archive.text(mainPart)
	if (!source) throw new Error('DOCX ini tidak berisi bagian dokumen utama')

	const body = bodyOf(parse(source))
	if (!body) throw new Error('Bagian utama DOCX ini tidak punya badan dokumen')

	const relationshipsSource = archive.text(relsPathOf(mainPart))
	const context: ParseContext = {
		styles: readStyles(partByType(archive, parse, mainPart, 'styles')),
		theme: readTheme(partByType(archive, parse, mainPart, 'theme')),
		relationships: relationshipsSource ? readRelationships(parse(relationshipsSource)) : new Map(),
		skipped: new Map(),
	}

	const blocks = bodyBlocks(body, context)

	return {
		// Dokumen kosong tetap butuh satu paragraf; skema editor menolak badan
		// dokumen tanpa isi.
		content: { type: 'doc', content: blocks.length > 0 ? blocks : [{ type: 'paragraph' }] },
		warnings: warningsFor(context.skipped, archive),
	}
}
