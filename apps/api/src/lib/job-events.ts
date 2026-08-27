import type { Redis } from 'ioredis'
import { RedisClient } from '@/config/redis'

/**
 * Kanal pub/sub tempat status job dipublikasikan untuk SSE - harus sama
 * persis dengan `stream_channel` di `services/worker/core/queue/keys.py`.
 * Nama "grammar:stream" dipertahankan apa adanya untuk job analysis juga -
 * mengubahnya butuh perubahan serentak di kedua sisi.
 */
export function jobChannel(jobId: string): string {
	return `grammar:stream:${jobId}`
}

/**
 * Bendera pembatalan kooperatif yang dibaca worker di titik periksa - harus
 * sama persis dengan `_flag_key` di `services/worker/core/cancel.py`.
 */
export function cancelFlagKey(jobId: string): string {
	return `job:${jobId}:cancel`
}

export interface JobEvent {
	type: 'checkpoint' | 'done' | 'error' | 'timeout' | 'cancelled'
	[key: string]: unknown
}

export function isTerminalEvent(event: { type?: string }): boolean {
	return event.type === 'done' || event.type === 'error' || event.type === 'cancelled'
}

export async function subscribeToJob(jobId: string, onMessage: (raw: string) => void): Promise<() => void> {
	const subscriber: Redis = RedisClient.getInstance().duplicate()
	const channel = jobChannel(jobId)

	await subscriber.subscribe(channel)
	subscriber.on('message', (_channel, raw: string) => onMessage(raw))

	return () => {
		try {
			subscriber.disconnect()
		} catch {}
	}
}
