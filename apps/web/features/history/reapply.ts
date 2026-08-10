import type {
	AiDetectorResult,
	AiRewriterResult,
	AnalysisResultData,
	GrammarResultPayload,
	HumanizerResult,
	PlagiarismResult,
	TextChange,
	TranslatorResult,
} from '@writer-hub/shared'
import type { Doc } from 'yjs'
import type { PanelId } from '@/features/analysis/panel-context'
import { resolveSpan } from '@/features/document/suggestions'
import { fragmentToJSON } from '@/features/sync/serialize'
import { versionPlainText } from '@/features/versions/diff'
import type { HistoryFeature } from './types'

/** Teks polos naskah sebuah tab, dibaca langsung dari fragmen Y.Doc-nya. */
export function tabPlainText(doc: Doc, tabId: string): string {
	return versionPlainText(fragmentToJSON(doc, tabId))
}

/** Panel yang menampilkan hasil sebuah fitur aktivitas. */
export function panelForFeature(feature: HistoryFeature): PanelId {
	return feature === 'grammar' ? 'proofreader' : feature
}

/**
 * Hanya modul dengan usulan penggantian yang dapat "Terapkan ulang" (§F.4):
 * grammar (suggestions[]) dan rewriter/humanizer (changes[]). Detector dan
 * plagiarism hasilnya penilaian - tidak ada yang bisa "diterapkan".
 */
export function canReapply(feature: HistoryFeature | null): boolean {
	return feature === 'grammar' || feature === 'ai_rewriter' || feature === 'humanizer'
}

/**
 * Geser offset hasil lama ke posisinya di teks SEKARANG. Offset lama hanya
 * dipakai sebagai petunjuk oleh resolveSpan; segmen yang teks aslinya sudah
 * hilang dibiarkan apa adanya (alur apply di panel gagal dengan aman) dan
 * ditandai "teks sudah berubah" di panel detail - tidak dilewati diam-diam.
 */
function remapChanges(text: string, changes: readonly TextChange[]): TextChange[] {
	return changes.map((change) => {
		const span = resolveSpan(text, change.original, change.offset)
		return span ? { ...change, offset: span.offset, length: span.length } : change
	})
}

/**
 * Petakan ulang seluruh rentang sebuah hasil ke teks sekarang, per fitur.
 * Grammar tidak perlu: suggestions-nya direkonsiliasi reducer dokumen
 * (`applyCheckResult` → `reconcileSuggestions`) dengan resolveSpan yang sama.
 */
export function remapResult(
	feature: HistoryFeature,
	result: GrammarResultPayload | AnalysisResultData,
	text: string,
): GrammarResultPayload | AnalysisResultData {
	switch (feature) {
		case 'grammar':
			return result
		case 'ai_rewriter':
		case 'humanizer':
		case 'translator': {
			// Ketiganya berbentuk sama: satu `changes[]` berisi usulan pengganti.
			const typed = result as AiRewriterResult | HumanizerResult | TranslatorResult
			return { ...typed, changes: remapChanges(text, typed.changes) }
		}
		case 'ai_detector': {
			const typed = result as AiDetectorResult
			return {
				...typed,
				sentences: typed.sentences.map((sentence) => {
					const span = resolveSpan(text, sentence.text, sentence.offset)
					return span ? { ...sentence, offset: span.offset, length: span.length } : sentence
				}),
			}
		}
		case 'glossary':
			// Hasilnya daftar istilah, bukan rentang di naskah - tidak ada yang
			// perlu dipetakan ulang.
			return result
		case 'plagiarism': {
			const typed = result as PlagiarismResult
			return {
				...typed,
				flagged_phrases: typed.flagged_phrases.map((phrase) => {
					const span = resolveSpan(text, phrase.text, phrase.offset)
					return span ? { ...phrase, offset: span.offset, length: span.length } : phrase
				}),
			}
		}
	}
}
