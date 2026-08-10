import { createRouter } from '@/lib/create-app'
import { authMiddleware } from '@/middlewares/auth'
import TabsService from '@/services/tabs/service'
import VersionsService from '@/services/versions/service'

const tabs = createRouter().basePath('/tabs')

// Operasi atas satu tab: autosave naskah (`PUT /:tabId`, pengganti
// `PUT /documents/:id` lama) serta riwayat versi yang memang per tab.
// Kepemilikan diverifikasi lewat dokumen induknya di dalam service.
tabs.get('/:tabId', authMiddleware, (c) => new TabsService(c).getById())
tabs.put('/:tabId', authMiddleware, (c) => new TabsService(c).update())
tabs.delete('/:tabId', authMiddleware, (c) => new TabsService(c).remove())

// Riwayat versi tab (sub-path `/:tabId/versions`, tidak bentrok dengan
// `/:tabId` karena Hono mencocokkan segmen path secara lengkap).
tabs.get('/:tabId/versions', authMiddleware, (c) => new VersionsService(c).list())
tabs.get('/:tabId/versions/:versionId', authMiddleware, (c) => new VersionsService(c).getById())
tabs.post('/:tabId/versions', authMiddleware, (c) => new VersionsService(c).create())
tabs.post('/:tabId/versions/:versionId/restore', authMiddleware, (c) =>
	new VersionsService(c).restore(),
)

export default tabs
