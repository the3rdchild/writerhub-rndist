'use client'
import type { DocxImport, ImportWarning } from './docx'

export type { DocxImport, ImportWarning }

export async function importDocx(file: File): Promise<DocxImport> {
	const { readDocx } = await import('./docx')
	return readDocx(new Uint8Array(await file.arrayBuffer()))
}
export function isDocx(file: File): boolean {
	return (
		file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
		file.name.toLowerCase().endsWith('.docx')
	)
}
