import { Cloud, CloudAlert, CloudOff, CloudUpload, Loader2 } from 'lucide-react'
import type { SyncStatus } from '@/features/sync/sync-context'
import { cn } from '@/lib/utils'

/**
 * Satu lencana per keadaan sinkronisasi. Sebelumnya ini rangkaian lima blok
 * `if` yang mengembalikan JSX nyaris identik; sebagai tabel, keadaan yang
 * belum tertangani langsung ketahuan lewat typechecker.
 */
const BADGES: Record<SyncStatus, { title: string; className: string; Icon: typeof Cloud }> = {
	saving: { title: 'Menyimpan ke cloud…', className: 'text-subtle', Icon: Loader2 },
	error: { title: 'Gagal menyimpan ke cloud', className: 'text-red-400', Icon: CloudAlert },
	synced: { title: 'Tersimpan di cloud', className: 'text-subtle', Icon: Cloud },
	dirty: {
		title: 'Ada perubahan yang belum tersimpan ke cloud',
		className: 'text-subtle',
		Icon: CloudUpload,
	},
	local: { title: 'Hanya tersimpan lokal di peramban ini', className: 'text-faint', Icon: CloudOff },
}

export function SyncBadge({ status }: { status: SyncStatus }) {
	const { title, className, Icon } = BADGES[status]

	return (
		<span title={title} className={cn('flex shrink-0 items-center', className)}>
			<Icon className={cn('h-3.5 w-3.5', status === 'saving' && 'animate-spin')} />
		</span>
	)
}
