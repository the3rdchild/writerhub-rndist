'use client'

import type { Editor } from '@tiptap/react'
import { useEffect, useRef, useState } from 'react'
import { blockSpacingAt } from '@/features/editor/block-spacing-at'
import { ptToPx, pxToPt } from '@/features/editor/spacing-units'
import { cn } from '@/lib/utils'

const FIELD_CLASS =
	'w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-foreground outline-none transition-colors focus:border-accent disabled:cursor-not-allowed disabled:opacity-50'

const MIN_LINE_HEIGHT = 0.5

function toNumber(value: string, fallback: number): number {
	const parsed = Number.parseFloat(value)
	return Number.isFinite(parsed) ? parsed : fallback
}

/**
 * Dialog "Spasi kustom", meniru dialog Line & paragraph spacing Google Docs:
 * spasi baris bebas plus spasi paragraf sebelum/sesudah dalam pt.
 */
export function CustomSpacingDialog({
	editor,
	open,
	onClose,
}: {
	editor: Editor | null
	open: boolean
	onClose: () => void
}) {
	const [lineHeight, setLineHeight] = useState('1.15')
	const [before, setBefore] = useState('0')
	const [after, setAfter] = useState('0')
	const overlayRef = useRef<HTMLDivElement>(null)

	// Isi draf dari blok tempat kursor berada setiap kali dialog dibuka.
	useEffect(
		function prefillFromSelection() {
			if (!open || !editor) return
			const current = blockSpacingAt(editor)
			setLineHeight(current.lineHeight ?? '1.15')
			setBefore(String(pxToPt(current.spaceBefore)))
			setAfter(String(pxToPt(current.spaceAfter)))
		},
		[open, editor],
	)

	useEffect(
		function lockScrollAndCloseOnEscape() {
			if (!open) return
			document.body.style.overflow = 'hidden'
			const onKey = (e: KeyboardEvent) => {
				if (e.key === 'Escape') onClose()
			}
			window.addEventListener('keydown', onKey)
			return () => {
				document.body.style.overflow = ''
				window.removeEventListener('keydown', onKey)
			}
		},
		[open, onClose],
	)

	if (!open) return null

	const apply = () => {
		const spacing = Math.max(MIN_LINE_HEIGHT, toNumber(lineHeight, 1.15))
		editor
			?.chain()
			.focus()
			.setLineHeight(String(spacing))
			.setBlockSpace({
				before: ptToPx(Math.max(0, toNumber(before, 0))),
				after: ptToPx(Math.max(0, toNumber(after, 0))),
			})
			.run()
		onClose()
	}

	return (
		<div
			ref={overlayRef}
			role="dialog"
			aria-modal="true"
			aria-label="Spasi kustom"
			className="fixed inset-0 z-[70] flex animate-in items-center justify-center bg-black/60 p-4 backdrop-blur-sm fade-in duration-200"
			onClick={(e) => {
				if (e.target === overlayRef.current) onClose()
			}}
		>
			<div className="flex max-h-full w-full max-w-sm animate-in flex-col gap-4 overflow-y-auto rounded-2xl border border-line-strong bg-surface-raised p-5 shadow-2xl zoom-in-95 duration-200">
				<h2 className="text-base font-semibold text-foreground">Spasi kustom</h2>

				<div className="flex flex-col gap-3">
					<div className="grid grid-cols-[9.5rem_1fr] items-center gap-x-4">
						<label htmlFor="custom-line-spacing" className="text-xs font-medium text-muted">
							Spasi baris
						</label>
						<input
							id="custom-line-spacing"
							type="number"
							min={MIN_LINE_HEIGHT}
							step={0.05}
							value={lineHeight}
							onChange={(e) => setLineHeight(e.target.value)}
							className={cn(FIELD_CLASS, 'w-24')}
						/>
					</div>

					<fieldset className="flex flex-col gap-2">
						<legend className="text-xs font-medium text-muted">Spasi paragraf (pt)</legend>
						<div className="grid grid-cols-[9.5rem_1fr] items-center gap-x-4">
							<label htmlFor="custom-space-before" className="text-xs text-subtle">
								Sebelum
							</label>
							<input
								id="custom-space-before"
								type="number"
								min={0}
								step={1}
								value={before}
								onChange={(e) => setBefore(e.target.value)}
								className={cn(FIELD_CLASS, 'w-24')}
							/>
						</div>
						<div className="grid grid-cols-[9.5rem_1fr] items-center gap-x-4">
							<label htmlFor="custom-space-after" className="text-xs text-subtle">
								Sesudah
							</label>
							<input
								id="custom-space-after"
								type="number"
								min={0}
								step={1}
								value={after}
								onChange={(e) => setAfter(e.target.value)}
								className={cn(FIELD_CLASS, 'w-24')}
							/>
						</div>
					</fieldset>
				</div>

				<div className="flex justify-end gap-2">
					<button
						type="button"
						onClick={onClose}
						className="rounded-lg px-3 py-1.5 text-sm text-muted transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
					>
						Batal
					</button>
					<button
						type="button"
						onClick={apply}
						className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
					>
						Terapkan
					</button>
				</div>
			</div>
		</div>
	)
}
