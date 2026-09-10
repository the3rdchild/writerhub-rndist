import { describe, expect, test } from 'bun:test'
import {
	appendStep,
	appendText,
	type ChatStep,
	closeAll,
	closeRunning,
	flatSteps,
	lastRunningStep,
	patchStep,
	type TurnPart,
	visibleParts,
} from './turn-parts'

function step(id: string, extra: Partial<ChatStep> = {}): ChatStep {
	return { id, label: id, status: 'running', startedAt: 1, ...extra }
}

describe('teks memisahkan kelompok', () => {
	test('langkah beruntun menumpuk di satu kelompok', () => {
		const parts = appendStep(appendStep([], step('a')), step('b'))
		expect(parts).toHaveLength(1)
		expect(flatSteps(parts).map((s) => s.id)).toEqual(['a', 'b'])
	})

	test('teks sesudah langkah menutup kelompoknya', () => {
		const parts = appendStep(appendText(appendStep([], step('a')), 'halo'), step('b'))
		expect(parts.map((p) => p.kind)).toEqual(['steps', 'text', 'steps'])
	})

	test('teks beruntun disambung, bukan dipecah jadi gelembung', () => {
		const parts = appendText(appendText([], 'hal'), 'o')
		expect(parts).toEqual([{ kind: 'text', text: 'halo' }])
	})
})

describe('langkah yang berjalan sendiri', () => {
	/*
	 * Inti dari dukungan sub-agent: langkah latar tidak boleh ikut ditutup oleh
	 * langkah berikutnya, kalau tidak penulis melihat centang di sebelah gambar
	 * yang baru saja dimulai.
	 */
	test('tidak ikut ditutup oleh langkah berikutnya', () => {
		const parts = appendStep(appendStep([], step('gambar', { background: true })), step('baca'))
		const closed = closeRunning('done', parts, 9)

		const [background, ordinary] = flatSteps(closed)
		expect(background.status).toBe('running')
		// Yang biasa memang harus tertutup - itu justru gunanya `closeRunning`.
		expect(ordinary.status).toBe('done')
	})

	test('langkah biasa tetap ditutup di sekitarnya', () => {
		const parts = appendStep(appendStep([], step('baca')), step('gambar', { background: true }))
		expect(flatSteps(closeRunning('done', parts, 9))[0]).toMatchObject({ status: 'done', endedAt: 9 })
	})

	test('giliran yang berakhir menutup semuanya - spinner abadi lebih buruk', () => {
		const parts = appendStep([], step('gambar', { background: true }))
		expect(flatSteps(closeAll('done', parts, 9))[0]).toMatchObject({ status: 'done', endedAt: 9 })
	})

	test('beberapa bisa berputar sekaligus', () => {
		const parts = appendStep(
			appendStep([], step('g1', { background: true })),
			step('g2', { background: true }),
		)
		expect(flatSteps(closeRunning('done', parts)).filter((s) => s.status === 'running')).toHaveLength(2)
	})
})

describe('menambal langkah', () => {
	test('menurut id, bukan menurut posisi', () => {
		const parts = appendStep(appendStep([], step('a')), step('b'))
		expect(flatSteps(patchStep(parts, 'a', { detail: 'x' }))[0].detail).toBe('x')
	})

	/*
	 * `patchRunningStep` menempelkan penalaran dan hasil alat ke langkah yang
	 * sedang dikerjakan model - dan itu tidak pernah pekerjaan sub-agent.
	 */
	test('langkah berjalan terakhir melewati yang berjalan sendiri', () => {
		const parts = appendStep(appendStep([], step('baca')), step('gambar', { background: true }))
		expect(lastRunningStep(parts)?.id).toBe('baca')
	})

	test('tidak ada yang berjalan berarti tidak ada yang ditambal', () => {
		const parts = appendStep([], step('a', { status: 'done' }))
		expect(lastRunningStep(parts)).toBeUndefined()
	})
})

describe('membersihkan sebelum disimpan', () => {
	test('bagian teks yang habis dibersihkan tidak meninggalkan gelembung kosong', () => {
		const parts: TurnPart[] = [
			{ kind: 'steps', steps: [step('a')] },
			{ kind: 'text', text: '   ' },
			{ kind: 'steps', steps: [step('b')] },
		]
		expect(visibleParts(parts)?.map((p) => p.kind)).toEqual(['steps', 'steps'])
	})

	test('giliran tanpa isi sama sekali menjadi undefined', () => {
		expect(visibleParts([{ kind: 'text', text: '  ' }])).toBeUndefined()
		expect(visibleParts(undefined)).toBeUndefined()
	})

	test('teks biasa dipertahankan apa adanya', () => {
		expect(visibleParts([{ kind: 'text', text: 'halo' }])).toEqual([{ kind: 'text', text: 'halo' }])
	})
})
