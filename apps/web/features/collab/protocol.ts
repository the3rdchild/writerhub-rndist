import { COLLAB_MESSAGE, type CollabStatus } from '@writer-hub/shared'
import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import type { WebsocketProvider } from 'y-websocket'

/**
 * Dua pesan milik kita di atas protokol y-websocket (lihat `@writer-hub/shared`
 * `COLLAB_MESSAGE` dan `apps/api/src/collab/protocol.ts`):
 *
 *   status: varUint(100) varString(JSON CollabStatus)   server → klien
 *   seed:   varUint(101) varUint8Array(pembaruan Yjs)    klien → server
 */

export function encodeSeedMessage(update: Uint8Array): Uint8Array {
	const encoder = encoding.createEncoder()
	encoding.writeVarUint(encoder, COLLAB_MESSAGE.seed)
	encoding.writeVarUint8Array(encoder, update)
	return encoding.toUint8Array(encoder)
}

/** Isi pesan status; `decoder` sudah melewati tipe pesannya. */
export function readStatus(decoder: decoding.Decoder): CollabStatus | null {
	try {
		const value = JSON.parse(decoding.readVarString(decoder)) as Partial<CollabStatus>
		if (value.state !== 'waiting' && value.state !== 'seed' && value.state !== 'ready') return null
		return {
			state: value.state,
			epoch: typeof value.epoch === 'string' ? value.epoch : null,
			role: value.role === 'editor' || value.role === 'commenter' ? value.role : 'viewer',
			readOnly: value.readOnly !== false,
		}
	} catch {
		return null
	}
}

/**
 * Memasang penangan pesan milik kita pada provider. WAJIB: pesan yang tidak
 * dikenal hanya ditulis ke konsol oleh y-websocket, jadi tanpa ini klien
 * tidak pernah tahu bahwa ia diminta menyemai.
 */
export function installCollabHandlers(
	provider: WebsocketProvider,
	onStatus: (status: CollabStatus) => void,
): void {
	provider.messageHandlers[COLLAB_MESSAGE.status] = (_encoder, decoder) => {
		const status = readStatus(decoder)
		if (status) onStatus(status)
	}
	// Server tidak pernah mengirim `seed`; penangan kosong mencegah galat konsol.
	provider.messageHandlers[COLLAB_MESSAGE.seed] = () => {}
}
