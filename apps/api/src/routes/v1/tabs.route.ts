import { createRouter } from '@/lib/create-app'
import { authMiddleware } from '@/middlewares/auth'
import TabsService from '@/services/tabs/service'
import VersionsService from '@/services/versions/service'

const tabs = createRouter().basePath('/tabs')
tabs.get('/:tabId', authMiddleware, (c) => new TabsService(c).getById())
tabs.put('/:tabId', authMiddleware, (c) => new TabsService(c).update())
tabs.delete('/:tabId', authMiddleware, (c) => new TabsService(c).remove())
tabs.get('/:tabId/versions', authMiddleware, (c) => new VersionsService(c).list())
tabs.get('/:tabId/versions/:versionId', authMiddleware, (c) => new VersionsService(c).getById())
tabs.post('/:tabId/versions', authMiddleware, (c) => new VersionsService(c).create())
tabs.post('/:tabId/versions/:versionId/restore', authMiddleware, (c) =>
	new VersionsService(c).restore(),
)

export default tabs
