import { createHash } from 'node:crypto'
import { unlink } from 'node:fs/promises'
import { env } from '@/config/env'
import { imageExtension } from '@/constants/mime'
import { deleteObject, getObjectBytes, getPresignedUrl, uploadFile } from '@/lib/cdn'
import { signAsset } from '@/lib/signed-url'
import { readLocalFile, storagePath, writeLocalFile } from '@/lib/storage/local'

/**
 * Penyimpanan aset, dengan percabangan driver disimpan di satu tempat.
 *
 * Aset punya dua jalur baca yang sengaja berbeda, dan pemisahan itulah yang
 * menghapus kebutuhan konfigurasi CORS di bucket:
 *
 * - **Render di bingkai** memakai URL. Bingkainya berasal-opaque, jadi cookie
 *   tidak ikut dan URL-nya harus membawa izinnya sendiri.
 * - **Ekspor** memakai bytes, diambil lewat permintaan same-origin ke API yang
 *   sudah terautentikasi seperti biasa, lalu disisipkan sebagai `data:` URI.
 *   Berkas hasil ekspor wajib utuh tanpa jaringan, jadi URL tidak boleh dipakai
 *   di jalur ini.
 */

export function assetKey(projectId: string, assetId: string, mime: string): string {
	return `assets/${projectId}/${assetId}.${imageExtension(mime)}`
}

export function checksumOf(bytes: Uint8Array): string {
	return createHash('sha256').update(bytes).digest('hex')
}

export async function putAsset(key: string, bytes: Uint8Array, mime: string): Promise<void> {
	if (env.STORAGE_DRIVER === 'local') {
		await writeLocalFile(key, bytes)
		return
	}
	await uploadFile(key, bytes, mime)
}

export async function getAsset(key: string): Promise<Uint8Array> {
	if (env.STORAGE_DRIVER === 'local') {
		const { file } = await readLocalFile(key)
		return new Uint8Array(await file.arrayBuffer())
	}
	return getObjectBytes(key)
}

export async function removeAsset(key: string): Promise<void> {
	if (env.STORAGE_DRIVER === 'local') {
		await unlink(storagePath(key)).catch(() => undefined)
		return
	}
	await deleteObject(key)
}

/**
 * URL berumur pendek yang bisa dimuat bingkai tanpa cookie.
 *
 * Driver S3 memakai presigned URL bawaannya - bandwidth-nya tidak lewat API
 * sama sekali. Driver lokal tidak punya padanannya, jadi ia menunjuk balik ke
 * endpoint aset kita sendiri dengan tanda tangan HMAC; bentuknya berbeda, tapi
 * jaminannya sama: berumur pendek, dan tidak bersandar pada sesi.
 */
export async function assetUrl(assetId: string, key: string): Promise<string> {
	if (env.STORAGE_DRIVER === 'local') {
		const { exp, sig } = signAsset(assetId)
		return `${env.SERVICE_URL}/api/v1/assets/${assetId}/raw?exp=${exp}&sig=${encodeURIComponent(sig)}`
	}
	return getPresignedUrl(key, env.ASSET_URL_TTL_SECONDS)
}
