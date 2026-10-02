import { upgradeCollabSocket } from '@/collab/server'
import { createRouter } from '@/lib/create-app'
import { authMiddleware } from '@/middlewares/auth'
import CollabService from '@/services/collab/service'

/*
 * Kolaborasi real-time (docs/collab-realtime.md). Dua rute sengaja tanpa
 * authMiddleware, masing-masing dengan izinnya sendiri: tiket lewat tautan
 * berbagi (tokennya izin), dan websocket (tiket bertanda tangan di query -
 * peramban tidak bisa mengirim header tanda tangan server).
 */
const collab = createRouter().basePath('/collab')
collab.post('/tickets', authMiddleware, (c) => new CollabService(c).issue())
collab.post('/shared/:token/tickets', (c) => new CollabService(c).issueShared())
collab.get('/ws/:tabId', (c) => upgradeCollabSocket(c))

export default collab
