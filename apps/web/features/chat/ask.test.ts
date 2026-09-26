import { describe, expect, test } from 'bun:test'
import type { ToolCall } from '@writer-hub/shared'
import { briefField } from '@writer-hub/shared'
import {
	type AskQuestion,
	answerWords,
	askResultText,
	briefAnswerValue,
	canonicalOption,
	parseAskQuestions,
	requestedBriefFields,
	responseValue,
} from './ask'

const call = (name: string, args: Record<string, unknown> = {}): ToolCall => ({
	id: 'c1',
	name,
	arguments: args,
})

describe('membaca argumen ask_user', () => {
	test('pertanyaan dan pilihan dipangkas ke batasnya', () => {
		const questions = parseAskQuestions({
			questions: Array.from({ length: 6 }, (_, index) => ({
				question: `Pertanyaan ${index}?`,
				options: Array.from({ length: 9 }, (_, option) => ({ label: `Pilihan ${option}` })),
			})),
		})
		expect(questions).toHaveLength(4)
		expect(questions[0].options).toHaveLength(6)
	})

	test('label kembar dan kosong dibuang, pilihan berupa teks diterima', () => {
		const [question] = parseAskQuestions({
			questions: [
				{ question: 'Pendekatan?', options: ['Kuantitatif', 'kuantitatif', { label: '' }, 'Kualitatif'] },
			],
		})
		expect(question.options.map((option) => option.label)).toEqual(['Kuantitatif', 'Kualitatif'])
	})

	test('pertanyaan tanpa kalimat dibuang; judul kosong diberi nomor', () => {
		const questions = parseAskQuestions({
			questions: [{ options: ['A'] }, { question: 'Apa?', options: [] }, 'x'],
		})
		expect(questions).toEqual([{ question: 'Apa?', header: 'Pertanyaan 1', options: [], multiSelect: false }])
	})

	test('sasaran brief hanya isian yang boleh ditulis AI', () => {
		const questions = parseAskQuestions({
			questions: [
				{ question: 'A?', options: ['x'], brief_field: 'pendekatan' },
				{ question: 'B?', options: ['x'], brief_field: 'catatan' },
				{ question: 'C?', options: ['x'], brief_field: 'karangan' },
			],
		})
		expect(questions.map((question) => question.briefField)).toEqual(['pendekatan', undefined, undefined])
	})

	test('argumen yang rusak tidak melempar', () => {
		expect(parseAskQuestions({})).toEqual([])
		expect(parseAskQuestions({ questions: 'bukan larik' })).toEqual([])
	})
})

test('request_brief hanya menerima isian yang dikenal, tanpa kembar', () => {
	expect(requestedBriefFields({ fields: ['judul', 'judul', 'catatan', 'karangan', 'tujuan'] })).toEqual([
		'judul',
		'tujuan',
	])
})

describe('hasil untuk model', () => {
	test('jawaban pilihan, isian sendiri, dan yang tidak dijawab', () => {
		const text = askResultText(
			call('ask_user'),
			{
				responses: [
					{ question: 'Pendekatan?', choices: ['Kualitatif'] },
					{ question: 'Teori?', choices: [], other: 'TAM' },
					{ question: 'Lokasi?', choices: [] },
				],
			},
			['pendekatan'],
		)
		expect(text).toContain('1. Pendekatan? → Kualitatif')
		expect(text).toContain('2. Teori? → their own answer: "TAM"')
		expect(text).toContain('3. Lokasi? → no answer')
		expect(text).toContain("Saved to the research brief as the writer's decision: Research approach.")
		// Tanpa ini model memanggil update_brief lagi untuk isian yang sama - satu putaran sia-sia.
		expect(text).toContain('do not call update_brief for these')
	})

	test('dilewati berarti lanjut dengan asumsi yang dinyatakan', () => {
		expect(askResultText(call('ask_user'), { skipped: true })).toContain('state it plainly')
	})

	test('request_brief melaporkan isi dan yang masih kosong', () => {
		const text = askResultText(call('request_brief'), {
			filled: [{ key: 'judul', label: 'Judul', value: 'Literasi' }],
			empty: ['tujuan'],
		})
		expect(text).toContain('- Title: Literasi')
		expect(text).toContain('Still empty: Research objectives.')
	})
})

test('nilai jawaban: pilihan lalu isian sendiri', () => {
	expect(responseValue({ question: 'q', choices: ['A', 'B'], other: 'C' })).toBe('A, B, C')
	expect(responseValue({ question: 'q', choices: [] })).toBe('')
})

/* Kasus-kasus di bawah ini datang dari uji DeepSeek V4 Flash 26 Sep. */
describe('jawaban yang dicatat ke brief', () => {
	const approach = briefField('pendekatan')
	if (!approach) throw new Error('isian pendekatan hilang')

	test('pilihan palsu seperti "Tulis sendiri" dibuang - kartunya jadi isian bebas', () => {
		const [question] = parseAskQuestions({
			questions: [
				{
					question: 'Apa judul penelitian Anda?',
					options: ['Tulis sendiri', 'Lainnya', 'Saya akan isi sendiri'],
					brief_field: 'judul',
				},
			],
		})
		expect(question.options).toEqual([])
	})

	test('sasaran brief disimpulkan dari pilihannya bila model lupa menyebutnya', () => {
		const [approachQuestion, countQuestion] = parseAskQuestions({
			questions: [
				{ question: 'Mana yang benar?', options: ['Kuantitatif', 'Kualitatif', 'Campuran (Mixed Methods)'] },
				{ question: 'Berapa paragraf?', options: ['1 paragraf', '2 paragraf'] },
			],
		})
		expect(approachQuestion.briefField).toBe('pendekatan')
		// Spasi baris "1"/"2" sengaja tidak ikut disimpulkan.
		expect(countQuestion.briefField).toBeUndefined()
	})

	test('jawaban dipetakan ke ejaan pilihan panel', () => {
		expect(canonicalOption(approach, 'Campuran (mixed methods)')).toBe('Campuran')
		expect(canonicalOption(approach, 'kuantitatif - regresi')).toBe('Kuantitatif')
		expect(canonicalOption(approach, 'Kuantitatifnya')).toBeNull()
	})

	const ask = (briefField: AskQuestion['briefField']): AskQuestion => ({
		question: 'q',
		header: 'h',
		options: [],
		multiSelect: false,
		...(briefField ? { briefField } : {}),
	})

	test('jawaban yang tidak cocok dengan isian pilihannya tidak disimpan', () => {
		expect(
			briefAnswerValue(ask('pendekatan'), { question: 'q', choices: ['Judul baru yang benar'] }),
		).toBeNull()
		expect(
			briefAnswerValue(ask('pendekatan'), { question: 'q', choices: ['Kuantitatif', 'Kualitatif'] }),
		).toBeNull()
		expect(
			briefAnswerValue(ask('pendekatan'), { question: 'q', choices: ['Kualitatif (studi kasus)'] }),
		).toBe('Kualitatif')
	})

	test('kata-kata penulis sendiri selalu diterima', () => {
		expect(
			briefAnswerValue(ask('pendekatan'), { question: 'q', choices: [], other: 'Deskriptif kualitatif' }),
		).toBe('Deskriptif kualitatif')
		expect(briefAnswerValue(ask('judul'), { question: 'q', choices: [], other: 'Judul saya' })).toBe(
			'Judul saya',
		)
		expect(briefAnswerValue(ask(undefined), { question: 'q', choices: ['x'] })).toBeNull()
	})

	test('model diberi tahu jawaban yang tidak disimpan', () => {
		const text = askResultText(
			call('ask_user'),
			{ responses: [{ question: 'Topik?', choices: ['A'] }] },
			[],
			['pendekatan'],
		)
		expect(text).toContain('Not saved to the brief - the answer does not fit the field: Research approach.')
	})
})

test('sumber bukti dari jawaban hanya kata-kata penulis, bukan pertanyaan model', () => {
	expect(
		answerWords({
			responses: [
				{ question: 'Apakah pendekatannya kuantitatif?', choices: ['Ya'] },
				{ question: 'Teori?', choices: [], other: 'TAM' },
			],
		}),
	).toEqual(['Ya', 'TAM'])
	expect(answerWords({ filled: [{ key: 'judul', label: 'Judul', value: 'Judul saya' }] })).toEqual([
		'Judul saya',
	])
	expect(answerWords({ skipped: true })).toEqual([])
})
