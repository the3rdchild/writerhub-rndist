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

	// Sama dengan GET /models adapter; urut dari murah ke premium.
	{
		id: 'deepseek/deepseek-v4-flash-0731',
		label: 'DeepSeek V4 Flash 0731',
		hint: 'Murah; revisi V4 Flash untuk alur agen',
		tools: true,
	},
	{
		id: 'deepseek/deepseek-v4-flash',
		label: 'DeepSeek V4 Flash',
		hint: 'Murah; konteks 1 juta token',
		tools: true,
	},
	{
		id: 'openai/gpt-6-luna',
		label: 'GPT-6 Luna',
		hint: 'Murah; model cepat dari OpenAI',
		tools: true,
	},
	{
		id: 'xiaomi/mimo-v2.6-flash',
		label: 'MiMo V2.6 Flash',
		hint: 'Murah; konteks 1 juta token',
		tools: true,
	},
	{
		id: 'qwen/qwen3.8-flash',
		label: 'Qwen3.8 Flash',
		hint: 'Murah; cepat dari Alibaba',
		tools: true,
	},
	{
		id: 'z-ai/glm-5.3-flash',
		label: 'GLM-5.3 Flash',
		hint: 'Murah; kuat di konteks panjang',
		tools: true,
	},
	{
		id: 'deepseek/deepseek-v4.1-flash',
		label: 'DeepSeek V4.1 Flash',
		hint: 'Menengah; penerus V4 Flash',
		tools: true,
	},
	{
		id: 'minimax/minimax-m3',
		label: 'MiniMax M3',
		hint: 'Menengah; konteks 1 juta token',
		tools: true,
	},
	{
		id: 'qwen/qwen3.7-plus',
		label: 'Qwen3.7 Plus',
		hint: 'Menengah; serba bisa dari Alibaba',
		tools: true,
	},
	{
		id: 'deepseek/deepseek-v4-pro',
		label: 'DeepSeek V4 Pro',
		hint: 'Menengah; lebih kuat untuk penalaran panjang',
		tools: true,
	},
	{
		id: 'google/gemini-3.8-flash',
		label: 'Gemini 3.8 Flash',
		hint: 'Menengah; cepat, konteks 1 juta token',
		tools: true,
	},
	{
		id: 'anthropic/claude-sonnet-5',
		label: 'Claude Sonnet 5',
		hint: 'Premium; kuat untuk menyunting naskah panjang',
		tools: true,
	},
	{
		id: 'openai/gpt-6-sol',
		label: 'GPT-6 Sol',
		hint: 'Premium; serba bisa dari OpenAI',
		tools: true,
	},
	{
		id: 'moonshotai/kimi-k3',
		label: 'Kimi K3',
		hint: 'Premium; kuat di teks non-Inggris',
		tools: true,
	},
	{
		id: 'anthropic/claude-opus-5.5',
		label: 'Claude Opus 5.5',
		hint: 'Premium; paling kuat, paling mahal',
		tools: true,
	},
]

const CHAT_MODEL_IDS = new Set(CHAT_MODELS.map((model) => model.id))

export function isKnownChatModel(id: string): boolean {
	return CHAT_MODEL_IDS.has(id)
}

export function findChatModel(id: string): ChatModel | undefined {
	return CHAT_MODELS.find((model) => model.id === id)
}
