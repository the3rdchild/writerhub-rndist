import { env } from '@/config/env'
import LoggerClient from '@/lib/logger'

/**
 * Pemutus sirkuit untuk panggilan ke pp-backend (`/auth/check` dan
 * `/users/extended-package`).
 *
 * Saat pp-backend menggantung, setiap panggilan menahan satu slot `fetch`
 * keluar sampai timeout. Bun membatasi slot itu (bawaan 256) untuk seluruh
 * proses, termasuk panggilan ke provider AI dan admin-ppe, jadi antreannya
 * ikut memperlambat semuanya. Sesudah beberapa kegagalan beruntun, pp-backend
 * dilewati sebentar: permintaan yang butuh jawaban baru dibalas 503 seketika,
 * dan pengguna yang sudah terverifikasi tetap dilayani cache (`lib/pp-auth.ts`).
 *
 * Begitu jeda habis, hanya satu panggilan percobaan yang diteruskan. Tanpa
 * itu, semua pembaruan cache yang tertunda menembak pp-backend bersamaan dan
 * menggantung bersamaan lagi.
 */

const FAILURE_THRESHOLD = 5
const COOLDOWN_MS = 10_000

type State = 'closed' | 'open' | 'half-open'

let state: State = 'closed'
let consecutiveFailures = 0
let openUntil = 0
let probeStartedAt = 0

export function isPpBackendAvailable(): boolean {
	const now = Date.now()
	if (state === 'closed') return true

	if (state === 'open') {
		if (now < openUntil) return false
		state = 'half-open'
		probeStartedAt = now
		return true
	}

	// Setengah terbuka: satu percobaan sedang berjalan. Percobaan yang tidak
	// pernah melapor (lewat timeout-nya sendiri) digantikan yang baru.
	if (now - probeStartedAt > env.PP_AUTH_TIMEOUT_MS + 1_000) {
		probeStartedAt = now
		return true
	}
	return false
}

/** Hanya kegagalan hulu yang dihitung (tidak terjangkau, timeout, 5xx), bukan token yang ditolak. */
export function recordPpBackendResult(ok: boolean): void {
	if (ok) {
		state = 'closed'
		consecutiveFailures = 0
		return
	}

	if (state === 'half-open') {
		open()
		return
	}
	// Sisa panggilan yang sudah berjalan sebelum pemutus terbuka.
	if (state === 'open') return

	consecutiveFailures += 1
	if (consecutiveFailures >= FAILURE_THRESHOLD) open()
}

function open(): void {
	state = 'open'
	consecutiveFailures = 0
	openUntil = Date.now() + COOLDOWN_MS
	LoggerClient.getInstance().warn(
		{ cooldown_ms: COOLDOWN_MS, failures: FAILURE_THRESHOLD },
		'pp-backend gagal beruntun; panggilan baru dilewati sementara',
	)
}

/** Untuk uji: kembalikan pemutus ke keadaan tertutup. */
export function resetPpBackendBreaker(): void {
	state = 'closed'
	consecutiveFailures = 0
	openUntil = 0
	probeStartedAt = 0
}
