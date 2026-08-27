export interface TitleSide {
	title: string
	titleUpdatedAt: number
}

export type TitleResolution = 'adopt-server' | 'push-local' | 'none'

export function resolveTitle(local: TitleSide, server: TitleSide, base: string | undefined): TitleResolution {
	if (local.title === server.title) return 'none'

	const localMoved = base === undefined || local.title !== base
	const serverMoved = base === undefined || server.title !== base

	if (serverMoved && !localMoved) return 'adopt-server'
	if (localMoved && !serverMoved) return 'push-local'

	return server.titleUpdatedAt > local.titleUpdatedAt ? 'adopt-server' : 'push-local'
}
