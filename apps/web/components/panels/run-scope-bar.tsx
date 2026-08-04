'use client'

import { Check, FileText, Globe, TextSelection } from 'lucide-react'
import { Dropdown, DropdownItem, DropdownSeparator } from '@/components/ui/dropdown'
import { LANGUAGE_OPTIONS } from '@/features/document/language'
import { useDocumentLanguage } from '@/features/document/use-language'
import { cn } from '@/lib/utils'

/**
 * Apa yang akan diperiksa, dan dalam bahasa apa.
 *
 * Keduanya duduk sebaris tepat di atas tombol Run karena keduanya menjawab
 * pertanyaan yang sama: "kalau saya klik ini, apa yang terjadi?". Bahasa ikut
 * di sini, bukan di pengaturan, sebab akibatnya langsung terasa pada hasil —
 * dan salah bahasa adalah kekeliruan yang baru ketahuan setelah kuota terpakai.
 */
export function RunScopeBar({ wordCount }: { wordCount: number | null }) {
	const language = useDocumentLanguage()

	return (
		<div className="flex items-center gap-2">
			<div
				className={cn(
					'flex min-w-0 flex-1 items-center gap-2 rounded-xl border px-3 py-2 text-xs',
					wordCount === null
						? 'border-line bg-[var(--overlay-hover)] text-subtle'
						: 'border-accent/20 bg-accent/10 text-accent',
				)}
			>
				{wordCount === null ? (
					<FileText className="h-3.5 w-3.5 shrink-0" />
				) : (
					<TextSelection className="h-3.5 w-3.5 shrink-0" />
				)}
				<span className="truncate">
					{wordCount === null
						? 'Whole document'
						: `Selection · ${wordCount} ${wordCount === 1 ? 'word' : 'words'}`}
				</span>
			</div>

			<Dropdown
				align="end"
				side="top"
				trigger={({ open, toggle, id }) => (
					<button
						type="button"
						onClick={toggle}
						aria-expanded={open}
						aria-controls={id}
						title={
							language.overridden
								? `Language: ${language.label} (set manually)`
								: `Detected language: ${language.label}`
						}
						className={cn(
							'flex shrink-0 items-center gap-1.5 rounded-xl border px-2.5 py-2 text-xs transition-colors',
							// Tebakan yang lemah ditandai supaya pengguna curiga lebih dulu,
							// bukan setelah hasilnya kembali dalam bahasa yang salah.
							language.uncertain
								? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400'
								: 'border-line text-muted hover:text-foreground',
						)}
					>
						<Globe className="h-3.5 w-3.5 shrink-0" />
						<span className="max-w-[92px] truncate">{language.label}</span>
					</button>
				)}
			>
				{({ close }) => (
					<>
						<DropdownItem
							icon={language.overridden ? undefined : <Check className="h-4 w-4" />}
							active={!language.overridden}
							onSelect={() => {
								close()
								language.setLanguage(null)
							}}
						>
							Detect automatically
						</DropdownItem>
						<DropdownSeparator />
						{LANGUAGE_OPTIONS.map((option) => (
							<DropdownItem
								key={option.code}
								icon={
									language.overridden && language.code === option.code ? (
										<Check className="h-4 w-4" />
									) : undefined
								}
								active={language.overridden && language.code === option.code}
								onSelect={() => {
									close()
									language.setLanguage(option.code)
								}}
							>
								{option.label}
							</DropdownItem>
						))}
					</>
				)}
			</Dropdown>
		</div>
	)
}
