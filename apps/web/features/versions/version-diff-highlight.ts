import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { buildTextIndex, textPosToPM, textRangeToPM } from '@/features/document/tiptap-offsets'
import { countWords } from '@/lib/utils'
import type { VersionDiffRange } from './diff'

export const versionDiffHighlightKey = new PluginKey<VersionDiffHighlightState>('versionDiffHighlight')

interface VersionDiffHighlightState {
	ranges: VersionDiffRange[]
	decorations: DecorationSet
}

/**
 * Bangun dekorasi diff di atas dokumen preview.
 *
 * `removed` (ada di versi, hilang di draf) disorot inline merah muda bercoret.
 * `added` (ada di draf, tidak di versi) tidak punya rentang di dokumen preview,
 * jadi ia dirender sebagai marker hijau di titik sisipnya - menampilkan teks
 * tambahan secara inline berarti merender teks yang tidak ada di dokumen.
 */
function buildDecorations(doc: PMNode, ranges: readonly VersionDiffRange[]): DecorationSet {
	if (ranges.length === 0) return DecorationSet.empty

	const index = buildTextIndex(doc)
	const decorations: Decoration[] = []

	for (const range of ranges) {
		if (range.kind === 'removed') {
			const pm = textRangeToPM(index, range.offset, range.length)
			if (!pm) continue
			decorations.push(Decoration.inline(pm.from, pm.to, { class: 'version-diff-removed' }))
			continue
		}

		// Titik sisip berupa posisi tunggal; `textRangeToPM` menolak rentang
		// nol-panjang, jadi petakan lewat `textPosToPM` langsung.
		const pos = textPosToPM(index, range.offset)
		if (pos === null) continue

		const addedWords = countWords(range.words ?? '')
		decorations.push(
			Decoration.widget(
				pos,
				() => {
					const marker = document.createElement('span')
					marker.className = 'version-diff-added'
					marker.title = `${addedWords} kata ditambahkan di versi saat ini`
					marker.setAttribute('aria-label', `${addedWords} kata ditambahkan di versi saat ini`)
					return marker
				},
				{ key: `version-diff-added-${range.offset}` },
			),
		)
	}

	return DecorationSet.create(doc, decorations)
}

/**
 * Ekstensi penyorot selisih versi, dipasang hanya di editor preview riwayat -
 * tidak lewat `buildEditorExtensions`, supaya editor utama tidak ikut membawanya.
 *
 * Rentang masuk lewat meta transaksi (`VersionDiffRange[]` untuk memasang,
 * `null` untuk melepas) dan dekorasi dibangun ulang dari dokumen saat itu,
 * pola yang sama dengan `SuggestionHighlight`.
 */
export const VersionDiffHighlight = Extension.create({
	name: 'versionDiffHighlight',

	addProseMirrorPlugins() {
		return [
			new Plugin<VersionDiffHighlightState>({
				key: versionDiffHighlightKey,

				state: {
					init: () => ({ ranges: [], decorations: DecorationSet.empty }),

					apply(tr, current, _oldState, newState) {
						const incoming = tr.getMeta(versionDiffHighlightKey) as VersionDiffRange[] | null | undefined
						if (incoming !== undefined) {
							const ranges = incoming ?? []
							return { ranges, decorations: buildDecorations(newState.doc, ranges) }
						}
						if (tr.docChanged) {
							return {
								ranges: current.ranges,
								decorations: buildDecorations(newState.doc, current.ranges),
							}
						}
						return current
					},
				},

				props: {
					decorations: (state) => versionDiffHighlightKey.getState(state)?.decorations,
				},
			}),
		]
	},
})
