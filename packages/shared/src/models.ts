export interface ChatModel {
	id: string
	label: string
	hint: string
	tools: boolean
	free?: boolean
}
export const DEFAULT_CHAT_MODEL = ''

export const CHAT_MODELS: readonly ChatModel[] = [
	{
		id: DEFAULT_CHAT_MODEL,
		label: 'Bawaan',
		hint: 'Model yang disetel untuk akun ini',
		tools: true,
	},

	{
		id: 'deepseek/deepseek-v4-flash',
		label: 'DeepSeek V4 Flash',
		hint: 'Cepat dan murah; konteks 1 juta token',
		tools: true,
	},
	{
		id: 'deepseek/deepseek-v4-pro',
		label: 'DeepSeek V4 Pro',
		hint: 'Lebih kuat untuk penalaran panjang',
		tools: true,
	},
	{
		id: 'google/gemini-3.6-flash',
		label: 'Gemini 3.6 Flash',
		hint: 'Cepat, konteks 1 juta token',
		tools: true,
	},
	{
		id: 'anthropic/claude-sonnet-5',
		label: 'Claude Sonnet 5',
		hint: 'Kuat untuk menyunting naskah panjang',
		tools: true,
	},
	{
		id: 'anthropic/claude-opus-5',
		label: 'Claude Opus 5',
		hint: 'Paling kuat, paling mahal',
		tools: true,
	},
	{
		id: 'openai/gpt-5.6-sol',
		label: 'GPT-5.6 Sol',
		hint: 'Serba bisa dari OpenAI',
		tools: true,
	},
	{
		id: 'moonshotai/kimi-k3',
		label: 'Kimi K3',
		hint: 'Konteks besar, kuat di teks non-Inggris',
		tools: true,
	},
	{
		id: 'inclusionai/ling-3.0-tiny:free',
		label: 'Ling 3.0 Tiny',
		hint: 'Gratis; kecil, untuk tanya jawab ringan',
		tools: true,
		free: true,
	},
	{
		id: 'poolside/laguna-s-2.1:free',
		label: 'Laguna S 2.1',
		hint: 'Gratis; condong ke tugas terstruktur',
		tools: true,
		free: true,
	},
]

const CHAT_MODEL_IDS = new Set(CHAT_MODELS.map((model) => model.id))
export function isKnownChatModel(id: string): boolean {
	return CHAT_MODEL_IDS.has(id)
}

export function findChatModel(id: string): ChatModel | undefined {
	return CHAT_MODELS.find((model) => model.id === id)
}
