#!/usr/bin/env bun
/**
 * Menyegarkan cuplikan skill upstream di `vendor/scientific-agent-skills/`.
 *
 * Bukan `git subtree`: subtree menarik seluruh repo (30 MB, 163 skill) dan
 * tidak bisa sparse, padahal yang kita rujuk cuma lima direktori. Yang dipakai
 * di sini clone sparse + blobless ke direktori sementara, lalu menyalin berkas
 * yang dikurasi saja.
 *
 * Karena hasilnya berupa berkas biasa yang ikut di-commit, `git diff vendor/`
 * setelah menjalankan ini *adalah* diff terhadap upstream - tidak perlu
 * mesin pembanding sendiri.
 *
 *   bun run skills:sync            segarkan ke tag yang dipatok
 *   bun run skills:sync --latest   segarkan ke tag terbaru upstream
 *   bun run skills:sync --check    laporkan pergerakan upstream, jangan menulis
 */

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
	cpSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'

const REPO = 'https://github.com/K-Dense-AI/scientific-agent-skills.git'

/** Tag yang dipatok. Dinaikkan secara sadar, tidak pernah otomatis. */
const PINNED_TAG = 'v2.66.0'

/**
 * Skill yang dikurasi. Sengaja terpisah dari manifest runtime
 * (`packages/shared/src/skills.ts`): daftar ini mencakup skill yang overlaynya
 * belum ditulis, karena teks upstreamnya tetap perlu dirujuk saat menulisnya.
 */
const CURATED = [
	'scientific-writing',
	'peer-review',
	'venue-templates',
	'research-grants',
	'scientific-brainstorming',
] as const

/** Berkas selain skill yang tetap ikut - lisensi wajib, sisanya tidak. */
const EXTRA_FILES = ['LICENSE.md'] as const

const ROOT = join(import.meta.dir, '..')
const VENDOR = join(ROOT, 'vendor/scientific-agent-skills')
const LOCKFILE = join(VENDOR, '.upstream.json')

interface Lockfile {
	repo: string
	tag: string
	syncedAt: string
	/** Jalur relatif upstream → sha256 isinya. */
	files: Record<string, string>
}

function git(args: string[], cwd?: string): string {
	return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

function sha256(path: string): string {
	return createHash('sha256').update(readFileSync(path)).digest('hex')
}

/** Tag rilis terbaru upstream, menurut urutan versi. */
function latestTag(): string {
	const lines = git(['ls-remote', '--tags', '--refs', '--sort=-v:refname', REPO]).trim().split('\n')
	const tag = lines[0]?.split('refs/tags/')[1]
	if (!tag) throw new Error('Tidak bisa membaca daftar tag upstream.')
	return tag
}

/**
 * Mengambil direktori yang dikurasi ke direktori sementara. Blobless + sparse:
 * yang diunduh hanya pohon yang diminta, bukan 30 MB penuh.
 */
function fetchUpstream(tag: string): string {
	const dir = mkdtempSync(join(tmpdir(), 'skills-sync-'))
	git(['clone', '--depth', '1', '--branch', tag, '--filter=blob:none', '--sparse', REPO, dir])
	git(['sparse-checkout', 'set', ...CURATED.map((name) => `skills/${name}`)], dir)
	return dir
}

/** Hanya Markdown yang disalin: skrip Python upstream tidak bisa kita jalankan. */
function markdownFilesIn(dir: string, base: string): string[] {
	const found: string[] = []
	for (const entry of readdirSync(dir)) {
		const path = join(dir, entry)
		if (statSync(path).isDirectory()) found.push(...markdownFilesIn(path, base))
		else if (entry.endsWith('.md')) found.push(relative(base, path))
	}
	return found
}

function collect(source: string): string[] {
	const files = CURATED.flatMap((name) => markdownFilesIn(join(source, 'skills', name), source))
	return [...files, ...EXTRA_FILES].sort()
}

function readLockfile(): Lockfile | null {
	try {
		return JSON.parse(readFileSync(LOCKFILE, 'utf8'))
	} catch {
		return null
	}
}

function write(source: string, tag: string, files: string[]): void {
	rmSync(VENDOR, { recursive: true, force: true })
	const hashes: Record<string, string> = {}
	for (const file of files) {
		const target = join(VENDOR, file)
		mkdirSync(dirname(target), { recursive: true })
		cpSync(join(source, file), target)
		hashes[file] = sha256(target)
	}
	const lock: Lockfile = { repo: REPO, tag, syncedAt: new Date().toISOString(), files: hashes }
	writeFileSync(LOCKFILE, `${JSON.stringify(lock, null, '\t')}\n`)
	console.log(`Tersinkron ke ${tag} - ${files.length} berkas di vendor/scientific-agent-skills/`)
	console.log('Periksa `git diff vendor/` untuk melihat apa yang bergerak di upstream.')
}

/**
 * Membandingkan tanpa menulis. Sengaja tidak auto-merge: overlay kita memang
 * menyimpang jauh dari upstream (lihat docs/AGENT-SKILLS-PLAN.md §6), jadi
 * penggabungan otomatis hanya akan merusak.
 */
function check(source: string, tag: string, files: string[]): number {
	const lock = readLockfile()
	if (!lock) {
		console.error('Lockfile belum ada. Jalankan `bun run skills:sync` dulu.')
		return 1
	}

	const current = new Map(files.map((file) => [file, sha256(join(source, file))]))
	const added = files.filter((file) => !(file in lock.files))
	const removed = Object.keys(lock.files).filter((file) => !current.has(file))
	const changed = files.filter((file) => file in lock.files && current.get(file) !== lock.files[file])

	if (tag === lock.tag && !added.length && !removed.length && !changed.length) {
		console.log(`Tidak ada pergerakan upstream (${lock.tag}).`)
		return 0
	}

	console.log(`Upstream bergerak: ${lock.tag} → ${tag}`)
	for (const file of changed) console.log(`  berubah  ${file}`)
	for (const file of added) console.log(`  baru     ${file}`)
	for (const file of removed) console.log(`  hilang   ${file}`)
	console.log('\nJalankan `bun run skills:sync --latest`, lalu tinjau apakah overlay perlu ikut disesuaikan.')
	return 1
}

const args = new Set(process.argv.slice(2))
const tag = args.has('--latest') || args.has('--check') ? latestTag() : PINNED_TAG
const source = fetchUpstream(tag)

try {
	const files = collect(source)
	if (args.has('--check')) {
		process.exitCode = check(source, tag, files)
	} else {
		write(source, tag, files)
	}
} finally {
	rmSync(source, { recursive: true, force: true })
}
