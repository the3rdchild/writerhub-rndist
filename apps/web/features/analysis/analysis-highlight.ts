import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { AnalysisFeature, TextRange } from '@writer-hub/shared'
import { buildTextIndex, textRangeToPM } from '@/features/document/tiptap-offsets'

export const analysisHighlightKey = new PluginKey<AnalysisHighlightState>('analysisHighlight')

/** Jenis sorotan; tiap jenis punya kelas CSS sendiri di globals.css. */
export type AnalysisHighlightKind = 'change' | 'ai-low' | 'ai-medium' | 'ai-high'

/** Rentang dalam koordinat teks polos dokumen - koordinat yang dipakai API. */
export interface AnalysisHighlightRange extends TextRange {
	kind: AnalysisHighlightKind
}

/**
 * Perintah meta transaksi: pasang ulang SELURUH rentang milik satu sumber.
 * Kirim `ranges: []` untuk membersihkan sumber itu.
 */
export interface AnalysisHighlightUpdate {
	source: AnalysisFeature
	ranges: AnalysisHighlightRange[]
}

interface AnalysisHighlightState {
	sources: Partial<Record<AnalysisFeature, AnalysisHighlightRange[]>>
	decorations: DecorationSet
}

const KIND_CLASS: Record<AnalysisHighlightKind, string> = {
	change: 'analysis-highlight--change',
	'ai-low': 'analysis-highlight--ai-low',
	'ai-medium': 'analysis-highlight--ai-medium',
	'ai-high': 'analysis-highlight--ai-high',
}

/** Tingkat sorotan AI detector dari skor kalimat: rendah kuning, tinggi merah. */
export function aiScoreLevel(score: number): AnalysisHighlightKind {
	if (score < 40) return 'ai-low'
	if (score <= 70) return 'ai-medium'
	return 'ai-high'
}

function buildDecorations(
	doc: PMNode,
	sources: Partial<Record<AnalysisFeature, AnalysisHighlightRange[]>>,
): DecorationSet {
	const decorations: Decoration[] = []
	const index = buildTextIndex(doc)

	for (const ranges of Object.values(sources)) {
		for (const range of ranges) {
			const pm = textRangeToPM(index, range.offset, range.length)
			if (!pm) continue
			decorations.push(Decoration.inline(pm.from, pm.to, { class: KIND_CLASS[range.kind] }))
		}
	}

	return decorations.length > 0 ? DecorationSet.create(doc, decorations) : DecorationSet.empty
}

/**
 * Sorotan hasil analisis (Humanizer, Translator, AI Detector) di dalam editor.
 *
 * Rentang masuk lewat meta transaksi per sumber (`AnalysisHighlightUpdate`),
 * dibangun ulang dari dokumen saat itu. Saat naskah disunting, dekorasi ikut
 * bergeser lewat `DecorationSet.map` - offset tersimpan tidak dihitung ulang
 * karena posisinya memang hanya perkiraan sampai run berikutnya.
 */
export const AnalysisHighlight = Extension.create({
	name: 'analysisHighlight',

	addProseMirrorPlugins() {
		return [
			new Plugin<AnalysisHighlightState>({
				key: analysisHighlightKey,

				state: {
					init: () => ({ sources: {}, decorations: DecorationSet.empty }),

					apply(tr, current, _oldState, newState) {
						const incoming = tr.getMeta(analysisHighlightKey) as AnalysisHighlightUpdate | undefined
						if (incoming) {
							const sources = { ...current.sources, [incoming.source]: incoming.ranges }
							return { sources, decorations: buildDecorations(newState.doc, sources) }
						}
						if (tr.docChanged) {
							return {
								sources: current.sources,
								decorations: current.decorations.map(tr.mapping, tr.doc),
							}
						}
						return current
					},
				},

				props: {
					decorations: (state) => analysisHighlightKey.getState(state)?.decorations,
				},
			}),
		]
	},
})
