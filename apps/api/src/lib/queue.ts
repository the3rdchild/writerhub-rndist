import { Queue } from 'bullmq'
import { env } from '@/config/env'
import { RedisClient } from '@/config/redis'

class QueueClient {
	private static instance: Queue | null = null
	private static analysisInstance: Queue | null = null

	static getInstance(): Queue {
		if (!QueueClient.instance) {
			QueueClient.instance = new Queue(
				env.GRAMMAR_QUEUE_NAME ?? 'GRAMMAR_QUEUE',
				{ connection: RedisClient.getInstance() },
			)
		}
		return QueueClient.instance
	}

	static getAnalysisInstance(): Queue {
		if (!QueueClient.analysisInstance) {
			QueueClient.analysisInstance = new Queue(
				env.ANALYSIS_QUEUE_NAME ?? 'ANALYSIS_QUEUE',
				{ connection: RedisClient.getInstance() },
			)
		}
		return QueueClient.analysisInstance
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

	static async close(): Promise<void> {
		if (QueueClient.instance) {
			await QueueClient.instance.close()
			QueueClient.instance = null
		}
		if (QueueClient.analysisInstance) {
			await QueueClient.analysisInstance.close()
			QueueClient.analysisInstance = null
		}
	}
}

export default QueueClient
