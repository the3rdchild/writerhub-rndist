'use client'

import type { DraftErrorCode, DraftPhase } from '@writer-hub/shared'
import { FileText } from 'lucide-react'
import Link from 'next/link'
import { useOpenDraft } from '@/features/drafts/use-open-draft'

/**
 * Halaman antara untuk tautan `/d/<documentId>` yang dibagikan klien eksternal:
 * menunggu drafnya selesai ditulis, lalu melempar penggunanya ke editor.
 *
 * Dua hal yang sengaja tidak disembunyikan dari penunggunya: seberapa jauh
 * naskahnya sudah ditulis, dan - kalau gagal - apa sebabnya beserta apa yang
 * bisa ia lakukan. Layar tunggu yang diam adalah alasan orang menutup tab.
 */

const PHASE_LABEL: Record<DraftPhase, string> = {
	preparing: 'Preparing the AI request…',
	writing: 'Writing the draft…',
	saving: 'Saving the draft to the document…',
}

/**
 * Kalimat yang menjelaskan apa yang terjadi dan apakah mencoba lagi masuk akal.
 * Pesan mentah dari API tetap ditampilkan di bawahnya - ini menerjemahkan, bukan
 * menggantikan.
 */
const ERROR_HINT: Record<DraftErrorCode, string> = {
	provider_unreachable: "The server couldn't reach the AI service. This is usually temporary - try again.",
	provider_rejected: 'The AI service rejected the request. Check the credentials or model in the settings.',
	quota_exceeded: 'Your AI quota is used up. Try again once it renews.',
	timeout: 'Writing stopped before it finished.',
	empty_response: "The AI service didn't return any text.",
	save_failed: "The draft was written but couldn't be saved to the document.",
	unknown: "The draft couldn't be written.",
}

export function DraftOpenView({ documentId }: { documentId: string }) {
	const { phase, title, message, errorCode, progress, canRetry, retrying, retry, openAnyway } =
		useOpenDraft(documentId)

	if (phase === 'error') {
		return (
			<Centered>
				<FileText className="h-12 w-12 text-faint" />
				<h1 className="mt-4 text-lg font-medium text-foreground">
					{title || "The draft can't be opened yet"}
				</h1>
				{errorCode && <p className="mt-1 max-w-md text-sm text-muted">{ERROR_HINT[errorCode]}</p>}
				{message && <p className="mt-2 max-w-md text-xs text-faint">{message}</p>}

				<div className="mt-6 flex flex-wrap items-center justify-center gap-3">
					{canRetry && (
						<button
							type="button"
							onClick={retry}
							disabled={retrying}
							className="rounded-xl bg-accent px-5 py-2 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-60"
						>
							{retrying ? 'Rewriting…' : 'Rewrite the draft'}
						</button>
					)}
					<button
						type="button"
						onClick={openAnyway}
						className="rounded-xl px-5 py-2 text-sm font-medium text-muted transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
					>
						Open the document as is
					</button>
					<Link
						href="/library"
						className="rounded-xl px-5 py-2 text-sm font-medium text-muted transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
					>
						Go to Library
					</Link>
				</div>
			</Centered>
		)
	}

	const percent = phase === 'opening' ? 100 : (progress?.percent ?? 0)

	return (
		<Centered>
			<div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
			<h1 className="mt-4 text-lg font-medium text-foreground">{title || 'Preparing the draft'}</h1>
			<p className="mt-1 text-sm text-muted">
				{phase === 'opening'
					? 'Opening the document in the editor…'
					: PHASE_LABEL[progress?.phase ?? 'preparing']}
			</p>

			<div className="mt-5 w-full max-w-sm">
				<div
					className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--overlay-hover)]"
					role="progressbar"
					aria-valuenow={percent}
					aria-valuemin={0}
					aria-valuemax={100}
					aria-label="Draft writing progress"
				>
					<div
						className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
						style={{ width: `${percent}%` }}
					/>
				</div>
				{/* Angkanya taksiran - panjang keluaran model tidak diketahui sampai
				    ia berhenti menulis, jadi menampilkannya sebagai angka pasti
				    akan menjanjikan ketelitian yang tidak ada. */}
				<p className="mt-2 text-xs text-faint">
					{phase === 'opening' ? 'Almost done' : `About ${percent}% - estimated from the length`}
				</p>
			</div>
		</Centered>
	)
}

function Centered({ children }: { children: React.ReactNode }) {
	return (
		<div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
			{children}
		</div>
	)
}
