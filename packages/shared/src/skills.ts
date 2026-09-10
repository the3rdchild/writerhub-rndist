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
			'How to build and audit an evidence-bound scientific argument: what may be claimed, how a claim is tied to a source, and how uncertainty must survive into the prose.',
		overlay: 'scientific-writing',
		files: [
			{
				name: 'evidence-audit',
				summary:
					'Step-by-step audit of an existing draft: finding unsupported claims, overstated certainty, and mismatches between methods and results.',
			},
		],
	},
	{
		name: 'peer-review',
		label: 'Tinjauan sejawat',
		hint: 'Periksa naskah sebelum disetor',
		description: '',
		overlay: null,
		files: [],
	},
	{
		name: 'venue-templates',
		label: 'Aturan penerbit',
		hint: 'Format sesuai tujuan terbit',
		description: '',
		overlay: null,
		files: [],
	},
	{
		name: 'research-grants',
		label: 'Proposal penelitian',
		hint: 'Susun usulan dana penelitian',
		description: '',
		overlay: null,
		files: [],
	},
	{
		name: 'scientific-brainstorming',
		label: 'Curah gagasan',
		hint: 'Tahap awal, sebelum ada tulisan',
		description: '',
		overlay: null,
		files: [],
	},
]

/** Skill yang overlaynya sudah ada - satu-satunya yang boleh dipakai. */
export const ACTIVE_SKILLS: readonly SkillDefinition[] = SKILLS.filter((skill) => skill.overlay !== null)
