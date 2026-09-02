'use client'

import type { PageSetup } from '@writer-hub/shared'
import { resolvePageSize } from '@/features/editor/page-geometry'

interface TemplatePreviewProps {
	pageSetup: PageSetup
	/** HTML dari `contentToPreviewHtml`; kosong berarti kerangka belum termuat. */
	html: string
	/** Lebar kotak pratinjau dalam piksel; halaman diskala agar muat. */
	width: number
	className?: string
}

/**
 * Pratinjau halaman pertama template, dirender langsung dari `content`
 * kerangkanya dengan skala kecil - bukan aset gambar, supaya tidak basi saat
 * kerangka disunting (`docs/TEMPLATE-GALLERY-PLAN.md` §6).
 */
export function TemplatePreview({ pageSetup, html, width, className }: TemplatePreviewProps) {
	const page = resolvePageSize(pageSetup)
	const scale = width / page.width

	return (
		<div
			className={className}
			style={{ width, height: page.height * scale, overflow: 'hidden' }}
			aria-hidden
		>
			<div
				style={{
					width: page.width,
					height: page.height,
					transform: `scale(${scale})`,
					transformOrigin: 'top left',
				}}
				className="bg-white text-gray-900 shadow-sm ring-1 ring-black/10"
			>
				<div
					className="template-preview h-full w-full px-[6%] py-[5%] text-[13px] leading-snug"
					// HTML hasil contentToPreviewHtml - seluruh teks sudah lolos escape.
					dangerouslySetInnerHTML={{ __html: html }}
				/>
			</div>
		</div>
	)
}
