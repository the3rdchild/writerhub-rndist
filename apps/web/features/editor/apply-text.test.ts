import { describe, expect, test } from 'bun:test'
import { getSchema } from '@tiptap/core'
import { buildEditorExtensions } from './extensions'
import { buildTextIndex, textRangeToPM } from '@/features/document/tiptap-offsets'
import { resolveSpan } from '@/features/document/suggestions'

/**
 * `replaceTextRange` (§P10) memilih kemunculan teks yang benar lewat
 * `resolveSpan`, bukan `indexOf` dari awal dokumen. Logika itu diuji di sini
 * lewat komposisi yang persis dipakai fungsi tersebut:
 * `buildTextIndex(doc)` → `resolveSpan(index.text, expected, offset)`.
 *
 * Editor asli tidak dipakai karena membutuhkan DOM, sedangkan pemilihan offset
 * (inti perbaikan) murni aritmetika teks - sama seperti uji lain di repo ini.
 */

const schema = getSchema(buildEditorExtensions({}))

function docWith(paragraphs: string[]) {
	return schema.node(
		'doc',
		null,
		paragraphs.map((text) => schema.node('paragraph', null, text ? [schema.text(text)] : [])),
	)
}

describe('replaceTextRange: memilih kemunculan yang benar (§P10)', () => {
	test('kata yang muncul 20×: petunjuk ke kemunculan ke-17 menyasar ke-17, bukan ke-1', () => {
		// 20 kemunculan "yang" dipisah spasi; kemunculan ke-k (1-induks) berada di
		// offset (k-1)*5. Jadi ke-17 berada di offset 80.
		const text = 'yang '.repeat(19) + 'yang'
		const doc = docWith([text])
		const index = buildTextIndex(doc)

		// Offset API kerap meleset satu-dua karakter; di sini petunjuk 81
		// (satu karakter setelah awal ke-17). Dulu `indexOf` menjatuhkan ke
		// kemunculan pertama (offset 0); resolveSpan harus tetap ke ke-17.
		const span = resolveSpan(index.text, 'yang', 81)
		expect(span).not.toBeNull()
		expect(span?.offset).toBe(80)

		// Rentang ProseMirror yang dipetakan juga harus menunjuk ke ke-17.
		const range = textRangeToPM(index, span!.offset, span!.length)
		expect(range).not.toBeNull()
		expect(doc.textBetween(range!.from, range!.to)).toBe('yang')
	})

	test('offset yang persis tepat tetap dipakai apa adanya', () => {
		const text = 'kucing anjing kucing anjing kucing'
		const doc = docWith([text])
		const index = buildTextIndex(doc)

		// "kucing" ke-1 di offset 0, ke-2 di 14, ke-3 di 28.
		expect(resolveSpan(index.text, 'kucing', 0)?.offset).toBe(0)
		expect(resolveSpan(index.text, 'kucing', 14)?.offset).toBe(14)
		expect(resolveSpan(index.text, 'kucing', 28)?.offset).toBe(28)
	})

	test('teks yang sudah tidak ada membuat gagal (null), bukan menjatuhkan ke posisi asal', () => {
		const doc = docWith(['naskah biasa tanpa kata yang dicari'])
		const index = buildTextIndex(doc)

		expect(resolveSpan(index.text, 'tidakada', 5)).toBeNull()
	})
})
