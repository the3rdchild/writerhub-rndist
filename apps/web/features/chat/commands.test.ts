import { describe, expect, test } from 'bun:test'
import { ACTIVE_SKILLS } from '@writer-hub/shared'
import { applyCommand, commandToken, matchCommands } from './commands'

describe('token perintah', () => {
	test('dikenali saat ia satu-satunya isi kotak', () => {
		expect(commandToken('/ris')).toBe('ris')
		expect(commandToken('/')).toBe('')
	})

	test('tidak dikenali setelah ada spasi - itu sudah kalimat', () => {
		expect(commandToken('/riset kronologi demo')).toBeNull()
	})

	test('tidak dikenali di tengah kalimat', () => {
		expect(commandToken('tolong /riset')).toBeNull()
	})
})

describe('pencocokan perintah', () => {
	test('garis miring kosong menampilkan intent dan skill, tanpa alat mentah', () => {
		const found = matchCommands('/')
		expect(found.length).toBeGreaterThan(0)
		expect(found.every((command) => command.tier !== 'tool')).toBe(true)
	})

	test('skill ikut muncul sejak garis miring pertama', () => {
		const skills = matchCommands('/').filter((command) => command.tier === 'skill')
		expect(skills.length).toBe(ACTIVE_SKILLS.length)
		expect(skills.every((command) => command.instruction.startsWith('Baca skill '))).toBe(true)
	})

	test('skill dipanggil dengan namanya sendiri', () => {
		const found = matchCommands('/scientific')
		expect(found.some((command) => command.id === 'skill-scientific-writing')).toBe(true)
	})

	test('alat mentah baru muncul setelah tiga huruf', () => {
		expect(matchCommands('/in').some((command) => command.tier === 'tool')).toBe(false)
		expect(matchCommands('/ins').some((command) => command.tier === 'tool')).toBe(true)
	})

	test('alat baca tidak pernah muncul - model memanggilnya sendiri', () => {
		const names = matchCommands('/get').map((command) => command.id)
		expect(names).not.toContain('get_outline')
		expect(names).not.toContain('think')
	})

	test('riset web tidak muncul sebagai alat mentah, hanya sebagai intent', () => {
		const research = matchCommands('/ris')
		expect(research.map((command) => command.id)).toContain('riset')
		expect(matchCommands('/web').map((command) => command.id)).not.toContain('web_search')
	})

	test('teks bukan perintah tidak mencocokkan apa pun', () => {
		expect(matchCommands('halo')).toEqual([])
	})
})

describe('penerapan perintah', () => {
	test('intent mengganti token dengan kalimat siap lanjut', () => {
		const diagram = matchCommands('/diagram')[0]
		expect(applyCommand(diagram)).toContain('Mermaid')
	})

	test('riset mengosongkan kotak dan menyalakan mode riset', () => {
		const riset = matchCommands('/riset')[0]
		expect(riset.enablesResearch).toBe(true)
		expect(applyCommand(riset)).toBe('')
	})
})
