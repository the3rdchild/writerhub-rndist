import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { ACTIVE_SKILLS, skillFilePath } from '@writer-hub/shared'

const SKILLS_DIR = new URL('../../../../../packages/shared/skills/', import.meta.url)

/**
 * Katalog dan berkasnya gampang berpisah diam-diam: menambah entri di katalog
 * lebih mudah daripada menulis teksnya, dan model baru tahu berkasnya hilang
 * saat penulis sudah menunggu jawaban.
 */
describe('isi skill', () => {
	test('tiap skill aktif punya badan yang benar-benar ada', async () => {
		for (const skill of ACTIVE_SKILLS) {
			const path = skillFilePath(skill.name)
			expect(path).not.toBeNull()

			const text = await readFile(new URL(path as string, SKILLS_DIR), 'utf8')
			expect(text.length).toBeGreaterThan(200)
		}
	})

	test('tiap berkas dalam yang dijanjikan katalog juga ada', async () => {
		for (const skill of ACTIVE_SKILLS) {
			for (const file of skill.files) {
				const path = skillFilePath(skill.name, file.name)
				expect(path).not.toBeNull()

				const text = await readFile(new URL(path as string, SKILLS_DIR), 'utf8')
				expect(text.length).toBeGreaterThan(200)
			}
		}
	})

	test('badan skill tidak menyebut nama heading - itu milik template', async () => {
		// Aturan §6 di docs/AGENT-SKILLS-PLAN.md. Label Inggris yang bocor ke
		// sini muncul di dokumen berbahasa Indonesia sebagai heading asing.
		const terlarang = ['## Introduction', '## Methods', '## Results', '## Discussion', '## Conclusion']

		for (const skill of ACTIVE_SKILLS) {
			const text = await readFile(new URL(skillFilePath(skill.name) as string, SKILLS_DIR), 'utf8')
			for (const label of terlarang) expect(text).not.toContain(label)
		}
	})
})
