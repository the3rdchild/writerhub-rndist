import { Cloud, CloudAlert, CloudUpload, HardDrive, Loader2 } from 'lucide-react'
import type { SyncStatus } from '@/features/sync/sync-context'
import { cn } from '@/lib/utils'

/**
 * Satu lencana per keadaan sinkronisasi. Sebelumnya ini rangkaian lima blok
 * `if` yang mengembalikan JSX nyaris identik; sebagai tabel, keadaan yang
 * belum tertangani langsung ketahuan lewat typechecker.
 */
const BADGES: Record<SyncStatus, { title: string; className: string; Icon: typeof Cloud }> = {
	saving: { title: 'Saving to the cloud…', className: 'text-subtle', Icon: Loader2 },
	error: { title: 'Could not save to the cloud', className: 'text-red-400', Icon: CloudAlert },
	'too-large': {
		title: 'Too large to save to the cloud. Shrink or remove some images.',
		className: 'text-red-400',
		Icon: CloudAlert,
	},
	synced: { title: 'Saved to the cloud', className: 'text-subtle', Icon: Cloud },
	dirty: {
		title: 'Changes not yet saved to the cloud',
		className: 'text-subtle',
		Icon: CloudUpload,
	},
	/*
	 * Cakram, bukan awan dicoret: pada 14 px CloudOff terbaca sebagai "mata
	 * dicoret" dan disangka tombol sembunyikan tab (uji editor 2 Okt, SHL-18).
	 */
	local: { title: 'Saved only in this browser', className: 'text-faint', Icon: HardDrive },
}

export function SyncBadge({ status }: { status: SyncStatus }) {
	const { title, className, Icon } = BADGES[status]

	return (
		<span title={title} role="img" aria-label={title} className={cn('flex shrink-0 items-center', className)}>
			<Icon aria-hidden className={cn('h-3.5 w-3.5', status === 'saving' && 'animate-spin')} />
		</span>
	)
}
