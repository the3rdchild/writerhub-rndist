import { describe, expect, test } from 'bun:test'
import type { DiagramDrawBody } from './dto'
import { buildDiagramMessages, repairMessage } from './prompt'

const SOURCES = { skill: 'SKILL BODY', grammar: 'GRAMMAR BODY' }

function body(extra: Partial<DiagramDrawBody> = {}): DiagramDrawBody {
	return { type: 'flowchart', spec: 'alur penerbitan berita', ...extra }
}

describe('perintah untuk sub-agent', () => {
	/*
	 * Kesempitan inilah yang dibeli: tanpa dokumen, tanpa katalog alat, tanpa
	 * riwayat percakapan. Kalau salah satunya menyelinap masuk, alasan sub-agent
	 * ini ada ikut hilang.
	 */
	test('hanya tata bahasa dan satu spesifikasi', () => {
		const messages = buildDiagramMessages(body(), SOURCES)
		expect(messages).toHaveLength(2)
		expect(messages[0].content).toContain('SKILL BODY')
		expect(messages[0].content).toContain('GRAMMAR BODY')
		expect(messages[1].content).toBe('alur penerbitan berita')
	})

	test('kontrak keluaran ikut, supaya jawabannya bukan esai', () => {
		expect(buildDiagramMessages(body(), SOURCES)[0].content).toContain('nothing else')
	})

	test('palet gelap hanya disebut kalau diminta', () => {
		expect(buildDiagramMessages(body(), SOURCES)[0].content).not.toContain('#f08a59')
		expect(buildDiagramMessages(body({ dark: true }), SOURCES)[0].content).toContain('#f08a59')
	})
})

describe('gambar ulang', () => {
	/*
	 * Sumber lama ikut dikirim ke sub-agent, bukan ke model utama - itu yang
	 * menjaga konteks percakapan tetap bersih saat penulis minta satu warna
	 * diubah.
	 */
	test('sumber lama ikut, dengan perintah menjaga sisanya', () => {
		const messages = buildDiagramMessages(body({ previous: '<svg id="lama"/>' }), SOURCES)
		expect(messages[1].content).toContain('<svg id="lama"/>')
		expect(messages[1].content).toContain('Keep everything the change does not touch')
	})
})

describe('permintaan perbaikan', () => {
	test('keluhannya didaftar bersama gambarnya', () => {
		const message = repairMessage('<svg/>', ['no <title>', 'a <style> element'])
		expect(message.content).toContain('- no <title>')
		expect(message.content).toContain('- a <style> element')
		expect(message.content).toContain('<svg/>')
	})
})
