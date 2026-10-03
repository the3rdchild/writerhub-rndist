/**
 * Metadata penelitian satu dokumen - "brief" yang ikut di setiap permintaan AI
 * Chat supaya model tidak keluar dari penelitian penulisnya.
 *
 * Dua jenis isian yang sengaja diperlakukan berbeda:
 *
 * - **Keputusan** (jenis karya, pendekatan, rumusan masalah, variabel...) hanya
 *   boleh diisi AI kalau ada buktinya - kutipan naskah atau jawaban penulis.
 *   Tebakan yang tercatat di sini akan dituruti AI sendiri di setiap giliran
 *   berikutnya, dan penulis yang "tidak perlu membaca ulang" baru menemukannya
 *   di BAB III.
 * - **Turunan** (ringkasan bab, kata kunci) boleh diisi dan diperbarui AI
 *   dengan bebas: ia hanya merangkum apa yang sudah tertulis.
 *
 * Apa pun yang sudah terisi dan bukan turunan hasil AI tidak pernah ditimpa
 * langsung; perubahannya menjadi usulan yang disetujui penulis.
 *
 * Semua fungsi di sini murni - penyimpanan (Y.Doc, server) dan antarmuka
 * memanggilnya, bukan sebaliknya - supaya aturan di atas bisa diuji tanpa
 * satu pun dari keduanya.
 */

export type BriefSource = 'user' | 'ai' | 'template'
export type BriefNature = 'decision' | 'derived'
export type BriefTab = 'research' | 'format'
export type ChapterStatus = 'belum' | 'draf' | 'selesai'

export const BRIEF_KEYS = [
	'judul',
	'jenisKarya',
	'pendekatan',
	'bidang',
	'rumusanMasalah',
	'tujuan',
	'variabel',
	'hipotesis',
	'fokus',
	'informan',
	'produk',
	'modelPengembangan',
	'subjek',
	'metode',
	'teori',
	'kataKunci',
	'catatan',
	'pedoman',
	'sitasi',
	'kertas',
	'marginKiri',
	'marginAtas',
	'marginKanan',
	'marginBawah',
	'font',
	'ukuranFont',
	'spasi',
	'penomoranBab',
	'bahasa',
	'panjangAbstrak',
	'catatanFormat',
] as const

export type BriefKey = (typeof BRIEF_KEYS)[number]

export const CHAPTER_STATUSES: readonly ChapterStatus[] = ['belum', 'draf', 'selesai']

export interface BriefFieldDef {
	key: BriefKey
	tab: BriefTab
	/** Label di panel, bahasa penulis. */
	label: string
	/** Label di system prompt - model membaca instruksinya dalam bahasa Inggris. */
	prompt: string
	nature: BriefNature
	input: 'text' | 'multiline' | 'choice' | 'number'
	/** Pilihan cepat untuk `choice`; nilai lain tetap boleh diketik. */
	options?: readonly string[]
	/**
	 * Hanya relevan untuk pendekatan tertentu. Isian yang sudah bernilai tetap
	 * tampil apa pun pendekatannya - menyembunyikan data yang ada lebih buruk
	 * daripada satu baris yang tidak relevan.
	 */
	when?: readonly string[]
	/** Hanya penulis yang mengisinya; AI tidak pernah menulis ke sini. */
	userOnly?: boolean
	unit?: string
	hint?: string
	example?: string
}

const QUANTITATIVE = ['Kuantitatif', 'Campuran'] as const
const QUALITATIVE = ['Kualitatif', 'Campuran'] as const
const DEVELOPMENT = ['R&D'] as const

export const BRIEF_FIELDS: readonly BriefFieldDef[] = [
	{
		key: 'judul',
		tab: 'research',
		label: 'Title',
		prompt: 'Title',
		nature: 'decision',
		input: 'multiline',
		example: 'Pengaruh Literasi Digital terhadap Minat Baca Mahasiswa',
	},
	{
		key: 'jenisKarya',
		tab: 'research',
		label: 'Type of work',
		prompt: 'Type of work',
		nature: 'decision',
		input: 'choice',
		options: ['Skripsi', 'Tesis', 'Disertasi', 'Artikel jurnal', 'Makalah', 'Proposal penelitian'],
	},
	{
		key: 'pendekatan',
		tab: 'research',
		label: 'Approach',
		prompt: 'Research approach',
		nature: 'decision',
		input: 'choice',
		options: ['Kuantitatif', 'Kualitatif', 'Campuran', 'R&D', 'Studi literatur'],
	},
	{
		key: 'bidang',
		tab: 'research',
		label: 'Field & theme',
		prompt: 'Field and theme',
		nature: 'decision',
		input: 'text',
		example: 'Pendidikan - literasi digital mahasiswa',
	},
	{
		key: 'rumusanMasalah',
		tab: 'research',
		label: 'Research questions',
		prompt: 'Research questions',
		nature: 'decision',
		input: 'multiline',
	},
	{
		key: 'tujuan',
		tab: 'research',
		label: 'Research objectives',
		prompt: 'Research objectives',
		nature: 'decision',
		input: 'multiline',
	},
	{
		key: 'variabel',
		tab: 'research',
		label: 'Variables',
		prompt: 'Variables',
		nature: 'decision',
		input: 'text',
		when: QUANTITATIVE,
		example: 'X: literasi digital; Y: minat baca',
	},
	{
		key: 'hipotesis',
		tab: 'research',
		label: 'Hypotheses',
		prompt: 'Hypotheses',
		nature: 'decision',
		input: 'multiline',
		when: QUANTITATIVE,
	},
	{
		key: 'fokus',
		tab: 'research',
		label: 'Research focus',
		prompt: 'Research focus',
		nature: 'decision',
		input: 'multiline',
		when: QUALITATIVE,
	},
	{
		key: 'informan',
		tab: 'research',
		label: 'Informants / participants',
		prompt: 'Informants / participants',
		nature: 'decision',
		input: 'text',
		when: QUALITATIVE,
	},
	{
		key: 'produk',
		tab: 'research',
		label: 'Product being developed',
		prompt: 'Product being developed',
		nature: 'decision',
		input: 'text',
		when: DEVELOPMENT,
	},
	{
		key: 'modelPengembangan',
		tab: 'research',
		label: 'Development model',
		prompt: 'Development model',
		nature: 'decision',
		input: 'choice',
		options: ['ADDIE', 'Borg & Gall', '4D', 'Plomp', 'Dick & Carey'],
		when: DEVELOPMENT,
	},
	{
		key: 'subjek',
		tab: 'research',
		label: 'Subjects, population & setting',
		prompt: 'Subjects, population and setting',
		nature: 'decision',
		input: 'text',
	},
	{
		key: 'metode',
		tab: 'research',
		label: 'Method & analysis technique',
		prompt: 'Method and analysis technique',
		nature: 'decision',
		input: 'text',
		example: 'Survei, regresi linear berganda',
	},
	{
		key: 'teori',
		tab: 'research',
		label: 'Main theory',
		prompt: 'Main theory',
		nature: 'decision',
		input: 'text',
	},
	{
		key: 'kataKunci',
		tab: 'research',
		label: 'Keywords',
		prompt: 'Keywords',
		nature: 'derived',
		input: 'text',
	},
	{
		key: 'catatan',
		tab: 'research',
		label: 'Additional notes',
		prompt: "Writer's notes",
		nature: 'decision',
		input: 'multiline',
		userOnly: true,
		hint: 'Only you fill this in. The AI reads it but never writes here.',
	},

	{
		key: 'pedoman',
		tab: 'format',
		label: 'Style guide / institution',
		prompt: 'Style guide / institution',
		nature: 'decision',
		input: 'text',
		example: 'Pedoman Penulisan Skripsi FEB 2024',
	},
	{
		key: 'sitasi',
		tab: 'format',
		label: 'Citation style',
		prompt: 'Citation style',
		nature: 'decision',
		input: 'choice',
		options: ['APA 7', 'IEEE', 'Harvard', 'Chicago', 'Vancouver', 'MLA'],
	},
	{
		key: 'kertas',
		tab: 'format',
		label: 'Paper size',
		prompt: 'Paper size',
		nature: 'decision',
		input: 'choice',
		options: ['A4', 'F4 / Folio', 'Letter'],
	},
	{
		key: 'marginKiri',
		tab: 'format',
		label: 'Left',
		prompt: 'Left margin (cm)',
		nature: 'decision',
		input: 'number',
		unit: 'cm',
	},
	{
		key: 'marginAtas',
		tab: 'format',
		label: 'Top',
		prompt: 'Top margin (cm)',
		nature: 'decision',
		input: 'number',
		unit: 'cm',
	},
	{
		key: 'marginKanan',
		tab: 'format',
		label: 'Right',
		prompt: 'Right margin (cm)',
		nature: 'decision',
		input: 'number',
		unit: 'cm',
	},
	{
		key: 'marginBawah',
		tab: 'format',
		label: 'Bottom',
		prompt: 'Bottom margin (cm)',
		nature: 'decision',
		input: 'number',
		unit: 'cm',
	},
	{
		key: 'font',
		tab: 'format',
		label: 'Font',
		prompt: 'Body typeface',
		nature: 'decision',
		input: 'choice',
		options: ['Times New Roman', 'Arial', 'Georgia', 'Verdana'],
	},
	{
		key: 'ukuranFont',
		tab: 'format',
		label: 'Font size',
		prompt: 'Body font size (pt)',
		nature: 'decision',
		input: 'number',
		unit: 'pt',
	},
	{
		key: 'spasi',
		tab: 'format',
		label: 'Line spacing',
		prompt: 'Line spacing',
		nature: 'decision',
		input: 'choice',
		options: ['1', '1.15', '1.5', '2'],
	},
	{
		key: 'penomoranBab',
		tab: 'format',
		label: 'Heading numbering',
		prompt: 'Heading numbering',
		nature: 'decision',
		input: 'choice',
		options: ['BAB I, 1.1, 1.1.1', '1, 1.1, 1.1.1', 'I, A, 1', 'Tanpa nomor'],
	},
	{
		key: 'bahasa',
		tab: 'format',
		label: 'Manuscript language',
		prompt: 'Manuscript language',
		nature: 'decision',
		input: 'choice',
		options: ['Indonesia', 'Inggris'],
	},
	{
		key: 'panjangAbstrak',
		tab: 'format',
		label: 'Abstract length',
		prompt: 'Abstract length',
		nature: 'decision',
		input: 'text',
		example: '150-250 kata',
	},
	{
		key: 'catatanFormat',
		tab: 'format',
		label: 'Other format rules',
		prompt: 'Other format rules',
		nature: 'decision',
		input: 'multiline',
		example: 'Kutipan langsung > 40 kata ditulis terpisah, spasi 1, menjorok 1,27 cm.',
	},
]

const FIELD_BY_KEY = new Map(BRIEF_FIELDS.map((field) => [field.key, field]))

export function briefField(key: string): BriefFieldDef | undefined {
	return FIELD_BY_KEY.get(key as BriefKey)
}

export function isBriefKey(value: unknown): value is BriefKey {
	return typeof value === 'string' && FIELD_BY_KEY.has(value as BriefKey)
}

export interface BriefEntry {
	value: string
	source: BriefSource
	/** Kutipan naskah atau jawaban penulis yang mendasari isian AI. */
	evidence?: string
	at: number
}

export interface BriefChapter {
	title: string
	summary: string
	status: ChapterStatus
	source: BriefSource
	/**
	 * Tabel dan gambar yang dijanjikan kerangka untuk bab ini, berlabel
	 * nomornya: "Tabel 1: statistik adopsi", "Gambar 2: infografis". Aplikasi
	 * memeriksa naskah terhadapnya - lihat `set_outline`.
	 */
	items?: string[]
	/**
	 * Sidik jari isi bab saat ringkasannya ditulis. Berbeda dengan isi bab
	 * sekarang berarti naskahnya berubah sejak diringkas.
	 */
	fingerprint?: string
	at: number
}

/**
 * Perubahan dari AI yang menunggu keputusan penulis. Satu usulan per sasaran:
 * usulan baru untuk isian yang sama menggantikan yang lama, jadi `id`-nya bisa
 * diturunkan dari sasarannya.
 */
export interface BriefProposal {
	id: string
	key?: BriefKey
	chapter?: string
	value: string
	status?: ChapterStatus
	evidence?: string
	at: number
}

/**
 * Bagian kerangka tugas menulis yang bukan milik satu bab: panjang yang diminta
 * penulis dan catatan riset. Ikut di setiap giliran, jadi tidak hilang ketika
 * "Outline disetujui" memulai permintaan baru - dulu riset yang sama diulang
 * dari nol di giliran menulis (T13).
 */
export interface BriefPlan {
	/** Rentang halaman yang diminta, [min, maks]. */
	pages?: [number, number]
	/** Fakta dan sumber dari riset yang akan dipakai naskah, satu per baris. */
	notes: string[]
	at: number
}

export interface ResearchBrief {
	entries: Partial<Record<BriefKey, BriefEntry>>
	chapters: BriefChapter[]
	proposals: BriefProposal[]
	plan?: BriefPlan
	/**
	 * Template yang sudah pernah menyemai brief ini. Tanpa penanda ini, isian
	 * yang sengaja dikosongkan penulis akan terisi lagi dari template setiap
	 * kali dokumennya dibuka.
	 */
	seededFrom?: string
}

export const BRIEF_LIMITS = {
	value: 2_000,
	evidence: 400,
	chapters: 30,
	chapterTitle: 200,
	summary: 1_200,
	proposals: 40,
	items: 12,
	item: 200,
	notes: 20,
	note: 400,
	pages: 2_000,
} as const

export const EMPTY_BRIEF: ResearchBrief = { entries: {}, chapters: [], proposals: [] }

const clip = (value: unknown, limit: number): string =>
	typeof value === 'string' ? value.slice(0, limit) : ''

const SOURCES: readonly BriefSource[] = ['user', 'ai', 'template']

function readSource(raw: unknown): BriefSource {
	return SOURCES.includes(raw as BriefSource) ? (raw as BriefSource) : 'user'
}

function readStatus(raw: unknown): ChapterStatus {
	return CHAPTER_STATUSES.includes(raw as ChapterStatus) ? (raw as ChapterStatus) : 'draf'
}

const readTime = (raw: unknown): number => (typeof raw === 'number' && Number.isFinite(raw) ? raw : 0)

/**
 * Membaca brief tersimpan - dari Y.Doc, dari server, atau dari klien lain -
 * dengan curiga. Yang tersimpan bisa lebih tua dari kode ini, dan yang datang
 * lewat jaringan bisa berisi apa saja; bentuk yang tidak dikenal dibuang, bukan
 * dilempar sebagai galat yang mematikan panel.
 */
export function normalizeBrief(raw: unknown): ResearchBrief {
	if (!raw || typeof raw !== 'object') return { ...EMPTY_BRIEF }
	const value = raw as Record<string, unknown>

	const entries: ResearchBrief['entries'] = {}
	const rawEntries = value.entries && typeof value.entries === 'object' ? value.entries : {}
	for (const [key, entry] of Object.entries(rawEntries as Record<string, unknown>)) {
		if (!isBriefKey(key) || !entry || typeof entry !== 'object') continue
		const fields = entry as Record<string, unknown>
		const text = clip(fields.value, BRIEF_LIMITS.value).trim()
		if (!text) continue
		const evidence = clip(fields.evidence, BRIEF_LIMITS.evidence).trim()
		entries[key] = {
			value: text,
			source: readSource(fields.source),
			...(evidence ? { evidence } : {}),
			at: readTime(fields.at),
		}
	}

	const chapters: BriefChapter[] = []
	for (const chapter of Array.isArray(value.chapters) ? value.chapters : []) {
		if (!chapter || typeof chapter !== 'object') continue
		const fields = chapter as Record<string, unknown>
		const title = clip(fields.title, BRIEF_LIMITS.chapterTitle).trim()
		if (!title) continue
		const items = readLines(fields.items, BRIEF_LIMITS.items, BRIEF_LIMITS.item)
		chapters.push({
			title,
			summary: clip(fields.summary, BRIEF_LIMITS.summary).trim(),
			status: readStatus(fields.status),
			source: readSource(fields.source),
			...(items.length > 0 ? { items } : {}),
			...(typeof fields.fingerprint === 'string' ? { fingerprint: fields.fingerprint.slice(0, 64) } : {}),
			at: readTime(fields.at),
		})
		if (chapters.length >= BRIEF_LIMITS.chapters) break
	}

	const proposals: BriefProposal[] = []
	for (const proposal of Array.isArray(value.proposals) ? value.proposals : []) {
		if (!proposal || typeof proposal !== 'object') continue
		const fields = proposal as Record<string, unknown>
		const key = isBriefKey(fields.key) ? fields.key : undefined
		const chapter = clip(fields.chapter, BRIEF_LIMITS.chapterTitle).trim() || undefined
		if (!key && !chapter) continue
		const evidence = clip(fields.evidence, BRIEF_LIMITS.evidence).trim()
		proposals.push({
			id: key ? fieldProposalId(key) : chapterProposalId(chapter as string),
			...(key ? { key } : { chapter }),
			value: clip(fields.value, key ? BRIEF_LIMITS.value : BRIEF_LIMITS.summary).trim(),
			...(fields.status !== undefined ? { status: readStatus(fields.status) } : {}),
			...(evidence ? { evidence } : {}),
			at: readTime(fields.at),
		})
		if (proposals.length >= BRIEF_LIMITS.proposals) break
	}

	const seededFrom = clip(value.seededFrom, 64) || undefined
	const plan = readPlan(value.plan)
	return { entries, chapters, proposals, ...(plan ? { plan } : {}), ...(seededFrom ? { seededFrom } : {}) }
}

/** Larik teks pendek: yang bukan teks atau kosong dibuang, sisanya dipotong. */
function readLines(raw: unknown, count: number, length: number): string[] {
	if (!Array.isArray(raw)) return []
	return raw
		.map((line) => clip(line, length).replace(/\s+/g, ' ').trim())
		.filter(Boolean)
		.slice(0, count)
}

/** Rentang halaman yang masuk akal: bilangan bulat, 1 ≤ min ≤ maks. */
export function readPageRange(raw: unknown): [number, number] | undefined {
	if (!Array.isArray(raw) || raw.length !== 2) return undefined
	const [min, max] = raw.map((value) => Math.round(Number(value)))
	if (!Number.isFinite(min) || !Number.isFinite(max) || min < 1 || max < min || max > BRIEF_LIMITS.pages) {
		return undefined
	}
	return [min, max]
}

function readPlan(raw: unknown): BriefPlan | undefined {
	if (!raw || typeof raw !== 'object') return undefined
	const fields = raw as Record<string, unknown>
	const pages = readPageRange(fields.pages)
	const notes = readLines(fields.notes, BRIEF_LIMITS.notes, BRIEF_LIMITS.note)
	if (!pages && notes.length === 0) return undefined
	return { ...(pages ? { pages } : {}), notes, at: readTime(fields.at) }
}

export function isBriefEmpty(brief: ResearchBrief): boolean {
	return Object.keys(brief.entries).length === 0 && brief.chapters.length === 0 && !brief.plan
}

export function fieldProposalId(key: BriefKey): string {
	return `field:${key}`
}

export function chapterProposalId(title: string): string {
	return `chapter:${chapterKey(title)}`
}

/** Judul bab dicocokkan tanpa peduli huruf besar dan spasi: "BAB I  PENDAHULUAN" = "Bab I Pendahuluan". */
export function chapterKey(title: string): string {
	return title.toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Apakah isian ini relevan untuk pendekatan yang tercatat. Tanpa pendekatan,
 * isian bersyarat disembunyikan - kecuali sudah bernilai.
 */
export function briefFieldVisible(field: BriefFieldDef, brief: ResearchBrief): boolean {
	if (!field.when) return true
	if (brief.entries[field.key]) return true
	const approach = brief.entries.pendekatan?.value.toLowerCase()
	return approach !== undefined && field.when.some((option) => option.toLowerCase() === approach)
}

/** Keputusan penelitian yang relevan tapi belum terisi - yang harus ditanyakan, bukan ditebak. */
export function missingDecisions(brief: ResearchBrief): BriefFieldDef[] {
	return BRIEF_FIELDS.filter(
		(field) =>
			field.tab === 'research' &&
			field.nature === 'decision' &&
			!field.userOnly &&
			!brief.entries[field.key] &&
			briefFieldVisible(field, brief),
	)
}

/*
 * Pencocokan bukti dibuat longgar terhadap hal yang tidak mengubah makna -
 * huruf besar, spasi, tanda kutip lengkung, elipsis di ujung kutipan - dan
 * ketat terhadap isinya. Yang dicegah adalah bukti karangan, bukan kutipan yang
 * spasinya berbeda.
 */
function normalizeForMatch(text: string): string {
	return text
		.toLowerCase()
		.replace(/[“”„"]/g, '"')
		.replace(/[‘’]/g, "'")
		.replace(/\s+/g, ' ')
		.trim()
}

function stripQuoteMarks(text: string): string {
	return text.replace(/^["'\s.…]+|["'\s.…]+$/g, '')
}

/** Kutipan di dalam tanda kutip, sesudah tanda kutip lengkung diluruskan. */
const QUOTED = /"([^"]{3,})"|'([^']{3,})'/g
const SEGMENT = /→|->|=>|:|;|\(|\)/

/**
 * Apakah bukti yang disebut AI benar-benar ada - di naskah, atau di sesuatu
 * yang dikatakan penulis. Bukti yang tidak ditemukan di mana pun adalah
 * tebakan yang menyamar sebagai kutipan.
 *
 * Model jarang menyerahkan kutipan telanjang: ia menulis `User said:
 * 'skripsi saya'` atau `"Kuantitatif" (pilihan dari ask_user)`. Karena itu
 * yang dicocokkan bukan hanya seluruh teksnya, tapi juga tiap bagian yang
 * dikutipnya - pembungkusnya bukan klaim, kutipannya yang klaim.
 */
export function evidenceFound(evidence: string | undefined, sources: readonly string[]): boolean {
	const normalized = normalizeForMatch(evidence ?? '')
	const haystacks = sources.map(normalizeForMatch)
	const present = (needle: string) => haystacks.some((source) => source.includes(needle))

	const whole = stripQuoteMarks(normalized)
	if (whole.length >= 2 && present(whole)) return true

	for (const match of normalized.matchAll(QUOTED)) {
		const quote = stripQuoteMarks(match[1] ?? match[2] ?? '')
		if (quote.length >= 3 && present(quote)) return true
	}

	// "Bidang → Pendidikan Sejarah", "Pendekatan: kualitatif" - label lalu nilainya.
	for (const part of normalized.split(SEGMENT)) {
		const piece = stripQuoteMarks(part)
		if (piece.length >= 4 && present(piece)) return true
	}
	return false
}

export type BriefVerdict =
	| { verdict: 'apply' }
	| { verdict: 'propose' }
	| { verdict: 'skip'; reason: string }
	| { verdict: 'reject'; reason: string }

/**
 * Nasib satu tulisan AI ke satu isian. Inilah seluruh kebijakan brief dalam
 * satu tempat: panel, alat chat, dan ujinya membaca keputusan yang sama.
 */
export function judgeBriefWrite(
	field: BriefFieldDef,
	current: BriefEntry | undefined,
	value: string,
	hasEvidence: boolean,
): BriefVerdict {
	if (field.userOnly) return { verdict: 'reject', reason: 'only the writer fills this field' }
	if (!value.trim()) return { verdict: 'reject', reason: 'empty value - only the writer clears a field' }
	if (current && current.value === value.trim()) return { verdict: 'skip', reason: 'unchanged' }

	if (!current) {
		if (field.nature === 'decision' && !hasEvidence) {
			return {
				verdict: 'reject',
				reason:
					"no quote found in the document or in the writer's own words - put their exact words in quotes as evidence, or ask with ask_user instead of guessing",
			}
		}
		return { verdict: 'apply' }
	}

	if (field.nature === 'derived' && current.source === 'ai') return { verdict: 'apply' }
	return { verdict: 'propose' }
}

export interface BriefFieldUpdate {
	key: string
	value: string
	evidence?: string
}

export interface BriefChapterUpdate {
	title: string
	summary: string
	status?: ChapterStatus
}

export interface BriefUpdateReport {
	applied: string[]
	proposed: string[]
	skipped: string[]
	rejected: { target: string; reason: string }[]
}

export interface BriefUpdateContext {
	now: number
	/** Naskah dan ucapan penulis - tempat bukti keputusan harus bisa ditemukan. */
	evidenceSources: readonly string[]
	/** Sidik jari isi bab sekarang, menurut judulnya; `undefined` bila bab tidak ditemukan. */
	fingerprintOf?: (title: string) => string | undefined
}

function withoutProposal(proposals: BriefProposal[], id: string): BriefProposal[] {
	return proposals.filter((proposal) => proposal.id !== id)
}

function withProposal(proposals: BriefProposal[], proposal: BriefProposal): BriefProposal[] {
	return [...withoutProposal(proposals, proposal.id), proposal].slice(-BRIEF_LIMITS.proposals)
}

/** Tulisan AI ke brief, dengan laporan per sasaran yang dikembalikan ke model sebagai hasil alatnya. */
export function applyAiBriefUpdate(
	brief: ResearchBrief,
	update: { fields?: readonly BriefFieldUpdate[]; chapters?: readonly BriefChapterUpdate[] },
	context: BriefUpdateContext,
): { brief: ResearchBrief; report: BriefUpdateReport } {
	const report: BriefUpdateReport = { applied: [], proposed: [], skipped: [], rejected: [] }
	const entries = { ...brief.entries }
	let proposals = [...brief.proposals]
	const chapters = [...brief.chapters]

	for (const incoming of update.fields ?? []) {
		const field = briefField(incoming.key)
		if (!field) {
			report.rejected.push({ target: incoming.key, reason: 'unknown field' })
			continue
		}
		const raw = incoming.value.slice(0, BRIEF_LIMITS.value).trim()
		// "kuantitatif" dicatat sebagai "Kuantitatif": pilihan yang sama dengan
		// chip di panel, supaya chip-nya menyala dan tidak jatuh ke "Lainnya".
		const value = field.options?.find((option) => option.toLowerCase() === raw.toLowerCase()) ?? raw
		const evidence = incoming.evidence?.slice(0, BRIEF_LIMITS.evidence).trim() || undefined
		const verdict = judgeBriefWrite(
			field,
			entries[field.key],
			value,
			evidenceFound(evidence, context.evidenceSources),
		)

		if (verdict.verdict === 'apply') {
			entries[field.key] = { value, source: 'ai', ...(evidence ? { evidence } : {}), at: context.now }
			proposals = withoutProposal(proposals, fieldProposalId(field.key))
			report.applied.push(field.key)
		} else if (verdict.verdict === 'propose') {
			proposals = withProposal(proposals, {
				id: fieldProposalId(field.key),
				key: field.key,
				value,
				...(evidence ? { evidence } : {}),
				at: context.now,
			})
			report.proposed.push(field.key)
		} else if (verdict.verdict === 'skip') {
			report.skipped.push(field.key)
		} else {
			report.rejected.push({ target: field.key, reason: verdict.reason })
		}
	}

	for (const incoming of update.chapters ?? []) {
		const title = incoming.title.slice(0, BRIEF_LIMITS.chapterTitle).trim()
		const summary = incoming.summary.slice(0, BRIEF_LIMITS.summary).trim()
		if (!title) {
			report.rejected.push({ target: 'chapter', reason: 'missing title' })
			continue
		}
		const label = `chapter "${title}"`
		const at = chapters.findIndex((chapter) => chapterKey(chapter.title) === chapterKey(title))
		const existing = at === -1 ? undefined : chapters[at]
		const status = incoming.status ?? existing?.status ?? 'draf'
		const fingerprint = context.fingerprintOf?.(title)

		if (!existing) {
			if (chapters.length >= BRIEF_LIMITS.chapters) {
				report.rejected.push({ target: label, reason: `at most ${BRIEF_LIMITS.chapters} chapters` })
				continue
			}
			chapters.push({
				title,
				summary,
				status,
				source: 'ai',
				...(fingerprint ? { fingerprint } : {}),
				at: context.now,
			})
			report.applied.push(label)
			continue
		}

		const summaryChanged = summary !== '' && summary !== existing.summary
		if (!summaryChanged && status === existing.status) {
			report.skipped.push(label)
			continue
		}

		// Ringkasan yang ditulis penulis sendiri dilindungi; statusnya tidak -
		// "draf" ke "selesai" adalah fakta tentang naskah, bukan kata-katanya.
		// Bab yang ditambahkan penulis tanpa ringkasan boleh diisi: tidak ada
		// kata-kata penulis yang tertimpa.
		if (summaryChanged && existing.source === 'user' && existing.summary !== '') {
			proposals = withProposal(proposals, {
				id: chapterProposalId(existing.title),
				chapter: existing.title,
				value: summary,
				status,
				at: context.now,
			})
			report.proposed.push(label)
			continue
		}

		chapters[at] = {
			...existing,
			summary: summaryChanged ? summary : existing.summary,
			status,
			source: summaryChanged ? 'ai' : existing.source,
			...(fingerprint ? { fingerprint } : {}),
			at: context.now,
		}
		report.applied.push(label)
	}

	return { brief: { ...brief, entries, chapters, proposals }, report }
}

export interface OutlineSection {
	title: string
	summary?: string
	items?: string[]
}

export interface OutlineUpdate {
	sections: readonly OutlineSection[]
	/** `null` menghapus target; tanpa kunci ini target lama dipertahankan. */
	pages?: [number, number] | null
	notes?: readonly string[]
}

export interface OutlineReport {
	sections: number
	items: number
	/** Bab tulisan penulis yang tidak ada di kerangka - dipertahankan, bukan dihapus. */
	kept: string[]
	/** Bab rekaan AI atau template yang digantikan kerangka ini. */
	replaced: string[]
}

/**
 * Kerangka dari `set_outline`: daftar bab menjadi urutan kerangka, dengan
 * tabel/gambar yang dijanjikan tiap bab.
 *
 * Kerangka yang disetujui penulis menggantikan daftar bab rekaan AI atau
 * semaian template - yang tidak disebut kerangka dibuang, supaya pemeriksaan
 * kelengkapan tidak menagih bab yang memang tidak direncanakan. Bab yang
 * ditulis penulis sendiri tetap ada, di belakang, dan ringkasannya tidak
 * ditimpa. Status bab yang sudah berjalan dipertahankan.
 */
export function applyOutline(
	brief: ResearchBrief,
	outline: OutlineUpdate,
	now: number,
): { brief: ResearchBrief; report: OutlineReport } {
	const existing = new Map(brief.chapters.map((chapter) => [chapterKey(chapter.title), chapter]))
	const planned = new Set<string>()
	const chapters: BriefChapter[] = []

	for (const section of outline.sections) {
		const title = section.title.slice(0, BRIEF_LIMITS.chapterTitle).replace(/\s+/g, ' ').trim()
		const key = chapterKey(title)
		if (!title || planned.has(key) || chapters.length >= BRIEF_LIMITS.chapters) continue
		planned.add(key)

		const items = readLines(section.items ?? [], BRIEF_LIMITS.items, BRIEF_LIMITS.item)
		const summary = (section.summary ?? '').slice(0, BRIEF_LIMITS.summary).trim()
		const before = existing.get(key)
		const ownSummary = before?.source === 'user' && before.summary !== ''
		chapters.push({
			title: before?.title ?? title,
			summary: ownSummary || !summary ? (before?.summary ?? '') : summary,
			status: before?.status ?? 'belum',
			source: ownSummary ? 'user' : 'ai',
			...(items.length > 0 ? { items } : {}),
			...(before?.fingerprint ? { fingerprint: before.fingerprint } : {}),
			at: now,
		})
	}

	const kept: string[] = []
	const replaced: string[] = []
	for (const chapter of brief.chapters) {
		if (planned.has(chapterKey(chapter.title))) continue
		if (chapter.source === 'user' && chapters.length < BRIEF_LIMITS.chapters) {
			chapters.push(chapter)
			kept.push(chapter.title)
		} else {
			replaced.push(chapter.title)
		}
	}

	const pages = outline.pages === undefined ? brief.plan?.pages : (readPageRange(outline.pages) ?? undefined)
	const notes =
		outline.notes === undefined
			? (brief.plan?.notes ?? [])
			: readLines(outline.notes, BRIEF_LIMITS.notes, BRIEF_LIMITS.note)
	const plan: BriefPlan | undefined =
		pages || notes.length > 0 ? { ...(pages ? { pages } : {}), notes, at: now } : undefined

	const titles = new Set(chapters.map((chapter) => chapterProposalId(chapter.title)))
	const { plan: _previous, ...rest } = brief
	return {
		brief: {
			...rest,
			chapters,
			proposals: brief.proposals.filter((proposal) => !proposal.chapter || titles.has(proposal.id)),
			...(plan ? { plan } : {}),
		},
		report: {
			sections: planned.size,
			items: chapters.reduce((sum, chapter) => sum + (chapter.items?.length ?? 0), 0),
			kept,
			replaced,
		},
	}
}

/** Suntingan penulis: selalu menang, dan menggugurkan usulan AI untuk isian yang sama. */
export function setUserEntry(brief: ResearchBrief, key: BriefKey, value: string, now: number): ResearchBrief {
	const entries = { ...brief.entries }
	const text = value.slice(0, BRIEF_LIMITS.value).trim()
	if (text) entries[key] = { value: text, source: 'user', at: now }
	else delete entries[key]
	return { ...brief, entries, proposals: withoutProposal(brief.proposals, fieldProposalId(key)) }
}

/**
 * Isian AI yang dikunci penulis menjadi miliknya. Nilainya sama, sumbernya
 * yang berubah - dan sejak itu AI hanya bisa mengusulkan perubahannya.
 */
export function confirmEntry(brief: ResearchBrief, key: BriefKey, now: number): ResearchBrief {
	const entry = brief.entries[key]
	if (!entry || entry.source === 'user') return brief
	return { ...brief, entries: { ...brief.entries, [key]: { value: entry.value, source: 'user', at: now } } }
}

export function setUserChapters(brief: ResearchBrief, chapters: readonly BriefChapter[]): ResearchBrief {
	const titles = new Set(chapters.map((chapter) => chapterProposalId(chapter.title)))
	return {
		...brief,
		chapters: chapters.slice(0, BRIEF_LIMITS.chapters),
		// Usulan untuk bab yang sudah dihapus tidak punya tempat mendarat lagi.
		proposals: brief.proposals.filter((proposal) => !proposal.chapter || titles.has(proposal.id)),
	}
}

export function acceptProposal(brief: ResearchBrief, id: string, now: number): ResearchBrief {
	const proposal = brief.proposals.find((entry) => entry.id === id)
	if (!proposal) return brief
	const proposals = withoutProposal(brief.proposals, id)

	if (proposal.key) {
		/* Disetujui penulis berarti diputuskan penulis: sumbernya menjadi
		 * `user`, jadi AI tidak bisa menimpanya lagi tanpa usulan baru. */
		return {
			...brief,
			entries: { ...brief.entries, [proposal.key]: { value: proposal.value, source: 'user', at: now } },
			proposals,
		}
	}

	const chapters = brief.chapters.map((chapter) =>
		chapterProposalId(chapter.title) === id
			? {
					...chapter,
					summary: proposal.value,
					status: proposal.status ?? chapter.status,
					source: 'user' as const,
					at: now,
				}
			: chapter,
	)
	return { ...brief, chapters, proposals }
}

export function rejectProposal(brief: ResearchBrief, id: string): ResearchBrief {
	return { ...brief, proposals: withoutProposal(brief.proposals, id) }
}

/**
 * Sidik jari pendek untuk teks bab - FNV-1a 32 bit. Bukan pengaman, hanya
 * penanda "isinya berubah" yang murah dihitung ulang setiap kali naskah
 * disunting.
 */
export function textFingerprint(text: string): string {
	let hash = 0x811c9dc5
	const normalized = text.replace(/\s+/g, ' ').trim()
	for (let index = 0; index < normalized.length; index++) {
		hash ^= normalized.charCodeAt(index)
		hash = Math.imul(hash, 0x01000193)
	}
	return (hash >>> 0).toString(36)
}

/*
 * "Buatkan saya", "terserah kamu", "AI saja": jawaban yang menyerahkan
 * keputusan, bukan keputusan itu sendiri. Dulu tersimpan apa adanya sebagai
 * rumusan masalah, lalu dibaca model di setiap giliran sebagai fakta - dan
 * model melaporkan bahwa rumusan masalahnya "masih bertuliskan Buatkan saya"
 * padahal naskahnya sudah lengkap.
 */
const DELEGATION =
	/^(tolong\s+|silakan\s+|coba\s+)?(buat(kan|in)?|isi(kan|in)?|tulis(kan|in)?|tentu(kan|in)|pilih(kan|in)?|kamu|anda|ai|terserah|bebas|serah(kan)?|you decide|up to you|dari (kamu|ai|anda))\b/i

export function isDelegation(value: string): boolean {
	const text = value.trim()
	if (!text || text.split(/\s+/).length > 6) return false
	return DELEGATION.test(text)
}
