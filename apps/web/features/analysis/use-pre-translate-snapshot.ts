'use client'

import { useCallback, useRef } from 'react'
import { useSessions } from '@/features/sessions/session-context'
import { useSync } from '@/features/sync/sync-context'
import { createVersion } from '@/features/versions/api'

/**
 * Titik pulih otomatis sebelum terjemahan menimpa naskah.
 *
 * Menerjemahkan mengganti banyak kalimat sekaligus, dan satu versi bernama
 * jelas jauh lebih berguna daripada menekan Ctrl+Z belasan kali - apalagi
 * setelah tab ditutup, ketika riwayat undo sudah hilang.
 *
 * Dibuat sekali per rangkaian penerapan: menerima sepuluh segmen satu-satu
 * tidak boleh melahirkan sepuluh versi. Penanda direset saat hasil baru datang.
 *
 * Hanya untuk tab yang sudah tersimpan di cloud - tab lokal belum punya baris
 * di server untuk diversikan. Kegagalannya sengaja tidak menghentikan
 * penerapan: pengguna meminta terjemahan, bukan meminta snapshot, dan menolak
 * menerapkan hanya karena cadangan gagal dibuat akan terasa sewenang-wenang.
 */
export function usePreTranslateSnapshot() {
	const { activeId } = useSessions()
	const { linkage } = useSync()
	const taken = useRef<string | null>(null)

	const reset = useCallback(() => {
		taken.current = null
	}, [])

	const ensureSnapshot = useCallback(() => {
		const tabId = activeId ? linkage[activeId]?.serverId : undefined
		if (!tabId || taken.current === tabId) return

		taken.current = tabId
		void createVersion(tabId, 'Sebelum terjemahan', 'pre_translate').catch(() => {
			// Gagal membuat titik pulih tidak menggagalkan terjemahan; coba lagi
			// pada penerapan berikutnya.
			taken.current = null
		})
	}, [activeId, linkage])

	return { ensureSnapshot, reset }
}
