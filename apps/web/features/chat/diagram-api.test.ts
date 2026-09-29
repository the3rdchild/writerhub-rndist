import { describe, expect, test } from 'bun:test'
import { diagramFailureResult } from './diagram-api'

describe('hasil alat untuk gambar yang gagal', () => {
	test('waktu habis menyarankan deskripsi yang lebih sederhana', () => {
		const result = diagramFailureResult({
			error: 'Sub-agent penggambar tidak selesai (not finished within 150 s).',
			status: 504,
		})
		expect(result).toContain('not finished within 150 s')
		expect(result).toContain('simpler description')
	})

	test('gambar yang tidak lolos pemeriksaan menyebut sebabnya dan nilai chart', () => {
		const result = diagramFailureResult({
			error: 'Gambarnya tidak lolos pemeriksaan: points: the points are not on one scale.',
			status: 422,
		})
		expect(result).toContain('not on one scale')
		expect(result).toContain('give every value and the axis range')
	})

	test('kegagalan lain: coba sekali lagi, lalu lanjut menulis', () => {
		const result = diagramFailureResult({ error: 'Tidak bisa menghubungi layanan penggambar.' })
		expect(result).toContain('Try once more.')
		expect(result).toContain('tell the writer which figure is still missing')
	})
})
