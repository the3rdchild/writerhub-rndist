'use client'

import { Brain, Crown, Mail, Monitor, Moon, Palette, Sun, Type, User } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { BASE_FONT_SIZE_PT } from '@/features/editor/typography'
import { MemoryTab } from '@/features/memory/memory-tab'
import { type FontSize, type Theme, useSettings } from '@/features/settings/settings-context'
import { cn } from '@/lib/utils'

const TABS = [
	{ key: 'profile', label: 'Profil', icon: User },
	{ key: 'appearance', label: 'Tampilan', icon: Palette },
	{ key: 'editor', label: 'Editor', icon: Type },
	{ key: 'memory', label: 'AI Memory', icon: Brain },
] as const

type TabKey = (typeof TABS)[number]['key']

const THEMES: Array<{ value: Theme; label: string; icon: typeof Moon }> = [
	{ value: 'dark', label: 'Dark', icon: Moon },
	{ value: 'light', label: 'Light', icon: Sun },
	{ value: 'system', label: 'System', icon: Monitor },
]

const FONT_SIZES: FontSize[] = ['small', 'medium', 'large']

export function SettingsDialog() {
	const { settings, update, updateProfile, settingsOpen, setSettingsOpen } = useSettings()
	const [tab, setTab] = useState<TabKey>('profile')
	const overlayRef = useRef<HTMLDivElement>(null)

	useEffect(
		function lockScrollAndCloseOnEscape() {
			if (!settingsOpen) return

			document.body.style.overflow = 'hidden'
			const onKeyDown = (event: KeyboardEvent) => {
				if (event.key === 'Escape') setSettingsOpen(false)
			}
			window.addEventListener('keydown', onKeyDown)

			return () => {
				document.body.style.overflow = ''
				window.removeEventListener('keydown', onKeyDown)
			}
		},
		[settingsOpen, setSettingsOpen],
	)

	if (!settingsOpen) return null

	return (
		<div
			ref={overlayRef}
			role="dialog"
			aria-modal="true"
			aria-label="Pengaturan"
			className="fixed inset-0 z-[70] flex animate-in items-center justify-center bg-black/60 backdrop-blur-sm fade-in duration-200"
			onClick={(event) => {
				if (event.target === overlayRef.current) setSettingsOpen(false)
			}}
		>
			<div className="flex max-h-[85vh] w-full max-w-lg animate-in flex-col overflow-hidden rounded-2xl border border-line-strong bg-surface-raised shadow-2xl zoom-in-95 duration-200">
				<div className="flex shrink-0 items-center justify-between border-b border-line px-5 py-4">
					<h2 className="text-base font-semibold text-foreground">Pengaturan</h2>
					<button
						type="button"
						onClick={() => setSettingsOpen(false)}
						aria-label="Tutup"
						className="rounded-md p-1 text-subtle transition-colors hover:bg-[var(--overlay-hover)] hover:text-foreground"
					>
						×
					</button>
				</div>

				<div className="flex shrink-0 gap-0.5 border-b border-line px-5 pt-3">
					{TABS.map(({ key, label, icon: Icon }) => (
						<button
							key={key}
							type="button"
							onClick={() => setTab(key)}
							className={cn(
								'flex items-center gap-1.5 border-b-2 px-3 pb-2.5 text-sm transition-colors',
								tab === key
									? 'border-accent font-medium text-foreground'
									: 'border-transparent text-subtle hover:text-muted',
							)}
						>
							<Icon className="h-4 w-4" />
							{label}
						</button>
					))}
				</div>

				<div className="min-h-0 flex-1 overflow-y-auto p-5">
					{tab === 'profile' && (
						<div className="flex flex-col gap-5">
							<div className="flex items-center gap-4">
								<div className="flex h-16 w-16 items-center justify-center rounded-full border border-accent/30 bg-accent/20 text-xl font-semibold text-accent">
									{settings.profile.name.charAt(0).toUpperCase()}
								</div>
								<div>
									<p className="text-sm font-medium text-foreground">{settings.profile.name}</p>
									<div className="mt-0.5 flex items-center gap-1.5">
										<Crown className="h-3.5 w-3.5 text-orange-400" />
										<span className="text-xs font-medium text-orange-400">{settings.profile.role}</span>
									</div>
								</div>
							</div>

							<Field label="Nama tampilan">
								<input
									type="text"
									value={settings.profile.name}
									onChange={(event) => updateProfile({ name: event.target.value })}
									placeholder="Nama Anda"
									className="w-full rounded-lg border border-line-strong bg-surface-inset px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-faint focus:border-accent/50"
								/>
							</Field>

							<Field label="Email">
								<div className="relative">
									<Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
									<input
										type="email"
										value={settings.profile.email}
										onChange={(event) => updateProfile({ email: event.target.value })}
										placeholder="anda@example.com"
										className="w-full rounded-lg border border-line-strong bg-surface-inset py-2 pl-9 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-faint focus:border-accent/50"
									/>
								</div>
							</Field>

							<Field label="Langganan">
								<div className="flex items-center gap-2 rounded-lg border border-orange-400/20 bg-orange-400/10 px-3 py-2">
									<Crown className="h-4 w-4 text-orange-400" />
									<span className="text-sm font-medium text-orange-400">Paket {settings.profile.role}</span>
								</div>
							</Field>
						</div>
					)}

					{tab === 'appearance' && (
						<Field label="Tema">
							<div className="grid grid-cols-3 gap-2">
								{THEMES.map(({ value, label, icon: Icon }) => (
									<button
										key={value}
										type="button"
										onClick={() => update({ theme: value })}
										className={cn(
											'flex flex-col items-center gap-2 rounded-xl border px-4 py-4 transition-colors',
											settings.theme === value
												? 'border-accent bg-accent text-accent-foreground'
												: 'border-line-strong bg-surface-inset text-muted hover:text-foreground',
										)}
									>
										<Icon className="h-5 w-5" />
										<span className="text-xs font-medium">{label}</span>
									</button>
								))}
							</div>
							<p className="mt-3 text-xs leading-relaxed text-subtle">
								Perubahan tema langsung diterapkan. Pilihan System mengikuti preferensi perangkat.
							</p>
						</Field>
					)}

					{tab === 'editor' && (
						<div className="flex flex-col gap-5">
							<Field label="Ukuran font bawaan">
								<div className="flex gap-2">
									{FONT_SIZES.map((size) => (
										<button
											key={size}
											type="button"
											onClick={() => update({ editorFontSize: size })}
											className={cn(
												'flex-1 rounded-lg border px-3 py-2 text-sm font-medium capitalize transition-colors',
												settings.editorFontSize === size
													? 'border-accent/40 bg-accent/15 text-accent'
													: 'border-line-strong bg-surface-inset text-muted hover:text-foreground',
											)}
										>
											{size}
											<span className="ml-1.5 text-xs font-normal opacity-70">
												{BASE_FONT_SIZE_PT[size]}pt
											</span>
										</button>
									))}
								</div>
							</Field>

							<ToggleRow
								label="Simpan sesi otomatis"
								description="Simpan pekerjaan Anda ke riwayat sesi secara otomatis"
								checked={settings.autoSave}
								onChange={(autoSave) => update({ autoSave })}
							/>
							<ToggleRow
								label="Tampilkan jumlah kata"
								description="Tampilkan jumlah kata dan karakter di bawah editor"
								checked={settings.showWordCount}
								onChange={(showWordCount) => update({ showWordCount })}
							/>
						</div>
					)}

					{/* Satu-satunya tab yang bicara ke server: ia punya state
					    memuat/menyimpan/gagal sendiri dan tombol Simpan eksplisit,
					    bukan autosave localStorage seperti tab lain. */}
					{tab === 'memory' && <MemoryTab />}
				</div>
			</div>
		</div>
	)
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div>
			<span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
			{children}
		</div>
	)
}

function ToggleRow({
	label,
	description,
	checked,
	onChange,
}: {
	label: string
	description: string
	checked: boolean
	onChange: (value: boolean) => void
}) {
	return (
		<div className="flex items-center justify-between gap-4">
			<div>
				<p className="text-sm font-medium text-foreground">{label}</p>
				<p className="mt-0.5 text-xs text-subtle">{description}</p>
			</div>
			<button
				type="button"
				role="switch"
				aria-checked={checked}
				aria-label={label}
				onClick={() => onChange(!checked)}
				className={cn(
					'relative h-6 w-10 shrink-0 rounded-full transition-colors',
					checked ? 'bg-accent' : 'bg-line-strong',
				)}
			>
				<span
					className={cn(
						'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform',
						checked && 'translate-x-4',
					)}
				/>
			</button>
		</div>
	)
}
