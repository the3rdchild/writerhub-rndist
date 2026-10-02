import { COLLAB_MESSAGE, type CollabStatus } from '@writer-hub/shared'
import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import * as syncProtocol from 'y-protocols/sync'
import type * as Y from 'yjs'

/**
 * Pengodean pesan websocket (sisi server). Pesan 0-3 adalah protokol
 * y-websocket apa adanya; `status` dan `seed` milik kita - bentuknya sengaja
 * paling sederhana supaya klien lain mudah mengikutinya:
 *
 *   status: varUint(100) varString(JSON CollabStatus)
 *   seed:   varUint(101) varUint8Array(pembaruan Yjs)
 */

function finish(encoder: encoding.Encoder): Uint8Array {
	return encoding.toUint8Array(encoder)
}

export function encodeStatus(status: CollabStatus): Uint8Array {
	const encoder = encoding.createEncoder()
	encoding.writeVarUint(encoder, COLLAB_MESSAGE.status)
	encoding.writeVarString(encoder, JSON.stringify(status))
	return finish(encoder)
}

export function encodeSeed(update: Uint8Array): Uint8Array {
	const encoder = encoding.createEncoder()
	encoding.writeVarUint(encoder, COLLAB_MESSAGE.seed)
	encoding.writeVarUint8Array(encoder, update)
	return finish(encoder)
}

/** Sync step 1 milik server: "ini yang sudah kupunya, kirim sisanya". */
export function encodeSyncStep1(doc: Y.Doc): Uint8Array {
	const encoder = encoding.createEncoder()
	encoding.writeVarUint(encoder, COLLAB_MESSAGE.sync)
	syncProtocol.writeSyncStep1(encoder, doc)
	return finish(encoder)
}

/** Sync step 2: isi yang belum dimiliki pemegang `stateVector` (kosong = seluruh state). */
export function encodeSyncStep2(doc: Y.Doc, stateVector?: Uint8Array): Uint8Array {
	const encoder = encoding.createEncoder()
	encoding.writeVarUint(encoder, COLLAB_MESSAGE.sync)
	syncProtocol.writeSyncStep2(encoder, doc, stateVector)
	return finish(encoder)
}

export function encodeSyncUpdate(update: Uint8Array): Uint8Array {
	const encoder = encoding.createEncoder()
	encoding.writeVarUint(encoder, COLLAB_MESSAGE.sync)
	syncProtocol.writeUpdate(encoder, update)
	return finish(encoder)
}

export function encodeAwareness(update: Uint8Array): Uint8Array {
	const encoder = encoding.createEncoder()
	encoding.writeVarUint(encoder, COLLAB_MESSAGE.awareness)
	encoding.writeVarUint8Array(encoder, update)
	return finish(encoder)
}

/** Pesan masuk dari klien, sudah diurai seperlunya. */
export type ClientMessage =
	| { kind: 'sync-step1'; stateVector: Uint8Array }
	| { kind: 'sync-update'; update: Uint8Array }
	| { kind: 'awareness'; update: Uint8Array }
	| { kind: 'query-awareness' }
	| { kind: 'seed'; update: Uint8Array }
	| { kind: 'ignored'; type: number }

/** Melempar bila pesannya rusak; pemanggil menutup sambungannya. */
export function decodeClientMessage(data: Uint8Array): ClientMessage {
	const decoder = decoding.createDecoder(data)
	const type = decoding.readVarUint(decoder)
	switch (type) {
		case COLLAB_MESSAGE.sync: {
			const syncType = decoding.readVarUint(decoder)
			if (syncType === syncProtocol.messageYjsSyncStep1) {
				return { kind: 'sync-step1', stateVector: decoding.readVarUint8Array(decoder) }
			}
			if (syncType === syncProtocol.messageYjsSyncStep2 || syncType === syncProtocol.messageYjsUpdate) {
				return { kind: 'sync-update', update: decoding.readVarUint8Array(decoder) }
			}
			throw new Error(`unknown sync message ${syncType}`)
		}
		case COLLAB_MESSAGE.awareness:
			return { kind: 'awareness', update: decoding.readVarUint8Array(decoder) }
		case COLLAB_MESSAGE.queryAwareness:
			return { kind: 'query-awareness' }
		case COLLAB_MESSAGE.seed:
			return { kind: 'seed', update: decoding.readVarUint8Array(decoder) }
		default:
			// `auth` dan tipe yang belum dikenal: diabaikan, bukan alasan memutus.
			return { kind: 'ignored', type }
	}
}

// ── Pesan antar-instance lewat Redis pub/sub ───────────────────────────────

export const BUS_KIND = {
	update: 1,
	awareness: 2,
	seeded: 3,
	reset: 4,
	gone: 5,
	queryAwareness: 6,
	updateRef: 7,
	seededRef: 8,
} as const

/*
 * Pembaruan besar (gambar base64 yang ditempel, semaian naskah panjang) tidak
 * dikirim lewat pub/sub, cukup rujukannya: Redis memutus pelanggan yang
 * antrean keluarannya melewati `client-output-buffer-limit pubsub` (bawaan
 * 32 MB). Penerima mengambil barisnya sendiri dari log.
 */
export type BusMessage =
	| { kind: 'update'; origin: string; epoch: string; update: Uint8Array }
	| { kind: 'update-ref'; origin: string; epoch: string; id: number }
	| { kind: 'awareness'; origin: string; update: Uint8Array }
	| { kind: 'seeded'; origin: string; epoch: string; update: Uint8Array }
	| { kind: 'seeded-ref'; origin: string; epoch: string }
	| { kind: 'reset'; origin: string }
	| { kind: 'gone'; origin: string }
	| { kind: 'query-awareness'; origin: string }

const KIND_CODE: Record<BusMessage['kind'], number> = {
	update: BUS_KIND.update,
	'update-ref': BUS_KIND.updateRef,
	awareness: BUS_KIND.awareness,
	seeded: BUS_KIND.seeded,
	'seeded-ref': BUS_KIND.seededRef,
	reset: BUS_KIND.reset,
	gone: BUS_KIND.gone,
	'query-awareness': BUS_KIND.queryAwareness,
}

export function encodeBusMessage(message: BusMessage): Uint8Array {
	const encoder = encoding.createEncoder()
	encoding.writeVarUint(encoder, KIND_CODE[message.kind])
	encoding.writeVarString(encoder, message.origin)
	switch (message.kind) {
		case 'update':
		case 'seeded':
			encoding.writeVarString(encoder, message.epoch)
			encoding.writeVarUint8Array(encoder, message.update)
			break
		case 'update-ref':
			encoding.writeVarString(encoder, message.epoch)
			// Sebagai teks: id bigserial bisa melewati 2^31.
			encoding.writeVarString(encoder, String(message.id))
			break
		case 'seeded-ref':
			encoding.writeVarString(encoder, message.epoch)
			break
		case 'awareness':
			encoding.writeVarUint8Array(encoder, message.update)
			break
		default:
			break
	}
	return finish(encoder)
}

export function decodeBusMessage(data: Uint8Array): BusMessage | null {
	try {
		const decoder = decoding.createDecoder(data)
		const kind = decoding.readVarUint(decoder)
		const origin = decoding.readVarString(decoder)
		switch (kind) {
			case BUS_KIND.update:
				return {
					kind: 'update',
					origin,
					epoch: decoding.readVarString(decoder),
					update: decoding.readVarUint8Array(decoder),
				}
			case BUS_KIND.seeded:
				return {
					kind: 'seeded',
					origin,
					epoch: decoding.readVarString(decoder),
					update: decoding.readVarUint8Array(decoder),
				}
			case BUS_KIND.updateRef: {
				const epoch = decoding.readVarString(decoder)
				const id = Number(decoding.readVarString(decoder))
				return Number.isSafeInteger(id) ? { kind: 'update-ref', origin, epoch, id } : null
			}
			case BUS_KIND.seededRef:
				return { kind: 'seeded-ref', origin, epoch: decoding.readVarString(decoder) }
			case BUS_KIND.awareness:
				return { kind: 'awareness', origin, update: decoding.readVarUint8Array(decoder) }
			case BUS_KIND.reset:
				return { kind: 'reset', origin }
			case BUS_KIND.gone:
				return { kind: 'gone', origin }
			case BUS_KIND.queryAwareness:
				return { kind: 'query-awareness', origin }
			default:
				return null
		}
	} catch {
		return null
	}
}
