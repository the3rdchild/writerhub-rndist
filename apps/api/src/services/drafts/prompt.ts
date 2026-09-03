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

/**
 * Naskah berupa rancangan satu halaman, bukan prosa.
 *
 * Aturannya nyaris sama dengan `insert_html_block` di AI Chat, dan memang harus
 * begitu: keduanya berakhir di blok yang sama, dirender bingkai terkurung yang
 * sama (`html-sandbox.ts`), dan diratakan jadi gambar oleh pengekspor yang sama.
 * Satu-satunya beda, di sini tidak ada editor yang bisa ditanyai geometrinya -
 * jadi rancangannya harus mengisi ruang yang diberikan, berapa pun ukurannya.
 */
export const DRAFT_FLYER_PROMPT = [
	'Return ONE fenced ```html block and nothing else - no prose before or',
	'after it, no explanation, no second block.',
	'Inside it, write the body markup of a self-contained one-page design.',
	'Give the root element width:100% and height:100% and lay everything out',
	'inside it: the frame you are given IS the sheet, so never hardcode pixel',
	'dimensions, and anything taller than it is cut off at the page edge rather',
	'than scaled down.',
	'All CSS must be inline or in a <style> tag inside the block.',
	'NOTHING loads from a URL - no icon library, no web font, no remote image.',
	'Draw icons, logos, badges and decorative shapes as inline <svg>: markup is',
	'not a network request, so it renders, prints as vector, and survives export.',
	'Write the path data yourself, and do not let emoji stand in for icons.',
	'Raster images must be data: URIs; fonts must be data: URIs or system fonts.',
	'Scripts never run, so the design must be complete without them.',
	'Design it properly: real typographic hierarchy, layered shapes, gradients',
	'and custom SVG iconography - not a coloured box with text on it.',
].join(' ')

/**
 * Izin memilih sendiri, dipakai saat pemanggil tidak menyatakan bentuknya.
 *
 * Diletakkan sebagai satu kalimat di ujung prompt dokumen, bukan sebagai prompt
 * ketiga: yang dibutuhkan model hanyalah tahu bahwa pintu keluar itu ada.
 * Deteksinya di sisi kami sengaja sempit - hanya jawaban yang seluruhnya satu
 * pagar ```html yang dianggap rancangan (lihat `markdown-doc.ts`), jadi artikel
 * yang kebetulan memuat contoh HTML tetap jadi dokumen biasa.
 */
export const DRAFT_AUTO_CLAUSE = [
	'EXCEPTION: if the request is for a flyer, poster, pamphlet, banner,',
	'one-pager, certificate or invitation - anything whose whole point is a',
	'visual one-page layout rather than running text - do not write a document.',
	'Answer instead with ONE fenced ```html block and nothing else, following',
	'these rules:',
	DRAFT_FLYER_PROMPT,
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
	/*
	 * Rancangan satu halaman tidak punya panjang kata, register, maupun aturan
	 * format template yang berarti - semuanya menggambarkan prosa. Menyisipkan
	 * keduanya hanya mengaburkan satu-satunya perintah yang penting di sini.
	 */
	const system =
		request.kind === 'flyer'
			? [DRAFT_FLYER_PROMPT, languagePrompt(request.language)].filter(Boolean).join('\n\n')
			: [
					DRAFT_SYSTEM_PROMPT,
					languagePrompt(request.language),
					tonePrompt(request.tone),
					lengthPrompt(request.words),
					memoryPrompt(memory),
					templateRulesPrompt(templateRules),
					// Template menyatakan bentuknya sendiri; jangan tawarkan pintu
					// keluar yang bertentangan dengan kerangka yang sudah dipilih.
					request.kind === 'document' || templateRules?.length ? '' : DRAFT_AUTO_CLAUSE,
				]
					.filter(Boolean)
					.join('\n\n')

	return [
		{ role: 'system', content: system },
		{ role: 'user', content: request.prompt ?? '' },
	]
}
