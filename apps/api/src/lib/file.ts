import { env } from '@/config/env'
import { baseMimeType } from '@/constants/mime'
import { getPresignedUrl, uploadFile } from '@/lib/cdn'
import { localFileUrl, writeLocalFile } from '@/lib/storage/local'
export const PRESIGNED_TTL_SECONDS = 24 * 60 * 60

const MIME_TO_EXTENSION: Record<string, string> = {
	'application/pdf': 'pdf',
	'text/plain': 'txt',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
}

export interface UploadResult {
	originalFileName: string
	mimeType: string
	key: string
	downloadUrl: string
}

export function getFileExtension(mimeType: string): string {
	return MIME_TO_EXTENSION[baseMimeType(mimeType)] ?? 'bin'
}

export function sanitizeFileName(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
}

export async function uploadDocument(file: File): Promise<UploadResult> {
	const extension = getFileExtension(file.type)
	const stem = sanitizeFileName(file.name.replace(/\.[^.]+$/, ''))
	const key = `uploads/${crypto.randomUUID()}_${stem}.${extension}`
	const bytes = await file.arrayBuffer()

	let downloadUrl: string
	if (env.STORAGE_DRIVER === 'local') {
		await writeLocalFile(key, bytes)
		downloadUrl = localFileUrl(key)
	} else {
		await uploadFile(key, bytes, file.type)
		downloadUrl = await getPresignedUrl(key, PRESIGNED_TTL_SECONDS)
	}

	return { originalFileName: file.name, mimeType: file.type, key, downloadUrl }
}
