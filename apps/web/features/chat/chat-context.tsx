'use client'

import type { Editor } from '@tiptap/react'
import { generateJSON } from '@tiptap/core'
import {
	CHAT_CONTEXT_LIMITS,
	type ChatMessage,
	type ChatStreamPhase,
	type ChatUsage,
	type ToolCall,
} from '@writer-hub/shared'
import { isReadTool } from '@writer-hub/shared'
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useRef,
	useState,
} from 'react'
import { usePanels } from '@/features/analysis/panel-context'
import { useDocument } from '@/features/document/document-context'
import { useDocumentLanguage } from '@/features/document/use-language'
import { useEditorInstance } from '@/features/editor/editor-context'
import { buildEditorExtensions } from '@/features/editor/extensions'
import { paginationKey } from '@/features/editor/pagination'
import { toEditorContent } from '@/features/editor/markdown'
import { usePageSetup } from '@/features/editor/use-page-setup'
import { editorPlainText } from '@/features/editor/text-content'
import { sessionLabel, useSessions } from '@/features/sessions/session-context'
import { createTab as createTabInDoc } from '@/features/sessions/ydoc'
import { buildSchema, fragmentToJSON, jsonToFragment } from '@/features/sync/serialize'
import { parseFallbackCalls, streamChat, stripFallbackCalls } from './api'
import {
	applyWriteTool,
	type ReadToolContext,
	readToolLabel,
	runReadTool,
	summarizeToolResult,
	type ToolOutcome,
} from './tools'

/**
 * Percakapan dengan AI di panel samping.
 *
 * Riwayatnya hidup di memori saja: satu sesi tanya-jawab tentang naskah yang
 * sedang dibuka, bukan arsip yang perlu dibawa ke kunjungan berikutnya.
 * Menyimpannya ke tab berarti tiap draf membawa transkrip yang hampir tidak
 * pernah dibaca ulang.
 */

/** Potongan naskah yang ditempelkan ke giliran berikutnya. */
export interface ChatAttachment {
	text: string
	surrounding: string
	/** Koordinat teks polos, dipakai saat usulan diterapkan kembali. */
	offset: number
	length: number
}

/**
 * Satu baris langkah di lini masa giliran (§B1.3).
 *
 * Langkah lahir dari event `status` server dan dari alat baca yang dijalankan
 * klien; setelah giliran selesai ia menempel pada gilurannya supaya bisa
 * dibuka lagi sebagai "N langkah · X dtk".
 */
export interface ChatStep {
	id: string
	label: string
	status: 'running' | 'done' | 'failed' | 'cancelled'
	startedAt: number
	endedAt?: number
	/** Argumen alat + ringkasan hasil, atau penalaran; dibuka saat baris ditekan. */
	detail?: string
	/** Daftar rencana dari alat `plan` (§B3.2); dicentang seiring langkah selesai. */
	checklist?: { text: string; done: boolean }[]
}

/**
 * Satu giliran percakapan, plus aksi tulis yang menunggu persetujuan.
 *
 * `actions` tidak pernah ikut dikirim ke provider - ia hanya milik UI.
 */
export interface ChatTurn extends ChatMessage {
	actions?: ToolCall[]
	/** Batas tugas: semua giliran dari satu pesan pengguna berbagi id ini. */
	taskId?: string
	/** Lini masa langkah giliran ini (§B1); tidak dikirim ke provider. */
	steps?: ChatStep[]
	/** Pemakaian token, bila provider melaporkannya. */
	usage?: ChatUsage
}

/** Batas putaran alat baca dalam satu giliran. */
const MAX_TOOL_ROUNDS = 4

/** Label baris langkah untuk tiap fase yang dipancarkan server (§B1.3). */
const PHASE_LABEL: Record<ChatStreamPhase, string> = {
	connecting: 'Menghubungi provider…',
	thinking: 'Berpikir…',
	reading: 'Menyiapkan pembacaan dokumen…',
	writing: 'Menyusun jawaban…',
	retrying: 'Mencoba ulang tanpa tool calling…',
}

/** Id batas tugas baru. crypto.randomUUID bila ada, mundur ke counter waktu. */
function newTaskId(): string {
	return globalThis.crypto?.randomUUID?.() ?? `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
}

/**
 * Susun riwayat untuk dikirim ke provider, dengan pemadatan batas tugas.
 *
 * Tugas yang sedang berjalan (`currentTaskId`) dikirim utuh - termasuk pesan
 * `tool` dan `tool_calls`-nya - supaya model bisa melanjutkan pekerjaan alat
 * yang belum selesai. Tugas-tugas LAMA dipangkas: pesan `tool` dibuang dan
 * `tool_calls` asisten dicabut, hanya menyisakan teks pertanyaan/jawaban.
 *
 * Inilah penyangga utama bug "AI meneruskan tugas sebelumnya": tanpa pemadatan,
 * `tool_calls` lama yang tak berbuah hasil terbaca model sebagai pekerjaan
 * yang belum selesai. Lihat EDITOR-AI-UPGRADE-PRD §B2.
 */
export function buildOutboundMessages(history: ChatTurn[], currentTaskId: string | undefined): ChatMessage[] {
	const outbound: ChatMessage[] = []
	for (const turn of history) {
		// Tugas berjalan: utuh, hanya buang bidang milik UI.
		if (turn.taskId === currentTaskId) {
			const { actions: _actions, taskId: _taskId, steps: _steps, usage: _usage, ...message } = turn
			outbound.push(message)
			continue
		}

		// Tugas lama: pangkas rincian alatnya.
		if (turn.role === 'tool') continue
		if (turn.role === 'assistant') {
			// `tool_calls` lama dibuang; teks jawaban disimpan bila ada.
			if (turn.content) outbound.push({ role: 'assistant', content: turn.content })
			continue
		}
		outbound.push({ role: turn.role, content: turn.content })
	}

	/*
	 * Jaga batas server (max 40): buang giliran paling tua lebih dulu. Satu
	 * tugas alat baca bisa berisi belasan pesan (§B1), jadi tanpa ini sesi
	 * yang aktif ditolak DTO sebelum sempat bertanya lagi.
	 *
	 * Potongan hanya boleh mulai di pesan pengguna: mulai di tengah rangkaian
	 * `tool`/`tool_calls` mengirim pasangan pincang yang ditolak provider.
	 * Tugas berjalan selalu utuh karena ia selalu diawali pesan pengguna.
	 */
	if (outbound.length > CHAT_CONTEXT_LIMITS.messages) {
		let start = outbound.length - CHAT_CONTEXT_LIMITS.messages
		while (start < outbound.length - 1 && outbound[start].role !== 'user') start++
		return outbound.slice(start)
	}
	return outbound
}

/** Panjang maksimum potongan awal naskah pada ringkasan kerangka. */
const OUTLINE_SNIPPET_CHARS = 600

/**
 * Ringkasan murah dari tab aktif untuk konteks chat bawaan.
 *
 * Dua bagian: daftar heading (struktur) dan potongan awal naskah (isi). Cukup
 * untuk membuat model tahu dokumen tidak kosong dan apa bahasannya, tanpa
 * mengirim teks penuh tiap giliran. Sumbernya editor aktif, jadi selalu segar.
 *
 * Berkas dokumen tanpa heading punya cerita: potongan awalnya tetap dikirim,
 * jadi paragraf pertama yang ditulis pengguna tetap terlihat model.
 */
function editorOutlineSummary(editor: Editor): string | undefined {
	const doc = editor.state.doc
	const lines: string[] = []

	// Heading dibaca langsung dari ProseMirror, pola yang sama dengan use-outline
	// dan alat get_outline - tidak ada sumber kebenaran kedua.
	let headingCount = 0
	doc.descendants((node) => {
		if (node.type.name === 'heading') {
			headingCount += 1
			lines.push(`${'#'.repeat((node.attrs.level as number) ?? 1)} ${node.textContent.trim()}`)
			return false
		}
		return true
	})

	const plain = editorPlainText(editor)
	const hasText = plain.trim().length > 0
	if (!hasText && headingCount === 0) return undefined

	const parts: string[] = []
	if (headingCount > 0) parts.push(`Outline (${headingCount} heading):\n${lines.join('\n')}`)
	// Potongan awal selalu disertakan supaya dokumen tanpa heading juga dikenali.
	parts.push(`Opening:\n${plain.slice(0, OUTLINE_SNIPPET_CHARS).trim()}`)
	return parts.join('\n\n')
}

interface ChatContextValue {
	messages: ChatTurn[]
	/** Jawaban yang sedang mengalir; null saat tidak ada giliran berjalan. */
	streaming: string | null
	/** Lini masa langkah giliran yang sedang berjalan (§B1). */
	steps: ChatStep[]
	isRunning: boolean
	error: string | null

	attachment: ChatAttachment | null
	attach: (attachment: ChatAttachment) => void
	clearAttachment: () => void

	/** Sertakan seluruh naskah, bukan hanya sekitar seleksi. */
	includeDocument: boolean
	setIncludeDocument: (value: boolean) => void

	send: (prompt: string) => void
	stop: () => void
	reset: () => void

	/** Buka batas tugas baru tanpa menghapus transkrip; kartu aksi lama kedaluwarsa. */
	startNewTopic: () => void
	/** Id tugas yang sedang berjalan; dipakai UI untuk mengenali kartu aksi kedaluwarsa. */
	currentTaskId: string | undefined

	/** Jalankan aksi tulis yang disetujui pengguna lewat kartu aksi. */
	applyAction: (call: ToolCall) => ToolOutcome
	/** Apakah sebuah panggilan alat sudah pernah diterapkan (anti-terap-ganda). */
	isActionApplied: (id: string) => boolean
}

const ChatContext = createContext<ChatContextValue | null>(null)

export function ChatProvider({ children }: { children: ReactNode }) {
	const { state } = useDocument()
	const { editor } = useEditorInstance()
	const { setActivePanel, markRun } = usePanels()
	const { doc, activeDocId, activeId, sessions, comments, addComment } = useSessions()
	const { setup, setPageSetup } = usePageSetup()
	const language = useDocumentLanguage()
	const [messages, setMessages] = useState<ChatTurn[]>([])
	const [streaming, setStreaming] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [attachment, setAttachment] = useState<ChatAttachment | null>(null)
	const [includeDocument, setIncludeDocument] = useState(false)
	const [currentTaskId, setCurrentTaskId] = useState<string | undefined>(undefined)
	/** toolCallId yang sudah diterapkan - lihat M5 (anti-terap-ganda). */
	const [appliedActionIds, setAppliedActionIds] = useState<Set<string>>(() => new Set())

	// Lini masa langkah giliran berjalan (§B1). Dimutasi dari dalam rantai async
	// runTurn, jadi versi terkininya dipegang ref - state hanya untuk render.
	const [steps, setSteps] = useState<ChatStep[]>([])
	const stepsRef = useRef<ChatStep[]>([])

	const abortRef = useRef<AbortController | null>(null)

	/*
	 * Giliran berjalan sebagai rantai async yang bisa berputar beberapa kali,
	 * jadi ia membaca editor dan konteks lewat ref - bukan lewat closure yang
	 * sudah basi sejak putaran pertama.
	 */
	const editorRef = useRef(editor)
	editorRef.current = editor

	/** Dimatikan begitu provider terbukti menolak tool calling. */
	const toolsRef = useRef(true)

	const contextRef = useRef({ attachment, includeDocument, state })
	contextRef.current = { attachment, includeDocument, state }

	// Sumber alat baca/tulis yang hidup di luar editor: tata letak, tab, komentar.
	// Dibaca lewat ref karena runTurn berjalan sebagai rantai async (§B1).
	const appRef = useRef({ setup, setPageSetup, doc, activeDocId, activeId, sessions, comments })
	appRef.current = { setup, setPageSetup, doc, activeDocId, activeId, sessions, comments }

	// Konteks dirakit saat kirim, bukan saat diketik: naskah bisa berubah
	// selama pengguna menyusun pertanyaannya.
	const buildContext = useCallback(() => {
		const { attachment: current, includeDocument: whole, state: document } = contextRef.current

		/*
		 * Isi dokumen dibaca langsung dari editor aktif, bukan dari `state.text`.
		 * `state.text` hanya diperbarui saat pengguna mengetik (lewat `onUpdate`),
		 * jadi pada tab yang baru dibuka - sebelum satu ketukan pun - ia bisa kosong
		 * dan chat melaporkan "dokumen masih kosong". Editor selalu memegang isi
		 * tab aktif yang sebenarnya (didukung Y.Doc), dan inilah sumber kebenaran.
		 *
		 * Chat selalu diberi akses ke tab aktif, jadi ia tidak pernah mengira
		 * dokumen kosong padahal isinya ada. Dua kedalaman:
		 *
		 * - `includeDocument` mati (bawaan): ringkasan kerangka + potongan awal.
		 *   Murah, cukup untuk tahu dokumen tidak kosong dan strukturnya apa.
		 * - `includeDocument` nyala: teks penuh, dibatasi CHAT_CONTEXT_LIMITS.
		 */
		const editor = editorRef.current
		let documentText: string | undefined
		if (editor && !editor.isDestroyed) {
			documentText = whole
				? editorPlainText(editor).slice(0, CHAT_CONTEXT_LIMITS.document)
				: editorOutlineSummary(editor)
		} else {
			// Cadangan saat editor belum siap: state, seadanya. Tetap dipangkas -
			// naskah yang lebih panjang dari batas DTO ditolak API dengan 400.
			const text = whole
				? document.text?.slice(0, CHAT_CONTEXT_LIMITS.document)
				: document.text?.slice(0, OUTLINE_SNIPPET_CHARS)
			documentText = text || undefined
		}

		return {
			title: document.title || undefined,
			selection: current?.text,
			surrounding: current?.surrounding,
			document: documentText,
		}
	}, [])

	const stop = useCallback(() => {
		abortRef.current?.abort()
		abortRef.current = null
	}, [])

	// ── lini masa langkah (§B1) ──────────────────────────────────────────────
	// Helper ini hanya menyentuh ref + setState yang stabil, jadi aman dipakai
	// dari runTurn yang berjalan di luar siklus render.

	const setStepsBoth = (next: ChatStep[]) => {
		stepsRef.current = next
		setSteps(next)
	}

	const closeRunning = (status: 'done' | 'failed' | 'cancelled', list: ChatStep[]): ChatStep[] =>
		list.map((step) => (step.status === 'running' ? { ...step, status, endedAt: Date.now() } : step))

	/** Buka langkah baru; langkah berjalan sebelumnya ditutup (satu fase menggantikan fase sebelumnya). */
	const pushStep = (label: string, detail?: string): string => {
		const now = Date.now()
		const id = `step_${now.toString(36)}_${stepsRef.current.length}`
		setStepsBoth([
			...closeRunning('done', stepsRef.current),
			{ id, label, status: 'running', startedAt: now, detail },
		])
		return id
	}

	/** Tambahkan rincian pada langkah yang sedang berjalan (mis. penalaran atau hasil alat). */
	const patchRunningStep = (patch: Partial<ChatStep>) => {
		setStepsBoth(
			stepsRef.current.map((step, index) =>
				index === stepsRef.current.length - 1 && step.status === 'running' ? { ...step, ...patch } : step,
			),
		)
	}

	/** Tutup semua langkah berjalan dan kembalikan potretnya untuk ditempel ke giliran. */
	const finishSteps = (): ChatStep[] | undefined => {
		const closed = closeRunning('done', stepsRef.current)
		setStepsBoth(closed)
		return closed.length > 0 ? closed : undefined
	}

	// Rencana dari alat `plan` (§B3.2): checklist-nya dicentang satu per satu
	// setiap langkah alat berikutnya selesai.
	const planRef = useRef<{ stepId: string; next: number } | null>(null)

	const recordPlan = (items: string[]) => {
		const stepId = pushStep(`Rencana ${items.length} langkah`)
		setStepsBoth(
			stepsRef.current.map((step) =>
				step.id === stepId
					? { ...step, status: 'done', endedAt: Date.now(), checklist: items.map((text) => ({ text, done: false })) }
					: step,
			),
		)
		planRef.current = { stepId, next: 0 }
	}

	const advancePlan = () => {
		const plan = planRef.current
		if (!plan) return
		setStepsBoth(
			stepsRef.current.map((step) =>
				step.id === plan.stepId && step.checklist
					? {
							...step,
							checklist: step.checklist.map((item, index) =>
								index === plan.next ? { ...item, done: true } : item,
							),
						}
					: step,
			),
		)
		plan.next += 1
	}

	/** Konteks alat baca, dirakit segar dari sumbernya tiap dipakai. */
	const buildReadContext = (editor: Editor): ReadToolContext => {
		const app = appRef.current
		return {
			editor,
			pageCount: paginationKey.getState(editor.state)?.pageCount ?? 1,
			setup: app.setup,
			tabs: app.sessions.map((tab) => ({
				id: tab.id,
				label: sessionLabel(tab),
				active: tab.id === app.activeId,
			})),
			readTab: (tabId) => {
				try {
					const json = fragmentToJSON(app.doc, tabId)
					const node = buildSchema().nodeFromJSON(json)
					return node.textBetween(0, node.content.size, '\n', ' ')
				} catch {
					return null
				}
			},
			comments: app.comments,
		}
	}

	/** Buat tab baru berisi naskah awal (alat create_tab); tidak berpindah tab. */
	const createTabWithContent = (title: string | undefined, markdown: string | undefined) => {
		const app = appRef.current
		if (!app.activeDocId) return
		const id = createTabInDoc(app.doc, app.activeDocId, title ?? 'Untitled document')
		if (markdown?.trim()) {
			// toEditorContent menghasilkan HTML; generateJSON menerjemahkannya ke
			// JSON skema editor supaya bisa ditulis ke fragmen Y.Doc tab baru.
			const json = generateJSON(toEditorContent(markdown), buildEditorExtensions())
			jsonToFragment(app.doc, id, json)
		}
	}

	/**
	 * Satu giliran, termasuk kelanjutannya setelah alat baca dijalankan.
	 *
	 * Alat baca tidak mengubah apa pun, jadi hasilnya langsung dikembalikan ke
	 * model dan percakapan berlanjut sendiri - itulah yang membuat AI bisa
	 * membaca kerangka lalu memutuskan bagian mana yang perlu dibuka. Alat tulis
	 * berhenti di sini sebagai kartu aksi; pengguna yang memutuskan.
	 *
	 * Putarannya dibatasi supaya model yang salah paham tidak terus meminta
	 * bacaan sampai kuota habis.
	 */
	const runTurn = useCallback(
		async (history: ChatTurn[], round: number, controller: AbortController, taskId: string): Promise<void> => {
			let answer = ''
			const calls: ToolCall[] = []
			let usage: ChatUsage | undefined
			let reasoning = ''

			try {
				await streamChat(
					{ messages: buildOutboundMessages(history, taskId), context: buildContext(), tools: toolsRef.current },
					{
						onDelta: (delta) => {
							answer += delta
							setStreaming(answer)
						},
						onToolCall: (call) => calls.push(call),
						onToolsUnsupported: () => {
							toolsRef.current = false
						},
						// Tiap fase baru membuka satu baris langkah (§B1).
						onStatus: (phase, detail) => pushStep(PHASE_LABEL[phase], detail),
						// Penalaran ditempel ke langkah yang sedang berjalan; provider
						// yang tidak mengirimkannya tidak menghasilkan apa-apa (§B1.4 no. 4).
						onReasoning: (text) => {
							reasoning += text
							patchRunningStep({ detail: reasoning })
						},
						onUsage: (report) => {
							usage = report
						},
					},
					controller.signal,
				)
			} catch (cause) {
				if (controller.signal.aborted) {
					// Hentikan: langkah berjalan ditandai dibatalkan dan jawaban separuh
					// diabadikan, supaya pembatalannya terlihat di transkrip (§B1.4 no. 5).
					const cancelled = closeRunning('cancelled', stepsRef.current)
					setStepsBoth(cancelled)
					const partial = stripFallbackCalls(answer)
					if (partial || cancelled.length > 0) {
						setMessages((current) => [
							...current,
							{
								role: 'assistant',
								content: partial,
								taskId,
								steps: cancelled.length > 0 ? cancelled : undefined,
								usage,
							},
						])
					}
				} else {
					// Kegagalan sungguhan: langkah berjalan ditandai gagal sebelum
					// pesan errornya diangkat ke layar oleh send().
					setStepsBoth(closeRunning('failed', stepsRef.current))
				}
				throw cause
			}

			// Jalur cadangan: panggilan yang ditulis sebagai blok teks.
			calls.push(...parseFallbackCalls(answer))

			const visible = stripFallbackCalls(answer)
			const reads = calls.filter((call) => isReadTool(call.name))
			const writes = calls.filter((call) => !isReadTool(call.name))

			const assistant: ChatTurn = {
				role: 'assistant',
				content: visible,
				taskId,
				toolCalls:
					calls.length > 0
						? calls.map((call) => ({
								id: call.id,
								name: call.name,
								arguments: JSON.stringify(call.arguments),
							}))
						: undefined,
				actions: writes.length > 0 ? writes : undefined,
			}

			const editor = editorRef.current
			// Giliran terminal. Termasuk giliran kosong (M6): ia tetap masuk riwayat
			// sebagai penanda, bukan return diam-diam yang meninggalkan pertanyaan
			// pengguna tanpa jawaban di mata model.
			if (reads.length === 0 || round >= MAX_TOOL_ROUNDS || !editor) {
				if (reads.length > 0 && round >= MAX_TOOL_ROUNDS && editor) {
					// Putaran alat mentok di batas: langkah eksplisit, bukan berhenti
					// diam-diam (§B1.3).
					pushStep('Batas penelusuran tercapai')
					patchRunningStep({
						status: 'failed',
						endedAt: Date.now(),
						detail: `${MAX_TOOL_ROUNDS} putaran alat baca dalam satu giliran`,
					})
				}
				setMessages((current) => [...current, { ...assistant, steps: finishSteps(), usage }])
				return
			}

			// Alat baca dijalankan klien; tiap pemanggilan jadi satu baris langkah
			// berisi argumen dan ringkasan hasil (bukan isi penuh).
			const results: ChatTurn[] = []
			const readContext = buildReadContext(editor)
			for (const call of reads) {
				// plan/think adalah alat "baca" berefek lini masa (§B3.2): rencana
				// tampil sebagai checklist yang dicentang seiring langkah selesai,
				// renungan diringkas sebagai rincian langkah - tak ada yang
				// menempel ke naskah.
				if (call.name === 'plan') {
					const items = Array.isArray(call.arguments.steps)
						? call.arguments.steps.map(String).filter(Boolean)
						: []
					if (items.length > 0) recordPlan(items)
					results.push({ role: 'tool', content: 'Plan recorded and shown to the user.', toolCallId: call.id, taskId })
					continue
				}
				if (call.name === 'think') {
					pushStep('Berpikir sejenak')
					patchRunningStep({ status: 'done', endedAt: Date.now(), detail: String(call.arguments.thought ?? '') })
					results.push({ role: 'tool', content: 'OK.', toolCallId: call.id, taskId })
					continue
				}

				pushStep(readToolLabel(editor, call))
				const content = runReadTool(readContext, call)
				patchRunningStep({
					status: 'done',
					endedAt: Date.now(),
					detail: `${JSON.stringify(call.arguments)}\n→ ${summarizeToolResult(content)}`,
				})
				advancePlan()
				results.push({ role: 'tool', content, toolCallId: call.id, taskId })
			}

			setMessages((current) => [...current, assistant, ...results])
			setStreaming('')
			await runTurn([...history, assistant, ...results], round + 1, controller, taskId)
		},
		// buildContext dan editorRef dibaca lewat ref/closure segar tiap panggilan;
		// helper langkah hanya menyentuh ref + setState yang stabil.
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[],
	)

	const send = useCallback(
		(prompt: string) => {
			const trimmed = prompt.trim()
			if (!trimmed || abortRef.current) return

			// Setiap pesan pengguna membuka batas tugas baru (M1). Kartu aksi tugas
			// sebelumnya otomatis kedaluwarsa karena currentTaskId bergeser.
			const taskId = newTaskId()
			const history: ChatTurn[] = [...messages, { role: 'user', content: trimmed, taskId }]
			setMessages(history)
			setCurrentTaskId(taskId)
			setStreaming('')
			setError(null)
			setStepsBoth([])
			planRef.current = null

			const controller = new AbortController()
			abortRef.current = controller

			runTurn(history, 0, controller, taskId)
				.catch((cause: unknown) => {
					// Pembatalan oleh pengguna bukan kegagalan.
					if (controller.signal.aborted) return
					setError(cause instanceof Error ? cause.message : 'Percakapan gagal')
				})
				.finally(() => {
					abortRef.current = null
					setStreaming(null)
				})
		},
		[messages, runTurn],
	)

	/** Jalankan satu aksi tulis yang sudah disetujui pengguna. */
	const applyAction = useCallback(
		(call: ToolCall): ToolOutcome => {
			// M5: toolCallId yang sudah diterapkan tidak menulis dua kali,
			// sekalipun tombol Apply-nya ditekan lagi.
			if (appliedActionIds.has(call.id)) return { ok: true, message: 'Sudah diterapkan.' }

			const editor = editorRef.current
			if (!editor) return { ok: false, message: 'Editor belum siap.' }

			const outcome = applyWriteTool(
				{
					editor,
					addComment,
					openPanel: setActivePanel,
					runModule: (feature) =>
						markRun(feature, { text: state.text, offset: 0, scoped: false, language: language.code }),
					setup: appRef.current.setup,
					setPageSetup: appRef.current.setPageSetup,
					createTab: createTabWithContent,
				},
				call,
			)

			if (outcome.ok) setAppliedActionIds((current) => new Set(current).add(call.id))
			return outcome
		},
		[appliedActionIds, addComment, setActivePanel, markRun, state.text, language.code],
	)

	/** Buka batas tugas baru tanpa menghapus transkrip (M7). */
	const startNewTopic = useCallback(() => {
		// currentTaskId bergeser ke id segar yang tidak dimiliki pesan mana pun,
		// jadi seluruh kartu aksi yang masih tertunda otomatis kedaluwarsa.
		setCurrentTaskId(newTaskId())
	}, [])

	const reset = useCallback(() => {
		stop()
		setMessages([])
		setStreaming(null)
		setError(null)
		setAttachment(null)
		setAppliedActionIds(new Set())
		setCurrentTaskId(undefined)
		setStepsBoth([])
	}, [stop])

	const value = useMemo<ChatContextValue>(
		() => ({
			messages,
			streaming,
			steps,
			isRunning: streaming !== null,
			error,
			attachment,
			attach: setAttachment,
			clearAttachment: () => setAttachment(null),
			includeDocument,
			setIncludeDocument,
			send,
			stop,
			reset,
			startNewTopic,
			currentTaskId,
			applyAction,
			isActionApplied: (id: string) => appliedActionIds.has(id),
		}),
		[
			messages,
			streaming,
			steps,
			error,
			attachment,
			includeDocument,
			send,
			stop,
			reset,
			startNewTopic,
			currentTaskId,
			applyAction,
			appliedActionIds,
		],
	)

	return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

export function useChat(): ChatContextValue {
	const context = useContext(ChatContext)
	if (!context) throw new Error('useChat harus dipakai di dalam <ChatProvider>')
	return context
}

/**
 * Blok berpagar dalam jawaban dianggap usulan teks pengganti.
 *
 * Ini kontrak dengan prompt sistem di apps/api: teks yang dimaksudkan untuk
 * masuk ke dokumen ditulis di dalam pagar, prosa penjelas di luarnya. Dengan
 * begitu tombol Apply muncul hanya untuk yang memang siap ditempelkan.
 */
export function extractProposals(content: string): string[] {
	const proposals: string[] = []
	const fence = /```[\w-]*\n([\s\S]*?)```/g

	let match = fence.exec(content)
	while (match !== null) {
		const text = match[1].trim()
		if (text) proposals.push(text)
		match = fence.exec(content)
	}

	// Tabel hampir tidak pernah ditulis model di dalam pagar - ia menganggapnya
	// bagian dari jawaban, bukan blok kode. Tanpa ini, "buatkan tabel" berakhir
	// sebagai teks di gelembung chat tanpa satu pun tombol untuk memasukkannya.
	for (const table of extractTables(stripFences(content))) proposals.push(table)

	return proposals
}

const FENCE_PATTERN = /```[\w-]*\n[\s\S]*?```/g
/** Baris tabel berturut-turut; baris pemisah wajib, itu yang membedakannya dari teks. */
const TABLE_PATTERN = /(?:^\|.*\|[ \t]*\n)(?:^\|[\s:|-]*-[\s:|-]*\|[ \t]*\n)(?:^\|.*\|[ \t]*\n?)*/gm

function stripFences(content: string): string {
	return content.replace(FENCE_PATTERN, '')
}

function extractTables(content: string): string[] {
	return (content.match(TABLE_PATTERN) ?? []).map((table) => table.trim()).filter(Boolean)
}

/** Isi jawaban tanpa blok usulan - bagian yang dibaca sebagai penjelasan. */
export function stripProposals(content: string): string {
	return (
		stripFences(content)
			.replace(TABLE_PATTERN, '')
			// Blok yang dicabut meninggalkan baris kosong bertumpuk, dan prosa
			// dirender apa adanya (whitespace-pre-wrap) - jadi celahnya terlihat.
			.replace(/\n{3,}/g, '\n\n')
			.trim()
	)
}
