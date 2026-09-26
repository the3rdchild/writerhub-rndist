import { describe, expect, test } from 'bun:test'
import type { ChatMessage } from '@writer-hub/shared'
import type { ChatTurn } from './chat-context'
import { buildOutboundMessages, resumableTask } from './chat-context'
import { fitWindow, MISSING_RESULT, TRIMMED_NOTE, withToolResults } from './outbound-window'

const user = (content: string): ChatMessage => ({ role: 'user', content })
const call = (...ids: string[]): ChatMessage => ({
	role: 'assistant',
	content: '',
	toolCalls: ids.map((id) => ({ id, name: 'insert_content', arguments: '{}' })),
})
const result = (id: string): ChatMessage => ({ role: 'tool', content: `ok ${id}`, toolCallId: id })

/** Setiap panggilan punya hasil tepat sesudahnya, dan setiap hasil punya panggilan. */
function valid(messages: readonly ChatMessage[]): boolean {
	let open = new Set<string>()
	for (const message of messages) {
		if (message.role === 'tool') {
			if (!message.toolCallId || !open.has(message.toolCallId)) return false
			open.delete(message.toolCallId)
			continue
		}
		if (open.size > 0) return false
		open = new Set(message.toolCalls?.map((item) => item.id) ?? [])
	}
	return open.size === 0
}

describe('withToolResults', () => {
	test('panggilan tanpa hasil mendapat hasil pengganti, di tempatnya', () => {
		const fixed = withToolResults([user('tulis'), call('a', 'b'), result('a'), call('c'), result('c')])
		expect(fixed.map((message) => message.content)).toEqual(['tulis', '', 'ok a', MISSING_RESULT, '', 'ok c'])
		expect(valid(fixed)).toBe(true)
	})

	test('hasil yatim dibuang', () => {
		expect(withToolResults([user('tulis'), result('x')])).toEqual([user('tulis')])
	})
})

describe('fitWindow', () => {
	/** Satu tugas panjang: satu permintaan, lalu gelombang suntingan beruntun. */
	function longTask(waves: number): ChatMessage[] {
		const messages = [user('buatkan skripsi lengkap')]
		for (let wave = 0; wave < waves; wave++) {
			messages.push(call(`a${wave}`, `b${wave}`), result(`a${wave}`), result(`b${wave}`))
		}
		return messages
	}

	test('tugas panjang tetap dibuka permintaannya, bukan menyisakan satu hasil alat', () => {
		const messages = longTask(20)
		const fitted = fitWindow(messages, 40, 0)
		expect(fitted.length).toBeLessThanOrEqual(40)
		expect(fitted[0].content).toBe(`buatkan skripsi lengkap${TRIMMED_NOTE}`)
		expect(fitted.at(-1)).toEqual(result('b19'))
		expect(valid(fitted)).toBe(true)
	})

	test('jendela yang muat dikirim apa adanya', () => {
		const messages = longTask(3)
		expect(fitWindow(messages, 40, 0)).toEqual(messages)
	})

	test('permintaan di dalam jendela tidak diulang', () => {
		const messages = [user('lama'), { role: 'assistant' as const, content: 'jawab' }, ...longTask(2)]
		const fitted = fitWindow(messages, 6, 2)
		expect(fitted.filter((message) => message.content.startsWith('buatkan'))).toHaveLength(1)
	})
})

describe('buildOutboundMessages - tugas panjang', () => {
	test('lebih dari 40 pesan dalam satu tugas tetap sah dan tetap membawa permintaannya', () => {
		const history: ChatTurn[] = [{ role: 'user', content: 'tanya lama', taskId: 'old' }]
		history.push({ role: 'user', content: 'buatkan skripsi', taskId: 't' })
		for (let wave = 0; wave < 25; wave++) {
			history.push({ ...call(`w${wave}`), taskId: 't' }, { ...result(`w${wave}`), taskId: 't' })
		}
		history.push({
			role: 'user',
			content: '[Continue] ...',
			taskId: 't',
			continuation: { mode: 'auto', reason: 'wave_limit' },
		})

		const outbound = buildOutboundMessages(history, 't')
		expect(outbound.length).toBeLessThanOrEqual(40)
		expect(outbound[0].content.startsWith('buatkan skripsi')).toBe(true)
		expect(outbound.at(-1)).toEqual({ role: 'user', content: '[Continue] ...' })
		expect(valid(outbound)).toBe(true)
	})
})

describe('resumableTask - "lanjut" meneruskan tugas yang sama', () => {
	const ask: ChatTurn = { role: 'user', content: 'tulis bab 1', taskId: 't' }
	const pending: ChatTurn = {
		...call('w1'),
		taskId: 't',
		actions: [{ id: 'w1', name: 'insert_content', arguments: {} }],
	}

	test('boleh bila semua aksi tugas itu sudah diputuskan', () => {
		expect(resumableTask([ask, pending, { ...result('w1'), taskId: 't' }], 't')).toBe(true)
	})

	test('tidak bila masih ada aksi yang menunggu, atau model belum pernah menjawab', () => {
		expect(resumableTask([ask, pending], 't')).toBe(false)
		expect(resumableTask([ask], 't')).toBe(false)
		expect(resumableTask([ask], undefined)).toBe(false)
	})
})
