/**
 * Pertanyaan AI kepada penulis - `ask_user` dan `request_brief` - dari
 * argumen alat sampai hasil yang dikembalikan ke model.
 *
 * Argumen datang dari model, jadi dibaca dengan curiga: jumlah pertanyaan dan
 * pilihan dipangkas, label kembar dibuang. Kartu yang rusak karena argumen
 * yang aneh akan meninggalkan penulis tanpa kotak chat sama sekali.
 */

import {
	BRIEF_FIELDS,
	type BriefFieldDef,
	type BriefKey,
	briefField,
	isBriefKey,
	type ToolCall,
} from '@writer-hub/shared'

export const MAX_QUESTIONS = 4
export const MAX_OPTIONS = 6

export interface AskOption {
	label: string
	description?: string
}

export interface AskQuestion {
	question: string
	header: string
	options: AskOption[]
	multiSelect: boolean
	briefField?: BriefKey
}

export interface AskResponse {
	question: string
	choices: string[]
	/** Jawaban yang diketik sendiri lewat "Lainnya". */
	other?: string
}

/**
 * Jawaban penulis, disimpan di giliran hasil alatnya. Model hanya menerima
 * teksnya; bentuk ini untuk menggambar ringkasan tanya-jawab di percakapan.
 */
export interface AskAnswer {
	skipped?: boolean
	responses?: AskResponse[]
	filled?: { key: BriefKey; label: string; value: string }[]
	empty?: BriefKey[]
}

const text = (value: unknown, limit: number): string =>
	typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, limit) : ''

/*
 * Pilihan yang sebenarnya bukan pilihan: "Tulis sendiri", "Lainnya", "Saya
 * akan isi". Kartu selalu punya jalan menulis jawaban sendiri, jadi pilihan
 * seperti ini hanya menjebak - DeepSeek V4 Flash menawarkannya untuk judul,
 * dan teks "Tulis sendiri" tersimpan sebagai judul skripsi.
 */
const META_OPTION =
	/^(lainnya|other|tulis sendiri|isi sendiri|ketik sendiri|saya (akan )?(tulis|isi|ketik))\b/i

/*
 * Isian pilihan yang boleh disimpulkan dari pilihan jawabannya. Sengaja
 * sempit: spasi baris ("1", "2") atau kertas akan cocok dengan pertanyaan
 * yang sama sekali tidak membicarakannya.
 */
const INFERABLE: readonly BriefFieldDef[] = BRIEF_FIELDS.filter(
	(field) => field.options && !field.userOnly && (field.tab === 'research' || field.key === 'sitasi'),
)

/**
 * Pilihan panel yang dimaksud sebuah jawaban: "Campuran (mixed methods)" →
 * "Campuran", "R&D - pengembangan" → "R&D". `null` bila jawabannya tidak
 * menyebut satu pun pilihan isian itu.
 */
export function canonicalOption(field: BriefFieldDef, value: string): string | null {
	const lower = value.trim().toLowerCase()
	for (const option of field.options ?? []) {
		const wanted = option.toLowerCase()
		if (lower === wanted) return option
		if (lower.startsWith(wanted) && /^[\s(\-–:,]/.test(lower.slice(wanted.length))) return option
	}
	return null
}

/*
 * Model kadang lupa menyebut `brief_field` - pertanyaan "Kuantitatif atau
 * kualitatif?" tanpa sasaran, jawabannya lalu hilang. Kalau dua pilihannya
 * atau lebih adalah pilihan satu isian, isian itulah yang dimaksud.
 */
function inferBriefField(options: readonly AskOption[]): BriefKey | undefined {
	for (const field of INFERABLE) {
		const hits = options.filter((option) => canonicalOption(field, option.label) !== null).length
		if (hits >= 2) return field.key
	}
	return undefined
}

export function parseAskQuestions(args: Record<string, unknown>): AskQuestion[] {
	const raw = Array.isArray(args.questions) ? args.questions : []
	const questions: AskQuestion[] = []

	for (const entry of raw) {
		if (!entry || typeof entry !== 'object') continue
		const fields = entry as Record<string, unknown>
		const question = text(fields.question, 300)
		if (!question) continue

		const seen = new Set<string>()
		const options: AskOption[] = []
		for (const option of Array.isArray(fields.options) ? fields.options : []) {
			const value = typeof option === 'string' ? { label: option } : (option as Record<string, unknown>)
			const label = text(value?.label, 80)
			if (!label || META_OPTION.test(label) || seen.has(label.toLowerCase())) continue
			seen.add(label.toLowerCase())
			const description = text(value?.description, 160)
			options.push(description ? { label, description } : { label })
			if (options.length >= MAX_OPTIONS) break
		}

		const key = fields.brief_field
		const target = isBriefKey(key) && !briefField(key)?.userOnly ? key : inferBriefField(options)
		questions.push({
			question,
			header: text(fields.header, 16) || `Pertanyaan ${questions.length + 1}`,
			options,
			multiSelect: fields.multi_select === true,
			...(target ? { briefField: target } : {}),
		})
		if (questions.length >= MAX_QUESTIONS) break
	}

	return questions
}

export function requestedBriefFields(args: Record<string, unknown>): BriefKey[] {
	const raw = Array.isArray(args.fields) ? args.fields : []
	const keys = raw.filter((key): key is BriefKey => isBriefKey(key) && !briefField(key)?.userOnly)
	return [...new Set(keys)]
}

export function requestMessage(args: Record<string, unknown>): string {
	return text(args.message, 240)
}

/**
 * Kata-kata penulis dalam satu jawaban - dan hanya itu. Teks hasil alatnya
 * juga memuat pertanyaan yang ditulis model sendiri; kalau itu ikut menjadi
 * sumber bukti, model bisa "mengutip" pertanyaannya sendiri sebagai keputusan
 * penulis.
 */
export function answerWords(answer: AskAnswer): string[] {
	if (answer.skipped) return []
	return [
		...(answer.responses ?? []).map(responseValue),
		...(answer.filled ?? []).map((entry) => entry.value),
	].filter(Boolean)
}

/** Nilai satu jawaban seperti yang dicatat di brief: pilihan lalu isian sendiri. */
export function responseValue(response: AskResponse): string {
	return [...response.choices, ...(response.other ? [response.other] : [])].join(', ')
}

/**
 * Apa yang dicatat ke brief dari satu jawaban, atau `null` bila jawabannya
 * tidak cocok dengan isiannya. Model bisa salah menyebut sasaran - pertanyaan
 * "topik mana yang benar?" pernah diarahkan ke isian pendekatan - jadi isian
 * pilihan hanya menerima salah satu pilihannya sendiri, atau kata-kata yang
 * diketik penulis sendiri.
 */
export function briefAnswerValue(question: AskQuestion, response: AskResponse): string | null {
	const field = question.briefField ? briefField(question.briefField) : undefined
	if (!field) return null
	if (!field.options) return responseValue(response) || null

	if (response.choices.length === 1 && !response.other) return canonicalOption(field, response.choices[0])
	if (response.choices.length === 0 && response.other)
		return canonicalOption(field, response.other) ?? response.other
	return null
}

const SKIPPED =
	'The writer skipped this. Continue with a sensible assumption and state it plainly in one sentence.'

/** Hasil alat untuk model - bahasa Inggris, seperti semua instruksi yang dibacanya. */
export function askResultText(
	call: ToolCall,
	answer: AskAnswer,
	saved: readonly BriefKey[] = [],
	unfit: readonly BriefKey[] = [],
): string {
	if (answer.skipped) return SKIPPED

	if (call.name === 'request_brief') {
		const filled = answer.filled ?? []
		const lines = filled.map((entry) => `- ${briefField(entry.key)?.prompt ?? entry.key}: ${entry.value}`)
		return [
			filled.length > 0 ? 'The writer filled in the research brief:' : 'The writer left these fields empty.',
			...lines,
			answer.empty?.length
				? `Still empty: ${answer.empty.map((key) => briefField(key)?.prompt ?? key).join(', ')}.`
				: '',
		]
			.filter(Boolean)
			.join('\n')
	}

	const lines = (answer.responses ?? []).map((response, index) => {
		const choices = response.choices.join(', ')
		const own = response.other ? `their own answer: "${response.other}"` : ''
		const value = [choices, own].filter(Boolean).join('; ') || 'no answer'
		return `${index + 1}. ${response.question} → ${value}`
	})
	const label = (key: BriefKey) => briefField(key)?.prompt ?? key
	const note =
		saved.length > 0
			? `Saved to the research brief as the writer's decision: ${saved.map(label).join(', ')}. Already recorded - do not call update_brief for these.`
			: ''
	const skipped =
		unfit.length > 0
			? `Not saved to the brief - the answer does not fit the field: ${unfit.map(label).join(', ')}.`
			: ''
	return ['The writer answered:', ...lines, note, skipped].filter(Boolean).join('\n')
}
