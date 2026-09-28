import { describe, expect, test } from 'bun:test'
import type { ToolCall } from '@writer-hub/shared'
import { findInOtherTabs, splitAtSwitchTab, SWITCH_TAB_DEFERRED } from './tools'

describe('findInOtherTabs (UC7)', () => {
	test('menemukan teks di tab lain yang bukan tab aktif', () => {
		const ctx = {
			tabs: [
				{ id: 'a', label: 'Bab 1', active: true },
				{ id: 'b', label: 'Bab 2', active: false },
			],
			readTab: (id: string) => (id === 'b' ? 'Bagian Metode di sini' : null),
		}
		const found = findInOtherTabs(ctx, 'Metode')
		expect(found).toEqual({ id: 'b', label: 'Bab 2' })
	})

	test('tidak memakai tab aktif', () => {
		const ctx = {
			tabs: [
				{ id: 'a', label: 'Bab 1', active: true },
				{ id: 'b', label: 'Bab 2', active: false },
			],
			readTab: (id: string) => (id === 'a' ? 'Metode ada' : null),
		}
		// Tab aktif memang mengandung teks, tapi findInOtherDirs hanya mencari
		// tab lain - tab aktif bukan urusannya.
		expect(findInOtherTabs(ctx, 'Metode')).toBeNull()
	})

	test('case-insensitive', () => {
		const ctx = {
			tabs: [
				{ id: 'a', label: 'Bab 1', active: true },
				{ id: 'b', label: 'Bab 2', active: false },
			],
			readTab: (id: string) => (id === 'b' ? 'Kata KUNCI besar' : null),
		}
		expect(findInOtherTabs(ctx, 'kunci')).toEqual({ id: 'b', label: 'Bab 2' })
	})

	test('null bila tidak ada tab lain', () => {
		const ctx = {
			tabs: [{ id: 'a', label: 'Bab 1', active: true }],
			readTab: () => 'teks',
		}
		expect(findInOtherTabs(ctx, 'teks')).toBeNull()
	})

	test('null bila teks tidak ada di tab manapun', () => {
		const ctx = {
			tabs: [
				{ id: 'a', label: 'Bab 1', active: true },
				{ id: 'b', label: 'Bab 2', active: false },
			],
			readTab: (id: string) => (id === 'b' ? 'tidak ada' : null),
		}
		expect(findInOtherTabs(ctx, 'Metode')).toBeNull()
	})

	test('mengembalikan tab pertama yang cocok', () => {
		const ctx = {
			tabs: [
				{ id: 'a', label: 'Bab 1', active: true },
				{ id: 'b', label: 'Bab 2', active: false },
				{ id: 'c', label: 'Bab 3', active: false },
			],
			readTab: (id: string) => (id === 'c' ? 'ada Metode' : id === 'b' ? 'ada Metode juga' : null),
		}
		expect(findInOtherTabs(ctx, 'Metode')).toEqual({ id: 'b', label: 'Bab 2' })
	})
})

const call = (name: string, id: string): ToolCall => ({ id, name, arguments: {} })

describe('splitAtSwitchTab (UC7)', () => {
	test('tanpa switch_tab: semua di before, switchCall null, after kosong', () => {
		const calls = [call('write_section', '1'), call('replace_text', '2')]
		const { before, switchCall, after } = splitAtSwitchTab(calls)
		expect(before).toEqual(calls)
		expect(switchCall).toBeNull()
		expect(after).toEqual([])
	})

	test('switch_tab di tengah: before dan after terpisah', () => {
		const calls = [call('write_section', '1'), call('switch_tab', '2'), call('write_section', '3')]
		const { before, switchCall, after } = splitAtSwitchTab(calls)
		expect(before).toEqual([call('write_section', '1')])
		expect(switchCall).toEqual(call('switch_tab', '2'))
		expect(after).toEqual([call('write_section', '3')])
	})

	test('switch_tab di awal: before kosong', () => {
		const calls = [call('switch_tab', '1'), call('write_section', '2')]
		const { before, switchCall, after } = splitAtSwitchTab(calls)
		expect(before).toEqual([])
		expect(switchCall).toEqual(call('switch_tab', '1'))
		expect(after).toEqual([call('write_section', '2')])
	})

	test('switch_tab di akhir: after kosong', () => {
		const calls = [call('write_section', '1'), call('switch_tab', '2')]
		const { before, switchCall, after } = splitAtSwitchTab(calls)
		expect(before).toEqual([call('write_section', '1')])
		expect(switchCall).toEqual(call('switch_tab', '2'))
		expect(after).toEqual([])
	})

	test('hanya switch_tab: before dan after kosong', () => {
		const calls = [call('switch_tab', '1')]
		const { before, switchCall, after } = splitAtSwitchTab(calls)
		expect(before).toEqual([])
		expect(switchCall).toEqual(call('switch_tab', '1'))
		expect(after).toEqual([])
	})

	test('daftar kosong: semua kosong', () => {
		const { before, switchCall, after } = splitAtSwitchTab([])
		expect(before).toEqual([])
		expect(switchCall).toBeNull()
		expect(after).toEqual([])
	})

	test('SWITCH_TAB_DEFERRED adalah pesan yang menjelaskan penundaan', () => {
		expect(SWITCH_TAB_DEFERRED).toContain('Not run')
		expect(SWITCH_TAB_DEFERRED).toContain('tab switch')
	})
})