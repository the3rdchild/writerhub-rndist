/**
 * Alat yang boleh dipakai AI untuk mengoperasikan editor.
 *
 * Definisinya hidup di shared karena tiga pihak harus sepakat pada bentuk yang
 * sama: apps/api mengirimkannya ke provider sebagai parameter `tools`, browser
 * yang menjalankannya, dan prompt cadangan menuliskannya kembali sebagai teks
 * saat provider tidak mendukung tool calling.
 *
 * Alat dipisah tegas jadi dua jenis, dan pembedanya bukan selera:
 *
 * - `read` tidak mengubah apa pun, jadi ia dijalankan langsung dan percakapan
 *   berlanjut sendiri. Tidak ada yang perlu ditinjau dari membaca.
 * - `write` menyentuh naskah atau menghabiskan kuota, jadi ia berhenti sebagai
 *   kartu aksi sampai pengguna menekan Apply. Pada dokumen puluhan halaman,
 *   suntingan yang tidak dilihat hampir mustahil ditelusuri kembali.
 */

export type ToolKind = 'read' | 'write'

export interface ToolDefinition {
	name: string
	kind: ToolKind
	description: string
	/** JSON Schema untuk argumennya, sesuai format tool calling OpenAI. */
	parameters: {
		type: 'object'
		properties: Record<string, unknown>
		required?: string[]
	}
}

export const EDITOR_TOOLS: readonly ToolDefinition[] = [
	{
		name: 'get_outline',
		kind: 'read',
		description:
			'List every heading in the document with its level and index. Use this first to orient yourself before reading or editing a long document.',
		parameters: { type: 'object', properties: {} },
	},
	{
		name: 'read_section',
		kind: 'read',
		description:
			'Read the text under one heading, up to the next heading of the same or higher level. Prefer this over asking for the whole document.',
		parameters: {
			type: 'object',
			properties: {
				heading_index: {
					type: 'number',
					description: 'Index of the heading as returned by get_outline.',
				},
			},
			required: ['heading_index'],
		},
	},
	{
		name: 'find_text',
		kind: 'read',
		description:
			'Find occurrences of a phrase in the document. Returns a short snippet around each hit so you can quote it back exactly.',
		parameters: {
			type: 'object',
			properties: {
				query: { type: 'string', description: 'Text to look for.' },
			},
			required: ['query'],
		},
	},

	{
		name: 'insert_content',
		kind: 'write',
		description:
			'Insert new content into the document. Write it as Markdown — tables, headings and lists become real editor nodes, not text that looks like them.',
		parameters: {
			type: 'object',
			properties: {
				markdown: {
					type: 'string',
					description: 'The content as Markdown.',
				},
				position: {
					type: 'string',
					enum: ['cursor', 'end'],
					description: 'Where it goes. Defaults to the cursor.',
				},
			},
			required: ['markdown'],
		},
	},
	{
		name: 'replace_text',
		kind: 'write',
		description:
			'Replace an exact passage with new text. The find value must match the document character for character — use find_text or read_section first to copy it exactly.',
		parameters: {
			type: 'object',
			properties: {
				find: { type: 'string', description: 'Exact text to replace.' },
				replace: { type: 'string', description: 'Replacement, as Markdown.' },
			},
			required: ['find', 'replace'],
		},
	},
	{
		name: 'insert_page_break',
		kind: 'write',
		description: 'Start a new page at the cursor.',
		parameters: { type: 'object', properties: {} },
	},
	{
		name: 'add_comment',
		kind: 'write',
		description:
			'Leave a comment on a passage instead of editing it. Use this when the writer should decide, not you.',
		parameters: {
			type: 'object',
			properties: {
				quote: { type: 'string', description: 'Exact passage to attach the comment to.' },
				body: { type: 'string', description: 'The comment itself.' },
			},
			required: ['quote', 'body'],
		},
	},
	{
		name: 'run_module',
		kind: 'write',
		description:
			'Run one of the analysis modules and open its panel. Costs quota, so ask only when the user wants a full check.',
		parameters: {
			type: 'object',
			properties: {
				module: {
					type: 'string',
					enum: ['proofreader', 'ai_detector', 'ai_rewriter', 'humanizer', 'plagiarism'],
				},
			},
			required: ['module'],
		},
	},
]

const BY_NAME = new Map(EDITOR_TOOLS.map((tool) => [tool.name, tool]))

export function findTool(name: string): ToolDefinition | undefined {
	return BY_NAME.get(name)
}

export function isReadTool(name: string): boolean {
	return BY_NAME.get(name)?.kind === 'read'
}

/** Satu panggilan alat, sudah utuh argumennya. */
export interface ToolCall {
	id: string
	name: string
	/** Argumen hasil parsing; objek kosong kalau modelnya mengirim JSON rusak. */
	arguments: Record<string, unknown>
}

/** Hasil eksekusi yang dikirim balik ke model pada giliran berikutnya. */
export interface ToolResult {
	id: string
	name: string
	content: string
}

/**
 * Bentuk `tools` yang dikirim ke provider OpenAI-compatible.
 */
export function toProviderTools(): unknown[] {
	return EDITOR_TOOLS.map((tool) => ({
		type: 'function',
		function: {
			name: tool.name,
			description: tool.description,
			parameters: tool.parameters,
		},
	}))
}

/**
 * Instruksi cadangan saat provider tidak mendukung tool calling.
 *
 * Model diminta menulis panggilan sebagai blok berpagar bertanda `writerhub`.
 * Penanda itu sengaja tidak lazim supaya tidak tertukar dengan blok JSON biasa
 * yang kebetulan ada di dalam jawaban.
 */
export function fallbackToolPrompt(): string {
	const list = EDITOR_TOOLS.map((tool) => {
		const params = Object.keys(tool.parameters.properties).join(', ') || '(none)'
		return `- ${tool.name}(${params}) — ${tool.description}`
	}).join('\n')

	return [
		'You can operate the editor by emitting tool calls. To call a tool, write a',
		'fenced block tagged `writerhub` containing one JSON object:',
		'',
		'```writerhub',
		'{"tool": "insert_content", "arguments": {"markdown": "| A | B |\\n|---|---|\\n| 1 | 2 |"}}',
		'```',
		'',
		'Emit nothing else inside that block. Available tools:',
		list,
	].join('\n')
}

/** Pola blok cadangan; dipakai klien saat memindai jawaban. */
export const FALLBACK_TOOL_FENCE = /```writerhub\s*\n([\s\S]*?)```/g
