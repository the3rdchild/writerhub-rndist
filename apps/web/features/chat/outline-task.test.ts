import { describe, expect, test } from 'bun:test'
import type { JSONContent } from '@tiptap/core'
import { applyOutline, EMPTY_BRIEF, type OutlineUpdate, type ResearchBrief } from '@writer-hub/shared'
import * as Y from 'yjs'
import { DEFAULT_PAGE_SETUP } from '@/features/editor/page-geometry'
import { jsonToFragment } from '@/features/sync/serialize'
import { type ChatTurn, followsOutline, outlineFromArgs, recordOutline, wroteContent } from './chat-context'
import { measureOutline } from './outline-measure'
import { continueNudge } from './stall'

const user = (content: string, taskId: string): ChatTurn => ({ role: 'user', content, taskId })
const outlineTurn = (taskId: string): ChatTurn => ({
	role: 'assistant',
	content: 'Berikut outline-nya.',
	taskId,
	toolCalls: [{ id: `o-${taskId}`, name: 'set_outline', arguments: '{}' }],
})
const writeTurn = (id: string, name: string, taskId: string): ChatTurn => ({
	role: 'assistant',
	content: '',
	taskId,
	actions: [{ id, name, arguments: {} }],
})
const result = (content: string, toolCallId: string, taskId: string): ChatTurn => ({
	role: 'tool',
	content,
	toolCallId,
	taskId,
})

describe('argumen set_outline', () => {
	test('bab, janji, catatan, dan rentang {min,max}', () => {
		expect(
			outlineFromArgs({
				sections: [
					{ title: 'Pendahuluan', items: ['Tabel 1: data', 7] },
					'bukan objek',
					{ summary: 'tanpa judul' },
				],
				pages: { min: 8, max: 12 },
				notes: ['BI 2024', 3],
			}),
		).toEqual({
			sections: [
				{ title: 'Pendahuluan', summary: '', items: ['Tabel 1: data'] },
				{ title: '', summary: 'tanpa judul', items: [] },
			],
			pages: [8, 12],
			notes: ['BI 2024'],
		})
	})

	test('rentang yang ditulis model dalam bentuk lain tetap terbaca', () => {
		expect(outlineFromArgs({ sections: [], pages: [5, 8] }).pages).toEqual([5, 8])
		expect(outlineFromArgs({ sections: [], pages: '8-12 halaman' }).pages).toEqual([8, 12])
		expect(outlineFromArgs({ sections: [], pages: { min: 3 } }).pages).toEqual([3, 3])
	})

	test('tanpa pages dan notes, kuncinya tidak ada - target lama dipertahankan', () => {
		const parsed = outlineFromArgs({ sections: [{ title: 'A' }] })
		expect('pages' in parsed).toBe(false)
		expect('notes' in parsed).toBe(false)
	})
})

describe('lanjut otomatis hanya untuk tugas menulis dari kerangka yang baru disetujui', () => {
	const history: ChatTurn[] = [
		user('buatkan outline dulu', 't1'),
		outlineTurn('t1'),
		user('Outline disetujui, silakan tulis', 't2'),
		writeTurn('w1', 'write_section', 't2'),
		result('Wrote the section "Pendahuluan".', 'w1', 't2'),
		user('tambahkan satu tabel harga', 't3'),
		writeTurn('w2', 'insert_content', 't3'),
		result('Inserted.', 'w2', 't3'),
	]

	test('tugas sesudah outline mengikuti kerangka; permintaan lain sesudahnya tidak', () => {
		expect(followsOutline(history, 't2')).toBe(true)
		expect(followsOutline(history, 't1')).toBe(true)
		expect(followsOutline(history, 't3')).toBe(false)
		expect(followsOutline(history, 'tidak-ada')).toBe(false)
	})

	test('menulis isi berarti aksi isi yang diterapkan, bukan dilewati', () => {
		expect(wroteContent(history, 't2')).toBe(true)
		expect(wroteContent(history, 't1')).toBe(false)
		const skipped = [
			writeTurn('w3', 'write_section', 't4'),
			result('The writer skipped this action. It was not applied to the document.', 'w3', 't4'),
		]
		expect(wroteContent(skipped, 't4')).toBe(false)
	})
})

describe('dorongan lanjutan dengan kerangka', () => {
	const outline =
		'Still empty: "Metode". Promised but not in the document: Gambar 2 (no caption starting with that label).'

	test('kerangka belum selesai: yang ditagih kerangkanya', () => {
		const nudge = continueNudge('unfinished', ['Metode'], outline)
		expect(nudge).toStartWith(
			'[Continue] You ended the request, but the outline you recorded is not finished yet.',
		)
		expect(nudge).toContain(
			`Finish what the outline still lacks, in document order, one section per call. ${outline}`,
		)
		expect(nudge).not.toContain('level-1 sections')
	})

	test('sebab lain: kerangka menjadi acuan, bukan perintah', () => {
		const nudge = continueNudge('wave_limit', ['Metode'], outline)
		expect(nudge).toContain('Carry on with the same request from where you stopped.')
		expect(nudge).toContain(`Outline check: ${outline}`)
	})

	test('tanpa kerangka, perilaku lama: bab tingkat satu yang kosong', () => {
		expect(continueNudge('incomplete', ['BAB IV HASIL'])).toContain(
			'each with write_section on its heading: BAB IV HASIL.',
		)
	})
})

describe('set_outline sampai ke brief', () => {
	test('laporan untuk model menyebut isi kerangka yang tercatat', () => {
		let brief: ResearchBrief = EMPTY_BRIEF
		const api = {
			applyOutline: (outline: OutlineUpdate) => {
				const result = applyOutline(brief, outline, 1)
				brief = result.brief
				return result.report
			},
		}
		const message = recordOutline(api, {
			id: 'o1',
			name: 'set_outline',
			arguments: {
				sections: [{ title: 'Pendahuluan', items: ['Tabel 1: data'] }, { title: 'Metode' }],
				pages: { min: 8, max: 12 },
				notes: ['BI 2024'],
			},
		})
		expect(message).toBe(
			'Outline recorded: 2 sections, 1 promised tables/figures, target 8-12 pages, 1 research notes. From now on the editor context checks the document against it on every turn.',
		)
		expect(brief.chapters.map((chapter) => chapter.title)).toEqual(['Pendahuluan', 'Metode'])
	})

	test('kerangka kosong atau tanpa dokumen: tidak ada yang tercatat', () => {
		const call = { id: 'o', name: 'set_outline', arguments: { sections: [] } }
		expect(recordOutline({ applyOutline: () => null }, call)).toContain('at least one section')
		expect(
			recordOutline({ applyOutline: () => null }, { ...call, arguments: { sections: [{ title: 'A' }] } }),
		).toContain('No document is open')
	})
})

describe('kerangka diukur dari semua tab Y.Doc', () => {
	const heading = (text: string): JSONContent => ({
		type: 'heading',
		attrs: { level: 1 },
		content: [{ type: 'text', text }],
	})
	const paragraph = (text: string): JSONContent => ({ type: 'paragraph', content: [{ type: 'text', text }] })

	test('bab di tab kedua terhitung, dan panjang beberapa tab tidak dinilai', () => {
		const doc = new Y.Doc()
		jsonToFragment(doc, 'cv', { type: 'doc', content: [heading('Curriculum Vitae'), paragraph('Andi')] })
		jsonToFragment(doc, 'surat', { type: 'doc', content: [heading('Surat Lamaran')] })
		const brief = applyOutline(
			EMPTY_BRIEF,
			{ sections: [{ title: 'Curriculum Vitae' }, { title: 'Surat Lamaran' }], pages: [2, 3] },
			1,
		).brief

		const progress = measureOutline({
			doc,
			tabIds: ['cv', 'surat'],
			brief,
			editor: null,
			setup: DEFAULT_PAGE_SETUP,
		})
		expect(progress?.sections.map((section) => section.state)).toEqual(['written', 'empty'])
		expect(progress?.pages).toBeNull()
	})
})
