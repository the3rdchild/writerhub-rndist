import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { type Browser, chromium, type Page } from 'playwright'
import type { UseCase } from './cases'
import { type CaseResult, caseResult, type DriverStats } from './check'
import { docxFacts, pdfFacts } from './measure'

/**
 * Menjalankan use case lewat UI Writer Hub seperti penulis: pilih template,
 * minta outline, setujui, biarkan AI menulis, dorong bila berhenti, lalu
 * ekspor lewat menu File dan ukur berkasnya.
 *
 * Dipindahkan dari alat uji putaran 17-23 Sep (`harness/server.cjs`,
 * `drive-case.py`). Kalimat persetujuan outline sama persis, supaya hasilnya
 * sebanding dengan putaran itu. Bedanya:
 *
 * - Selesai-tidaknya dibaca dari aplikasi, bukan dengan meminta AI menjawab
 *   "SELESAI": AI dianggap berhenti di tengah bila kartu macet atau tombol
 *   "Lanjutkan" masih tampil. Dorongan penguji hanya "lanjutkan" - yang
 *   diketik penulis sungguhan - dan itulah yang dihitung sebagai dorongan
 *   manual. Lanjutan otomatis aplikasi dihitung terpisah.
 * - Aksi AI diterapkan lewat Auto-apply, setara penulis yang menyetujui semua.
 *   Penggerak tidak pernah menekan "Apply all" sendiri: aksi menggambar masih
 *   berjalan saat kartunya tampil tertunda, dan klik tambahan dulu memulai
 *   penerapan kedua (uji-asap 27 Sep: 174 permintaan gambar untuk 2 diagram).
 * - Kartu pertanyaan dijawab dalam "mode isi otomatis": pilihan yang
 *   menyerahkan keputusan ke AI (rekomendasi, contoh, terserah) didahulukan,
 *   selain itu pilihan pertama. Sejak 29 Sep AI bertanya lebih sering (tingkat
 *   sedang), dan pilihan pertama bisa berarti "pakai placeholder" - naskah uji
 *   lalu berisi kurung siku, bukan isi. Permintaan metadata dilewati - prompt
 *   uji sudah memuat semua yang dibutuhkan.
 * - Rem biaya membaca saldo OpenRouter sendiri, di proses yang sama.
 */

export interface DriveOptions {
	/** Alamat web, mis. http://localhost:8090. */
	base: string
	/** Folder hasil: satu subfolder per case, dan `<id>.json` untuk `report`. */
	out: string
	/** Label model di pemilih model. */
	model: string
	/** Batas biaya seluruh putaran, US$. */
	budgetUsd: number
	/** Executable peramban Chromium/Edge. */
	browser: string
	maxNudges: number
	/** Tarif per sejuta token, untuk perkiraan bila saldo provider tidak terbaca. */
	priceIn: number
	priceOut: number
	/** `apps/api/.env` - tempat kunci OpenRouter untuk membaca saldo. */
	apiEnv: string
}

const APPROVE = (extra: string) =>
	`Outline disetujui. Silakan tulis isinya ke dokumen sesuai urutan outline. Tulis per bagian: satu bagian per langkah, jangan sekaligus satu dokumen. ${extra} Panjang total tetap sesuai permintaan awal.`
const NUDGE = 'lanjutkan'

const OUTLINE_TIMEOUT_MS = 15 * 60_000
const WRITE_TIMEOUT_MS = 60 * 60_000
/** Panel harus diam selama ini sebelum dianggap berhenti: lanjutan otomatis dan Auto-apply butuh jeda. */
const SETTLE_MS = 30_000
const SPEND_CHECK_MS = 60_000
/** Aksi tertunda tanpa apa pun yang berjalan selama ini dianggap macet, bukan sibuk. */
const STUCK_PENDING_MS = 5 * 60_000
const USAGE_READ_MS = 30_000

/** Pilihan kartu pertanyaan yang menyerahkan keputusan ke AI. */
const DELEGATE = /rekomendasi|terserah|serahkan|putuskan|pilihkan|buatkan|contoh|asumsi|karang/i

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Pemakaian OpenRouter sejak putaran dimulai; `null` bila saldo tidak bisa dibaca. */
class Spend {
	private start: number | null = null
	private last: { at: number; value: number | null } = { at: 0, value: null }

	private constructor(private readonly key: string | null) {}

	static fromEnv(path: string): Spend {
		if (!existsSync(path)) return new Spend(null)
		const env = Object.fromEntries(
			readFileSync(path, 'utf8')
				.split('\n')
				.map((line) => line.split('='))
				.filter((parts) => parts.length >= 2)
				.map(([name, ...value]) => [name.trim(), value.join('=').trim()]),
		)
		// Kuncinya hanya dikirim ke provider pemiliknya.
		return new Spend(
			String(env.AI_BASE_URL ?? '').includes('openrouter.ai') ? (env.AI_API_KEY ?? null) : null,
		)
	}

	private async usage(): Promise<number | null> {
		if (!this.key) return null
		try {
			const response = await fetch('https://openrouter.ai/api/v1/credits', {
				headers: { authorization: `Bearer ${this.key}` },
				signal: AbortSignal.timeout(20_000),
			})
			if (!response.ok) return null
			const body = (await response.json()) as { data?: { total_usage?: number } }
			return typeof body.data?.total_usage === 'number' ? body.data.total_usage : null
		} catch {
			return null
		}
	}

	async begin(): Promise<void> {
		this.start = await this.usage()
	}

	/** Terpakai sejak `begin`, dibaca paling sering sekali per `SPEND_CHECK_MS` kecuali `fresh`. */
	async spent(fresh = false): Promise<number | null> {
		if (this.start === null) return null
		if (fresh || Date.now() - this.last.at >= SPEND_CHECK_MS) {
			const now = await this.usage()
			this.last = { at: Date.now(), value: now === null ? null : now - this.start }
		}
		return this.last.value
	}
}

interface PanelState {
	running: boolean
	drawing: boolean
	pendingApply: boolean
	ask: 'question' | 'metadata' | null
	stall: boolean
	resume: string | null
	errors: string[]
}

async function panelState(page: Page): Promise<PanelState> {
	return page.evaluate(() => {
		const text = (el: Element | null | undefined) => ((el as HTMLElement | null)?.innerText ?? '').trim()
		const buttons = [...document.querySelectorAll('button')]
		const hasButton = (label: string) => buttons.some((button) => text(button) === label)
		const body = document.body.innerText
		const resume = document.querySelector('button[aria-label="Sembunyikan tombol lanjutkan"]')
		return {
			running: !!document.querySelector('button[aria-label="Stop"]'),
			drawing: hasButton('Menggambar…') || hasButton('Menerapkan…'),
			pendingApply: buttons.some((button) => /^Apply all \(\d+\)$/.test(text(button))),
			/* Judul kartu ditulis huruf besar lewat CSS, dan `innerText` ikut
			 * mengembalikannya begitu: "PERTANYAAN AI · 1/3". Dicocokkan tanpa
			 * peduli huruf - putaran 27 dan 28 Sep tidak pernah menjawab satu
			 * kartu pun, dan UC5/UC7/UC9 macet di depan kartu itu. */
			ask:
				/ai meminta metadata/i.test(body) && hasButton('Lewati')
					? 'metadata'
					: /pertanyaan ai/i.test(body) && hasButton('Lewati')
						? 'question'
						: null,
			stall: hasButton('Cukup'),
			resume: resume ? text(resume.previousElementSibling) : null,
			errors: [...document.querySelectorAll('div.bg-red-400\\/10')].map((el) => text(el)),
		} as const
	}) as Promise<PanelState>
}

function transcriptOf(page: Page): Promise<string> {
	return page.evaluate(() => {
		const scroller = document.querySelector('div.bg-surface-inset.overflow-y-auto') as HTMLElement | null
		return scroller?.innerText ?? ''
	})
}

interface Usage {
	calls: number
	tokensIn: number
	tokensOut: number
}

function readUsage(page: Page): Promise<Usage> {
	return page.evaluate(() => {
		const calls = (window as unknown as { __sse: { promptTokens: number; completionTokens: number }[] }).__sse
		return {
			calls: calls.length,
			tokensIn: calls.reduce((sum, call) => sum + call.promptTokens, 0),
			tokensOut: calls.reduce((sum, call) => sum + call.completionTokens, 0),
		}
	})
}

class CaseRun {
	questions = 0
	/** Pemakaian terakhir yang terbaca - tetap ada walau peramban tertutup di tengah jalan. */
	usage: Usage = { calls: 0, tokensIn: 0, tokensOut: 0 }
	private usageAt = 0
	private shots = 0

	constructor(
		readonly page: Page,
		readonly dir: string,
	) {}

	log(type: string, data: Record<string, unknown> = {}): void {
		appendFileSync(
			join(this.dir, 'log.jsonl'),
			`${JSON.stringify({ t: new Date().toISOString(), type, ...data })}\n`,
		)
	}

	async shot(name: string): Promise<void> {
		this.shots += 1
		await this.page.screenshot({ path: join(this.dir, `${String(this.shots).padStart(3, '0')}-${name}.png`) })
	}

	async send(text: string): Promise<void> {
		// Kartu pertanyaan menggantikan kotak pesan; ia dijawab dulu.
		const state = await panelState(this.page)
		if (state.ask) await this.answer(state.ask)
		await this.page.locator('textarea[aria-label="Message"]').waitFor({ timeout: 60_000 })
		await this.page.locator('textarea[aria-label="Message"]').fill(text)
		await this.page.locator('button[aria-label="Send"]').click()
		this.log('send', { text })
	}

	/** Kartu pertanyaan dijawab seperti penulis yang menyerahkan detailnya ke AI (lihat `DELEGATE`). */
	async answer(kind: 'question' | 'metadata'): Promise<void> {
		this.questions += 1
		const { page } = this
		if (kind === 'metadata') {
			await page.getByRole('button', { name: 'Lewati', exact: true }).first().click()
			this.log('ask', { kind, answer: 'dilewati' })
			return
		}
		for (let step = 0; step < 6; step++) {
			const options = page.locator('fieldset[aria-label]').first().locator('button[aria-pressed]')
			if ((await options.count()) === 0) break
			const labels = await options.allInnerTexts()
			const delegated = labels.findIndex((label) => DELEGATE.test(label) && !/placeholder|\[/i.test(label))
			const option = options.nth(Math.max(delegated, 0))
			const question = await page.locator('fieldset[aria-label]').first().getAttribute('aria-label')
			if ((await option.getAttribute('aria-pressed')) !== 'true') await option.click()
			this.log('ask', { kind, question, answer: (await option.innerText()).split('\n')[0] })
			const forward = page.getByRole('button', { name: /^(Berikutnya|Kirim)/ }).first()
			const submit = /^Kirim/.test(await forward.innerText())
			await forward.click()
			await sleep(800)
			if (submit) break
		}
	}

	/**
	 * Tunggu sampai panel diam: tidak berjalan, tidak menggambar, tidak ada aksi
	 * tertunda, selama `SETTLE_MS`. Kartu pertanyaan dijawab di sepanjang jalan.
	 */
	async refreshUsage(): Promise<void> {
		this.usage = await readUsage(this.page).catch(() => this.usage)
		this.usageAt = Date.now()
	}

	async settle(timeoutMs: number, brake?: () => Promise<boolean>): Promise<PanelState> {
		const deadline = Date.now() + timeoutMs
		let idleSince: number | null = null
		let pendingSince: number | null = null
		while (Date.now() < deadline) {
			if (Date.now() - this.usageAt >= USAGE_READ_MS) await this.refreshUsage()
			const state = await panelState(this.page)
			if (brake && (await brake())) {
				if (state.running) await this.page.locator('button[aria-label="Stop"]').click()
				this.log('brake', {})
				return panelState(this.page)
			}
			if (state.ask) {
				await this.answer(state.ask)
				idleSince = null
			} else if (state.running || state.drawing) {
				idleSince = null
				pendingSince = null
			} else if (state.pendingApply && Date.now() - (pendingSince ??= Date.now()) < STUCK_PENDING_MS) {
				// Auto-apply yang menerapkannya; penggerak menunggu, tidak menekan tombol.
				idleSince = null
			} else {
				if (state.pendingApply && idleSince === null) this.log('stuck-pending', {})
				idleSince ??= Date.now()
				if (Date.now() - idleSince >= SETTLE_MS) return state
			}
			await sleep(2_000)
		}
		this.log('timeout', { timeoutMs })
		return panelState(this.page)
	}
}

async function setup(run: CaseRun, useCase: UseCase, options: DriveOptions): Promise<void> {
	const { page } = run
	await page.goto(`${options.base}/new`, { waitUntil: 'networkidle', timeout: 120_000 })
	if (useCase.template) {
		await page.getByText(useCase.template, { exact: true }).first().click()
		await sleep(1_200)
		await page.getByRole('button', { name: 'Pakai template ini' }).click()
	} else {
		await page.getByText('Dokumen kosong', { exact: true }).first().click()
	}
	await page.waitForURL(`${options.base}/`, { timeout: 120_000 })
	await page.waitForSelector('.ProseMirror', { timeout: 120_000 })
	await sleep(3_000)
	if ((await page.locator('textarea[aria-label="Message"]').count()) === 0) {
		await page.locator('button[aria-label="AI Chat"]').first().click()
		await page.waitForSelector('textarea[aria-label="Message"]', { timeout: 30_000 })
	}
	await page.locator('button[title^="Model: "]').click()
	await sleep(400)
	await page.getByText(options.model, { exact: true }).first().click()
	await sleep(400)
	const toggle = async (label: string, want: boolean) => {
		const button = page.locator(`button[aria-label="${label}"]`)
		if (((await button.getAttribute('aria-pressed')) === 'true') !== want) await button.click()
		await sleep(300)
	}
	await toggle('Riset web', useCase.research)
	await toggle('Auto-apply', true)
	const model = await page.locator('button[title^="Model: "]').getAttribute('title')
	run.log('setup', { template: useCase.template, model, research: useCase.research })
	await run.shot('setup')
}

async function openExportMenu(page: Page): Promise<void> {
	await page.keyboard.press('Escape').catch(() => {})
	await page
		.locator('button[aria-haspopup="menu"]', { hasText: /^File$/ })
		.first()
		.click()
	await sleep(400)
	const exportItem = page.getByText('Ekspor', { exact: true }).first()
	await exportItem.hover()
	await sleep(400)
	if (
		!(await page
			.getByText('Word (.docx)', { exact: true })
			.first()
			.isVisible()
			.catch(() => false))
	) {
		await exportItem.click()
		await sleep(400)
	}
}

/**
 * DOCX lewat File > Ekspor > Word, SELURUH tab bila dokumennya bertab lebih
 * dari satu - CV dan surat lamaran UC7 ada di dua tab. PDF lewat dialog cetak
 * yang disadap lalu `page.pdf()`: "Save as PDF" tanpa header/footer peramban.
 */
async function exportFiles(run: CaseRun, docx: string, pdf: string): Promise<string | null> {
	const { page } = run
	await page.evaluate(() => window.scrollTo(0, 0))
	await openExportMenu(page)
	const download = page.waitForEvent('download', { timeout: 180_000 })
	await page.getByText('Word (.docx)', { exact: true }).first().click()
	await sleep(1_500)
	const dialog = page.locator('[aria-label="Ekspor Word"]')
	if (await dialog.isVisible().catch(() => false)) {
		await dialog.getByText('Seluruh tab', { exact: false }).first().click()
		await sleep(400)
		await dialog.locator('button').last().click()
	}
	const file = await download
	await file.saveAs(docx)
	run.log('export', { kind: 'docx', suggested: file.suggestedFilename() })

	await openExportMenu(page)
	await page.getByText('PDF…', { exact: true }).first().click()
	const pdfDialog = page.locator('[aria-label="Ekspor PDF"]')
	await pdfDialog.waitFor({ timeout: 30_000 })
	const before = await page.evaluate(() => (window as unknown as { __printCalls: number }).__printCalls)
	await pdfDialog.getByRole('button', { name: /Buka dialog cetak/ }).click()
	await page.waitForFunction(
		(count) => (window as unknown as { __printCalls: number }).__printCalls > count,
		before,
		{ timeout: 300_000 },
	)
	await page.pdf({ path: pdf, preferCSSPageSize: true })
	run.log('export', { kind: 'pdf' })
	return file.suggestedFilename()
}

/*
 * Dipasang sebelum aplikasi dimuat: `window.print` disadap supaya ekspor PDF
 * bisa diambil `page.pdf()`, dan salinan stream /api/chat dibaca lewat tee()
 * untuk menghitung panggilan dan token - aplikasi tetap menerima stream aslinya.
 */
function tapScript(): void {
	const win = window as unknown as {
		__printCalls: number
		__sse: { promptTokens: number; completionTokens: number; error: string | null; done: boolean }[]
	}
	win.__printCalls = 0
	window.print = () => {
		win.__printCalls += 1
	}
	win.__sse = []
	const original = window.fetch.bind(window)
	const tapped = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
		const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
		const response = await original(input, init)
		if (!url.includes('/api/chat') || !response.body) return response
		const [forApp, forTap] = response.body.tee()
		const call = { promptTokens: 0, completionTokens: 0, error: null as string | null, done: false }
		win.__sse.push(call)
		void (async () => {
			const reader = forTap.getReader()
			const decoder = new TextDecoder()
			let buffer = ''
			try {
				for (;;) {
					const { done, value } = await reader.read()
					if (done) break
					buffer += decoder.decode(value, { stream: true })
					const parts = buffer.split('\n\n')
					buffer = parts.pop() ?? ''
					for (const part of parts) {
						const line = part.split('\n').find((item) => item.startsWith('data:'))
						if (!line) continue
						try {
							const event = JSON.parse(line.slice(5))
							if (event.type === 'usage') {
								call.promptTokens += event.promptTokens ?? 0
								call.completionTokens += event.completionTokens ?? 0
							}
							if (event.type === 'error') call.error = String(event.message ?? '').slice(0, 300)
						} catch {}
					}
				}
				call.done = true
			} catch (error) {
				call.error = String(error).slice(0, 300)
			}
		})()
		return new Response(forApp, {
			status: response.status,
			statusText: response.statusText,
			headers: response.headers,
		})
	}
	window.fetch = tapped as typeof window.fetch
}

async function driveCase(
	browser: Browser,
	useCase: UseCase,
	options: DriveOptions,
	spend: Spend,
	startedSpend: number | null,
): Promise<CaseResult> {
	const dir = join(options.out, useCase.id)
	mkdirSync(dir, { recursive: true })
	const context = await browser.newContext({
		viewport: { width: 1680, height: 1050 },
		acceptDownloads: true,
		locale: 'id-ID',
		timezoneId: 'Asia/Jakarta',
	})
	await context.addInitScript(tapScript)
	const page = await context.newPage()
	const run = new CaseRun(page, dir)
	page.on('pageerror', (error) => run.log('pageerror', { text: String(error.stack ?? error).slice(0, 3000) }))
	page.on('dialog', (dialog) => {
		run.log('dialog', { message: dialog.message() })
		dialog.accept().catch(() => {})
	})

	const started = Date.now()
	const overBudget = async () => {
		const spent = await spend.spent()
		return spent !== null && spent >= options.budgetUsd
	}
	let status = 'selesai'
	let nudges = 0
	let appliedAtNudge = 0

	try {
		await setup(run, useCase, options)
		await run.send(useCase.prompt)
		const outline = await run.settle(OUTLINE_TIMEOUT_MS, overBudget)
		/* Model yang langsung menulis tanpa menunggu persetujuan (UC4, 28 Sep)
		 * masih berjalan saat batas outline habis. Ia ditunggu sampai diam, bukan
		 * disela: tombol Send baru ada lagi sesudah itu. */
		if (outline.running) {
			run.log('outline-overrun', {})
			await run.settle(Math.max(60_000, started + WRITE_TIMEOUT_MS - Date.now()), overBudget)
		}
		writeFileSync(join(dir, 'outline.txt'), await transcriptOf(page))
		await run.shot('outline')

		await run.send(APPROVE(useCase.approveExtra))
		const deadline = started + WRITE_TIMEOUT_MS
		for (;;) {
			const state = await run.settle(Math.max(60_000, deadline - Date.now()), overBudget)
			run.log('settled', { ...state })
			if (await overBudget()) {
				status = 'dihentikan: batas biaya'
				break
			}
			const stopped = state.stall || state.resume !== null || state.errors.length > 0
			if (!stopped) break
			if (nudges >= options.maxNudges) {
				status = 'berhenti: batas dorongan'
				break
			}
			if (Date.now() >= deadline) {
				status = 'berhenti: batas waktu'
				break
			}
			/*
			 * Dorongan yang tidak menghasilkan satu suntingan pun tidak diulang.
			 * Uji-asap 27 Sep: model menyatakan UC9 selesai sementara keterangan
			 * Gambar 1.1/1.2 tidak berdampingan dengan grafiknya - ia tidak
			 * punya alat untuk memindahkannya - dan setiap "lanjutkan" membuka
			 * putaran baru: 60 menit, 4,5 juta token.
			 */
			const applied = countApplied(await transcriptOf(page))
			if (nudges > 0 && applied === appliedAtNudge) {
				status = 'berhenti: dorongan tanpa kemajuan'
				break
			}
			appliedAtNudge = applied
			nudges += 1
			await run.send(NUDGE)
		}
	} catch (error) {
		status = 'galat penggerak'
		run.log('crash', { error: String((error as Error).stack ?? error).slice(0, 3000) })
		await run.shot('crash').catch(() => {})
	}

	await run.refreshUsage()
	const transcript = await transcriptOf(page).catch(() => '')
	writeFileSync(join(dir, 'transcript.txt'), transcript)
	await run.shot('akhir').catch(() => {})

	const docx = join(dir, `${useCase.id}.docx`)
	const pdf = join(dir, `${useCase.id}.pdf`)
	let exported = false
	try {
		await exportFiles(run, docx, pdf)
		exported = true
	} catch (error) {
		run.log('export-failed', { error: String((error as Error).stack ?? error).slice(0, 3000) })
	}

	await run.refreshUsage()
	await context.close()

	const { calls, tokensIn, tokensOut } = run.usage
	const estimate = (tokensIn * options.priceIn + tokensOut * options.priceOut) / 1e6
	const spentNow = await spend.spent(true)
	// Tagihan mencakup sub-agent penggambar, yang tidak lewat stream chat yang disadap.
	const real = spentNow !== null && startedSpend !== null ? spentNow - startedSpend : null
	const driver: DriverStats = {
		status: exported ? status : `${status}; ekspor gagal`,
		model: options.model,
		nudges,
		questions: run.questions,
		autoContinues: (transcript.match(/Dilanjutkan otomatis/g) ?? []).length,
		calls,
		tokensIn,
		tokensOut,
		costUsd: real ?? estimate,
		costEstimateUsd: estimate,
		costSource: real === null ? 'tarif' : 'tagihan',
		minutes: Math.round((Date.now() - started) / 6_000) / 10,
	}

	const facts = exported
		? { docx: docxFacts(readFileSync(docx)), pdf: pdfFacts(pdf) }
		: {
				docx: { blocks: [], tables: 0, images: 0, media: 0, columnSections: [], words: 0, text: '' },
				pdf: null,
			}
	const result = caseResult(useCase, facts, { pdf: exported ? pdf : null, docx }, driver)
	writeFileSync(join(options.out, `${useCase.id}.json`), `${JSON.stringify(result, null, 1)}\n`)
	return result
}

/** Aksi yang sudah diterapkan, menurut kartu aksi di transkrip panel. */
function countApplied(transcript: string): number {
	return (transcript.match(/^Applied\b/gm) ?? []).length
}

/*
 * Satu penggerak per folder. Uji-asap 27 Sep: sesi penggerak lain yang masih
 * hidup ikut menulis ke folder dan log yang sama, dan hasil UC9 yang bersih
 * tertimpa hasilnya.
 */
function lockFolder(out: string): () => void {
	const lock = join(out, 'drive.lock')
	if (existsSync(lock)) {
		const pid = Number(readFileSync(lock, 'utf8'))
		let alive = false
		try {
			process.kill(pid, 0)
			alive = true
		} catch {}
		if (alive) throw new Error(`Folder ${out} sedang dipakai penggerak lain (pid ${pid}).`)
	}
	writeFileSync(lock, String(process.pid))
	return () => rmSync(lock, { force: true })
}

/** Case berurutan, satu konteks peramban per case, dengan rem biaya bersama. */
export async function driveCases(
	cases: readonly UseCase[],
	options: DriveOptions,
	report: (line: string) => void,
): Promise<CaseResult[]> {
	mkdirSync(options.out, { recursive: true })
	const unlock = lockFolder(options.out)
	report(`Penggerak pid ${process.pid}, folder ${options.out}.`)
	const spend = Spend.fromEnv(options.apiEnv)
	await spend.begin()
	report(
		(await spend.spent(true)) === null
			? `Saldo provider tidak terbaca: rem biaya memakai perkiraan tarif, batas US$${options.budgetUsd}.`
			: `Rem biaya aktif: batas US$${options.budgetUsd} untuk seluruh putaran.`,
	)

	const browser = await chromium.launch({
		executablePath: options.browser,
		headless: true,
		args: ['--lang=id-ID'],
	})
	const results: CaseResult[] = []
	let estimate = 0
	try {
		for (const useCase of cases) {
			const spent = (await spend.spent(true)) ?? estimate
			if (spent >= options.budgetUsd) {
				report(`${useCase.id}: dilewati - batas biaya tercapai (US$${spent.toFixed(2)}).`)
				continue
			}
			report(`${useCase.id}: mulai (${useCase.title}).`)
			const result = await driveCase(browser, useCase, options, spend, await spend.spent(true))
			estimate += result.driver?.costUsd ?? 0
			results.push(result)
			const failed = result.checks.filter((check) => !check.ok).length
			report(
				`${useCase.id}: ${result.driver?.status}; ${result.passed ? 'LOLOS' : `${failed} syarat belum terpenuhi`}; ${result.driver?.nudges} dorongan, ${result.driver?.autoContinues} lanjutan otomatis, US$${(result.driver?.costUsd ?? 0).toFixed(3)}.`,
			)
		}
	} finally {
		await browser.close()
		unlock()
	}
	return results
}
