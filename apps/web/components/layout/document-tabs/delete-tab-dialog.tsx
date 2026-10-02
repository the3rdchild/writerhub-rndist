'use client'

import { useCallback } from 'react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { sessionLabel, useSessions } from '@/features/sessions/session-context'
import { useSettings } from '@/features/settings/settings-context'

/**
 * Satu-satunya pintu menghapus tab: menu ⋮ di sidebar, File › Hapus tab ini,
 * dan Ctrl+Alt+W semuanya hanya MEMINTA lewat `setPendingTabDelete`.
 *
 * Dulu menu File dan pintasannya langsung memanggil `deleteSession` - tanpa
 * konfirmasi, tanpa jalan kembali, dan pada tab tunggal seluruh dokumen ikut
 * lenyap (uji editor 2 Okt, SHL-3). Dipasang di AppShell, bukan di sidebar,
 * supaya tetap muncul walau panel tab sedang disembunyikan.
 */
export function DeleteTabDialog() {
	const { pendingTabDelete, setPendingTabDelete } = useSettings()
	const { sessions, deleteSession } = useSessions()
	const tab = sessions.find((session) => session.id === pendingTabDelete) ?? null

	const cancel = useCallback(() => setPendingTabDelete(null), [setPendingTabDelete])
	const confirm = () => {
		if (tab) deleteSession(tab.id)
		setPendingTabDelete(null)
	}

	return (
		<ConfirmDialog
			open={tab !== null}
			danger
			title="Hapus tab ini?"
			description={
				<>
					Naskah <strong className="text-foreground">{tab && sessionLabel(tab)}</strong> ikut terhapus,
					termasuk komentar di dalamnya. Tidak ada jalan kembali.
				</>
			}
			confirmLabel="Hapus"
			onConfirm={confirm}
			onCancel={cancel}
		/>
	)
}
