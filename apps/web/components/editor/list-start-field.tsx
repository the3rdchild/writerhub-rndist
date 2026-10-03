'use client'

import type { Editor } from '@tiptap/react'
import { useId, useState } from 'react'
import { orderedListAt, setNumberingStart } from '@/features/editor/list-numbering'

/** Isian "Start at" untuk daftar bernomor di kursor (Format › Lists, TKS-10). */
export function ListStartField({ editor, onDone }: { editor: Editor | null; onDone: () => void }) {
	const id = useId()
	const list = editor ? orderedListAt(editor.state.selection.$from) : null
	const [value, setValue] = useState(String(list?.node.attrs.start ?? 1))

	if (!list) {
		return <p className="px-3 py-2 text-xs text-subtle">Put the cursor in a numbered list first.</p>
	}

	return (
		<form
			className="flex items-center gap-2 px-3 py-2"
			onSubmit={(event) => {
				event.preventDefault()
				if (editor && setNumberingStart(editor, Number(value))) onDone()
			}}
		>
			<label htmlFor={id} className="text-sm text-muted">
				Start at
			</label>
			<input
				id={id}
				type="number"
				min={0}
				value={value}
				onChange={(event) => setValue(event.target.value)}
				className="w-16 rounded-md border border-line-strong bg-surface-inset px-2 py-1 text-sm text-foreground outline-none focus:border-accent/50"
			/>
			<button
				type="submit"
				className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground transition-colors hover:bg-accent-hover"
			>
				Apply
			</button>
		</form>
	)
}
