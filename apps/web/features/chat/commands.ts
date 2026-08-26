import { ALL_TOOLS } from '@writer-hub/shared'

/**
 * Perintah garis miring untuk kotak chat.
 *
 * Perhitungan murni: pencocokan dan penggantian teks, tanpa React dan tanpa
 * jaringan. Yang menjalankan efeknya adalah `ai-chat-panel`.
 */
export interface ChatCommand {
	id: string
	trigger: string
	label: string
	hint: string
	tier: 'intent' | 'tool'
	/** Teks yang menggantikan perintah di kotak chat. */
	instruction: string
	/** Menyalakan mode riset web - satu-satunya perintah yang mengubah state. */
	enablesResearch?: boolean
}

/** Tingkat 1: apa yang ingin dikerjakan penulis, bukan alat mana yang dipanggil. */
const INTENTS: ChatCommand[] = [
	{
		id: 'riset',
		trigger: 'riset',
		label: 'Riset web',
		hint: 'Nyalakan pencarian web untuk percakapan ini',
		tier: 'intent',
		instruction: '',
		enablesResearch: true,
	},
	{
		id: 'susun',
		trigger: 'susun',
		label: 'Susun dokumen',
		hint: 'Rancang kerangka dan heading',
		tier: 'intent',
		instruction: 'Susun kerangka dokumen ini, lalu buat headingnya: ',
	},
	{
		id: 'diagram',
		trigger: 'diagram',
		label: 'Buat diagram',
		hint: 'Ubah uraian jadi diagram Mermaid',
		tier: 'intent',
		instruction: 'Buatkan diagram Mermaid untuk: ',
	},
	{
		id: 'rapikan',
		trigger: 'rapikan',
		label: 'Rapikan format',
		hint: 'Seragamkan gaya paragraf, heading, dan spasi',
		tier: 'intent',
		instruction:
			'Rapikan format dokumen ini agar seragam: gaya paragraf, heading, penomoran, dan spasi.',
	},
	{
		id: 'tabel',
		trigger: 'tabel',
		label: 'Buat tabel',
		hint: 'Sisipkan tabel dari uraian',
		tier: 'intent',
		instruction: 'Buatkan tabel untuk: ',
	},
	{
		id: 'toc',
		trigger: 'toc',
		label: 'Daftar isi',
		hint: 'Sisipkan blok daftar isi',
		tier: 'intent',
		instruction: 'Sisipkan daftar isi ',
	},
	{
		id: 'terjemah',
		trigger: 'terjemah',
		label: 'Terjemahkan',
		hint: 'Terjemahkan bagian yang dipilih',
		tier: 'intent',
		instruction: 'Terjemahkan bagian ini ke ',
	},
]

/**
 * Tingkat 2 diturunkan dari registri alat, bukan ditulis ulang. Alat baca
 * disaring habis: model memanggilnya sendiri untuk mengorientasi diri, dan
 * mengetiknya sebagai perintah tidak menghasilkan apa pun yang terlihat.
 */
const TOOL_COMMANDS: ChatCommand[] = ALL_TOOLS.filter((tool) => tool.kind === 'write').map(
	(tool) => ({
		id: tool.name,
		trigger: tool.name.replace(/_/g, '-'),
		label: tool.name,
		hint: tool.description,
		tier: 'tool' as const,
		instruction: `Gunakan alat ${tool.name}: `,
	}),
)

/** Alat mentah baru muncul setelah tiga huruf - daftar 24 baris menutupi intent. */
const TOOL_TIER_MIN_CHARS = 3

const COMMAND_TOKEN = /^\/([a-z0-9-]*)$/i

/** Token perintah hanya dikenali saat ia satu-satunya isi kotak chat. */
export function commandToken(draft: string): string | null {
	const match = COMMAND_TOKEN.exec(draft)
	return match ? match[1].toLowerCase() : null
}

export function matchCommands(draft: string): ChatCommand[] {
	const token = commandToken(draft)
	if (token === null) return []

	const intents = INTENTS.filter((command) => command.trigger.startsWith(token))
	if (token.length < TOOL_TIER_MIN_CHARS) return intents

	const tools = TOOL_COMMANDS.filter((command) => command.trigger.includes(token))
	return [...intents, ...tools]
}

export function applyCommand(command: ChatCommand): string {
	return command.instruction
}
