import { describe, expect, test } from 'bun:test'
import { EMPTY_BRIEF, type ResearchBrief, type TemplateMetadataField } from '@writer-hub/shared'
import {
	ASK_AND_BRIEF_GUIDANCE,
	buildSystemPrompt,
	documentBriefPrompt,
	researchBriefPrompt,
} from './prompts'

const at = 1

const skripsi: ResearchBrief = {
	entries: {
		jenisKarya: { value: 'Skripsi', source: 'template', at },
		pendekatan: { value: 'Kualitatif', source: 'ai', evidence: 'pendekatan kualitatif', at },
		judul: { value: 'Literasi   digital\nmahasiswa', source: 'user', at },
		catatan: { value: 'Dosen minta kutipan terbaru', source: 'user', at },
		sitasi: { value: 'APA 7', source: 'template', at },
		marginKiri: { value: '4', source: 'template', at },
		marginAtas: { value: '3', source: 'template', at },
	},
	chapters: [{ title: 'BAB I Pendahuluan', summary: 'Latar belakang.', status: 'draf', source: 'ai', at }],
	proposals: [{ id: 'field:pendekatan', key: 'pendekatan', value: 'Campuran', at }],
}

describe('brief penelitian di prompt', () => {
	test('brief kosong hanya memberi tahu cara mengisinya, tanpa daftar keputusan', () => {
		const prompt = researchBriefPrompt(EMPTY_BRIEF)
		expect(prompt).toContain('no research brief yet')
		expect(prompt).toContain('ignore the brief')
		expect(prompt).not.toContain('Not decided yet')
		expect(researchBriefPrompt(undefined)).toBe(prompt)
	})

	test('isian dinyatakan sebagai fakta, dengan asalnya', () => {
		const prompt = researchBriefPrompt(skripsi)
		expect(prompt).toContain('FACT')
		expect(prompt).toContain('- Title: Literasi digital mahasiswa')
		expect(prompt).toContain(
			'- Research approach: Kualitatif (recorded by AI, not yet confirmed by the writer)',
		)
		expect(prompt).toContain('- Type of work: Skripsi (from the template)')
	})

	test('catatan penulis dibaca sebagai catatan, bukan sebagai baris fakta', () => {
		const prompt = researchBriefPrompt(skripsi)
		expect(prompt).toContain(
			"The writer's own notes for you about this research: Dosen minta kutipan terbaru",
		)
		expect(prompt).not.toContain("- Writer's notes")
	})

	test('keputusan yang belum ada disebut supaya ditanyakan, bukan ditebak', () => {
		const prompt = researchBriefPrompt(skripsi)
		expect(prompt).toContain('Not decided yet')
		expect(prompt).toContain('Research questions')
		// Pendekatannya kualitatif: variabel bukan urusannya, fokus iya.
		expect(prompt).not.toContain('Variables')
		expect(prompt).toContain('Research focus')
	})

	test('aturan format saja tidak memicu daftar keputusan penelitian', () => {
		const prompt = researchBriefPrompt({
			...EMPTY_BRIEF,
			entries: { sitasi: { value: 'APA 7', source: 'user', at } },
		})
		expect(prompt).toContain('- Citation style: APA 7')
		expect(prompt).not.toContain('Not decided yet')
	})

	test('usulan yang menunggu disebut supaya tidak diusulkan lagi', () => {
		expect(researchBriefPrompt(skripsi)).toContain(
			"Awaiting the writer's approval - do not propose these again: Research approach → Campuran.",
		)
	})

	test('aturan format kampus menang atas aturan template, margin dalam satu baris', () => {
		const prompt = researchBriefPrompt(skripsi)
		expect(prompt).toContain('these win')
		expect(prompt).toContain('- Margins (cm): left 4, top 3, right ?, bottom ?')
		expect(prompt).toContain('- Citation style: APA 7')
	})

	test('rencana bab membawa statusnya', () => {
		expect(researchBriefPrompt(skripsi)).toContain('- BAB I Pendahuluan [draf]: Latar belakang.')
	})
})

describe('metadata template', () => {
	const fields: TemplateMetadataField[] = [
		{ key: 'judul', label: 'Judul skripsi', placeholder: 'Judul Skripsi', briefKey: 'judul' },
		{ key: 'nama', label: 'Nama mahasiswa', placeholder: 'Nama Mahasiswa', personal: true },
		{ key: 'nim', label: 'NIM', placeholder: '123', personal: true },
		{ key: 'prodi', label: 'Program studi', placeholder: 'Program Studi' },
	]
	const metadata = { judul: 'Literasi', nama: 'Budi', nim: '2201', prodi: 'Pendidikan' }

	test('nama dan NIM tidak pernah sampai ke provider', () => {
		const prompt = documentBriefPrompt(fields, metadata)
		expect(prompt).not.toContain('Budi')
		expect(prompt).not.toContain('2201')
		expect(prompt).toContain('- Program studi: Pendidikan')
	})

	test('isian yang diwakili brief tidak dikirim dua kali', () => {
		expect(documentBriefPrompt(fields, metadata)).toContain('- Judul skripsi: Literasi')
		expect(documentBriefPrompt(fields, metadata, { briefCovers: true })).not.toContain('Judul skripsi')
	})
})

test('panduan bertanya hanya ikut saat alat aktif', () => {
	const base = { research: false, memory: null } as const
	expect(buildSystemPrompt({ ...base, withTools: true })).toContain(ASK_AND_BRIEF_GUIDANCE)
	expect(buildSystemPrompt({ ...base, withTools: false })).not.toContain(ASK_AND_BRIEF_GUIDANCE)
})

describe('kebijakan bertanya tingkat sedang', () => {
	test('keputusan inti disebut untuk setiap jenis dokumen, bukan hanya karya akademik', () => {
		for (const kind of ['academic work', 'letters', 'a CV', 'reports', 'flyers', 'anything else']) {
			expect(ASK_AND_BRIEF_GUIDANCE).toContain(kind)
		}
	})

	test('fakta milik penulis ditanyakan, tidak dikarang', () => {
		expect(ASK_AND_BRIEF_GUIDANCE).toContain('Facts only the writer knows')
		expect(ASK_AND_BRIEF_GUIDANCE).toContain('are never invented')
	})

	test('permintaan yang sudah lengkap tidak ditanya; data baru boleh ditanya lagi', () => {
		expect(ASK_AND_BRIEF_GUIDANCE).toContain('gets no question: start working')
		expect(ASK_AND_BRIEF_GUIDANCE).toContain('ask again only at a new decision point')
		expect(ASK_AND_BRIEF_GUIDANCE).toContain('changes or contradicts an earlier')
	})
})

test('isian berisi "Buatkan saya" bukan fakta, melainkan diserahkan ke AI', () => {
	const prompt = researchBriefPrompt({
		...EMPTY_BRIEF,
		entries: {
			judul: { value: 'Pemetaan Lahan Sawit dengan Drone', source: 'user', at },
			rumusanMasalah: { value: 'Buatkan saya', source: 'user', at },
		},
	})
	expect(prompt).not.toContain('Research questions: Buatkan saya')
	expect(prompt).toContain('The writer left these for you to decide: Research questions.')
})

test('rencana bab tidak mengalahkan naskah', () => {
	expect(researchBriefPrompt(skripsi)).toContain('the document is the authority on what is')
})
