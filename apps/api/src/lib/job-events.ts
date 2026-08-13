import type { Redis } from 'ioredis'
import { RedisClient } from '@/config/redis'

/**
 * Kanal pub/sub tempat worker mengabarkan progres sebuah job.
 * Satu-satunya tempat nama kanal ini didefinisikan - dipakai SSE stream
 * dan pencatatan token usage.
 */
export function jobChannel(jobId: string): string {
	return `grammar:stream:${jobId}`
}

export interface JobEvent {
	type: 'checkpoint' | 'done' | 'error' | 'timeout' | 'cancelled'
	[key: string]: unknown
}

export function isTerminalEvent(event: { type?: string }): boolean {
	return event.type === 'done' || event.type === 'error' || event.type === 'cancelled'
}

/**
 * Berlangganan event sebuah job pada koneksi Redis terpisah.
 *
 * Koneksi khusus itu wajib: begitu sebuah klien ioredis masuk mode subscribe,
 * ia tidak bisa lagi melayani perintah biasa, jadi instance bersama tidak
 * boleh dipakai. Fungsi mengembalikan cleanup yang menutup koneksi tersebut.
 */
export async function subscribeToJob(
	jobId: string,
	onMessage: (raw: string) => void,
): Promise<() => void> {
	const subscriber: Redis = RedisClient.getInstance().duplicate()
	const channel = jobChannel(jobId)

	await subscriber.subscribe(channel)
	subscriber.on('message', (_channel, raw: string) => onMessage(raw))

	return () => {
		try {
			subscriber.disconnect()
		} catch {
			// koneksi sudah tertutup - tidak ada yang perlu dibereskan
		}
	}
}
