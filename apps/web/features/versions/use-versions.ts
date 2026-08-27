import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getVersion, listVersions } from './api'
import { getLocalVersion, listLocalVersions } from './local-store'

export const VERSIONS_QUERY_KEY = ['versions'] as const

export interface VersionSource {
	tabId: string
	serverTabId: string | null
}

function sourceKey(source: VersionSource): readonly unknown[] {
	return source.serverTabId
		? [...VERSIONS_QUERY_KEY, source.serverTabId]
		: [...VERSIONS_QUERY_KEY, 'local', source.tabId]
}

export function useVersions(source: VersionSource | null) {
	return useQuery({
		queryKey: source ? sourceKey(source) : VERSIONS_QUERY_KEY,
		queryFn: () => {
			if (!source) throw new Error('useVersions dipanggil tanpa sumber')
			return source.serverTabId ? listVersions(source.serverTabId) : listLocalVersions(source.tabId)
		},
		enabled: source !== null,
		staleTime: 0,
	})
}

export function useVersion(source: VersionSource | null, versionId: string | null) {
	return useQuery({
		queryKey: source ? [...sourceKey(source), versionId] : VERSIONS_QUERY_KEY,
		queryFn: async () => {
			if (!source || !versionId) throw new Error('useVersion dipanggil tanpa sumber/versi')
			return source.serverTabId
				? getVersion(source.serverTabId, versionId)
				: getLocalVersion(source.tabId, versionId)
		},
		enabled: source !== null && versionId !== null,
		staleTime: Number.POSITIVE_INFINITY,
	})
}

export function useInvalidateVersions() {
	const queryClient = useQueryClient()
	return (source: VersionSource) => queryClient.invalidateQueries({ queryKey: sourceKey(source) })
}
