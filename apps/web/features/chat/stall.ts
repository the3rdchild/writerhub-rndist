import type { Node as PMNode } from '@tiptap/pm/model'
import { PAGE_BREAK_NODE } from '@/features/editor/page-break'
import { TOC_BLOCK } from '@/features/editor/toc-block'

/**
 * Tugas chat yang berhenti sebelum selesai, dan cara melanjutkannya.
 *
 * Uji use case dengan Flash: delapan dari sembilan dokumen berhenti di tengah
 * dan baru bergerak lagi setelah penulis mengetik "lanjutkan" - sampai delapan
 * kali per dokumen. Sebabnya bukan satu:
 *
 * - `wave_limit` - rem biaya: sesudah sekian gelombang suntingan beruntun,
 *   aplikasi berhenti menyambung giliran sendiri.
 * - `promised` - model menutup gilirannya dengan "Saya akan melanjutkan
 *   dengan BAB II." tanpa satu pun panggilan alat. Tidak ada yang menunggu
 *   penulis; model hanya berhenti.
 * - `truncated` - jawaban terpotong batas panjang keluaran provider.
 * - `empty` - provider selesai tanpa teks dan tanpa panggilan alat.
 * - `unfinished` - model menutup tugas menulis dari kerangka yang baru
 *   disetujui, padahal kerangkanya belum terpenuhi: bab kosong, tabel/gambar
 *   yang dijanjikan belum ada, atau panjangnya jauh dari target.
 *
 * Semuanya ditangani sama: dilanjutkan otomatis beberapa kali, lalu - kalau
 * masih berhenti - kartu "Lanjutkan" di tempat percakapannya berhenti.
 */

export type StallReason = 'wave_limit' | 'promised' | 'truncated' | 'empty' | 'unfinished'

/**
 * Lanjutan otomatis per permintaan penulis. Satu lanjutan membuka satu
 * rangkaian gelombang suntingan baru, jadi ini sekaligus batas atas biayanya;
 * sesudahnya penulis sendiri yang memutuskan lewat tombol.
 */
export const MAX_AUTO_CONTINUES = 3

/**
 * Boleh dilanjutkan otomatis? Selama jatahnya ada - kecuali tugas berhenti lagi
 * karena sebab yang sama tanpa satu suntingan pun sejak lanjutan sebelumnya:
 * model yang sesudah didorong tetap hanya berjanji tidak akan berubah pada
 * dorongan berikutnya. Sebab yang berbeda (jeda gelombang, lalu janji) masih
 * layak satu dorongan, karena dorongannya pun berbeda.
 */
export function mayAutoContinue(autoContinues: number, progressed: boolean, repeated: boolean): boolean {
	if (autoContinues >= MAX_AUTO_CONTINUES) return false
	return progressed || !repeated
}

/*
 * Kalimat yang mengumumkan langkah berikutnya sebagai pernyataan, bukan
 * tawaran: "Saya akan melanjutkan dengan BAB II.", "Selanjutnya saya akan
 * menulis BAB III.", "Let me continue with chapter 2."
 */
const NEXT_STEP: readonly RegExp[] = [
	/\b(saya|aku|kami)\s+(akan\s+|segera\s+|sekarang\s+|langsung\s+)*(lanjut|lanjutkan|melanjutkan|teruskan|meneruskan)\b/i,
	/\b(selanjutnya|berikutnya|sekarang|kemudian|setelah itu)\s*,?\s*(saya|aku|kami)\s+(akan|mau|hendak)\b/i,
	/\b(saya|aku|kami)\s+akan\s+(segera\s+|langsung\s+|sekarang\s+)?(menulis|menambahkan|mengisi|membuat|menyusun|mengerjakan|memperbaiki|menerapkan|menyisipkan|melengkapi|memasukkan|mengganti|merapikan)\b/i,
	/\b(mari|ayo)\s+(kita\s+)?(lanjut|lanjutkan|mulai|kerjakan|tulis|isi)\b/i,
	/^(lanjut|beralih|pindah)\s+ke\s+/i,
	/\b(i'?ll|i will|let me|let's|i am going to|i'm going to)\s+(now\s+)?(continue|proceed|move on|write|add|fill|start|finish)\b/i,
	/\bmoving on to\b/i,
]

/*
 * Yang menunggu penulis bukan macet: pertanyaan, tawaran bersyarat ("jika
 * Anda setuju, saya akan..."), atau permintaan persetujuan.
 */
const WAITS =
	/\?\s*$|\b(jika|kalau|bila|apabila|seandainya|setelah|begitu)\b.{0,60}\b(anda|kamu|setuju|berkenan|izin|mengizinkan)\b|\bmenunggu\s+(konfirmasi|persetujuan|jawaban|arahan|masukan)|\b(silakan|mohon)\s+(pilih|tentukan|konfirmasi|beri|jawab|tinjau|periksa|setujui)|\bberi\s?tahu\b|\b(if you|would you|let me know|shall i|should i|once you)\b/i

const SENTENCE_END = /(?<=[.!?])\s+/

/**
 * Model menutup gilirannya dengan janji langkah berikutnya? Hanya paragraf
 * terakhir yang dibaca - rencana di awal jawaban ("Saya akan menulis lima
 * bab: ...") bukan tanda berhenti.
 */
export function promisesMore(text: string): boolean {
	const paragraphs = text
		.trim()
		.split(/\n\s*\n/)
		.map((paragraph) => paragraph.replace(/[*_`#>]/g, '').trim())
		.filter(Boolean)
	const last = paragraphs.at(-1)
	if (!last) return false

	const tail = last.split(SENTENCE_END).slice(-2)
	if (tail.some((sentence) => WAITS.test(sentence))) return false
	return tail.some((sentence) => NEXT_STEP.some((pattern) => pattern.test(sentence)))
}

/*
 * "lanjut", "lanjutkan saja", "ok lanjut", "continue" - penulis ingin tugas
 * yang tadi berjalan terus, bukan memulai permintaan baru.
 */
const CONTINUE =
	/^(ok(e|ay)?[,.!]?\s+)?(silakan\s+)?(lanjut(kan|in)?|teruskan|terusin|terus(kan)?|continue|go on|keep going)(\s+(saja|aja|dong|ya|lagi|sampai selesai|hingga selesai|please|pls))*[.!\s]*$/i

export function isContinuePrompt(text: string): boolean {
	return CONTINUE.test(text.trim())
}

const DERIVED_SECTION = /^daftar\s+(isi|tabel|gambar|lampiran)\b/i

export function hasBody(node: PMNode): boolean {
	if (node.type.name === PAGE_BREAK_NODE || node.type.name === TOC_BLOCK) return false
	if (node.type.name === 'heading') return false
	if (node.textContent.trim()) return true
	if (node.isAtom) return true
	let found = false
	node.descendants((child) => {
		if (found) return false
		if (child.isAtom && child.type.name !== 'hardBreak') found = true
		return !found
	})
	return found
}

/**
 * Bagian tingkat satu yang baru judul - tanpa paragraf, tabel, atau gambar di
 * bawahnya (subjudul saja belum dihitung isi). Daftar isi dan kawannya
 * dilewati: isinya dibuat aplikasi, bukan ditulis.
 */
export function emptySections(doc: PMNode): { total: number; empty: string[] } {
	const sections: { title: string; filled: boolean }[] = []
	doc.forEach((node) => {
		if (node.type.name === 'heading' && Number(node.attrs.level) === 1) {
			const title = node.textContent.replace(/\s+/g, ' ').trim()
			if (title && !DERIVED_SECTION.test(title)) sections.push({ title, filled: false })
			else sections.push({ title: '', filled: true })
			return
		}
		const current = sections.at(-1)
		if (current && !current.filled && hasBody(node)) current.filled = true
	})
	const counted = sections.filter((section) => section.title)
	return {
		total: counted.length,
		empty: counted.filter((section) => !section.filled).map((section) => section.title),
	}
}

const MAX_LISTED = 12

/**
 * Alasan sebuah tugas diteruskan dengan dorongan `[Continue]`: tiga sebab
 * macet di atas, ditambah dua yang datang dari penulis lewat tombol
 * "Lanjutkan" di atas kotak chat - tugas yang ia hentikan sendiri, dan naskah
 * yang babnya masih kosong sesudah tugas menulis selesai.
 */
export type ContinueReason = Exclude<StallReason, 'empty'> | 'stopped' | 'incomplete'

const LEAD: Record<ContinueReason, string> = {
	wave_limit: 'The app paused this request after a long series of edits.',
	promised: 'You announced your next step but ended your turn without doing it.',
	truncated: 'Your last reply was cut off by the output length limit.',
	stopped: 'The writer stopped you earlier and now asks you to go on.',
	incomplete: 'The writer asks you to go on with the document.',
	unfinished: 'You ended the request, but the outline you recorded is not finished yet.',
}

/**
 * Dorongan untuk model, sebagai pesan pengguna bertanda `[Continue]`.
 *
 * Daftar bagian kosong biasanya disebut sebagai acuan, bukan perintah:
 * permintaannya mungkin memang hanya satu bab. Kecuali untuk `incomplete` -
 * penulis menekan tombol yang menyebut bab kosong itu, jadi di situlah
 * permintaannya.
 */
export function continueNudge(reason: ContinueReason, empty: readonly string[], outline?: string): string {
	const listed = empty.slice(0, MAX_LISTED)
	const sections = `${listed.join('; ')}${empty.length > listed.length ? '; ...' : ''}`
	/*
	 * Dengan kerangka dari `set_outline`, yang ditagih adalah kerangka itu -
	 * bab, tabel/gambar yang dijanjikan, dan panjangnya - bukan sekadar bab
	 * tingkat satu yang kosong.
	 */
	const body =
		reason === 'truncated'
			? 'Carry on from where it stopped, in smaller pieces: one section per call (write_section for a heading that exists, insert_content for a new one).'
			: reason === 'incomplete' || reason === 'unfinished'
				? outline
					? `Finish what the outline still lacks, in document order, one section per call. ${outline}`
					: listed.length > 0
						? `Write the level-1 sections that still have no body text, in document order, each with write_section on its heading: ${sections}. Follow the plan, depth and style of what is already written.`
						: 'Check what the earlier request still lacks and finish it.'
				: 'Carry on with the same request from where you stopped.'
	const reference =
		reason === 'incomplete' || reason === 'unfinished'
			? ''
			: outline
				? `Outline check: ${outline}`
				: listed.length > 0
					? `For reference, level-1 sections that still have no body text: ${sections}. Fill only those the request covers.`
					: ''
	return [
		`[Continue] ${LEAD[reason]}`,
		body,
		'Do not start over and do not repeat what is already in the document; call get_outline if unsure what is there.',
		reference,
		'When everything the writer asked for is done, reply with a short summary and no tool calls.',
	]
		.filter(Boolean)
		.join(' ')
}

/** Kalimat kartu untuk penulis. */
export const STALL_TEXT: Record<StallReason, { title: string; hint: string }> = {
	wave_limit: {
		title: 'AI berhenti sejenak setelah rangkaian suntingan yang panjang.',
		hint: 'Jeda ini menjaga pemakaian token tetap terkendali.',
	},
	promised: {
		title: 'AI berhenti sebelum mengerjakan langkah yang ia sebutkan.',
		hint: '',
	},
	truncated: {
		title: 'Jawaban AI terpotong karena melewati batas panjang keluaran.',
		hint: 'Saat dilanjutkan, AI diminta menulis per bagian yang lebih kecil.',
	},
	empty: {
		title: 'AI tidak mengirim jawaban apa pun.',
		hint: 'Biasanya gangguan sesaat di sisi provider.',
	},
	unfinished: {
		title: 'AI berhenti sebelum kerangka yang disetujui selesai.',
		hint: 'Yang masih kurang dihitung dari kerangka di panel Metadata.',
	},
}
