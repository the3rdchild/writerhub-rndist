import { AppError } from '@/lib/error'
import { findTemplateBySlug, findTemplates } from '@/repository/template'
import BaseService from '@/services/base.service'
import { toTemplate } from './dto'

export default class TemplatesService extends BaseService {
	async list(): Promise<Response> {
		try {
			const category = this.context.req.query('category') || undefined
			const rows = await findTemplates(category)
			return this.success({ data: rows.map(toTemplate) })
		} catch (error) {
			return this.failFromError(error)
		}
	}

	async getBySlug(): Promise<Response> {
		try {
			const slug = this.context.req.param('slug')
			if (!slug) throw AppError.badRequest('Slug template tidak ada')

			const row = await findTemplateBySlug(slug)
			if (!row) throw AppError.notFound('Template tidak ditemukan')

			return this.success({ data: toTemplate(row) })
		} catch (error) {
			return this.failFromError(error)
		}
	}
}
