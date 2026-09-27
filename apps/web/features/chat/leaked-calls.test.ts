import { afterEach, describe, expect, test } from 'bun:test'
import { CHAT_CONTEXT_LIMITS } from '@writer-hub/shared'
import { streamChat, stripFallbackCalls } from './api'
import { buildOutboundMessages, type ChatTurn } from './chat-context'
import { ChatTurnError, chatFailureHint } from './failure'
import { leakedCallRepeats, parseLeakedCalls, stripLeakedCalls } from './leaked-calls'
import { clipMessage } from './outbound-window'

/*
 * Bentuk balasan UC3, 27 Sep: pembungkus `tool_calls`, dua parameter yang
 * ditutup, lalu `sections` yang JSON-nya rusak dan tidak pernah ditutup -
 * diulang terus sampai melewati 64 ribu karakter.
 */
const BROKEN_BLOCK = [
	'<｜DSML｜tool_calls>',
	'<｜DSML｜invoke name="set_outline">',
	'<｜DSML｜parameter name="notes" string="false">["PDB tumbuh ~5% per tahun (BPS, 2024)"]</｜DSML｜parameter>',
	'<｜DSML｜parameter name="pages" string="false">{"max": 12, "min": 8}</｜DSML｜parameter>',
	'<｜DSML｜parameter name="sections" string="false">[{"items": [{"description": "Indikator"}, "label": "Tabel 1"}, {"',
	'',
].join('\n')

const GOOD_BLOCK = [
	'<｜DSML｜tool_calls>',
	'<｜DSML｜invoke name="write_section">',
	'<｜DSML｜parameter name="heading" string="true">Pendahuluan</｜DSML｜parameter>',
	'<｜DSML｜parameter name="markdown" string="true">Isi **bab**.</｜DSML｜parameter>',
	'</｜DSML｜invoke>',
	'</｜DSML｜tool_calls>',
].join('\n')

describe('panggilan DSML yang bocor ke teks', () => {
	test('blok utuh menjadi panggilan alat dengan argumennya', () => {
		const [leaked, ...rest] = parseLeakedCalls(`Saya tulis bagiannya.\n\n${GOOD_BLOCK}`)
		expect(rest).toHaveLength(0)
		expect(leaked.broken).toBe(false)
		expect(leaked.call.name).toBe('write_section')
		expect(leaked.call.arguments).toEqual({ heading: 'Pendahuluan', markdown: 'Isi **bab**.' })
	})

	test('139 ulangan blok rusak menjadi satu panggilan yang ditandai rusak', () => {
		const answer = BROKEN_BLOCK.repeat(139)
		expect(answer.length).toBeGreaterThan(CHAT_CONTEXT_LIMITS.message / 2)
		const leaked = parseLeakedCalls(answer)
		expect(leaked).toHaveLength(1)
		expect(leaked[0].broken).toBe(true)
		expect(leaked[0].call.name).toBe('set_outline')
		expect(leaked[0].call.arguments.pages).toEqual({ max: 12, min: 8 })
	})

	test('ulangan dikenali begitu blok kedua selesai, bukan sesudah 139 kali', () => {
		expect(leakedCallRepeats(BROKEN_BLOCK)).toBe(false)
		expect(leakedCallRepeats(BROKEN_BLOCK.repeat(2))).toBe(false)
		expect(
			leakedCallRepeats(`${BROKEN_BLOCK.repeat(2)}<｜DSML｜tool_calls>\n<｜DSML｜invoke name="set_outline">`),
		).toBe(true)
		// Panggilan berbeda berturut-turut bukan putaran.
		const other = GOOD_BLOCK.replace('Pendahuluan', 'Metode')
		expect(leakedCallRepeats(`${GOOD_BLOCK}\n${other}\n${GOOD_BLOCK.replace('Pendahuluan', 'Hasil')}`)).toBe(
			false,
		)
	})

	test('teksnya tidak pernah tersimpan', () => {
		expect(stripLeakedCalls(`Kerangka dicatat.\n\n${BROKEN_BLOCK.repeat(3)}`)).toBe('Kerangka dicatat.')
		expect(stripLeakedCalls(`Awal.\n\n${GOOD_BLOCK}\n\nAkhir.`)).toBe('Awal.\n\nAkhir.')
		expect(stripFallbackCalls(`Awal.\n\n${GOOD_BLOCK}`)).toBe('Awal.')
		expect(stripLeakedCalls('Tanpa panggilan | sama sekali.')).toBe('Tanpa panggilan | sama sekali.')
	})

	test('bilah ASCII juga dikenali', () => {
		const ascii = GOOD_BLOCK.replaceAll('｜', '|')
		expect(parseLeakedCalls(ascii)[0].call.arguments.heading).toBe('Pendahuluan')
	})
})

describe('riwayat yang dikirim ulang', () => {
	test('pesan kepanjangan dipotong sampai batasnya, dengan catatan', () => {
		const long = { role: 'user' as const, content: 'x'.repeat(CHAT_CONTEXT_LIMITS.message + 5000) }
		const clipped = clipMessage(long, CHAT_CONTEXT_LIMITS.message)
		expect(clipped.content.length).toBeLessThanOrEqual(CHAT_CONTEXT_LIMITS.message)
		expect(clipped.content).toContain('too long to send again')
		const short = { role: 'user' as const, content: 'pendek' }
		expect(clipMessage(short, CHAT_CONTEXT_LIMITS.message)).toBe(short)
	})

	test('balasan lama berisi DSML dibersihkan, dan tidak ada pesan yang melewati batas', () => {
		const history: ChatTurn[] = [
			{ role: 'user', content: 'Tulis makalah.', taskId: 't1' },
			{ role: 'assistant', content: `Baik.\n\n${BROKEN_BLOCK.repeat(400)}`, taskId: 't1' },
			{ role: 'user', content: 'x'.repeat(CHAT_CONTEXT_LIMITS.message + 1), taskId: 't2' },
		]
		const outbound = buildOutboundMessages(history, 't2')
		expect(outbound.find((message) => message.role === 'assistant')?.content).toBe('Baik.')
		expect(outbound.every((message) => message.content.length <= CHAT_CONTEXT_LIMITS.message)).toBe(true)
	})
})

describe('galat validasi dari server sendiri', () => {
	const realFetch = globalThis.fetch
	afterEach(() => {
		globalThis.fetch = realFetch
	})

	test('400 tidak lagi menyarankan memeriksa kunci API', async () => {
		globalThis.fetch = (async () =>
			new Response(JSON.stringify({ errors: ['Too big: expected string to have <=64000 characters'] }), {
				status: 400,
				headers: { 'content-type': 'application/json' },
			})) as unknown as typeof fetch
		const failure = await streamChat({ messages: [{ role: 'user', content: 'hai' }] }, () => {}).catch(
			(error: unknown) => error,
		)
		expect(failure).toBeInstanceOf(ChatTurnError)
		const error = failure as ChatTurnError
		expect(error.message).toContain('ditolak sebelum sampai ke model')
		expect(chatFailureHint(error.code) ?? '').not.toContain('kunci API')
	})
})
