import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { env } from '@/config/env'

const s3Client = new S3Client({
	endpoint: env.CDN_ENDPOINT,
	region: env.CDN_REGION,
	credentials: {
		accessKeyId: env.CDN_ACCESS_KEY_ID,
		secretAccessKey: env.CDN_SECRET_ACCESS_KEY,
	},
	forcePathStyle: true, // dibutuhkan sebagian besar layanan S3-compatible
})

const bucket = env.CDN_BUCKET_NAME

export const DEFAULT_PRESIGNED_TTL_SECONDS = 3600

export async function uploadFile(
	key: string,
	body: Buffer | ArrayBuffer | Uint8Array | string,
	contentType: string,
	isPublic = false,
): Promise<string> {
	await s3Client.send(
		new PutObjectCommand({
			Bucket: bucket,
			Key: key,
			Body: body instanceof ArrayBuffer ? Buffer.from(body) : body,
			ContentType: contentType,
			...(env.S3_USE_OBJECT_ACL && isPublic ? { ACL: 'public-read' as const } : {}),
		}),
	)
	return key
}

export interface PresignOptions {
	/**
	 * Nama berkas yang ditawarkan peramban saat mengunduh. Tanpa ini, objek
	 * `exports/<uuid>.pdf` diunduh dengan nama UUID-nya - sah, tapi tidak
	 * membantu siapa pun yang membuka foldernya kemudian.
	 */
	downloadFilename?: string
}

/**
 * Tanda kutip, backslash, dan karakter kendali tidak sah di dalam nilai header
 * yang dikutip; sisanya (termasuk spasi dan non-ASCII) aman karena SDK yang
 * menyandikan headernya.
 */
function quotedHeaderValue(name: string): string {
	return name.replace(/["\\\r\n]/g, '').trim() || 'file'
}

export async function getPresignedUrl(
	key: string,
	expiresIn = DEFAULT_PRESIGNED_TTL_SECONDS,
	options: PresignOptions = {},
): Promise<string> {
	const disposition = options.downloadFilename
		? `attachment; filename="${quotedHeaderValue(options.downloadFilename)}"`
		: undefined

	return getSignedUrl(
		s3Client,
		new GetObjectCommand({
			Bucket: bucket,
			Key: key,
			...(disposition ? { ResponseContentDisposition: disposition } : {}),
		}),
		{ expiresIn },
	)
}

/**
 * Mengambil isi objek sebagai bytes.
 *
 * Perlu di samping presigned URL karena dua pembacanya berbeda watak: bingkai
 * blok HTML memuat gambar lewat URL (ia tidak bisa mengirim cookie, jadi URL
 * bertanda tangan satu-satunya jalan), sementara jalur ekspor harus menyisipkan
 * bytes-nya sebagai `data:` URI supaya berkas hasil tetap utuh tanpa jaringan.
 * Yang kedua mengambilnya lewat sini.
 */
export async function getObjectBytes(key: string): Promise<Uint8Array> {
	const result = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
	const body = result.Body
	if (!body) throw new Error(`Objek ${key} kosong`)
	return new Uint8Array(await body.transformToByteArray())
}

export async function deleteObject(key: string): Promise<void> {
	await s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
}

export { s3Client }
