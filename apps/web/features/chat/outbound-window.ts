import type { ChatMessage } from '@writer-hub/shared'

/**
 * Menjaga pesan yang dikirim ke provider tetap sah: setiap panggilan alat
 * asisten diikuti hasilnya, dan tidak ada hasil tanpa panggilannya.
 *
 * Provider menolak percakapan yang melanggar itu dengan 400 - dan server,
 * yang dulu membaca setiap 4xx sebagai "provider tidak mendukung tool
 * calling", lalu mematikan alat untuk sisa sesi. Sejak itu model hanya bisa
 * menulis "Saya akan melanjutkan dengan BAB II." tanpa mampu melakukannya:
 * dari luar, chat tampak berhenti di tengah jalan.
 */

export const MISSING_RESULT =
	'No result: this edit is still waiting for the writer, or was left undecided. Do not assume it was applied.'

/**
 * Hasil pengganti untuk panggilan yang belum punya hasil - aksi yang masih
 * menunggu penulis ketika giliran berikutnya tetap harus dikirim.
 */
export function withToolResults(messages: readonly ChatMessage[]): ChatMessage[] {
	const out: ChatMessage[] = []
	let index = 0
	while (index < messages.length) {
		const message = messages[index]
		index += 1
		if (message.role === 'tool') continue // hasil tanpa panggilan di depannya
		out.push(message)
		if (message.role !== 'assistant' || !message.toolCalls?.length) continue

		const expected = new Set(message.toolCalls.map((call) => call.id))
		while (index < messages.length && messages[index].role === 'tool') {
			const result = messages[index]
			index += 1
			if (!result.toolCallId || !expected.has(result.toolCallId)) continue
			expected.delete(result.toolCallId)
			out.push(result)
		}
		for (const id of expected) out.push({ role: 'tool', content: MISSING_RESULT, toolCallId: id })
	}
	return out
}

export const TRIMMED_NOTE =
	'\n\n[System] Earlier steps of this request were left out of the history to save space; their edits are already in the document. Call get_outline before continuing if you need to know what is there.'

/**
 * Satu pesan asisten dengan hasil alatnya, dipangkas supaya muat `room` pesan.
 *
 * Satuan yang lebih besar dari jendela dulu dikirim utuh - memotongnya merusak
 * pasangan panggilan dan hasil - dan server menolak seluruh permintaan karena
 * lebih dari 40 pesan (uji ulang 28 Sep, UC4: puluhan panggilan dari blok DSML
 * yang bocor dalam satu balasan). Panggilan terakhir dibuang bersama hasilnya,
 * jadi yang tersisa tetap berpasangan.
 */
function shrinkUnit(items: readonly ChatMessage[], room: number): ChatMessage[] {
	const [assistant, ...results] = items
	if (items.length <= room || !assistant.toolCalls?.length) return [...items]
	const kept = assistant.toolCalls.slice(0, Math.max(1, room - 1))
	const ids = new Set(kept.map((call) => call.id))
	const keptResults = results.filter((result) => result.toolCallId && ids.has(result.toolCallId))
	const last = keptResults.at(-1)
	if (last) {
		keptResults[keptResults.length - 1] = {
			...last,
			content: `${last.content}\n\n[System] ${assistant.toolCalls.length - kept.length} more tool calls from this step were left out of the history to fit it.`,
		}
	}
	return [{ ...assistant, toolCalls: kept }, ...keptResults]
}

/**
 * Riwayat dipangkas ke `limit` pesan dari yang tertua, per satuan utuh: satu
 * pesan pengguna, atau satu pesan asisten beserta seluruh hasil alatnya.
 *
 * Dulu pemangkasan mencari pesan pengguna pertama di dalam jendela, dan tugas
 * panjang yang satu-satunya pesan penggunanya jauh di belakang tersisa SATU
 * pesan: hasil alat terakhir, tanpa panggilannya. Kini permintaan yang sedang
 * dikerjakan (`request`, indeksnya di `messages`) selalu ikut di depan jendela,
 * dengan catatan bahwa langkah awalnya dilewati.
 */
export function fitWindow(messages: readonly ChatMessage[], limit: number, request?: number): ChatMessage[] {
	if (messages.length <= limit) return [...messages]

	const units: { start: number; items: ChatMessage[] }[] = []
	messages.forEach((message, index) => {
		const last = units.at(-1)
		if (message.role === 'tool' && last && last.items[0].role === 'assistant') last.items.push(message)
		else units.push({ start: index, items: [message] })
	})

	// Satu tempat disisihkan untuk pesan permintaannya.
	let first = units.length
	let size = 0
	while (first > 0 && size + units[first - 1].items.length <= limit - 1) {
		first -= 1
		size += units[first].items.length
	}
	// Satu satuan yang lebih besar dari jendela dipangkas panggilannya - lihat `shrinkUnit`.
	if (first === units.length) {
		first = units.length - 1
		units[first] = { ...units[first], items: shrinkUnit(units[first].items, limit - 1) }
	}

	const kept = units.slice(first).flatMap((unit) => unit.items)
	const windowStart = units[first].start

	let anchor: number | undefined
	if (request !== undefined && request < windowStart) anchor = request
	else if (kept[0].role !== 'user') {
		for (let at = windowStart - 1; at >= 0; at--) {
			if (messages[at].role === 'user') {
				anchor = at
				break
			}
		}
	}
	if (anchor === undefined) return kept

	const skippedWork = messages
		.slice(anchor + 1, windowStart)
		.some((message) => message.role === 'assistant' && (message.toolCalls?.length ?? 0) > 0)
	const head = messages[anchor]
	return [{ ...head, content: skippedWork ? head.content + TRIMMED_NOTE : head.content }, ...kept]
}

/**
 * Satu pesan yang melewati batas server dipotong, bukan dikirim utuh.
 *
 * Server menolak seluruh permintaan bila satu pesan saja kepanjangan, dan
 * riwayat yang sama dikirim ulang di setiap giliran - jadi satu balasan
 * kebablasan cukup untuk mematikan percakapan selamanya (uji 27 Sep, UC3).
 * Awal pesannya yang dipertahankan: di sanalah model biasanya menulis
 * maksudnya, sisanya ulangan.
 */
export function clipMessage(message: ChatMessage, limit: number): ChatMessage {
	if (message.content.length <= limit) return message
	const note = `\n\n[… ${message.content.length - limit} more characters cut: this message was too long to send again.]`
	return { ...message, content: `${message.content.slice(0, Math.max(0, limit - note.length))}${note}` }
}
