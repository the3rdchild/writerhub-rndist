import { AppError } from '@/lib/error'
import { findMemoryByOwner, upsertMemory } from '@/repository/memory'
import BaseService from '@/services/base.service'
import { memoryPreferencesSchema } from './dto'
export default class MemoryService extends BaseService {
	async get(): Promise<Response> {
		try {
			const row = await findMemoryByOwner(await this.identityId())
			return this.success({ data: row?.preferences ?? {} })
		} catch (error) {
			return this.failFromError(error)
		}
	}
	async put(): Promise<Response> {
		try {
			const body = memoryPreferencesSchema.safeParse(
				await this.context.req.json().catch(() => ({})),
			)
			if (!body.success) {
				return this.error({ errors: body.error.issues.map((issue) => issue.message) })
			}

			const row = await upsertMemory(await this.identityId(), body.data)
			if (!row) throw AppError.internalServerError('Gagal menyimpan AI Memory')

			return this.success({ data: row.preferences })
		} catch (error) {
			return this.failFromError(error)
		}
	}
}
