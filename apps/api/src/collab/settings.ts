import { COLLAB_WS_PATH } from '@writer-hub/shared'
import { env } from '@/config/env'
import type { RoomSettings } from './room'
import { createTicketSigner, type TicketSigner } from './ticket'

/** Setelan room dari lingkungan; angka yang tidak perlu diubah operator ditulis di sini. */
export function roomSettingsFromEnv(): RoomSettings {
	return {
		flushMs: 100,
		deriveDebounceMs: env.COLLAB_DERIVE_DEBOUNCE_MS,
		deriveMaxMs: Math.max(env.COLLAB_DERIVE_MAX_MS, env.COLLAB_DERIVE_DEBOUNCE_MS),
		seedLockMs: 20_000,
		electionRetryMs: 1_000,
		shareSeedGraceMs: 1_500,
		compactEvery: 500,
		compactOnUnload: 20,
		maxAwarenessBytes: 64 * 1024,
		busInlineMaxBytes: 256 * 1024,
	}
}

let signer: TicketSigner | null | undefined

/** null bila kolaborasi tidak dikonfigurasi (`COLLAB_TICKET_SECRET` kosong). */
export function collabTicketSigner(): TicketSigner | null {
	if (signer === undefined)
		signer = env.COLLAB_TICKET_SECRET ? createTicketSigner(env.COLLAB_TICKET_SECRET) : null
	return signer
}

/** Alamat dasar websocket yang dibuka peramban (tanpa id tab). */
export function publicCollabWsUrl(): string {
	if (env.COLLAB_PUBLIC_WS_URL) return env.COLLAB_PUBLIC_WS_URL.replace(/\/+$/, '')
	const base = env.SERVICE_URL.replace(/\/+$/, '').replace(/^http/i, 'ws')
	return `${base}${COLLAB_WS_PATH}`
}
