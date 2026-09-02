/**
 * Menerjemahkan `DocumentTypography` menjadi satu lembar gaya yang disuntikkan
 * ke kanvas. Pola ini meniru aturan `@page` di `document-canvas.tsx`: satu
 * `<style>` yang dibangkitkan dari nilai dokumen, bukan puluhan properti
 * kustom CSS yang harus dicocokkan satu per satu di `globals.css`.
 *
 * Karena inilah satu-satunya tempat ukuran judul ditentukan, tangga judul yang
 * dulu ditulis tangan di `globals.css` sudah dihapus dari sana - dokumen tanpa
 * tipografi sendiri tetap tampil sama karena `resolveHeadingStyle` memakai
 * tangga yang angkanya persis sama.
 */

import {
	type BlockStyle,
	cssLineHeight,
	type DocumentTypography,
	resolveHeadingStyle,
	resolveParagraphStyle,
} from '@writer-hub/shared'
import { HEADING_LEVELS } from './heading-extension'

/**
 * Judul tingkat 1-6 punya tag sendiri; 7-9 dirender sebagai `div.heading`
 * (HTML tidak punya `h7`), jadi pemilihnya ikut berbeda.
 */
function headingSelector(level: number): string {
	return level <= 6 ? `.document-body h${level}` : `.document-body .heading[data-level='${level}']`
}

function declarations(style: BlockStyle): string[] {
	return [
		`font-size: ${style.sizePt}pt`,
		`font-weight: ${style.bold ? 700 : 400}`,
		`font-style: ${style.italic ? 'italic' : 'normal'}`,
		`line-height: ${cssLineHeight(style.lineHeight)}`,
		`text-align: ${style.align}`,
		`margin-top: ${style.spaceBeforePt}pt`,
		`margin-bottom: ${style.spaceAfterPt}pt`,
		`margin-left: ${style.indentPt}pt`,
		`text-indent: ${style.firstLinePt}pt`,
	]
}

function rule(selector: string, style: BlockStyle): string {
	return `${selector} { ${declarations(style).join('; ')}; }`
}

export function typographyRules(typography: DocumentTypography): string {
	const paragraph = resolveParagraphStyle(typography)

	const rules = [
		`.document-body { font-family: ${typography.baseFont.family}; font-size: ${typography.baseFont.sizePt}pt; line-height: ${cssLineHeight(typography.lineHeight)}; }`,
		// Hanya paragraf tingkat atas: indent baris pertama dan rata kanan-kiri
		// milik badan naskah tidak boleh bocor ke paragraf di dalam sel tabel,
		// kutipan, atau daftar.
		rule('.document-body > p', paragraph),
		...HEADING_LEVELS.map((level) => rule(headingSelector(level), resolveHeadingStyle(typography, level))),
	]

	return rules.join('\n')
}
