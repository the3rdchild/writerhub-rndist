'use client'

import type { Editor } from '@tiptap/react'
import { createContext, type ReactNode, useContext, useMemo, useState } from 'react'

/**
 * Instance Tiptap dibuat jauh di dalam kanvas, tapi menu bar dan toolbar berada
 * di atasnya pada pohon komponen. Context ini menjembatani keduanya tanpa
 * meneruskan prop lewat setiap lapisan tata letak.
 *
 * Bernilai null sampai editor selesai dipasang — pemanggil harus siap menerima
 * itu dan menonaktifkan kontrolnya.
 */
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
