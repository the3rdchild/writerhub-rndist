'use client'

import type { Editor } from '@tiptap/react'
import { createContext, type ReactNode, useContext, useMemo, useState } from 'react'
interface EditorInstanceContextValue {
	editor: Editor | null
	setEditor: (editor: Editor | null) => void
}

const EditorInstanceContext = createContext<EditorInstanceContextValue | null>(null)

export function EditorInstanceProvider({ children }: { children: ReactNode }) {
	const [editor, setEditor] = useState<Editor | null>(null)
	const value = useMemo(() => ({ editor, setEditor }), [editor])

	return <EditorInstanceContext.Provider value={value}>{children}</EditorInstanceContext.Provider>
}

export function useEditorInstance(): EditorInstanceContextValue {
	const context = useContext(EditorInstanceContext)
	if (!context) throw new Error('useEditorInstance harus dipakai di dalam <EditorInstanceProvider>')
	return context
}
