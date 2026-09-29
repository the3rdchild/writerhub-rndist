import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { caseById, USE_CASES } from './cases'
import { type CaseResult, caseResult, type DriverStats, readinessReport } from './check'
import { driveCases } from './drive'
import { docxFacts, pdfFacts } from './measure'

/**
 * Mengukur berkas hasil use case dan merangkumnya. Dijalankan dari apps/web:
 *
 *   bun run use-cases measure uc3 --docx uc3.docx --pdf uc3.pdf [--driver run.json] [--out uc3.json]
 *   bun run use-cases report hasil/ [--title "Flash, 21 Sep"]
 *   bun run use-cases cases
 *   bun run use-cases drive uc1 uc9 | --all  --out <folder> [--budget 2.5] [--model "DeepSeek V4 Flash"]
 *
 * `measure` mencetak (atau menulis) satu CaseResult sebagai JSON; `report`
 * membaca semua JSON itu dari satu folder dan mencetak tabel kriteria siap
 * produksi sebagai Markdown. PDF diukur dengan poppler - lihat `popplerDir`.
 *
 * `--driver` menerima angka dari penggerak UI: dorongan, panggilan, token, dan
 * biaya. Bentuk hasil alat uji lama (`drive-case.py`: `nudges`, `cost_usd`,
 * `tokens_in`, …) juga diterima, supaya putaran lama bisa diukur ulang.
 */

function option(args: string[], name: string): string | undefined {
	const at = args.indexOf(`--${name}`)
	return at === -1 ? undefined : args[at + 1]
}

function driverStats(path: string): DriverStats {
	const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
	const number = (...keys: string[]) => {
		const value = keys.map((key) => raw[key]).find((item) => typeof item === 'number')
		return typeof value === 'number' ? value : undefined
	}
	const text = (key: string) => (typeof raw[key] === 'string' ? (raw[key] as string) : undefined)
	return {
		status: text('status'),
		model: text('model')?.split('\n')[0],
		nudges: number('nudges'),
		calls: number('calls'),
		tokensIn: number('tokensIn', 'tokens_in'),
		tokensOut: number('tokensOut', 'tokens_out'),
		costUsd: number('costUsd', 'cost_usd'),
		minutes: number('minutes', 'menit'),
	}
}

function measure(args: string[]): void {
	const [id] = args
	const docx = option(args, 'docx')
	if (!id || !docx)
		throw new Error('Pakai: measure <case> --docx <berkas> [--pdf <berkas>] [--driver <json>] [--out <json>]')
	const pdf = option(args, 'pdf') ?? null
	const driver = option(args, 'driver')

	const facts = { docx: docxFacts(readFileSync(docx)), pdf: pdf ? pdfFacts(pdf) : null }
	const result = caseResult(caseById(id), facts, { pdf, docx }, driver ? driverStats(driver) : undefined)
	const json = JSON.stringify(result, null, 1)

	const out = option(args, 'out')
	if (out) writeFileSync(out, `${json}\n`)
	else console.log(json)

	const failed = result.checks.filter((check) => !check.ok)
	console.error(
		`${id}: ${result.passed ? 'LOLOS' : `${failed.length} syarat belum terpenuhi`}${failed.map((check) => `\n  - ${check.label}: ${check.detail}`).join('')}`,
	)
}

function report(args: string[]): void {
	const [target] = args
	if (!target) throw new Error('Pakai: report <folder berisi JSON hasil measure> [--title <judul>]')
	const files = statSync(target).isDirectory()
		? readdirSync(target)
				.filter((name) => name.endsWith('.json'))
				.sort()
				.map((name) => join(target, name))
		: [target]
	const results = files
		.map((file) => JSON.parse(readFileSync(file, 'utf8')) as CaseResult)
		.filter((result) => Array.isArray(result.checks))
	console.log(readinessReport(results, option(args, 'title')))
}

/**
 * Putaran lewat UI. Butuh Writer Hub yang berjalan (`docker compose up`), peramban
 * Chromium/Edge (`UJI_BROWSER`), poppler untuk PDF, dan provider di
 * `apps/api/.env` - dengan OpenRouter, saldonya dipakai sebagai rem biaya.
 */
async function drive(args: string[]): Promise<void> {
	const out = option(args, 'out')
	if (!out)
		throw new Error('Pakai: drive <case...> | --all --out <folder> [--budget <US$>] [--model <label>]')
	const valued = new Set(['--out', '--budget', '--model', '--base', '--max-nudges'])
	const ids = args.filter((arg, at) => !arg.startsWith('--') && !valued.has(args[at - 1] ?? ''))
	const cases = args.includes('--all') ? [...USE_CASES] : ids.map(caseById)
	if (cases.length === 0) throw new Error('Sebutkan case (uc1 uc2 ...) atau --all.')

	const model = option(args, 'model') ?? 'DeepSeek V4 Flash'
	const results = await driveCases(
		cases,
		{
			base: option(args, 'base') ?? 'http://localhost:8090',
			out,
			model,
			budgetUsd: Number(option(args, 'budget') ?? 2.5),
			browser: process.env.UJI_BROWSER ?? '/run/current-system/sw/bin/microsoft-edge',
			maxNudges: Number(option(args, 'max-nudges') ?? 8),
			priceIn: Number(process.env.UJI_PRICE_IN ?? 0.09),
			priceOut: Number(process.env.UJI_PRICE_OUT ?? 0.18),
			apiEnv: join(process.cwd(), '..', 'api', '.env'),
		},
		(line) => console.error(`[${new Date().toLocaleTimeString('id-ID')}] ${line}`),
	)
	const markdown = readinessReport(results, `Putaran ${model}`)
	writeFileSync(join(out, 'laporan.md'), `${markdown}\n`)
	console.log(markdown)
}

const [command, ...rest] = process.argv.slice(2)
try {
	if (command === 'measure') measure(rest)
	else if (command === 'report') report(rest)
	else if (command === 'drive') await drive(rest)
	else if (command === 'cases') {
		for (const item of USE_CASES)
			console.log(`${item.id.padEnd(5)} ${item.title.padEnd(48)} ${item.template ?? 'Dokumen kosong'}`)
	} else {
		throw new Error('Perintah: measure | report | cases | drive')
	}
} catch (error) {
	console.error(error instanceof Error ? error.message : error)
	process.exit(1)
}
