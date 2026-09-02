'use client'

import { RotateCw } from 'lucide-react'
import type { ChatError } from '@/features/chat/chat-context'

/**
 * Giliran yang berhenti, beserta jalan keluarnya.
 *
 * Ia berdiri sendiri dan tidak memakai `PanelError` seperti panel lain, karena
 * ia bukan sekadar kalimat: percakapan yang gagal masih bisa dilanjutkan, dan
 * tombolnya harus berada tepat di tempat kegagalannya terbaca.
 */
export function TurnError({
	error,
	onRetry,
	disabled,
}: {
	error: ChatError
	onRetry: () => void
	disabled: boolean
}) {
	return (
		<div className="rounded-xl bg-red-400/10 px-3 py-2.5">
			<p className="text-xs text-red-400">{error.message}</p>
			{error.hint && <p className="mt-1 text-xs text-muted">{error.hint}</p>}

			<div className="mt-2 flex flex-wrap items-center gap-2">
				<button
					type="button"
					onClick={onRetry}
					disabled={disabled}
					className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:border-accent/60 disabled:opacity-50"
				>
					<RotateCw className="h-3.5 w-3.5" />
					Lanjutkan
				</button>

				{error.autoRetried && (
					<span className="text-[11px] text-faint">Sudah dicoba ulang sekali otomatis.</span>
				)}
			</div>
		</div>
	)
}
