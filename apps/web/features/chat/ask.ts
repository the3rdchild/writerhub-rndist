/**
 * Pertanyaan AI kepada penulis - `ask_user` dan `request_brief` - dari
 * argumen alat sampai hasil yang dikembalikan ke model.
 *
 * Argumen datang dari model, jadi dibaca dengan curiga: jumlah pertanyaan dan
 * pilihan dipangkas, label kembar dibuang. Kartu yang rusak karena argumen
 * yang aneh akan meninggalkan penulis tanpa kotak chat sama sekali.
 */

import { type BriefKey, briefField, isBriefKey, type ToolCall } from '@writer-hub/shared'

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
			if (!label || seen.has(label.toLowerCase())) continue
			seen.add(label.toLowerCase())
			const description = text(value?.description, 160)
			options.push(description ? { label, description } : { label })
			if (options.length >= MAX_OPTIONS) break
		}

		const key = fields.brief_field
		const target = isBriefKey(key) && !briefField(key)?.userOnly ? key : undefined
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

/** Nilai satu jawaban seperti yang dicatat di brief: pilihan lalu isian sendiri. */
export function responseValue(response: AskResponse): string {
	return [...response.choices, ...(response.other ? [response.other] : [])].join(', ')
}

const SKIPPED =
	'The writer skipped this. Continue with a sensible assumption and state it plainly in one sentence.'

/** Hasil alat untuk model - bahasa Inggris, seperti semua instruksi yang dibacanya. */
export function askResultText(call: ToolCall, answer: AskAnswer, saved: readonly BriefKey[] = []): string {
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
	const note =
		saved.length > 0
			? `Saved to the research brief as the writer's decision: ${saved.map((key) => briefField(key)?.prompt ?? key).join(', ')}.`
			: ''
	return ['The writer answered:', ...lines, note].filter(Boolean).join('\n')
}
