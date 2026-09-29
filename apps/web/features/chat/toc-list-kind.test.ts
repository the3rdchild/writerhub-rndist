import { describe, expect, test } from 'bun:test'
import { EDITOR_TOOLS } from '@writer-hub/shared'
import { describeToolCall, tocListKind } from './tools'

describe('tocListKind - jenis daftar dari judul tempatnya', () => {
	/*
	 * Uji 29 Sep: "Daftar Tabel" dan "Daftar Gambar" disisipkan tanpa
	 * list_kind, jadi daftar isi - lalu ditolak sebagai daftar isi kedua.
	 */
	test('di bawah "Daftar Tabel" / "Daftar Gambar" tanpa list_kind', () => {
		expect(tocListKind({ after_heading: 'Daftar Tabel' })).toBe('tabel')
		expect(tocListKind({ after_heading: 'DAFTAR GAMBAR' })).toBe('gambar')
		expect(tocListKind({ after_heading: 'List of Figures' })).toBe('gambar')
		expect(tocListKind({ after_heading: 'Daftar Isi' })).toBe('isi')
	})

	test('judul tempatnya menang atas list_kind yang bertentangan', () => {
		expect(tocListKind({ after_heading: 'Daftar Tabel', list_kind: 'isi' })).toBe('tabel')
	})

	test('tanpa judul yang dikenali, list_kind yang dipakai; bawaannya daftar isi', () => {
		expect(tocListKind({ list_kind: 'gambar' })).toBe('gambar')
		expect(tocListKind({ after_heading: 'Lampiran', list_kind: 'tabel' })).toBe('tabel')
		expect(tocListKind({})).toBe('isi')
	})

	test('label kartu aksi mengikuti jenis yang disimpulkan', () => {
		const call = { id: 'c1', name: 'insert_toc', arguments: { after_heading: 'Daftar Tabel' } }
		expect(describeToolCall(call)).toBe('Insert list of tables')
	})

	test('deskripsi alat menyebut satu blok per jenis daftar', () => {
		const tool = EDITOR_TOOLS.find((item) => item.name === 'insert_toc')
		expect(tool?.description).toContain('Each is its own block')
	})
})
