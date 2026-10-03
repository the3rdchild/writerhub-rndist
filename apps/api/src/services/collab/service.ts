import type { CollabRole, CollabTicket } from '@writer-hub/shared'
import { collabCanWrite } from '@writer-hub/shared'
import { and, eq } from 'drizzle-orm'
import { collabTicketSigner, publicCollabWsUrl } from '@/collab/settings'
import { findCollabEpoch } from '@/collab/store'
import type { CollabClaims } from '@/collab/ticket'
import { env, isLocalAuth } from '@/config/env'
import { documentTabs, shares } from '@/db/schemas'
import { AppError } from '@/lib/error'
import { getExtendedUserPackage } from '@/lib/pp-backend-client'
import { findTabById } from '@/repository/document-tab'
import BaseService from '@/services/base.service'
import { issueTicketBodySchema } from './dto'

/**
 * Penerbitan tiket websocket kolaborasi (lihat `collab/ticket.ts`).
 *
 * Dua jalur, sama seperti share: pemilik lewat sesi (`POST /collab/tickets`,
 * di belakang authMiddleware), dan pemegang tautan berbagi lewat tokennya
 * (`POST /collab/shared/:token/tickets`, tanpa sesi - tokennya yang menjadi
 * izin, dan perannya mengikuti tautan itu).
 */
export default class CollabService extends BaseService {
	async issue(): Promise<Response> {
		try {
			const signer = this.signer()
			const body = issueTicketBodySchema.safeParse(await this.context.req.json().catch(() => null))
			if (!body.success) {
				return this.error({ errors: body.error.issues.map((issue) => issue.message) })
			}

			const identityId = await this.identityId()
			const tab = await findTabById(body.data.tabId, identityId)
			if (!tab) throw AppError.notFound('Tab not found')

			const userId = this.context.get('userId') ?? null
			const ticket = await this.ticket(signer, {
				tab: tab.id,
				doc: tab.document_id,
				sub: identityId,
				uid: userId,
				name: await this.displayName(userId),
				role: 'editor',
			})
			return this.success({ data: ticket })
		} catch (error) {
			return this.failFromError(error)
		}
	}

	async issueShared(): Promise<Response> {
		try {
			const signer = this.signer()
			const token = this.context.req.param('token')
			if (!token) throw AppError.badRequest('Share token is missing')
			const body = issueTicketBodySchema.safeParse(await this.context.req.json().catch(() => null))
			if (!body.success) {
				return this.error({ errors: body.error.issues.map((issue) => issue.message) })
			}

			const [share] = await this.db
				.select({ id: shares.id, documentId: shares.document_id, access: shares.access, role: shares.role })
				.from(shares)
				.where(eq(shares.token, token))
				.limit(1)
			if (!share?.documentId) throw AppError.notFound('Share link not found')
			// Sama dengan `GET /shares/:token`: rute ini tanpa sesi, jadi tautan
			// terbatas tidak pernah bisa dibuka lewat sini.
			if (share.access === 'restricted' && !this.context.get('userId')) {
				throw AppError.forbidden('This document is restricted - please sign in first')
			}

			const [tab] = await this.db
				.select({ id: documentTabs.id, documentId: documentTabs.document_id })
				.from(documentTabs)
				.where(and(eq(documentTabs.id, body.data.tabId), eq(documentTabs.document_id, share.documentId)))
				.limit(1)
			if (!tab) throw AppError.notFound('Tab not found')

			const ticket = await this.ticket(signer, {
				tab: tab.id,
				doc: tab.documentId,
				sub: `share:${share.id}`,
				uid: null,
				name: 'Guest',
				role: share.role,
				acc: share.access,
			})
			return this.success({ data: ticket })
		} catch (error) {
			return this.failFromError(error)
		}
	}

	private signer() {
		const signer = collabTicketSigner()
		if (!signer) throw new AppError(503, 'Real-time collaboration is not configured (COLLAB_TICKET_SECRET)')
		return signer
	}

	private async ticket(
		signer: NonNullable<ReturnType<typeof collabTicketSigner>>,
		claims: Omit<CollabClaims, 'v' | 'exp'> & { role: CollabRole },
	): Promise<CollabTicket> {
		const { ticket, exp } = signer.sign(claims, env.COLLAB_TICKET_TTL_S)
		return {
			ticket,
			expiresAt: exp * 1000,
			tabId: claims.tab,
			documentId: claims.doc,
			role: claims.role,
			readOnly: !collabCanWrite(claims.role),
			epoch: await findCollabEpoch(claims.tab),
			wsUrl: publicCollabWsUrl(),
			user: { id: claims.sub, name: claims.name },
		}
	}

	/** Nama yang dilihat kolaborator; dari paket pp-backend (sudah tersimpan di cache auth). */
	private async displayName(userId: string | null): Promise<string> {
		if (isLocalAuth) return userId ?? 'Local user'
		const token = this.context.get('bearerToken')
		if (token) {
			const pkg = await getExtendedUserPackage(token).catch(() => null)
			const name = pkg?.username?.trim()
			if (name) return name
		}
		return userId ?? 'Guest'
	}
}
