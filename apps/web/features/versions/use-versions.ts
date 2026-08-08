import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getVersion, listVersions } from './api'
import { getLocalVersion, listLocalVersions } from './local-store'

export const VERSIONS_QUERY_KEY = ['versions'] as const

/**
 * Sumber lini masa versi (Iterasi 2): `documentId` terisi berarti dokumen
 * cloud (API server), `null` berarti tab lokal (IndexedDB `local-store`).
 * Bentuknya sengaja irisan dari `VersionMode` di version-context supaya mode
 * yang sedang terbuka bisa disodorkan apa adanya.
 */
export interface VersionSource {
	tabId: string
	documentId: string | null
}

/**
 * Kunci query per sumber. Pola server tidak berubah (`['versions', docId]`);
 * lokal memakai `['versions', 'local', tabId]` supaya invalidasi dari
 * Ctrl+S/snapshot interval/restore mengenai daftar dan detail sekaligus.
 */
function sourceKey(source: VersionSource): readonly unknown[] {
	return source.documentId
		? [...VERSIONS_QUERY_KEY, source.documentId]
		: [...VERSIONS_QUERY_KEY, 'local', source.tabId]
}

/** Lini masa versi satu sumber; hanya dijalankan selama mode riwayat terbuka. */
export function useVersions(source: VersionSource | null) {
	return useQuery({
		queryKey: source ? sourceKey(source) : VERSIONS_QUERY_KEY,
		queryFn: () => {
			if (!source) throw new Error('useVersions dipanggil tanpa sumber')
			return source.documentId ? listVersions(source.documentId) : listLocalVersions(source.tabId)
		},
		enabled: source !== null,
		// Versi interval bisa tercipta kapan saja lewat autosave; tidak boleh abadi.
		staleTime: 0,
	})
}

/** Naskah satu versi untuk pratinjau; `null` berarti "Versi saat ini" terpilih. */
export function useVersion(source: VersionSource | null, versionId: string | null) {
	return useQuery({
		queryKey: source ? [...sourceKey(source), versionId] : VERSIONS_QUERY_KEY,
		queryFn: async () => {
			if (!source || !versionId) throw new Error('useVersion dipanggil tanpa sumber/versi')
			return source.documentId
				? getVersion(source.documentId, versionId)
				: getLocalVersion(source.tabId, versionId)
		},
		enabled: source !== null && versionId !== null,
		// Naskah versi immutable; cukup diambil sekali.
		staleTime: Number.POSITIVE_INFINITY,
	})
}

/**
 * Segarkan lini masa setelah mutasi (create manual / restore).
 * Pola yang sama dengan `useInvalidateDocuments`: titik mutasinya tersebar dan
 * yang penting hanya cache-nya ikut ditarik. Kunci detail versi ikut terkena
 * karena ia berawalan kunci daftar.
 */
export function useInvalidateVersions() {
	const queryClient = useQueryClient()
	return (source: VersionSource) => queryClient.invalidateQueries({ queryKey: sourceKey(source) })
}
