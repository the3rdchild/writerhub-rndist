import type { Redis } from 'ioredis'
import { RedisClient } from '@/config/redis'
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
		}
	}
}
