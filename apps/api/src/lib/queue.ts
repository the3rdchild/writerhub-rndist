import { Queue } from 'bullmq'
import { env } from '@/config/env'
import { RedisClient } from '@/config/redis'

/**
 * Posisi antrean dari indeks job di list tunggu.
 *
 * BullMQ memasukkan job baru dari kiri (`LPUSH`), dan worker Python
 * mengambilnya dari kanan (`BRPOP`, lihat `services/worker/core/queue/worker.py`).
 * Karena itu elemen paling kanan adalah posisi 1.
 */
export function queuePositionFrom(index: number | null, length: number): number | null {
	if (index === null || index < 0 || index >= length) return null
	return length - index
}

class QueueClient {
	private static instance: Queue | null = null
	private static analysisInstance: Queue | null = null
	private static renderInstance: Queue | null = null

	static getInstance(): Queue {
		if (!QueueClient.instance) {
			QueueClient.instance = new Queue(env.GRAMMAR_QUEUE_NAME ?? 'GRAMMAR_QUEUE', {
				connection: RedisClient.getInstance(),
			})
		}
		return QueueClient.instance
	}

	static getAnalysisInstance(): Queue {
		if (!QueueClient.analysisInstance) {
			QueueClient.analysisInstance = new Queue(env.ANALYSIS_QUEUE_NAME ?? 'ANALYSIS_QUEUE', {
				connection: RedisClient.getInstance(),
			})
		}
		return QueueClient.analysisInstance
	}

	static getRenderInstance(): Queue {
		if (!QueueClient.renderInstance) {
			QueueClient.renderInstance = new Queue(env.RENDER_QUEUE_NAME ?? 'RENDER_QUEUE', {
				connection: RedisClient.getInstance(),
			})
		}
		return QueueClient.renderInstance
	}

	static async enqueueGrammarJob(jobId: string, payload: Record<string, unknown>): Promise<void> {
		await QueueClient.getInstance().add(
			env.GRAMMAR_JOB_NAME ?? 'PROCESS_GRAMMAR',
			{ jobId, payload },
			{
				jobId,
				removeOnComplete: true,
				removeOnFail: true,
			},
		)
	}

	static async enqueueAnalysisJob(jobId: string, payload: Record<string, unknown>): Promise<void> {
		await QueueClient.getAnalysisInstance().add(
			env.ANALYSIS_JOB_NAME ?? 'PROCESS_ANALYSIS',
			{ jobId, payload },
			{
				jobId,
				removeOnComplete: true,
				removeOnFail: true,
			},
		)
	}

	/** jobId = documentId, supaya render terakhir untuk satu dokumen tidak menumpuk. */
	static async enqueueRenderJob(jobId: string, payload: Record<string, unknown>): Promise<void> {
		await QueueClient.getRenderInstance().add(
			env.RENDER_JOB_NAME ?? 'RENDER_DOCUMENT',
			{ jobId, payload },
			{
				jobId,
				removeOnComplete: true,
				removeOnFail: true,
			},
		)
	}

	/**
	 * Kunci Redis List BullMQ tempat job menunggu diambil (BRPOP) - harus sama
	 * persis dengan `wait_key` di `services/worker/core/queue/keys.py`. Python
	 * tidak membaca `packages/shared`, jadi kecocokannya cuma dijaga lewat
	 * konvensi tertulis ini.
	 */
	static waitKey(queueName: string): string {
		return `bull:${queueName}:wait`
	}

	/**
	 * Posisi job render di antrean tunggu; 1 berarti job berikutnya yang akan
	 * diambil worker. null bila job-nya sudah diambil atau tidak ada di
	 * antrean.
	 */
	static async renderQueuePosition(jobId: string): Promise<number | null> {
		const key = QueueClient.waitKey(env.RENDER_QUEUE_NAME)
		const results = await RedisClient.getInstance().multi().lpos(key, jobId).llen(key).exec()
		const index = results?.[0]?.[1]
		const length = results?.[1]?.[1]
		return queuePositionFrom(
			typeof index === 'number' ? index : null,
			typeof length === 'number' ? length : 0,
		)
	}

	/** Hash BullMQ berisi data satu job - pasangan {@link waitKey}. */
	static jobHashKey(queueName: string, jobId: string): string {
		return `bull:${queueName}:${jobId}`
	}

	static async close(): Promise<void> {
		if (QueueClient.instance) {
			await QueueClient.instance.close()
			QueueClient.instance = null
		}
		if (QueueClient.analysisInstance) {
			await QueueClient.analysisInstance.close()
			QueueClient.analysisInstance = null
		}
		if (QueueClient.renderInstance) {
			await QueueClient.renderInstance.close()
			QueueClient.renderInstance = null
		}
	}
}

export default QueueClient
