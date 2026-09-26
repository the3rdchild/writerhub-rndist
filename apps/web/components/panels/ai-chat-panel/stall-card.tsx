'use client'

import { Play, RotateCw } from 'lucide-react'
import type { ChatStall, ChatTurn } from '@/features/chat/chat-context'
import { type ContinueReason, STALL_TEXT } from '@/features/chat/stall'

/**
 * Tugas yang berhenti sebelum selesai - bukan galat, jadi tidak merah. Ia
 * muncul hanya sesudah lanjutan otomatis habis atau tidak lagi menghasilkan
 * apa-apa; tombolnya meneruskan tugas yang sama, bukan memulai yang baru.
 */
export function StallCard({
	stall,
	onContinue,
	onDismiss,
	disabled,
}: {
	stall: ChatStall
	onContinue: () => void
	onDismiss: () => void
	disabled: boolean
}) {
	const text = STALL_TEXT[stall.reason]
	const filled = stall.total - stall.empty.length

	return (
		<div className="rounded-xl border border-accent/25 bg-accent/5 px-3 py-2.5 text-xs">
			<p className="text-foreground">{text.title}</p>
			{text.hint && <p className="mt-1 text-muted">{text.hint}</p>}
			{stall.total > 0 && (
				<p className="mt-1 text-muted">
					{filled} dari {stall.total} bagian sudah berisi
					{stall.empty.length > 0 && stall.empty.length <= 4 && (
						<span className="text-subtle"> · kosong: {stall.empty.join(', ')}</span>
					)}
				</p>
			)}

			<div className="mt-2 flex flex-wrap items-center gap-2">
				<button
					type="button"
					onClick={onContinue}
					disabled={disabled}
					className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1 font-medium text-foreground transition-colors hover:border-accent/60 disabled:opacity-50"
				>
					{stall.reason === 'empty' ? <RotateCw className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
					Lanjutkan
				</button>
				<button
					type="button"
					onClick={onDismiss}
					className="rounded-lg px-2 py-1 text-subtle transition-colors hover:text-foreground"
				>
					Cukup
				</button>

				{stall.autoContinues > 0 && (
					<span className="text-[11px] text-faint">
						Sudah dilanjutkan otomatis {stall.autoContinues} kali.
					</span>
				)}
			</div>
		</div>
	)
}

const MARKER: Record<ContinueReason, string> = {
	wave_limit: 'jeda suntingan',
	promised: 'AI sempat berhenti',
	truncated: 'jawaban terpotong',
	stopped: 'setelah dihentikan',
	incomplete: 'bagian yang masih kosong',
}

/** Dorongan `[Continue]` di percakapan: penanda kecil, bukan gelembung pesan penulis. */
export function ContinueMarker({ continuation }: { continuation: NonNullable<ChatTurn['continuation']> }) {
	const reason = MARKER[continuation.reason]
	return (
		<div className="flex items-center gap-2 py-0.5 text-[11px] text-subtle" role="note">
			<span className="h-px flex-1 bg-foreground/10" />
			<span>
				{continuation.mode === 'auto' ? 'Dilanjutkan otomatis' : 'Dilanjutkan'}
				<span className="text-faint"> · {reason}</span>
			</span>
			<span className="h-px flex-1 bg-foreground/10" />
		</div>
	)
}
