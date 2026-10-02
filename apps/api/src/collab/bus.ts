import { randomUUID } from 'node:crypto'
import type { Redis } from 'ioredis'
import { env } from '@/config/env'
import { RedisClient } from '@/config/redis'
import LoggerClient from '@/lib/logger'
import { type BusMessage, decodeBusMessage, encodeBusMessage } from './protocol'

const log = LoggerClient.getInstance()

type BusHandler = (message: BusMessage) => void
type OutgoingBusMessage = BusMessage extends infer M
	? M extends BusMessage
		? Omit<M, 'origin'>
		: never
	: never

/** Lepas kunci hanya bila masih milik pemegangnya - jangan menghapus kunci penyemai lain yang sudah menggantikan. */
const RELEASE_LOCK = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`

/**
 * Jalur antar-instance (proses API dan replika) lewat Redis pub/sub, satu
 * kanal per room. Tidak perlu sticky session: setiap instance yang memegang
 * room menerima pembaruan instance lain dan meneruskannya ke kliennya sendiri.
 *
 * Pub/sub bersifat paling-banyak-sekali. Yang menutup celahnya: pembaruan
 * diterbitkan SETELAH tercatat di Postgres (room yang baru dimuat berlangganan
 * dulu, baru membaca log - jadi tidak ada yang jatuh di antaranya), ioredis
 * mengantre perintah selama sambungan putus, dan setelah langganan tersambung
 * ulang setiap room mengejar dari log (`onReconnect`).
 */
export class CollabBus {
	readonly instanceId = randomUUID()
	private subscriber: Redis | null = null
	private readonly handlers = new Map<string, Set<BusHandler>>()
	/** Dipanggil setelah sambungan langganan pulih; pesan selama putus mungkin hilang. */
	onReconnect: (() => void) | null = null

	constructor(
		private readonly publisher: Redis,
		private readonly prefix: string,
	) {}

	private channel(tabId: string): string {
		return `${this.prefix}room:${tabId}`
	}

	private lockKey(tabId: string): string {
		return `${this.prefix}seed:${tabId}`
	}

	private ensureSubscriber(): Redis {
		if (this.subscriber) return this.subscriber
		const subscriber = this.publisher.duplicate()
		let connectedOnce = false
		subscriber.on('ready', () => {
			if (connectedOnce) this.onReconnect?.()
			connectedOnce = true
		})
		subscriber.on('error', (error) => log.warn({ err: error }, '[collab] Redis langganan bermasalah'))
		subscriber.on('messageBuffer', (channel: Buffer, payload: Buffer) => {
			const handlers = this.handlers.get(channel.toString())
			if (!handlers || handlers.size === 0) return
			const message = decodeBusMessage(payload)
			if (!message || message.origin === this.instanceId) return
			for (const handler of handlers) {
				try {
					handler(message)
				} catch (error) {
					log.error({ err: error }, '[collab] penangan pesan antar-instance gagal')
				}
			}
		})
		this.subscriber = subscriber
		return subscriber
	}

	/** Selesai setelah Redis mengonfirmasi langganan - baru setelah itu room membaca log. */
	async subscribe(tabId: string, handler: BusHandler): Promise<void> {
		const channel = this.channel(tabId)
		let set = this.handlers.get(channel)
		if (!set) {
			set = new Set()
			this.handlers.set(channel, set)
		}
		set.add(handler)
		await this.ensureSubscriber().subscribe(channel)
	}

	async unsubscribe(tabId: string, handler: BusHandler): Promise<void> {
		const channel = this.channel(tabId)
		const set = this.handlers.get(channel)
		if (!set) return
		set.delete(handler)
		if (set.size > 0) return
		this.handlers.delete(channel)
		await this.subscriber?.unsubscribe(channel).catch(() => {})
	}

	/**
	 * Tidak ditunggu oleh pemanggil yang sedang menyimpan: saat Redis putus,
	 * ioredis mengantre perintahnya dan janjinya baru selesai setelah pulih.
	 */
	publish(tabId: string, message: OutgoingBusMessage): Promise<void> {
		const payload = encodeBusMessage({ ...message, origin: this.instanceId } as BusMessage)
		return this.publisher
			.publish(this.channel(tabId), Buffer.from(payload.buffer, payload.byteOffset, payload.byteLength))
			.then(() => undefined)
			.catch((error: unknown) => log.warn({ err: error, tabId }, '[collab] gagal menerbitkan ke Redis'))
	}

	async acquireSeedLock(tabId: string, holder: string, ttlMs: number): Promise<boolean> {
		const result = await this.publisher.set(this.lockKey(tabId), holder, 'PX', ttlMs, 'NX')
		return result === 'OK'
	}

	async releaseSeedLock(tabId: string, holder: string): Promise<void> {
		await this.publisher.eval(RELEASE_LOCK, 1, this.lockKey(tabId), holder).catch(() => {})
	}

	async close(): Promise<void> {
		this.handlers.clear()
		const subscriber = this.subscriber
		this.subscriber = null
		if (subscriber) await subscriber.quit().catch(() => subscriber.disconnect())
	}
}

let shared: CollabBus | null = null

/** Satu bus per proses; dibuat saat pertama dipakai supaya impor modul ini tidak membuka sambungan. */
export function getCollabBus(): CollabBus {
	if (!shared) shared = new CollabBus(RedisClient.getInstance(), env.COLLAB_REDIS_PREFIX)
	return shared
}

export async function closeCollabBus(): Promise<void> {
	const bus = shared
	shared = null
	await bus?.close()
}
