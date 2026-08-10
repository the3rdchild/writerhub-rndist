import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { buildTextIndex, textRangeToPM } from '@/features/document/tiptap-offsets'

export const candidatePreviewKey = new PluginKey<CandidatePreviewState>('candidatePreview')

/** Kandidat yang sedang dijenguk; `null` berarti tidak ada preview. */
export interface CandidatePreview {
	/** Offset teks polos segmen yang akan diganti. */
	offset: number
	length: number
	/** Teks asli segmen - dipakai mencari ulang bila naskah bergeser. */
	original: string
	/** Kandidat yang sedang dilihat. */
	candidate: string
}

interface CandidatePreviewState {
	preview: CandidatePreview | null
	decorations: DecorationSet
}

/**
 * Bangun dekorasi bayangan untuk satu kandidat.
 *
 * Naskah aslinya dicoret di tempat, dan kandidatnya muncul sebagai widget di
 * sebelahnya. Dokumen TIDAK disentuh: preview yang menulis ke dokumen lalu
 * mengandalkan undo akan mengotori riwayat undo dan menandai tab kotor tiap
 * kali pengguna sekadar melirik kandidat, sehingga autosave menembak berulang
 * kali untuk perubahan yang belum tentu jadi.
 */
function buildDecorations(doc: PMNode, preview: CandidatePreview | null): DecorationSet {
	if (!preview) return DecorationSet.empty

	const index = buildTextIndex(doc)

	// Offset hasil analisis bisa basi kalau naskah disunting setelah run.
	// Teks aslinya dicari ulang, dan bila sudah tidak ada preview-nya dilewat -
	// lebih baik tidak menampilkan apa-apa daripada menyorot kalimat yang salah.
	const at = index.text.slice(preview.offset, preview.offset + preview.length)
	const start = at === preview.original ? preview.offset : index.text.indexOf(preview.original)
	if (start === -1) return DecorationSet.empty

	const range = textRangeToPM(index, start, preview.original.length)
	if (!range) return DecorationSet.empty

	return DecorationSet.create(doc, [
		Decoration.inline(range.from, range.to, { class: 'candidate-preview-original' }),
		Decoration.widget(
			range.to,
			() => {
				const ghost = document.createElement('span')
				ghost.className = 'candidate-preview-ghost'
				ghost.textContent = preview.candidate
				// Bayangan bukan bagian naskah: jangan bisa disalin, dipilih, atau
				// dibaca pembaca layar sebagai isi dokumen.
				ghost.setAttribute('aria-hidden', 'true')
				ghost.contentEditable = 'false'
				return ghost
			},
			{ side: 1, key: `candidate-${start}-${preview.candidate.length}` },
		),
	])
}

/**
 * Pratinjau kandidat AI Rewriter langsung di naskah.
 *
 * Dipasang lewat meta transaksi (`CandidatePreview` untuk menampilkan, `null`
 * untuk membersihkan) dan dibangun ulang dari dokumen saat itu - pola yang sama
 * dengan `SuggestionHighlight` dan `VersionDiffHighlight`.
 */
export const CandidatePreviewHighlight = Extension.create({
	name: 'candidatePreview',

	addProseMirrorPlugins() {
		return [
			new Plugin<CandidatePreviewState>({
				key: candidatePreviewKey,

				state: {
					init: () => ({ preview: null, decorations: DecorationSet.empty }),

					apply(tr, current, _oldState, newState) {
						const incoming = tr.getMeta(candidatePreviewKey) as
							| CandidatePreview
							| null
							| undefined
						if (incoming !== undefined) {
							return { preview: incoming, decorations: buildDecorations(newState.doc, incoming) }
						}
						if (tr.docChanged) {
							return {
								preview: current.preview,
								decorations: buildDecorations(newState.doc, current.preview),
							}
						}
						return current
					},
				},

				props: {
					decorations: (state) => candidatePreviewKey.getState(state)?.decorations,
				},
			}),
		]
	},
})
