import { REWRITE_TONES, type RewriterTone, type StyleMemory } from '@writer-hub/shared'
// Preferensi gaya tersimpan sudah punya satu terjemahan ke instruksi prompt.
// Menyalinnya ke sini akan membuat dua versi yang lambat laun berbeda.
import { memoryPrompt, templateRulesPrompt } from '@/services/chat/prompts'
import type { DraftRequest } from './dto'

/**
 * Teks peran "system" untuk permintaan draf dari klien eksternal.
 *
 * Bedanya dengan prompt AI Chat: di sini tidak ada percakapan, tidak ada tool,
 * dan tidak ada editor yang menunggu jawaban. Yang diminta satu hal - naskah
 * Markdown utuh yang langsung disimpan sebagai isi dokumen - jadi seluruh
 * basa-basi asisten justru merusak hasilnya.
 */
export const DRAFT_SYSTEM_PROMPT = [
	'You write complete documents, not chat replies.',
	'Return ONLY the document itself as Markdown: no preamble, no closing',
	'remarks, no questions back, and never wrap the whole document in a code',
	'fence.',
	'Open with a single "# " title line, then write the document under it.',
	'Use Markdown for structure: ## for sections, - for lists, | … | for tables,',
	'**bold** for emphasis. Use $…$ only for mathematics - never write a full',
	'LaTeX document.',
	'Write the whole piece the request asks for, with real content in every',
	'section - no placeholders like "[isi di sini]" and no outline-only drafts.',
].join(' ')

/** Register per permintaan, memakai daftar tone yang sama dengan Paraphraser. */
export function tonePrompt(tone: RewriterTone | undefined): string {
	const selected = tone ? REWRITE_TONES.find((item) => item.id === tone) : undefined
	if (!selected) return ''

	return `Write the document in a ${selected.instruction} register throughout.`
}

/**
 * Bahasa naskah. Tanpa permintaan eksplisit, bahasa permintaanlah yang diikuti -
 * pemanggil dari PPE meneruskan kalimat penggunanya apa adanya.
 */
export function languagePrompt(language: string | undefined): string {
	return language
		? `Write the document in ${language}.`
		: 'Write the document in the same language as the request.'
}

/**
 * Panjang yang diminta. Selain mengarahkan model, angka inilah yang dipakai
 * sebagai pembagi saat menaksir kemajuan (lihat `progress.ts`) - jadi ia harus
 * benar-benar sampai ke model, bukan cuma dipakai menghitung di belakang.
 */
export function lengthPrompt(words: number | undefined): string {
	return words ? `Aim for roughly ${words} words in total.` : ''
}

/**
 * Pesan berformat OpenAI untuk satu permintaan draf. Bagian yang kosong -
 * misalnya memori gaya yang belum pernah diisi - dibuang, bukan disisipkan
 * sebagai paragraf hampa.
 */
export function buildDraftMessages(
	request: DraftRequest,
	memory: StyleMemory | null,
	templateRules?: string[],
): Array<{ role: string; content: string }> {
	const system = [
		DRAFT_SYSTEM_PROMPT,
		languagePrompt(request.language),
		tonePrompt(request.tone),
		lengthPrompt(request.words),
		memoryPrompt(memory),
		templateRulesPrompt(templateRules),
	]
		.filter(Boolean)
		.join('\n\n')

	return [
		{ role: 'system', content: system },
		{ role: 'user', content: request.prompt ?? '' },
	]
}
