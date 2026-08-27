'use client'

import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Flag } from '@/components/ui/flag'
import { LANGUAGE_OPTIONS } from '@/features/document/language'
import { cn } from '@/lib/utils'
import type { MemoryPreferences } from './types'
import { useMemory, useSaveMemory } from './use-memory'

const NOTES_MAX = 500
export function MemoryTab() {
	const memory = useMemory()
	const save = useSaveMemory()

	const [tone, setTone] = useState('')
	const [language, setLanguage] = useState('')
	const [glossary, setGlossary] = useState<string[]>([])
	const [term, setTerm] = useState('')
	const [notes, setNotes] = useState('')
	const [saved, setSaved] = useState(false)
	useEffect(() => {
		if (!memory.data) return
		setTone(memory.data.tone ?? '')
		setLanguage(memory.data.language ?? '')
		setGlossary(memory.data.glossary ?? [])
		setNotes(memory.data.notes ?? '')
		setSaved(false)
	}, [memory.data])

	const addTerm = () => {
		const value = term.trim()
		if (!value || glossary.includes(value)) return
		setGlossary([...glossary, value])
		setTerm('')
		setSaved(false)
	}

	const onSave = () => {
		const preferences: MemoryPreferences = {}
		if (tone.trim()) preferences.tone = tone.trim()
		if (language) preferences.language = language
		if (glossary.length > 0) preferences.glossary = glossary
		if (notes.trim()) preferences.notes = notes.trim()

		setSaved(false)
		save.mutate(preferences, { onSuccess: () => setSaved(true) })
	}

	if (memory.isPending) {
		return <p className="text-sm text-subtle">Loading preferences…</p>
	}

	if (memory.isError) {
		return (
			<div className="flex flex-col gap-3">
				<p className="text-sm text-red-400">Failed to load AI Memory: {memory.error.message}</p>
				<button
					type="button"
					onClick={() => memory.refetch()}
					className="w-fit rounded-lg border border-line-strong bg-surface-inset px-3 py-1.5 text-sm text-muted transition-colors hover:text-foreground"
				>
					Try again
				</button>
			</div>
		)
	}

	return (
		<div className="flex flex-col gap-5">
			<p className="text-xs leading-relaxed text-subtle">
				These preferences are used by AI Chat, AI Rewriter, and Humanizer when writing or rewriting text for
				you.
			</p>

			<Field label="Tone">
				<input
					type="text"
					value={tone}
					onChange={(event) => {
						setTone(event.target.value)
						setSaved(false)
					}}
					placeholder="e.g. formal, casual, academic"
					className="w-full rounded-lg border border-line-strong bg-surface-inset px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-faint focus:border-accent/50"
				/>
			</Field>

			<Field label="AI output language">
				{/* Select asli (native) dipertahankan karena ini formulir pengaturan;
			       opsi native tidak bisa merender SVG bendera, jadi bendera
			       kebahasaan yang dipilih ditampilkan sebagai indikator di depannya (§P1). */}
				<div className="relative">
					{(() => {
						const flagCode = LANGUAGE_OPTIONS.find((option) => option.label === language)?.flag
						return flagCode ? (
							<span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2">
								<Flag code={flagCode} />
							</span>
						) : null
					})()}
					<select
						value={language}
						onChange={(event) => {
							setLanguage(event.target.value)
							setSaved(false)
						}}
						className={cn(
							'w-full appearance-none rounded-lg border border-line-strong bg-surface-inset py-2 text-sm text-foreground outline-none transition-colors focus:border-accent/50',
							LANGUAGE_OPTIONS.some((option) => option.label === language) ? 'pl-9' : 'px-3',
						)}
					>
						<option value="">Follow document language</option>
						{LANGUAGE_OPTIONS.map((option) => (
							<option key={option.code} value={option.label}>
								{option.label}
							</option>
						))}
					</select>
				</div>
			</Field>

			<Field label="Glossary - terms that must not be changed or translated">
				<div className="flex gap-2">
					<input
						type="text"
						value={term}
						onChange={(event) => setTerm(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === 'Enter') {
								event.preventDefault()
								addTerm()
							}
						}}
						placeholder="e.g. WritingHub, Ransel.ai"
						className="w-full rounded-lg border border-line-strong bg-surface-inset px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-faint focus:border-accent/50"
					/>
					<button
						type="button"
						onClick={addTerm}
						disabled={!term.trim()}
						className="shrink-0 rounded-lg border border-line-strong bg-surface-inset px-3 py-2 text-sm text-muted transition-colors hover:text-foreground disabled:opacity-50"
					>
						Add
					</button>
				</div>
				{glossary.length > 0 && (
					<div className="mt-2 flex flex-wrap gap-1.5">
						{glossary.map((item) => (
							<span
								key={item}
								className="flex items-center gap-1 rounded-full border border-line-strong bg-surface-inset px-2.5 py-1 text-xs text-foreground"
							>
								{item}
								<button
									type="button"
									onClick={() => {
										setGlossary(glossary.filter((entry) => entry !== item))
										setSaved(false)
									}}
									aria-label={`Remove ${item}`}
									className="text-faint transition-colors hover:text-foreground"
								>
									<X className="h-3 w-3" />
								</button>
							</span>
						))}
					</div>
				)}
			</Field>

			<Field label="Style notes">
				<textarea
					value={notes}
					onChange={(event) => {
						setNotes(event.target.value)
						setSaved(false)
					}}
					maxLength={NOTES_MAX}
					rows={4}
					placeholder="e.g. Avoid passive voice; address the reader as 'you'"
					className="w-full resize-none rounded-lg border border-line-strong bg-surface-inset px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-faint focus:border-accent/50"
				/>
				<span
					className={cn(
						'mt-1 block text-right text-xs',
						notes.length >= NOTES_MAX ? 'text-red-400' : 'text-faint',
					)}
				>
					{notes.length}/{NOTES_MAX}
				</span>
			</Field>

			<div className="flex items-center gap-3">
				<button
					type="button"
					onClick={onSave}
					disabled={save.isPending}
					className={cn(
						'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
						'bg-accent text-accent-foreground hover:opacity-90 disabled:opacity-50',
					)}
				>
					{save.isPending ? 'Saving…' : 'Save'}
				</button>
				{saved && !save.isPending && <span className="text-xs text-green-400">Saved.</span>}
			</div>

			{save.isError && (
				<p className="text-sm text-red-400">
					Failed to save AI Memory: {save.error.message}. Your changes were not saved - try again.
				</p>
			)}
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
