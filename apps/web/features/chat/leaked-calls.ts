import type { ToolCall } from '@writer-hub/shared'

/**
 * Panggilan alat DeepSeek yang bocor ke teks balasan.
 *
 * DeepSeek menulis panggilan alatnya dalam format DSML, dan provider biasanya
 * mengubahnya menjadi `tool_calls` sungguhan. Kadang tidak: di uji use case
 * 27 Sep (UC3), `set_outline` datang sebagai teks
 * `<｜DSML｜invoke name="set_outline"> <｜DSML｜parameter …>`, JSON parameter
 * `sections`-nya rusak di titik yang sama, dan model mengulang blok yang
 * sama 139 kali dalam satu balasan. Balasan itu melewati batas 64 ribu
 * karakter per pesan, dan setiap permintaan sesudahnya ditolak server.
 *
 * Di sini blok itu dibaca sebagai panggilan alat - yang argumennya rusak
 * ditandai supaya model diminta mengirim ulang - ulangannya dibuang, dan
 * teksnya tidak pernah tersimpan di riwayat.
 */

const BAR = '[｜|]'
const INVOKE = new RegExp(`<${BAR}DSML${BAR}invoke\\s+name="([^"]+)"\\s*>`, 'g')
const PARAMETER = new RegExp(
	`<${BAR}DSML${BAR}parameter\\s+name="([^"]+)"(?:\\s+string="(true|false)")?\\s*>([\\s\\S]*?)(<\\/${BAR}DSML${BAR}parameter>|(?=<\\/?${BAR}DSML${BAR})|$)`,
	'g',
)
/** Akhir isi satu blok: tag DSML pertama yang bukan parameter - penutup, atau pembungkus berikutnya. */
const INVOKE_END = new RegExp(`<\\/?${BAR}DSML${BAR}(?!parameter)`)
const ANY_TAG = new RegExp(`<\\/?${BAR}DSML${BAR}`)
const WRAPPER_END = new RegExp(`<\\/${BAR}DSML${BAR}(?:tool_calls|function_calls|invoke)>`, 'g')

export interface LeakedCall {
	call: ToolCall
	/** Ada parameter yang tidak ditutup atau JSON-nya tidak utuh. */
	broken: boolean
}

interface Block {
	name: string
	body: string
}

function blocks(content: string): Block[] {
	const openers = [...content.matchAll(INVOKE)]
	return openers.map((match, index) => {
		const start = (match.index ?? 0) + match[0].length
		const next = openers[index + 1]?.index ?? content.length
		const body = content.slice(start, next)
		const end = body.search(INVOKE_END)
		return { name: match[1], body: end === -1 ? body : body.slice(0, end) }
	})
}

function argumentsOf(body: string): { args: Record<string, unknown>; broken: boolean } {
	const args: Record<string, unknown> = {}
	let broken = false
	for (const match of body.matchAll(PARAMETER)) {
		const [, name, stringFlag, raw, closing] = match
		if (!closing?.startsWith('</')) broken = true
		if (stringFlag === 'true') {
			args[name] = raw
			continue
		}
		try {
			args[name] = JSON.parse(raw.trim())
		} catch {
			// Tanpa penanda `string`, nilai yang bukan JSON dianggap teks biasa.
			if (stringFlag === 'false') broken = true
			else args[name] = raw.trim()
		}
	}
	return { args, broken }
}

/** Panggilan di teks, satu per blok berbeda; ulangan yang persis sama dibuang. */
export function parseLeakedCalls(content: string): LeakedCall[] {
	const seen = new Set<string>()
	const found: LeakedCall[] = []
	const stamp = Date.now().toString(36)
	for (const block of blocks(content)) {
		const key = `${block.name}\u0000${block.body.trim()}`
		if (seen.has(key)) continue
		seen.add(key)
		const { args, broken } = argumentsOf(block.body)
		found.push({ call: { id: `leaked_${found.length}_${stamp}`, name: block.name, arguments: args }, broken })
	}
	return found
}

/**
 * Model sedang berputar: blok yang sudah lengkap diulang persis.
 *
 * Diperiksa selama balasan mengalir, supaya alirannya dihentikan pada ulangan
 * pertama - bukan sesudah 139 ulangan dan 64 ribu karakter.
 */
export function leakedCallRepeats(content: string): boolean {
	const openers = [...content.matchAll(INVOKE)].map((match) => match.index ?? 0)
	if (openers.length < 3) return false
	const complete = openers.slice(0, -1).map((at, index) => content.slice(at, openers[index + 1]).trim())
	return new Set(complete).size < complete.length
}

/** Teks balasan tanpa blok DSML; blok yang tidak pernah ditutup memakan sampai akhir. */
export function stripLeakedCalls(content: string): string {
	const start = content.search(ANY_TAG)
	if (start === -1) return content
	let end = content.length
	let lastClose = -1
	for (const match of content.matchAll(WRAPPER_END)) lastClose = (match.index ?? 0) + match[0].length
	if (lastClose > start && !ANY_TAG.test(content.slice(lastClose))) end = lastClose
	return `${content.slice(0, start)}${content.slice(end)}`.replace(/\n{3,}/g, '\n\n').trim()
}

/** Hasil alat untuk panggilan bocor yang argumennya rusak. */
export const LEAKED_BROKEN_RESULT =
	'Not carried out: this call arrived as text in your reply (<｜DSML｜invoke …>) instead of as a tool call, and its arguments were not valid JSON. Call the tool again the normal way, with smaller arguments if they are long.'
