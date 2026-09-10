/**
 * Katalog Agent Skills - pengetahuan prosedural yang dimuat sesuai kebutuhan,
 * bukan ditumpuk di system prompt.
 *
 * Satu katalog ini melayani tiga pembaca sekaligus: indeks ringkas yang
 * disuntik permanen ke system prompt, alat `read_skill` yang mengambil
 * badannya, dan tingkat ketiga palet `/` di kotak chat. Karena itu tiap entri
 * punya dua muka - `label`/`hint` untuk penulis (Bahasa Indonesia), dan
 * `description` untuk model (Inggris).
 *
 * Isinya ada di `packages/shared/skills/`, bukan di sini: teks panjang di
 * dalam berkas TypeScript menghalangi diff yang bisa dibaca.
 *
 * Rancangan lengkap: `docs/AGENT-SKILLS-PLAN.md`.
 */

import type { ToolDefinition } from './tools'

export interface SkillFile {
	/** Nama yang dipakai model di `read_skill(name, file)`. */
	name: string
	/** Untuk model: kapan berkas ini layak dibuka. */
	summary: string
}

export interface SkillDefinition {
	name: string
	/** Untuk penulis, muncul di palet `/`. */
	label: string
	hint: string
	/** Untuk model, ikut di indeks system prompt. Satu kalimat. */
	description: string
	/**
	 * Direktori overlay di `packages/shared/skills/`, atau `null` bila skill
	 * ini sudah dikurasi tapi overlaynya belum ditulis. Yang `null` tidak
	 * pernah sampai ke model maupun ke palet.
	 */
	overlay: string | null
	/** Berkas dalam, diambil hanya kalau model memintanya. */
	files: readonly SkillFile[]
}

export const SKILLS: readonly SkillDefinition[] = [
	{
		name: 'scientific-writing',
		label: 'Tulisan ilmiah',
		hint: 'Aturan argumen, bukti, dan ketidakpastian',
		description:
			'Building an evidence-bound argument: what may be claimed, how a claim is tied to a source, and how uncertainty survives the rewrite.',
		overlay: 'scientific-writing',
		files: [
			{
				name: 'evidence-audit',
				summary:
					'Auditing an existing draft for unsupported claims, overstated certainty, and methods that do not match the results.',
			},
		],
	},
	{
		name: 'peer-review',
		label: 'Tinjauan sejawat',
		hint: 'Periksa naskah sebelum disetor',
		description:
			"Assessing a manuscript, the writer's own or someone else's: what to examine in which order, and how a usable comment is built.",
		overlay: 'peer-review',
		files: [
			{
				name: 'revision-response',
				summary:
					'Answering reviewer comments: what to concede, what to defend, how the response letter is built.',
			},
		],
	},
	{
		name: 'venue-templates',
		label: 'Aturan penerbit',
		hint: 'Format sesuai tujuan terbit',
		description:
			'Preparing for a journal, conference or funder that rejects on formatting alone. Venue rules change between calls, so never state one from memory.',
		overlay: 'venue-templates',
		files: [],
	},
	{
		name: 'research-grants',
		label: 'Proposal penelitian',
		hint: 'Susun usulan dana penelitian',
		description:
			'The argument a funded proposal must make - why it matters, why it is new, why it will work, why this team - and how reviewers actually read.',
		overlay: 'research-grants',
		files: [],
	},
	{
		name: 'diagram-design',
		label: 'Diagram editorial',
		hint: 'Gambar bagan yang serasi dengan dokumen',
		description:
			'Drawing a diagram as inline SVG when a reader would learn more from a picture than from prose: which layout fits which relationship, the style tokens, and the constraints the editor enforces. Load it before calling insert_diagram.',
		overlay: 'diagram-design',
		files: [
			{
				name: 'architecture',
				summary: 'Components of a system and how they talk: tiers, zones, protocol labels.',
			},
			{
				name: 'flowchart',
				summary: 'Decision logic where shape carries the meaning and every branch is labelled.',
			},
			{
				name: 'timeline',
				summary: 'Events on an axis, spaced in proportion to the real intervals between them.',
			},
			{
				name: 'swimlane',
				summary: 'A process with several actors, where the handoffs between them are the point.',
			},
			{
				name: 'layers',
				summary: 'Levels of abstraction stacked on one another, with the direction stated.',
			},
			{
				name: 'tree',
				summary: 'Containment or descent where every node has exactly one parent.',
			},
			{
				name: 'bar',
				summary: 'One number per category, compared side by side.',
			},
			{
				name: 'line',
				summary: 'A trend over time or a sequence, where the direction of change is the message.',
			},
			{
				name: 'scatter',
				summary: 'Two continuous variables against each other: correlation, clusters, outliers.',
			},
		],
	},
	{
		name: 'scientific-brainstorming',
		label: 'Curah gagasan',
		hint: 'Tahap awal, sebelum ada tulisan',
		description:
			'Before there is anything to write: separating idea from assumption from evidence, and refusing to assert a research gap nobody searched for.',
		overlay: 'scientific-brainstorming',
		files: [],
	},
]

/** Skill yang overlaynya sudah ada - satu-satunya yang boleh dipakai. */
export const ACTIVE_SKILLS: readonly SkillDefinition[] = SKILLS.filter((skill) => skill.overlay !== null)

export function findActiveSkill(name: string): SkillDefinition | undefined {
	return ACTIVE_SKILLS.find((skill) => skill.name === name)
}

/**
 * Jalur berkas relatif terhadap `packages/shared/skills/`.
 *
 * Mengembalikan `null` bila skill atau berkasnya tidak ada di katalog. Karena
 * itu satu-satunya cara jalur dibentuk, tidak ada string dari model yang
 * pernah sampai ke sistem berkas - penelusuran direktori jadi mustahil, bukan
 * sekadar dicegah.
 */
export function skillFilePath(name: string, file?: string | null): string | null {
	const skill = findActiveSkill(name)
	if (!skill?.overlay) return null
	if (!file) return `${skill.overlay}/SKILL.md`
	return skill.files.some((entry) => entry.name === file) ? `${skill.overlay}/${file}.md` : null
}

/**
 * Alat pengambil isi skill. Kosong selama belum ada satu pun overlay: alat
 * yang tidak punya apa-apa untuk dibaca hanya mengundang model memanggilnya.
 */
export const SKILL_TOOLS: readonly ToolDefinition[] =
	ACTIVE_SKILLS.length === 0
		? []
		: [
				{
					name: 'read_skill',
					kind: 'read',
					description:
						'Load the full text of one skill listed in the skills index. Call it when the writer is working on something a skill covers, before you start drafting or judging their text. Pass `file` to go deeper than the main body; the index says which deeper files exist and what each is for.',
					parameters: {
						type: 'object',
						properties: {
							name: {
								type: 'string',
								description: 'Skill name exactly as it appears in the skills index.',
								enum: ACTIVE_SKILLS.map((skill) => skill.name),
							},
							file: {
								type: 'string',
								description: 'Optional deeper file within the skill. Omit to read the main body first.',
							},
						},
						required: ['name'],
					},
				},
			]
