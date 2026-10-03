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
		label: 'Default',
		hint: 'The model set for this account',
		tools: true,
	},

	// Sama dengan GET /models adapter; urut dari murah ke premium.
	{
		id: 'deepseek/deepseek-v4-flash-0731',
		label: 'DeepSeek V4 Flash 0731',
		hint: 'Cheap; V4 Flash revision for agent flows',
		tools: true,
	},
	{
		id: 'deepseek/deepseek-v4-flash',
		label: 'DeepSeek V4 Flash',
		hint: 'Cheap; 1 million token context',
		tools: true,
	},
	{
		id: 'openai/gpt-6-luna',
		label: 'GPT-6 Luna',
		hint: 'Cheap; fast model from OpenAI',
		tools: true,
	},
	{
		id: 'xiaomi/mimo-v2.6-flash',
		label: 'MiMo V2.6 Flash',
		hint: 'Cheap; 1 million token context',
		tools: true,
	},
	{
		id: 'qwen/qwen3.8-flash',
		label: 'Qwen3.8 Flash',
		hint: 'Cheap; fast, from Alibaba',
		tools: true,
	},
	{
		id: 'z-ai/glm-5.3-flash',
		label: 'GLM-5.3 Flash',
		hint: 'Cheap; strong with long context',
		tools: true,
	},
	{
		id: 'deepseek/deepseek-v4.1-flash',
		label: 'DeepSeek V4.1 Flash',
		hint: 'Mid-range; successor to V4 Flash',
		tools: true,
	},
	{
		id: 'minimax/minimax-m3',
		label: 'MiniMax M3',
		hint: 'Mid-range; 1 million token context',
		tools: true,
	},
	{
		id: 'qwen/qwen3.7-plus',
		label: 'Qwen3.7 Plus',
		hint: 'Mid-range; all-rounder from Alibaba',
		tools: true,
	},
	{
		id: 'deepseek/deepseek-v4-pro',
		label: 'DeepSeek V4 Pro',
		hint: 'Mid-range; stronger at long reasoning',
		tools: true,
	},
	{
		id: 'google/gemini-3.8-flash',
		label: 'Gemini 3.8 Flash',
		hint: 'Mid-range; fast, 1 million token context',
		tools: true,
	},
	{
		id: 'anthropic/claude-sonnet-5',
		label: 'Claude Sonnet 5',
		hint: 'Premium; strong at editing long documents',
		tools: true,
	},
	{
		id: 'openai/gpt-6-sol',
		label: 'GPT-6 Sol',
		hint: 'Premium; all-rounder from OpenAI',
		tools: true,
	},
	{
		id: 'moonshotai/kimi-k3',
		label: 'Kimi K3',
		hint: 'Premium; strong with non-English text',
		tools: true,
	},
	{
		id: 'anthropic/claude-opus-5.5',
		label: 'Claude Opus 5.5',
		hint: 'Premium; strongest, most expensive',
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
