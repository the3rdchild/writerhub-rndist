import type { ResearchSource } from '@writer-hub/shared'
import { stripFallbackCalls } from './api'

/**
 * Bentuk satu giliran chat, dan seluruh operasi yang membentuknya.
 *
 * Dipisahkan dari `chat-context.tsx` karena semuanya murni: masukan larik
 * bagian, keluaran larik bagian, tanpa React dan tanpa DOM. Di provider ia
 * tadinya berupa closure yang tidak bisa disentuh satu tes pun, padahal justru
 * di sinilah aturan urutan transkrip hidup.
 */

export interface ChatStep {
	id: string
	label: string
	status: 'running' | 'done' | 'failed' | 'cancelled'
	startedAt: number
	endedAt?: number
	detail?: string
	checklist?: { text: string; done: boolean }[]
	/** Hanya untuk langkah riset web - dipakai kartu verifikasi. */
	sources?: ResearchSource[]
	/**
	 * Langkah yang berjalan sendiri, di luar urutan giliran.
	 *
	 * Langkah biasa saling menggantikan: yang baru dimulai menutup yang
	 * sebelumnya, karena model memang mengerjakannya satu per satu. Pekerjaan
	 * yang dilempar ke sub-agent tidak begitu - ia berjalan sementara model
	 * utama terus menulis, dan bisa ada lebih dari satu sekaligus. Penanda ini
	 * yang menahannya supaya tidak ikut ditutup oleh langkah berikutnya, dan
	 * satu-satunya cara ia berakhir adalah ditutup dengan namanya sendiri.
	 */
	background?: boolean
}

/**
 * Satu giliran sebagai **aliran terurut**, bukan dua tumpukan terpisah.
 *
 * Sebelumnya giliran disimpan sebagai satu blob teks plus satu daftar langkah,
 * dan panel selalu menggambar daftarnya di atas teksnya. Model yang bicara lalu
 * memakai alat lalu bicara lagi tidak punya tempat untuk ucapan pertamanya:
 * kedua ucapan disambung jadi satu, dan seluruh langkah menumpuk di bawahnya.
 * Yang penulis lihat adalah pesannya "berpindah" - padahal ia memang tidak
 * pernah punya posisi.
 *
 * Aturan pembentuknya satu kalimat: **teks memisahkan kelompok.** Model bicara,
 * kelompok langkah ditutup; ia bekerja lagi, kelompok baru dibuka.
 */
export type TurnPart = { kind: 'text'; text: string } | { kind: 'steps'; steps: ChatStep[] }

/** Semua langkah giliran ini, tanpa peduli di kelompok mana ia jatuh. */
export function flatSteps(parts: TurnPart[]): ChatStep[] {
	return parts.flatMap((part) => (part.kind === 'steps' ? part.steps : []))
}

export function mapSteps(parts: TurnPart[], fn: (step: ChatStep) => ChatStep): TurnPart[] {
	return parts.map((part) => (part.kind === 'steps' ? { kind: 'steps', steps: part.steps.map(fn) } : part))
}

/**
 * Menutup langkah yang masih berjalan - kecuali yang berjalan sendiri.
 *
 * Pengecualian itu bukan kenyamanan: tanpanya, satu langkah fase berikutnya
 * akan menandai gambar sub-agent sebagai "selesai" saat ia baru mulai, dan
 * penulis melihat centang di sebelah pekerjaan yang belum ada hasilnya.
 */
export function closeRunning(
	status: 'done' | 'failed' | 'cancelled',
	parts: TurnPart[],
	at: number = Date.now(),
): TurnPart[] {
	return mapSteps(parts, (step) =>
		step.status === 'running' && !step.background ? { ...step, status, endedAt: at } : step,
	)
}

/** Menutup semuanya, termasuk yang berjalan sendiri - untuk giliran yang benar-benar berakhir. */
export function closeAll(
	status: 'done' | 'failed' | 'cancelled',
	parts: TurnPart[],
	at: number = Date.now(),
): TurnPart[] {
	return mapSteps(parts, (step) => (step.status === 'running' ? { ...step, status, endedAt: at } : step))
}

/**
 * Menambahkan langkah ke kelompok terakhir, atau membuka kelompok baru kalau
 * bagian terakhir adalah teks. Di situlah aturan "teks memisahkan kelompok"
 * hidup.
 */
export function appendStep(parts: TurnPart[], step: ChatStep): TurnPart[] {
	const last = parts[parts.length - 1]
	if (last?.kind === 'steps') {
		return [...parts.slice(0, -1), { kind: 'steps', steps: [...last.steps, step] }]
	}
	return [...parts, { kind: 'steps', steps: [step] }]
}

/**
 * Teks yang datang disambung ke bagian teks terakhir, atau membuka bagian teks
 * baru kalau sebelumnya kelompok langkah. Itu yang menutup kelompok.
 */
export function appendText(parts: TurnPart[], delta: string): TurnPart[] {
	const last = parts[parts.length - 1]
	if (last?.kind === 'text') {
		return [...parts.slice(0, -1), { kind: 'text', text: last.text + delta }]
	}
	return [...parts, { kind: 'text', text: delta }]
}

/** Menambal satu langkah menurut id-nya. Satu-satunya cara aman saat ada beberapa yang berjalan. */
export function patchStep(parts: TurnPart[], id: string, patch: Partial<ChatStep>): TurnPart[] {
	return mapSteps(parts, (step) => (step.id === id ? { ...step, ...patch } : step))
}

/**
 * Langkah biasa terakhir yang masih berjalan.
 *
 * Yang berjalan sendiri dilewati dengan sengaja: `patchRunningStep` dipakai
 * untuk menempelkan penalaran dan hasil alat ke langkah yang **sedang**
 * dikerjakan model, dan itu tidak pernah pekerjaan sub-agent.
 */
export function lastRunningStep(parts: TurnPart[]): ChatStep | undefined {
	const running = flatSteps(parts).filter((step) => step.status === 'running' && !step.background)
	return running[running.length - 1]
}

/**
 * Membersihkan bagian teks sebelum giliran disimpan.
 *
 * Selama mengalir, teksnya ditampilkan mentah - termasuk panggilan alat
 * cadangan yang ditulis model sebagai teks biasa. Yang tersimpan tidak boleh
 * begitu, dan bagian teks yang habis dibersihkan tidak boleh menyisakan
 * gelembung kosong di antara dua kelompok langkah.
 */
export function visibleParts(parts: TurnPart[] | undefined): TurnPart[] | undefined {
	if (!parts) return undefined
	const cleaned = parts
		.map((part) =>
			part.kind === 'text' ? { kind: 'text' as const, text: stripFallbackCalls(part.text) } : part,
		)
		.filter((part) => part.kind !== 'text' || part.text.trim().length > 0)
	return cleaned.length > 0 ? cleaned : undefined
}
