'use client'

import { Check, FileText, Globe, TextSelection } from 'lucide-react'
import { Dropdown, DropdownItem, DropdownSeparator } from '@/components/ui/dropdown'
import { Flag } from '@/components/ui/flag'
import { LANGUAGE_OPTIONS } from '@/features/document/language'
import { useDocumentLanguage } from '@/features/document/use-language'
import { cn } from '@/lib/utils'
export function RunScopeBar({ wordCount }: { wordCount: number | null }) {
	const language = useDocumentLanguage()
	const flagCode = LANGUAGE_OPTIONS.find((option) => option.code === language.code)?.flag

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
							language.uncertain
								? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-400'
								: 'border-line text-muted hover:text-foreground',
						)}
					>
						{/* Bahasa yang sudah pasti digambar sebagai bendera; Globe dipakai saat
						    bahasa belum pasti (uncertain) supaya tidak terlihat seperti klaim
						    yang salah (§P1 butir 4). */}
						{!language.uncertain && flagCode ? (
							<Flag code={flagCode} />
						) : (
							<Globe className="h-3.5 w-3.5 shrink-0" />
						)}
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
									) : (
										<Flag code={option.flag} />
									)
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
