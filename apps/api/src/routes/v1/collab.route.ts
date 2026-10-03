import { upgradeCollabSocket } from '@/collab/server'
import { env } from '@/config/env'
import { createRouter } from '@/lib/create-app'
import { authMiddleware } from '@/middlewares/auth'
import { rateLimit } from '@/middlewares/rate-limit'
import CollabService from '@/services/collab/service'

/*
 * Kolaborasi real-time (docs/collab-realtime.md). Dua rute sengaja tanpa
 * authMiddleware, masing-masing dengan izinnya sendiri: tiket lewat tautan
 * berbagi (tokennya izin), dan websocket (tiket bertanda tangan di query -
 * peramban tidak bisa mengirim header tanda tangan server).
 */
const collab = createRouter().basePath('/collab')

// Tanpa sesi, jadi yang dihitung adalah tautannya: satu tautan yang bocor tidak
// bisa dipakai membanjiri penerbitan tiket.
const shareTicketLimit = rateLimit(
	'collab-share-ticket',
	'tiket kolaborasi',
	env.RATE_LIMIT_SHARE_TICKETS_PER_MIN,
	(c) => {
		const token = c.req.param('token')
		return token ? `share:${token}` : null
	},
)

// Per pengguna: klien yang tiketnya terus ditolak tidak membanjiri penerbitan tiket.
const ticketLimit = rateLimit('collab-ticket', 'tiket kolaborasi', env.RATE_LIMIT_COLLAB_TICKETS_PER_MIN)

collab.post('/tickets', authMiddleware, ticketLimit, (c) => new CollabService(c).issue())
collab.post('/shared/:token/tickets', shareTicketLimit, (c) => new CollabService(c).issueShared())
collab.get('/ws/:tabId', (c) => upgradeCollabSocket(c))

export default collab
