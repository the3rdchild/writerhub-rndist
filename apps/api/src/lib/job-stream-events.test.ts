import { describe, expect, test } from 'bun:test'
import {
	cancelledEvent,
	doneEvent,
	errorEvent,
	FLATTENED_RESULT_FEATURE,
	serializeEvent,
	timeoutEvent,
} from './job-stream-events'

describe('event selesai', () => {
	test('grammar menaruh isi hasil di akar event', () => {
		const event = doneEvent(FLATTENED_RESULT_FEATURE, {
			suggestions: [{ id: 1 }],
			writing_quality: 82,
		})

		expect(event).toEqual({ type: 'done', suggestions: [{ id: 1 }], writing_quality: 82 })
		expect(event.result).toBeUndefined()
	})

	test('fitur selain grammar membungkus hasil di result', () => {
		const event = doneEvent('analysis', { changes: [], label: 'baik' })

		expect(event).toEqual({ type: 'done', result: { changes: [], label: 'baik' } })
	})

	test('hasil grammar tidak bisa menimpa penanda event', () => {
		// Bentuk pipih membongkar objek hasil ke akar event. Kalau `type` ditulis
		// sebelum pembongkaran, kunci `type` dari worker akan menggesernya dan
		// klien menggantung sampai batas waktu karena tidak pernah melihat 'done'.
		const event = doneEvent(FLATTENED_RESULT_FEATURE, { type: 'sesuatu-yang-lain', skor: 9 })

		expect(event.type).toBe('done')
		expect(event.skor).toBe(9)
	})
})

describe('event lain', () => {
	test('galat membawa pesannya', () => {
		expect(errorEvent('gagal memproses')).toEqual({ type: 'error', message: 'gagal memproses' })
	})

	test('batal dan waktu habis hanya membawa jenisnya', () => {
		expect(cancelledEvent()).toEqual({ type: 'cancelled' })
		expect(timeoutEvent()).toEqual({ type: 'timeout' })
	})
})

describe('serialisasi', () => {
	test('menghasilkan JSON satu baris - SSE tidak boleh mengandung newline', () => {
		const raw = serializeEvent(doneEvent('analysis', { label: 'baik' }))

		expect(raw).toBe('{"type":"done","result":{"label":"baik"}}')
		expect(raw).not.toContain('\n')
	})
})
