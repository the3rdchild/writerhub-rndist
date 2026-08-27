import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
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
export async function getPresignedUrl(
	key: string,
	expiresIn = DEFAULT_PRESIGNED_TTL_SECONDS,
): Promise<string> {
	return getSignedUrl(s3Client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn })
}

export { s3Client }
