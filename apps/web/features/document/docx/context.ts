/**
 * Bahan dan keadaan satu kali pembacaan DOCX.
 *
 * `ParseContext` berisi yang sudah lengkap sebelum paragraf pertama dibaca
 * (gaya, tema, penomoran, relasi, arsip); `ParseState` berisi yang tumbuh
 * selagi dibaca. Modul lain menerima keduanya lewat satu objek, tapi
 * pemisahannya membuat jelas mana yang dibaca dan mana yang ditulisi.
 */
import type { JSONContent } from '@tiptap/core'
import type { Numberer } from './numbering'
import type { DocxStyles } from './properties'
import { attr, children, descend } from './xml'
import type { DocxArchive } from './zip'

export interface ThemeFonts {
	major?: string
	minor?: string
}

export interface Relationship {
	type: string
	target: string
	external: boolean
}

export type Relationships = Map<string, Relationship>

/** Metadata satu komentar Word, apa adanya dari `word/comments.xml`. */
export interface CommentMeta {
	author: string
	date?: string
	text: string
}

/**
 * Yang tumbuh selama pembacaan berlangsung.
 *
 * Dipisahkan dari `ParseContext` supaya jelas mana bahan yang dibaca dan mana
 * yang ditulisi: sebelumnya keduanya bercampur sebagai field opsional di satu
 * objek, dan setiap pemakainya harus menulis `?.` untuk sesuatu yang
 * sebenarnya selalu ada.
 */
export interface ParseState {
	/** Sebab → berapa kali dilewati; menjadi peringatan impor di `index.ts`. */
	skipped: Map<string, number>
	/** Id catatan kaki yang dirujuk badan naskah, berurutan kemunculan. */
	footnoteQueue: number[]
	/** Id komentar yang rentangnya sedang terbuka (lintas paragraf). */
	commentStack: string[]
	/** Kutipan teks per id komentar, diakumulasi dari run yang termarka. */
	commentQuotes: Map<string, string>
}

export function createParseState(): ParseState {
	return { skipped: new Map(), footnoteQueue: [], commentStack: [], commentQuotes: new Map() }
}

/** Bahan pembacaan: sudah lengkap sebelum paragraf pertama dibaca. */
export interface ParseContext {
	readonly styles: DocxStyles
	readonly relationships: Relationships
	readonly theme: ThemeFonts
	readonly numberer: Numberer
	readonly archive: DocxArchive
	readonly mainPart: string
	/** Isi `word/footnotes.xml` — id Word → konten inline catatan. */
	readonly footnotes: Map<number, JSONContent[]>
	/** Metadata `word/comments.xml` — id Word → penulis & isi. */
	readonly commentMeta: Map<string, CommentMeta>
	readonly state: ParseState
}

/**
 * Membaca satu paragraf menjadi blok hasil.
 *
 * Modul media dan tabel sama-sama memuat paragraf, tapi perangkainya ada di
 * `parse.ts`. Disuntikkan sebagai fungsi supaya ketiganya tidak saling impor.
 */
export type ReadParagraph = (paragraph: Element) => JSONContent[]

/** Catat satu sebab kehilangan; `index.ts` yang mengubahnya jadi kalimat. */
export function skip(context: ParseContext, name: string): void {
	const { skipped } = context.state
	skipped.set(name, (skipped.get(name) ?? 0) + 1)
}

export function readRelationships(root: Element | null): Relationships {
	const result: Relationships = new Map()
	if (!root) return result

	for (const relationship of children(root, 'Relationship')) {
		const id = attr(relationship, 'Id')
		const target = attr(relationship, 'Target')
		if (!id || !target) continue
		result.set(id, {
			type: attr(relationship, 'Type') ?? '',
			target,
			external: attr(relationship, 'TargetMode') === 'External',
		})
	}
	return result
}

export function readTheme(root: Element | null): ThemeFonts {
	const scheme = descend(root, 'themeElements', 'fontScheme')
	if (!scheme) return {}

	const typefaceOf = (name: string) => attr(descend(scheme, name, 'latin'), 'typeface') || undefined
	return { major: typefaceOf('majorFont'), minor: typefaceOf('minorFont') }
}
