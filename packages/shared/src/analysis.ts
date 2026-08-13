import type { JobStatus } from './job'

export const ANALYSIS_FEATURES = [
	'ai_detector',
	'ai_rewriter',
	'humanizer',
	'plagiarism',
	'translator',
	'glossary',
] as const
export type AnalysisFeature = (typeof ANALYSIS_FEATURES)[number]

/**
 * Preferensi gaya AI Memory - ditulis eksplisit oleh user di Pengaturan
 * (bukan inferensi diam-diam), lalu dibaca server dan disuntikkan ke prompt
 * AI Chat serta payload job AI Rewriter/Humanizer (`style_memory`).
 * Klien tidak pernah mengirimnya per request.
 */
/**
 * Pilihan tone untuk AI Rewriter - dipilih user per run di panel.
 * `instruction` ditempel ke prompt sebagai pengganti field `tone` AI Memory
 * (keputusan: tone pilihan panel menang atas tone memory untuk run itu).
 */
export const REWRITE_TONES = [
	{ id: 'academic', label: 'Akademik', instruction: 'academic and scholarly' },
	{ id: 'formal', label: 'Formal', instruction: 'formal and professional' },
	{ id: 'casual', label: 'Santai', instruction: 'casual and conversational' },
	{
		id: 'natural',
		label: 'Lebih natural',
		instruction: 'natural and human-like, as if written by a person rather than an AI',
	},
] as const
export type RewriterTone = (typeof REWRITE_TONES)[number]['id']
export const REWRITE_TONE_IDS = REWRITE_TONES.map((tone) => tone.id) as [RewriterTone, ...RewriterTone[]]

export interface StyleMemory {
	/** Nada tulisan, teks bebas (mis. "formal", "santai"). */
	tone?: string
	/**
	 * Bahasa default keluaran AI. Disimpan sebagai label (mis. "Bahasa
	 * Indonesia"), bukan kode - nilainya langsung ditempel ke prompt.
	 */
	language?: string
	/** Istilah yang tidak boleh diubah/diterjemahkan. */
	glossary?: string[]
	/** Catatan gaya bebas, maks 500 karakter. */
	notes?: string
}

/** Rentang karakter pada teks sumber - dipakai highlight & apply. */
export interface TextRange {
	offset: number
	length: number
}

/** Perubahan teks yang bisa di-accept/dismiss per segmen. */
export interface TextChange extends TextRange {
	original: string
	replacement: string
	/**
	 * Alternatif pengganti (AI Rewriter: 2 varian per segmen; pengguna memilih
	 * salah satu sebelum apply). Opsional - fitur tanpa kandidat (Humanizer)
	 * memakai `replacement` saja. Bila ada, `candidates[0]` selalu sama dengan
	 * `replacement`, jadi pembaca lama tetap mendapat perilaku yang sama.
	 */
	candidates?: string[]
}

export interface AiDetectorResult {
	overall_score: number
	label: 'Human' | 'Mixed' | 'AI-Generated'
	sentences: Array<TextRange & { text: string; score: number; suggestion?: string | null }>
}

export interface AiRewriterResult {
	rewritten_text: string
	changes: TextChange[]
	/**
	 * Benar bila LLM tidak terjangkau sehingga naskah dikembalikan apa adanya.
	 *
	 * Tanpa penanda ini, hasil gagal dan hasil "naskahmu memang sudah bagus"
	 * sama-sama berupa `changes: []`, dan panel terpaksa menebak - lalu
	 * mengabarkan yang salah kepada pengguna.
	 */
	llm_unavailable?: boolean
}

export interface HumanizerResult {
	humanized_text: string
	changes_count: number
	changes: TextChange[]
	/** Sama seperti `AiRewriterResult.llm_unavailable`. */
	llm_unavailable?: boolean
}

/**
 * Hasil Translator. Bentuknya sengaja sama dengan AI Rewriter - satu change per
 * kalimat - supaya panel, highlight layer, dan alur apply yang sudah ada bisa
 * dipakai ulang tanpa cabang baru. Bedanya hanya asal usulannya: terjemahan,
 * bukan tulisan ulang.
 */
export interface TranslatorResult {
	translated_text: string
	changes: TextChange[]
	/** Bahasa sumber yang terdeteksi model; sekadar ditampilkan di panel. */
	detected_language?: string
	/** Sama seperti `AiRewriterResult.llm_unavailable`. */
	llm_unavailable?: boolean
}

/** Satu istilah di daftar Glosarium. */
export interface GlossaryEntry {
	term: string
	/**
	 * Kepanjangan singkatan, mis. "Distributed Control System" untuk "DCS".
	 * Kosong untuk istilah yang memang bukan singkatan, dan untuk singkatan khas
	 * satu instansi yang kepanjangannya tidak disebut di naskah - menebaknya di
	 * dokumen akademik lebih berbahaya daripada membiarkannya kosong.
	 */
	expansion?: string
	definition: string
	/** Berapa kali istilah ini muncul di naskah - bahan urut dan keyakinan. */
	occurrences: number
	/**
	 * Asal kandidat: 'acronym' (akronim, diterima walau muncul sekali) atau
	 * 'phrase' (frasa berkapital yang berulang). Opsional supaya hasil lama yang
	 * belum membawa bidang ini tetap terbaca (§P2).
	 */
	source?: 'acronym' | 'phrase'
}

/**
 * Hasil Glosarium. Berbeda dari modul lain, hasilnya BUKAN rentang teks untuk
 * disorot atau diganti, melainkan daftar istilah yang disisipkan sebagai tabel.
 * Karena itu ia tidak menyentuh highlight layer maupun alur apply.
 */
export interface GlossaryResult {
	entries: GlossaryEntry[]
	/** Sama seperti `AiRewriterResult.llm_unavailable`. */
	llm_unavailable?: boolean
}

export interface PlagiarismResult {
	uniqueness_score: number
	label: 'Unique' | 'Likely Original' | 'Possible Match' | 'High Similarity'
	flagged_phrases: Array<TextRange & { text: string; similarity: number }>
}

/** Peta feature → shape hasilnya. Sumber kebenaran untuk tipe hasil analisis. */
export interface AnalysisResultMap {
	ai_detector: AiDetectorResult
	ai_rewriter: AiRewriterResult
	humanizer: HumanizerResult
	plagiarism: PlagiarismResult
	translator: TranslatorResult
	glossary: GlossaryResult
}

export type AnalysisResultFor<F extends AnalysisFeature> = AnalysisResultMap[F]
export type AnalysisResultData = AnalysisResultMap[AnalysisFeature]

/** Respons `GET /api/v1/status/:jobId` untuk job analisis. */
export interface AnalysisJobStatus<F extends AnalysisFeature = AnalysisFeature> {
	jobId: string
	status: JobStatus
	title: string | null
	error?: string
	feature?: F
	result?: AnalysisResultFor<F>
}

/** Event SSE job analisis - hasil datang sekaligus di event `done`. */
export type AnalysisStreamEvent<F extends AnalysisFeature = AnalysisFeature> =
	| { type: 'done'; result: AnalysisResultFor<F> }
	| { type: 'error'; message: string }
	| { type: 'timeout' }
	| { type: 'ping' }
