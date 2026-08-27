import { randomUUID } from 'node:crypto'
import type { ResearchResultPayload } from '@writer-hub/shared'
import db from '@/db'
import { metadataVersion, poolRequest } from '@/db/schemas'

/**
 * Mencatat satu riset web ke riwayat supaya muncul di halaman Aktivitas.
 *
 * Riset bukan job antrean: ia sudah selesai saat dicatat, dan tidak
 * menghasilkan versi dokumen - karena itu `version_id` dibiarkan NULL
 * (lihat migrasi 0022).
 */
export async function recordResearchActivity(input: {
	userId: string | null
	tabId: string | null
	result: ResearchResultPayload
}): Promise<void> {
	const jobId = `research_${randomUUID()}`

	await db.transaction(async (tx) => {
		const [request] = await tx
			.insert(poolRequest)
			.values({
				job_id: jobId,
				status: 'completed',
				feature: 'research',
				user_id: input.userId,
				tab_id: input.tabId,
				total_tokens: input.result.credits,
				params: { query: input.result.query, topic: input.result.topic },
			})
			.returning()

		await tx.insert(metadataVersion).values({
			job_id: jobId,
			request_id: request.id,
			version_id: null,
			feature: 'research',
			result: input.result as unknown as Record<string, unknown>,
		})
	})
}
