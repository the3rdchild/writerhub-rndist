import { describe, expect, test } from 'bun:test'
import {
	acceptProposal,
	applyAiBriefUpdate,
	type BriefEntry,
	briefField,
	briefFieldVisible,
	confirmEntry,
	EMPTY_BRIEF,
	evidenceFound,
	judgeBriefWrite,
	missingDecisions,
	normalizeBrief,
	type ResearchBrief,
	rejectProposal,
	setUserChapters,
	setUserEntry,
	textFingerprint,
} from './brief'

const field = (key: string) => {
	const found = briefField(key)
	if (!found) throw new Error(`tidak ada isian ${key}`)
	return found
}

const entry = (value: string, source: BriefEntry['source']): BriefEntry => ({ value, source, at: 1 })

const MANUSCRIPT = 'Penelitian ini menggunakan pendekatan kualitatif dengan wawancara mendalam.'

describe('kebijakan tulisan AI ke brief', () => {
	test('keputusan kosong tanpa bukti ditolak - AI harus bertanya, bukan menebak', () => {
		const verdict = judgeBriefWrite(field('pendekatan'), undefined, 'Kuantitatif', false)
		expect(verdict.verdict).toBe('reject')
		if (verdict.verdict === 'reject') expect(verdict.reason).toContain('ask_user')
	})

	test('keputusan kosong dengan bukti langsung diisi', () => {
		expect(judgeBriefWrite(field('pendekatan'), undefined, 'Kualitatif', true).verdict).toBe('apply')
	})

	test('turunan kosong boleh diisi tanpa bukti', () => {
		expect(judgeBriefWrite(field('kataKunci'), undefined, 'literasi, minat baca', false).verdict).toBe(
			'apply',
		)
	})

	test('isian yang sudah terisi menjadi usulan, siapa pun pengisinya', () => {
		for (const source of ['user', 'ai', 'template'] as const) {
			const verdict = judgeBriefWrite(field('pendekatan'), entry('Kualitatif', source), 'Campuran', true)
			expect(verdict.verdict).toBe('propose')
		}
	})

	test('turunan hasil AI boleh diperbarui AI; turunan milik penulis tidak', () => {
		expect(judgeBriefWrite(field('kataKunci'), entry('a, b', 'ai'), 'a, b, c', false).verdict).toBe('apply')
		expect(judgeBriefWrite(field('kataKunci'), entry('a, b', 'user'), 'a, b, c', false).verdict).toBe(
			'propose',
		)
	})

	test('catatan penulis tidak pernah ditulis AI', () => {
		expect(judgeBriefWrite(field('catatan'), undefined, 'apa saja', true).verdict).toBe('reject')
	})

	test('nilai sama dilewati, nilai kosong ditolak', () => {
		expect(judgeBriefWrite(field('judul'), entry('X', 'user'), 'X', true).verdict).toBe('skip')
		expect(judgeBriefWrite(field('judul'), undefined, '   ', true).verdict).toBe('reject')
	})
})

describe('bukti', () => {
	test('kutipan naskah ditemukan meski huruf besar dan spasinya berbeda', () => {
		expect(evidenceFound('Pendekatan   KUALITATIF', [MANUSCRIPT])).toBe(true)
	})

	test('tanda kutip dan elipsis di ujung kutipan tidak menggagalkan', () => {
		expect(evidenceFound('“…pendekatan kualitatif dengan wawancara…”', [MANUSCRIPT])).toBe(true)
	})

	/* Bentuk-bentuk ini persis yang ditulis DeepSeek V4 Flash dalam uji 26 Sep -
	 * semuanya kutipan asli yang dulu ditolak karena pembungkusnya. */
	test('kutipan yang dibungkus keterangan tetap dikenali', () => {
		const said = ['Buatkan latar belakang untuk skripsi saya tentang literasi digital.']
		const answered = ['The writer answered:\n2. Pendekatan penelitian apa? → Kuantitatif']
		expect(evidenceFound("User said: 'skripsi saya'", said)).toBe(true)
		expect(evidenceFound('"skripsi saya" (pesan pengguna)', said)).toBe(true)
		expect(evidenceFound('"Kuantitatif" (pilihan dari ask_user)', answered)).toBe(true)
		expect(
			evidenceFound("Writer answered 'Kuantitatif' when asked 'Pendekatan penelitian apa?'", answered),
		).toBe(true)
	})

	test('bukti berbentuk label lalu nilai dicocokkan per bagian', () => {
		const answered = ['Pendidikan Sejarah', '1 orang guru']
		expect(evidenceFound('Bidang → Pendidikan Sejarah', answered)).toBe(true)
		expect(evidenceFound('Informan: 1 orang guru', answered)).toBe(true)
		expect(evidenceFound('Bidang → Ilmu Komunikasi', answered)).toBe(false)
	})

	test('pembungkus tidak meloloskan kutipan karangan atau yang terlalu pendek', () => {
		const said = ['Buatkan latar belakang untuk skripsi saya.']
		expect(evidenceFound("User said: 'penelitian kuantitatif'", said)).toBe(false)
		expect(evidenceFound("Implied by 'ya'", said)).toBe(false)
		expect(evidenceFound('Pengaruh X terhadap Y menyiratkan pendekatan kuantitatif', said)).toBe(false)
	})

	test('bukti karangan tidak ditemukan', () => {
		expect(evidenceFound('pendekatan kuantitatif', [MANUSCRIPT])).toBe(false)
		expect(evidenceFound('', [MANUSCRIPT])).toBe(false)
		expect(evidenceFound(undefined, [MANUSCRIPT])).toBe(false)
	})
})

describe('applyAiBriefUpdate', () => {
	const context = { now: 5, evidenceSources: [MANUSCRIPT, 'Saya pakai teori TAM'] }

	test('laporan memisahkan yang disimpan, diusulkan, dan ditolak', () => {
		const start: ResearchBrief = {
			...EMPTY_BRIEF,
			entries: { judul: entry('Judul lama', 'user') },
		}
		const { brief, report } = applyAiBriefUpdate(
			start,
			{
				fields: [
					{ key: 'pendekatan', value: 'Kualitatif', evidence: 'pendekatan kualitatif' },
					{ key: 'teori', value: 'TAM', evidence: 'teori TAM' },
					{ key: 'variabel', value: 'X dan Y' },
					{ key: 'judul', value: 'Judul baru' },
					{ key: 'bukanIsian', value: 'x' },
				],
			},
			context,
		)

		expect(report.applied).toEqual(['pendekatan', 'teori'])
		expect(report.proposed).toEqual(['judul'])
		expect(report.rejected.map((item) => item.target)).toEqual(['variabel', 'bukanIsian'])
		expect(brief.entries.pendekatan).toEqual({
			value: 'Kualitatif',
			source: 'ai',
			evidence: 'pendekatan kualitatif',
			at: 5,
		})
		expect(brief.entries.judul?.value).toBe('Judul lama')
		expect(brief.proposals).toEqual([{ id: 'field:judul', key: 'judul', value: 'Judul baru', at: 5 }])
	})

	test('nilai pilihan dicatat dengan ejaan panel', () => {
		const { brief } = applyAiBriefUpdate(
			EMPTY_BRIEF,
			{ fields: [{ key: 'pendekatan', value: 'kualitatif', evidence: 'pendekatan kualitatif' }] },
			context,
		)
		expect(brief.entries.pendekatan?.value).toBe('Kualitatif')
	})

	test('usulan baru untuk isian yang sama menggantikan yang lama', () => {
		const start: ResearchBrief = { ...EMPTY_BRIEF, entries: { judul: entry('A', 'user') } }
		const once = applyAiBriefUpdate(start, { fields: [{ key: 'judul', value: 'B' }] }, context).brief
		const twice = applyAiBriefUpdate(once, { fields: [{ key: 'judul', value: 'C' }] }, context).brief
		expect(twice.proposals.map((proposal) => proposal.value)).toEqual(['C'])
	})

	test('bab baru ditambahkan dengan sidik jari isinya', () => {
		const { brief, report } = applyAiBriefUpdate(
			EMPTY_BRIEF,
			{ chapters: [{ title: 'BAB I Pendahuluan', summary: 'Latar belakang.' }] },
			{ ...context, fingerprintOf: () => 'abc' },
		)
		expect(report.applied).toEqual(['chapter "BAB I Pendahuluan"'])
		expect(brief.chapters[0]).toMatchObject({ status: 'draf', source: 'ai', fingerprint: 'abc' })
	})

	test('ringkasan bab milik penulis menjadi usulan; statusnya tetap boleh diubah', () => {
		const start: ResearchBrief = {
			...EMPTY_BRIEF,
			chapters: [{ title: 'BAB I', summary: 'Tulisan saya.', status: 'draf', source: 'user', at: 1 }],
		}
		const proposed = applyAiBriefUpdate(
			start,
			{ chapters: [{ title: 'bab i', summary: 'Versi AI.' }] },
			context,
		)
		expect(proposed.report.proposed).toEqual(['chapter "bab i"'])
		expect(proposed.brief.chapters[0].summary).toBe('Tulisan saya.')

		const status = applyAiBriefUpdate(
			start,
			{ chapters: [{ title: 'BAB I', summary: 'Tulisan saya.', status: 'selesai' }] },
			context,
		)
		expect(status.report.applied).toHaveLength(1)
		expect(status.brief.chapters[0]).toMatchObject({ status: 'selesai', source: 'user' })
	})

	test('bab tambahan penulis yang ringkasannya masih kosong boleh diisi AI', () => {
		const start: ResearchBrief = {
			...EMPTY_BRIEF,
			chapters: [{ title: 'BAB II', summary: '', status: 'belum', source: 'user', at: 1 }],
		}
		const { brief } = applyAiBriefUpdate(
			start,
			{ chapters: [{ title: 'BAB II', summary: 'Teori.' }] },
			context,
		)
		expect(brief.chapters[0]).toMatchObject({ summary: 'Teori.', source: 'ai' })
	})
})

describe('keputusan penulis', () => {
	const withProposal: ResearchBrief = {
		...EMPTY_BRIEF,
		entries: { pendekatan: entry('Kuantitatif', 'ai') },
		proposals: [{ id: 'field:pendekatan', key: 'pendekatan', value: 'Kualitatif', at: 2 }],
	}

	test('menyetujui usulan menjadikannya milik penulis', () => {
		const next = acceptProposal(withProposal, 'field:pendekatan', 9)
		expect(next.entries.pendekatan).toEqual({ value: 'Kualitatif', source: 'user', at: 9 })
		expect(next.proposals).toHaveLength(0)
	})

	test('menolak usulan membiarkan isiannya', () => {
		const next = rejectProposal(withProposal, 'field:pendekatan')
		expect(next.entries.pendekatan?.value).toBe('Kuantitatif')
		expect(next.proposals).toHaveLength(0)
	})

	test('suntingan penulis menggugurkan usulan untuk isian yang sama', () => {
		const next = setUserEntry(withProposal, 'pendekatan', 'Campuran', 3)
		expect(next.entries.pendekatan).toEqual({ value: 'Campuran', source: 'user', at: 3 })
		expect(next.proposals).toHaveLength(0)
	})

	test('mengosongkan isian menghapusnya', () => {
		expect(setUserEntry(withProposal, 'pendekatan', '  ', 3).entries.pendekatan).toBeUndefined()
	})

	test('mengunci isian AI mengubah sumbernya, bukan nilainya', () => {
		expect(confirmEntry(withProposal, 'pendekatan', 4).entries.pendekatan).toEqual({
			value: 'Kuantitatif',
			source: 'user',
			at: 4,
		})
	})

	test('menghapus bab ikut membuang usulan untuknya', () => {
		const start: ResearchBrief = {
			...EMPTY_BRIEF,
			chapters: [{ title: 'BAB I', summary: 'a', status: 'draf', source: 'user', at: 1 }],
			proposals: [{ id: 'chapter:bab i', chapter: 'BAB I', value: 'b', at: 2 }],
		}
		expect(setUserChapters(start, []).proposals).toHaveLength(0)
	})
})

describe('isian bersyarat dan keputusan yang belum ada', () => {
	test('variabel hanya relevan untuk pendekatan kuantitatif atau campuran', () => {
		const quantitative: ResearchBrief = {
			...EMPTY_BRIEF,
			entries: { pendekatan: entry('Kuantitatif', 'user') },
		}
		const qualitative: ResearchBrief = {
			...EMPTY_BRIEF,
			entries: { pendekatan: entry('kualitatif', 'user') },
		}
		expect(briefFieldVisible(field('variabel'), quantitative)).toBe(true)
		expect(briefFieldVisible(field('variabel'), qualitative)).toBe(false)
		expect(briefFieldVisible(field('fokus'), qualitative)).toBe(true)
	})

	test('isian bersyarat yang sudah bernilai tetap tampil', () => {
		const brief: ResearchBrief = {
			...EMPTY_BRIEF,
			entries: { pendekatan: entry('Kualitatif', 'user'), variabel: entry('X', 'user') },
		}
		expect(briefFieldVisible(field('variabel'), brief)).toBe(true)
	})

	test('keputusan yang belum diisi tidak memuat catatan, turunan, atau isian format', () => {
		const keys = missingDecisions(EMPTY_BRIEF).map((item) => item.key)
		expect(keys).toContain('pendekatan')
		expect(keys).not.toContain('catatan')
		expect(keys).not.toContain('kataKunci')
		expect(keys).not.toContain('sitasi')
		expect(keys).not.toContain('variabel')
	})
})

describe('normalizeBrief', () => {
	test('bentuk asing dibuang, bukan dilempar', () => {
		expect(normalizeBrief(null)).toEqual(EMPTY_BRIEF)
		expect(normalizeBrief('rusak')).toEqual(EMPTY_BRIEF)
		const brief = normalizeBrief({
			entries: { judul: { value: 'A', source: 'hacker' }, bukanIsian: { value: 'x' }, teori: { value: '' } },
			chapters: [{ title: '' }, { title: 'BAB I', status: 'aneh' }],
			proposals: [{ key: 'judul', value: 'B' }, { value: 'tanpa sasaran' }],
		})
		expect(brief.entries).toEqual({ judul: { value: 'A', source: 'user', at: 0 } })
		expect(brief.chapters).toEqual([{ title: 'BAB I', summary: '', status: 'draf', source: 'user', at: 0 }])
		expect(brief.proposals).toEqual([{ id: 'field:judul', key: 'judul', value: 'B', at: 0 }])
	})

	test('nilai dipangkas ke batasnya', () => {
		const brief = normalizeBrief({ entries: { judul: { value: 'x'.repeat(5_000) } } })
		expect(brief.entries.judul?.value.length).toBe(2_000)
	})
})

test('sidik jari tidak peduli spasi, tapi peduli isi', () => {
	expect(textFingerprint('a  b\nc')).toBe(textFingerprint('a b c'))
	expect(textFingerprint('a b c')).not.toBe(textFingerprint('a b d'))
})
