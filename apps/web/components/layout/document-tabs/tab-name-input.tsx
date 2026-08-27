'use client'

import { useEffect, useRef, useState } from 'react'

export function TabNameInput({
	initialValue,
	ariaLabel = 'Nama tab',
	onCommit,
	onCancel,
}: {
	initialValue: string
	ariaLabel?: string
	onCommit: (value: string) => void
	onCancel: () => void
}) {
	const [value, setValue] = useState(initialValue)
	const inputRef = useRef<HTMLInputElement>(null)

	useEffect(function selectNameOnMount() {
		inputRef.current?.select()
	}, [])

	const commit = () => {
		const trimmed = value.trim()
		if (trimmed) onCommit(trimmed)
		else onCancel()
	}

	return (
		<input
			ref={inputRef}
			value={value}
			autoFocus
			onChange={(event) => setValue(event.target.value)}
			onBlur={commit}
			onKeyDown={(event) => {
				if (event.key === 'Enter') commit()
				else if (event.key === 'Escape') onCancel()
			}}
			aria-label={ariaLabel}
			className="w-full rounded-lg border border-accent bg-surface-raised px-2.5 py-1.5 text-sm text-foreground outline-none"
		/>
	)
}
