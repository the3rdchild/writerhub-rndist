import { fontChoicePrompt, REWRITE_TONES, type RewriterTone, type StyleMemory } from '@writer-hub/shared'
// Preferensi gaya tersimpan sudah punya satu terjemahan ke instruksi prompt.
// Menyalinnya ke sini akan membuat dua versi yang lambat laun berbeda.
import { memoryPrompt, templateRulesPrompt } from '@/services/chat/prompts'
import { canvasPrompt, designPageCount } from './design-layout'
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
 * Baris judul di depan pagar diminta, bukan sekadar ditoleransi. Versi pertama
 * melarang apa pun sebelum pagarnya, dan akibatnya baru terlihat di nama berkas:
 * rancangan tidak punya heading Markdown, jadi `headingTitle` mengembalikan null
 * dan judul dokumen jatuh ke `promptTitle` - 80 karakter pertama kalimat
 * penggunanya. Unduhannya bernama "buatin saya pamflet jangan buang sampah,
 * outputnya pdf.pdf".
 *
 * Hilirnya sudah menampung sejak awal: pengurai rancangan melewatkan satu heading
 * di depan pagar dan `headingTitle` memungutnya (`markdown-doc.ts`). Yang kurang
 * cuma izin di sini.
 */
const FLYER_TITLE_LINES = [
	'Open with a single "# " title line naming the piece - the title of the design',
	'itself, not a restatement of the request. Keep it short: it becomes the',
	'document title and the name of the downloaded file.',
]

/** Satu pagar = satu rancangan satu halaman (bentuk aslinya, tetap dipakai). */
const FLYER_SINGLE_FENCE = [
	'Then return ONE fenced ```html block and nothing else - no prose between the',
	'title and the fence, no explanation after it, no second block.',
	'Inside it, write the body markup of a self-contained one-page design.',
]

/**
 * Aturan kerajinannya - berlaku sama untuk satu halaman maupun banyak.
 *
 * Aturannya nyaris sama dengan `insert_html_block` di AI Chat, dan memang harus
 * begitu: keduanya berakhir di blok yang sama, dirender bingkai terkurung yang
 * sama (`html-sandbox.ts`), dan diratakan jadi gambar oleh pengekspor yang sama.
 * Satu-satunya beda, di sini tidak ada editor yang bisa ditanyai geometrinya -
 * jadi rancangannya harus mengisi ruang yang diberikan, berapa pun ukurannya.
 */
const FLYER_RULES = [
	'You are NOT writing a web page that displays a sheet - your markup IS the',
	'sheet. So: give the root element width:100% and height:100%, never a fixed',
	'pixel size; do not style <body> as a viewport that centres a page inside',
	'it (no min-height:100vh, no display:flex with align-items:center on body);',
	'do not paint a "desk" colour behind the design. Every one of those leaves',
	'the artwork floating in the middle of the paper with dead margins around',
	'it. Size everything in % or em, never vh/vw.',
	'Content taller than the sheet is cut off at the page edge rather than',
	'scaled down, so compose to fit rather than trusting it to shrink.',
	'All CSS must be inline or in a <style> tag inside the block.',
	'NOTHING loads from a URL - no icon library, no remote image, no font file.',
	'Draw icons, logos, badges and decorative shapes as inline <svg>: markup is',
	'not a network request, so it renders, prints as vector, and survives export.',
	'Write the path data yourself, and do not let emoji stand in for icons.',
	'Raster images must be data: URIs.',
	fontChoicePrompt(),
	'Scripts never run, so the design must be complete without them.',
	'Design it properly: real typographic hierarchy, layered shapes, gradients',
	'and custom SVG iconography - not a coloured box with text on it.',
]

export const DRAFT_FLYER_PROMPT = [...FLYER_TITLE_LINES, ...FLYER_SINGLE_FENCE, ...FLYER_RULES].join(' ')

/**
 * Prompt rancangan untuk jumlah halaman yang diminta.
 *
 * `null` (atau 1) memakai bentuk asli satu-pagar - permintaan tanpa angka
 * memang tidak pernah menjanjikan halaman kedua. Angka N mengganti instruksi
 * pagarnya: N pagar berurutan, satu per halaman, sebagai satu karya
 * bersambung (docs/DRAFTS-API-FINDINGS.md T2).
 */
export function flyerPrompt(pages: number | null): string {
	if (pages === null || pages <= 1) return DRAFT_FLYER_PROMPT

	return [
		...FLYER_TITLE_LINES,
		`Then return EXACTLY ${pages} fenced \`\`\`html blocks in order - one per page -`,
		'separated by a blank line and nothing else: no prose between blocks, no',
		'explanation after the last one, no fewer and no more blocks.',
		'Inside each block, write the body markup of one self-contained page; the',
		'pages form a single continuing piece, so repeat nothing but the design',
		'language, and let the final page complete and close the piece.',
		...FLYER_RULES,
	].join(' ')
}

/**
 * Izin memilih sendiri, dipakai saat pemanggil tidak menyatakan bentuknya.
 *
 * Diletakkan sebagai satu kalimat di ujung prompt dokumen, bukan sebagai prompt
 * ketiga: yang dibutuhkan model hanyalah tahu bahwa pintu keluar itu ada.
 * Deteksinya di sisi kami meniru promptnya: satu pagar untuk permintaan tanpa
 * angka, N pagar untuk permintaan ber-angka (T2) - keduanya diurai
 * `markdown-doc.ts`; artikel yang kebetulan memuat contoh HTML tetap jadi
 * dokumen biasa karena prosa sebelum pagarnya tetap membatalkan.
 */
export const DRAFT_AUTO_CLAUSE = [
	'EXCEPTION: if the request is for a flyer, poster, pamphlet, banner,',
	'one-pager, certificate or invitation - anything whose whole point is a',
	'visual one-page layout rather than running text - do not write a document.',
	'Answer instead with a "# " title line followed by ONE fenced ```html block',
	'and nothing else, following these rules:',
	DRAFT_FLYER_PROMPT,
].join(' ')

/** Klausa yang sama untuk permintaan ber-angka halaman (T2). */
export function draftAutoClause(pages: number | null): string {
	if (pages === null || pages <= 1) return DRAFT_AUTO_CLAUSE

	return [
		'EXCEPTION: if the request is for a flyer, poster, pamphlet, banner,',
		'one-pager, certificate or invitation - anything whose whole point is a',
		'visual one-page layout rather than running text - do not write a document.',
		`Answer instead with a "# " title line followed by EXACTLY ${pages} fenced`,
		'```html blocks (one per page, in order) and nothing else, following these',
		'rules:',
		flyerPrompt(pages),
	].join(' ')
}

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
	 *
	 * Jumlah halaman hanya dihitung untuk bentuk rancangan; permintaan prosa
	 * "makalah 10 halaman" tidak pernah melihat angkanya sampai model memilih
	 * jalur rancangannya - dan begitu pun angkanya dipingit (T2).
	 */
	const designPages = designPageCount(request.prompt)
	const system =
		request.kind === 'flyer'
			? [flyerPrompt(designPages), canvasPrompt(request.prompt), languagePrompt(request.language)]
					.filter(Boolean)
					.join('\n\n')
			: [
					DRAFT_SYSTEM_PROMPT,
					languagePrompt(request.language),
					tonePrompt(request.tone),
					lengthPrompt(request.words),
					memoryPrompt(memory),
					templateRulesPrompt(templateRules),
					// Template menyatakan bentuknya sendiri; jangan tawarkan pintu
					// keluar yang bertentangan dengan kerangka yang sudah dipilih.
					request.kind === 'document' || templateRules?.length
						? ''
						: `${draftAutoClause(designPages)} ${canvasPrompt(request.prompt)}`,
				]
					.filter(Boolean)
					.join('\n\n')

	return [
		{ role: 'system', content: system },
		{ role: 'user', content: request.prompt ?? '' },
	]
}
