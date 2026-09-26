/**
 * Dua aturan teks Markdown yang dipakai kedua konverter (`apps/web`
 * `features/editor/markdown.ts` dan `apps/api` `drafts/markdown-doc.ts`):
 * referensi entitas HTML dan backslash-escape.
 *
 * Model menulis keduanya dengan wajar - `&emsp;` untuk merapikan blok tanda
 * tangan, `\_\_\_\_` untuk garis isian yang tidak boleh terbaca sebagai
 * penanda miring - dan tanpa aturan ini keduanya mendarat di naskah apa
 * adanya: "&emsp; &emsp; NIP." dan "( \_\_\_ )".
 */

/*
 * Entitas bernama yang sungguh muncul di keluaran model. Daftar lengkap HTML
 * berisi dua ribuan; yang tidak dikenal dibiarkan apa adanya, sama seperti
 * yang dilakukan peramban untuk entitas yang tidak ada.
 */
const NAMED: Record<string, string> = {
	nbsp: ' ',
	ensp: ' ',
	emsp: ' ',
	thinsp: ' ',
	shy: '­',
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	hellip: '…',
	mdash: '—',
	ndash: '–',
	laquo: '«',
	raquo: '»',
	ldquo: '“',
	rdquo: '”',
	lsquo: '‘',
	rsquo: '’',
	middot: '·',
	bull: '•',
	deg: '°',
	times: '×',
	divide: '÷',
	plusmn: '±',
	copy: '©',
	reg: '®',
	trade: '™',
	sect: '§',
	para: '¶',
	euro: '€',
}

const ENTITY = /&(#[xX][0-9a-fA-F]{1,6}|#\d{1,7}|[a-zA-Z][a-zA-Z0-9]{1,31});/g

function codePointOf(reference: string): number | null {
	const hex = reference[1] === 'x' || reference[1] === 'X'
	const value = Number.parseInt(reference.slice(hex ? 2 : 1), hex ? 16 : 10)
	const valid =
		Number.isFinite(value) &&
		value <= 0x10ffff &&
		!(value >= 0xd800 && value <= 0xdfff) &&
		(value >= 0x20 || value === 0x09 || value === 0x0a)
	return valid ? value : null
}

/** `&emsp;` → spasi em, `&#8212;` → "—". Yang tidak dikenal atau tidak sah dibiarkan. */
export function decodeEntities(text: string): string {
	return text.replace(ENTITY, (whole, reference: string) => {
		if (reference.startsWith('#')) {
			const code = codePointOf(reference)
			return code === null ? whole : String.fromCodePoint(code)
		}
		return NAMED[reference] ?? whole
	})
}

const ENTITY_AT = /&(?:#[xX][0-9a-fA-F]{1,6}|#\d{1,7}|[a-zA-Z][a-zA-Z0-9]{1,31});/y

/**
 * Apakah `&` di posisi ini membuka referensi entitas. Konverter yang menulis
 * HTML memakainya supaya tidak meng-escape `&emsp;` menjadi `&amp;emsp;` -
 * peramban yang menerjemahkannya, dan entitas tidak pernah membentuk tag.
 */
export function startsEntity(text: string, at: number): boolean {
	ENTITY_AT.lastIndex = at
	return ENTITY_AT.test(text)
}

/*
 * Tanda baca yang boleh di-escape. Sengaja tanpa kurung dan backslash: di
 * editor ini `\(…\)` dan `\[…\]` adalah pembatas rumus, dan `\\` adalah baris
 * baru LaTeX - menerjemahkannya akan merusak rumus yang belum sempat dikenali.
 */
const ESCAPABLE = '_*#`~|<>+-.!{}&$'
const PROTECTED_BASE = 0xe000

function escapePattern(chars: string): RegExp {
	return new RegExp(`\\\\([${chars.replace(/[\]\\^-]/g, '\\$&')}])`, 'g')
}

/**
 * `\_` → karakter pengganti di wilayah pakai-pribadi Unicode, supaya penanda
 * inline berikutnya tidak melihatnya sebagai penanda. `restoreEscapes`
 * mengembalikannya sesudah pemformatan selesai.
 */
export function protectEscapes(text: string, chars: string = ESCAPABLE): string {
	return text.replace(escapePattern(chars), (_whole, char: string) =>
		String.fromCharCode(PROTECTED_BASE + char.charCodeAt(0)),
	)
}

/**
 * Karakter yang dilindungi kembali menjadi dirinya - atau menjadi bentuk lain
 * lewat `render`: HTML-escape untuk konverter web, backslash utuh untuk isi
 * kode yang memang tidak mengenal escape.
 */
export function restoreEscapes(text: string, render: (char: string) => string = (char) => char): string {
	return text.replace(/[-]/g, (placeholder) =>
		render(String.fromCharCode(placeholder.charCodeAt(0) - PROTECTED_BASE)),
	)
}

/**
 * Baris yang meminta pindah halaman. Model menulisnya dengan kebiasaan LaTeX -
 * `\pagebreak`, `\newpage`, `\clearpage` - di antara bab, dan tanpa aturan ini
 * perintahnya tertulis sebagai paragraf sementara babnya tidak pernah pindah
 * halaman.
 */
export function isPageBreakLine(line: string): boolean {
	return /^\\(?:pagebreak|newpage|clearpage)(?:\{\})?$/i.test(line.trim())
}
