import { AppError } from '@/lib/error'
import { findMemoryByOwner, upsertMemory } from '@/repository/memory'
import BaseService from '@/services/base.service'
import { memoryPreferencesSchema } from './dto'

/**
 * AI Memory user: preferensi gaya eksplisit yang disuntikkan SERVER ke prompt
 * AI Chat, AI Rewriter, dan Humanizer. Klien hanya membaca/menulis lewat
 * endpoint ini; ia tidak pernah mengirim memory saat memanggil modul AI.
 */
export default class MemoryService extends BaseService {
	/**
	 * Baca memory milik user. Mengembalikan objek kosong - BUKAN 404 - bila
	 * belum pernah diisi, supaya klien tidak perlu membedakan dua keadaan itu.
	 */
	async get(): Promise<Response> {
		try {
			const row = await findMemoryByOwner(this.ownerId())
			return this.success({ data: row?.preferences ?? {} })
		} catch (error) {
			return this.failFromError(error)
		}
	}

	/**
	 * Simpan memory. PUT menimpa SELURUH preferensi (bukan merge per field):
	 * form di Pengaturan selalu mengirim keadaan lengkapnya, dan merge
	 * diam-diam membuat field yang dikosongkan user tidak pernah hilang.
	 */
	async put(): Promise<Response> {
		try {
			const body = memoryPreferencesSchema.safeParse(
				await this.context.req.json().catch(() => ({})),
			)
			if (!body.success) {
				return this.error({ errors: body.error.issues.map((issue) => issue.message) })
			}

			const row = await upsertMemory(this.ownerId(), body.data)
			if (!row) throw AppError.internalServerError('Gagal menyimpan AI Memory')

			return this.success({ data: row.preferences })
		} catch (error) {
			return this.failFromError(error)
		}
	}

	private ownerId(): string {
		const userId = this.context.get('userId')
		if (!userId) throw AppError.unauthorized('User tidak dikenal')
		return userId
	}
}
