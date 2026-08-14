import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { buildTextIndex, textPosToPM, textRangeToPM } from '@/features/document/tiptap-offsets'
import { countWords } from '@/lib/utils'
import type { VersionDiffRange } from '@/features/versions/diff'

export const analysisDiffHighlightKey = new PluginKey<AnalysisDiffHighlightState>('analysisDiffHighlight')

interface AnalysisDiffHighlightState {
	ranges: VersionDiffRange[]
	decorations: DecorationSet
}

/**
 * Bangun dekorasi diff analisis di atas editor UTAMA (bukan pratinjau
 * riwayat). Pola sama persis dengan `version-diff-highlight.ts` - hanya plugin
 * key-nya yang beda, supaya keduanya bisa hidup bersama (riwayat versi di
 * editor pratinjau, diff hasil analisis di editor aktif).
 *
 * Kelas CSS dipakai ulang (`version-diff-removed` / `version-diff-added`) supaya
 * dua mode diff terlihat identik - kurang lebih seperti Google Docs yang tidak
 * membedakan warna diff menurut sumbernya.
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
					marker.title = `${addedWords} word${addedWords === 1 ? '' : 's'} added by this run`
					marker.setAttribute('aria-label', `${addedWords} word${addedWords === 1 ? '' : 's'} added by this run`)
					return marker
				},
				{ key: `analysis-diff-added-${range.offset}` },
			),
		)
	}

	return DecorationSet.create(doc, decorations)
}

/**
 * Ekstensi penyorot diff hasil analisis, dipasang di editor utama lewat
 * `buildEditorExtensions`. Rentang masuk lewat meta transaksi
 * (`VersionDiffRange[]` untuk memasang, `null` untuk melepas) dan dekorasi
 * dibangun ulang dari dokumen saat itu - pola yang sama dengan
 * `SuggestionHighlight` dan `AnalysisHighlight`.
 *
 * Saat dokumen berubah (`tr.docChanged`), dekorasi dihitung ulang dari rentang
 * yang sama supaya penanda tetap menempel pada teksnya walau paragraf bergeser.
 */
export const AnalysisDiffHighlight = Extension.create({
	name: 'analysisDiffHighlight',

	addProseMirrorPlugins() {
		return [
			new Plugin<AnalysisDiffHighlightState>({
				key: analysisDiffHighlightKey,

				state: {
					init: () => ({ ranges: [], decorations: DecorationSet.empty }),
					apply(tr, current, _oldState, newState) {
						const incoming = tr.getMeta(analysisDiffHighlightKey) as VersionDiffRange[] | null | undefined
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
					decorations: (state) => analysisDiffHighlightKey.getState(state)?.decorations,
				},
			}),
		]
	},
})
