import { mkdir, stat } from 'node:fs/promises'
import { dirname, join, normalize, resolve, sep } from 'node:path'
import { env } from '@/config/env'
import { AppError } from '@/lib/error'

/**
 * Driver penyimpanan berbasis disk untuk pengembangan lokal.
 *
 * Worker mengambil dokumen lewat HTTP (lihat services/extract/sources.py), jadi
 * berkas tetap dilayani sebagai URL — sama seperti presigned URL pada driver S3.
 * Dengan begitu worker tidak perlu tahu driver mana yang sedang dipakai.
 */

const ROOT = resolve(env.STORAGE_DIR)

/**
 * Pastikan key tetap berada di dalam ROOT.
 *
 * Key ikut membentuk path di disk dan sebagiannya berasal dari nama berkas
 * unggahan, jadi tanpa penjagaan ini `../../etc/passwd` bisa lolos lewat
 * endpoint pengambilan berkas.
 */
function resolveWithinRoot(key: string): string {
	const target = resolve(join(ROOT, normalize(key)))
	if (target !== ROOT && !target.startsWith(ROOT + sep)) {
		throw AppError.badRequest('Path berkas tidak valid')
	}
	return target
}

export async function writeLocalFile(
	key: string,
	body: Buffer | ArrayBuffer | Uint8Array | string,
): Promise<void> {
	const target = resolveWithinRoot(key)
	await mkdir(dirname(target), { recursive: true })
	await Bun.write(target, body instanceof ArrayBuffer ? Buffer.from(body) : body)
}

/** URL yang dipakai worker untuk mengunduh berkas ini. */
export function localFileUrl(key: string): string {
	return `${env.SERVICE_URL}/api/v1/files/${key.split('/').map(encodeURIComponent).join('/')}`
}

export async function readLocalFile(key: string) {
	const target = resolveWithinRoot(key)

	const info = await stat(target).catch(() => null)
	if (!info?.isFile()) throw AppError.notFound('Berkas tidak ditemukan')

	return { file: Bun.file(target), size: info.size }
}
