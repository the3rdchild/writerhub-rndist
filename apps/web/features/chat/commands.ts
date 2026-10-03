import { ACTIVE_SKILLS, ALL_TOOLS } from '@writer-hub/shared'

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
	tier: 'intent' | 'skill' | 'tool'
	/** Teks yang menggantikan perintah di kotak chat. */
	instruction: string
	/** Menyalakan mode riset web. */
	enablesResearch?: boolean
	/** Meneruskan tugas terakhir alih-alih mengisi kotak chat. */
	resumes?: boolean
}

/** Tingkat 1: apa yang ingin dikerjakan penulis, bukan alat mana yang dipanggil. */
const INTENTS: ChatCommand[] = [
	{
		id: 'riset',
		trigger: 'riset',
		label: 'Web research',
		hint: 'Turn on web search for this conversation',
		tier: 'intent',
		instruction: '',
		enablesResearch: true,
	},
	{
		id: 'lanjut',
		trigger: 'lanjut',
		label: 'Continue task',
		hint: 'Pick up the last task where it stopped',
		tier: 'intent',
		instruction: 'Lanjutkan ',
		resumes: true,
	},
	{
		id: 'susun',
		trigger: 'susun',
		label: 'Outline document',
		hint: 'Plan the outline and headings',
		tier: 'intent',
		instruction: 'Susun kerangka dokumen ini, lalu buat headingnya: ',
	},
	{
		id: 'diagram',
		trigger: 'diagram',
		label: 'Make a diagram',
		hint: 'Turn a description into a Mermaid diagram',
		tier: 'intent',
		instruction: 'Buatkan diagram Mermaid untuk: ',
	},
	{
		id: 'rapikan',
		trigger: 'rapikan',
		label: 'Tidy formatting',
		hint: 'Make paragraph styles, headings, and spacing consistent',
		tier: 'intent',
		instruction: 'Rapikan format dokumen ini agar seragam: gaya paragraf, heading, penomoran, dan spasi.',
	},
	{
		id: 'tabel',
		trigger: 'tabel',
		label: 'Make a table',
		hint: 'Insert a table from a description',
		tier: 'intent',
		instruction: 'Buatkan tabel untuk: ',
	},
	{
		id: 'toc',
		trigger: 'toc',
		label: 'Table of contents',
		hint: 'Insert a table of contents block',
		tier: 'intent',
		instruction: 'Sisipkan daftar isi ',
	},
	{
		id: 'terjemah',
		trigger: 'terjemah',
		label: 'Translate',
		hint: 'Translate the selected passage',
		tier: 'intent',
		instruction: 'Terjemahkan bagian ini ke ',
	},
]

/**
 * Tingkat 1b: skill yang bisa dipaksa penulis.
 *
 * Diturunkan dari katalog, bukan ditulis tangan - sama seperti tingkat 2 di
 * bawah. Duduk bersama intent, bukan bersama alat mentah: daftarnya pendek,
 * dan gunanya justru saat pemilihan otomatis oleh model meleset, jadi ia harus
 * kelihatan sejak garis miring pertama diketik.
 */
const SKILL_COMMANDS: ChatCommand[] = ACTIVE_SKILLS.map((skill) => ({
	id: `skill-${skill.name}`,
	trigger: skill.name,
	label: skill.label,
	hint: skill.hint,
	tier: 'skill' as const,
	instruction: `Baca skill ${skill.name} lebih dulu, lalu kerjakan: `,
}))

/**
 * Tingkat 2 diturunkan dari registri alat, bukan ditulis ulang. Alat baca
 * disaring habis: model memanggilnya sendiri untuk mengorientasi diri, dan
 * mengetiknya sebagai perintah tidak menghasilkan apa pun yang terlihat.
 */
const TOOL_COMMANDS: ChatCommand[] = ALL_TOOLS.filter((tool) => tool.kind === 'write').map((tool) => ({
	id: tool.name,
	trigger: tool.name.replace(/_/g, '-'),
	label: tool.name,
	hint: tool.description,
	tier: 'tool' as const,
	instruction: `Gunakan alat ${tool.name}: `,
}))

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
	const skills = SKILL_COMMANDS.filter((command) => command.trigger.includes(token))
	if (token.length < TOOL_TIER_MIN_CHARS) return [...intents, ...skills]

	const tools = TOOL_COMMANDS.filter((command) => command.trigger.includes(token))
	return [...intents, ...skills, ...tools]
}

export function applyCommand(command: ChatCommand): string {
	return command.instruction
}
