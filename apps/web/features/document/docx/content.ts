/** Pembantu kecil untuk node hasil (JSONContent), bukan untuk XML masukan. */
import type { JSONContent } from '@tiptap/core'

/** Teks gabungan sebuah node hasil (untuk perataan tabel bersarang). */
export function textOfNode(node: JSONContent): string {
	if (node.type === 'text') return node.text ?? ''
	// Tab kini node tersendiri; pola teks (daftar isi manual) tetap membacanya sebagai `\t`.
	if (node.type === 'tab') return '\t'
	return (node.content ?? []).map(textOfNode).join('')
}
