import { eq } from 'drizzle-orm'
import { env } from '@/config/env'
import { baseMimeType, isAllowedImageMime, SVG_MIME } from '@/constants/mime'
import type { Asset } from '@/db/schemas'
import { documents, shares } from '@/db/schemas'
import { assetKey, assetUrl, checksumOf, getAsset, putAsset, removeAsset } from '@/lib/asset-storage'
import { AppError } from '@/lib/error'
import { canAccessProject } from '@/lib/project-access'
import { verifyAsset } from '@/lib/signed-url'
import { sanitizeSvg } from '@/lib/svg-sanitize'
import {
	deleteAsset,
	findAssetByChecksum,
	findAssetById,
	findAssetsByIds,
	findAssetsByProject,
	findDocumentAssetIds,
	insertAsset,
	setDocumentAssets,
} from '@/repository/asset'
import { findDocumentById } from '@/repository/document'
import BaseService from '@/services/base.service'
import type { AssetSummary, AssetUrl, UploadAssetResponse } from './dto'
import { mintAssetUrlsBodySchema, setDocumentAssetsBodySchema, uploadAssetBodySchema } from './dto'

/**
 * Aset gambar milik proyek.
 *
 * Satu asimetri di berkas ini yang perlu dibaca sebelum apa pun diubah:
 * **kepemilikan aset mengikuti proyek, tapi izin menerbitkan URL tidak.**
 * Pemilik proyek boleh menerbitkan URL untuk aset mana pun miliknya - ia perlu
 * itu untuk menelusuri pustakanya. Pemegang share link hanya boleh untuk aset
 * yang benar-benar dirujuk dokumen yang dibagikan kepadanya. Tanpa pembedaan
 * itu, satu tautan `access: 'anyone'` ke satu dokumen membuka seluruh pustaka
 * proyeknya ke internet. Kedua aturan itu hidup di `authorizeAssets`.
 */
export default class AssetsService extends BaseService {
	async upload(): Promise<Response> {
		try {
			const form = await this.context.req.parseBody()
			const file = form.file
			if (!(file instanceof File)) throw AppError.badRequest('Berkas tidak ada')

			const body = uploadAssetBodySchema.safeParse({
				projectId: form.projectId,
				name: form.name,
				width: form.width,
				height: form.height,
			})
			if (!body.success) {
				return this.error({ errors: body.error.issues.map((issue) => issue.message) })
			}

			const identityId = await this.identityId()
			if (!(await canAccessProject(identityId, body.data.projectId))) {
				throw AppError.forbidden('Proyek ini bukan milik Anda')
			}

			const mime = baseMimeType(file.type)
			if (!isAllowedImageMime(mime)) throw AppError.badRequest(`Jenis berkas ${mime} tidak didukung`)

			const limit = env.ASSET_MAX_MB * 1024 * 1024
			if (file.size > limit) throw AppError.badRequest(`Berkas melebihi ${env.ASSET_MAX_MB} MB`)

			const { bytes, sanitized } = await this.readUpload(file, mime)
			const checksum = checksumOf(bytes)

			/*
			 * Dedupe setelah pembersihan, bukan sebelum: dua SVG yang berbeda hanya
			 * pada bagian yang toh dibuang harus mendarat di baris yang sama.
			 */
			const existing = await findAssetByChecksum(body.data.projectId, checksum)
			if (existing) {
				return this.success({ data: { ...this.toSummary(existing), deduplicated: true } })
			}

			const id = crypto.randomUUID()
			const key = assetKey(body.data.projectId, id, mime)
			await putAsset(key, bytes, mime)

			const asset = await insertAsset({
				id,
				project_id: body.data.projectId,
				key,
				mime,
				bytes: bytes.byteLength,
				width: body.data.width ?? null,
				height: body.data.height ?? null,
				name: body.data.name ?? file.name,
				checksum,
				created_by: identityId,
			})
			if (!asset) throw AppError.internalServerError('Gagal menyimpan aset')

			const response: UploadAssetResponse = this.toSummary(asset)
			if (sanitized?.length) response.sanitized = sanitized

			return this.success({ data: response, status: 201 })
		} catch (error) {
			return this.failFromError(error)
		}
	}

	async list(): Promise<Response> {
		try {
			const projectId = this.context.req.query('projectId')
			if (!projectId) throw AppError.badRequest('projectId tidak ada')

			if (!(await canAccessProject(await this.identityId(), projectId))) {
				throw AppError.forbidden('Proyek ini bukan milik Anda')
			}

			const rows = await findAssetsByProject(projectId)
			return this.success({ data: rows.map((row) => this.toSummary(row)) })
		} catch (error) {
			return this.failFromError(error)
		}
	}

	/** URL berumur pendek untuk dimuat bingkai blok HTML. */
	async mintUrls(): Promise<Response> {
		try {
			const body = mintAssetUrlsBodySchema.safeParse(await this.context.req.json())
			if (!body.success) {
				return this.error({ errors: body.error.issues.map((issue) => issue.message) })
			}

			const allowed = await this.authorizeAssets(body.data.ids, body.data.shareToken)
			const expiresAt = Math.floor(Date.now() / 1000) + env.ASSET_URL_TTL_SECONDS

			const urls: AssetUrl[] = await Promise.all(
				allowed.map(async (asset) => ({
					id: asset.id,
					url: await assetUrl(asset.id, asset.key),
					expiresAt,
				})),
			)

			/*
			 * Aset yang tidak diizinkan cukup tidak ada di jawaban - tidak ada galat
			 * per-id. Membedakan "tidak ada" dari "tidak boleh" akan mengubah
			 * endpoint ini jadi alat pengintai keberadaan aset milik orang lain.
			 */
			return this.success({ data: urls })
		} catch (error) {
			return this.failFromError(error)
		}
	}

	/**
	 * Bytes mentah untuk jalur ekspor.
	 *
	 * Diambil lewat permintaan same-origin dari aplikasi, jadi sesi bekerja
	 * normal di sini - berbeda dari bingkai yang harus memakai URL bertanda
	 * tangan. Klien mengubahnya jadi `data:` URI sebelum merasterisasi, karena
	 * berkas hasil ekspor wajib utuh tanpa jaringan.
	 */
	async inline(): Promise<Response> {
		try {
			const id = this.uuidParam('id', 'ID aset')
			const shareToken = this.context.req.query('shareToken')
			const [asset] = await this.authorizeAssets([id], shareToken)
			if (!asset) throw AppError.notFound('Aset tidak ditemukan')

			return this.serveBytes(asset)
		} catch (error) {
			return this.failFromError(error)
		}
	}

	/**
	 * Objek aset di balik URL bertanda tangan.
	 *
	 * Hanya dipakai driver penyimpanan lokal; dengan S3 bingkai mengambilnya
	 * langsung dari bucket lewat presigned URL dan permintaannya tidak pernah
	 * sampai ke sini. Tanpa `authMiddleware` dengan sengaja: pemintanya bingkai
	 * berasal-opaque yang tidak bisa mengirim cookie, dan tanda tangan itulah
	 * izinnya.
	 */
	async raw(): Promise<Response> {
		try {
			const id = this.uuidParam('id', 'ID aset')
			const exp = Number(this.context.req.query('exp'))
			const sig = this.context.req.query('sig') ?? ''
			verifyAsset(id, exp, sig)

			const asset = await findAssetById(id)
			if (!asset) throw AppError.notFound('Aset tidak ditemukan')

			return this.serveBytes(asset)
		} catch (error) {
			return this.failFromError(error)
		}
	}

	async remove(): Promise<Response> {
		try {
			const id = this.uuidParam('id', 'ID aset')
			const asset = await findAssetById(id)
			if (!asset) throw AppError.notFound('Aset tidak ditemukan')

			if (!(await canAccessProject(await this.identityId(), asset.project_id))) {
				throw AppError.forbidden('Aset ini bukan milik Anda')
			}

			await deleteAsset(id)
			// Objeknya dibuang setelah barisnya, bukan sebelum: kalau penghapusan
			// objek gagal yang tertinggal cuma berkas yatim, bukan baris yang
			// menunjuk ke berkas yang sudah tidak ada.
			await removeAsset(asset.key)

			return this.success({ data: { id } })
		} catch (error) {
			return this.failFromError(error)
		}
	}

	/** Mencatat aset mana yang dirujuk sebuah dokumen - lihat catatan kelas. */
	async setLinks(): Promise<Response> {
		try {
			const body = setDocumentAssetsBodySchema.safeParse(await this.context.req.json())
			if (!body.success) {
				return this.error({ errors: body.error.issues.map((issue) => issue.message) })
			}

			const identityId = await this.identityId()
			const document = await findDocumentById(body.data.documentId, identityId)
			if (!document) throw AppError.notFound('Dokumen tidak ditemukan')

			/*
			 * Hanya aset dari proyek dokumen itu yang boleh ditautkan. Tanpa saringan
			 * ini, penulis bisa menautkan aset proyek lain lalu membagikan dokumennya
			 * - dan tautan itu yang menjadi izinnya.
			 */
			const candidates = await findAssetsByIds(body.data.ids)
			const sameProject = candidates.filter((asset) => asset.project_id === document.project_id)
			await setDocumentAssets(
				body.data.documentId,
				sameProject.map((asset) => asset.id),
			)

			return this.success({ data: { documentId: body.data.documentId, count: sameProject.length } })
		} catch (error) {
			return this.failFromError(error)
		}
	}

	/**
	 * Menyaring daftar id menjadi aset yang benar-benar boleh dilihat peminta.
	 *
	 * Dua cabang, dan asimetrinya disengaja - lihat catatan di kepala kelas.
	 */
	private async authorizeAssets(ids: readonly string[], shareToken?: string): Promise<Asset[]> {
		const requested = await findAssetsByIds(ids)
		if (requested.length === 0) return []

		if (shareToken) {
			const documentId = await this.documentIdOfShare(shareToken)
			const granted = new Set(await findDocumentAssetIds(documentId))
			return requested.filter((asset) => granted.has(asset.id))
		}

		const identityId = await this.identityId()
		const projects = new Set(requested.map((asset) => asset.project_id))
		const permitted = new Set<string>()
		await Promise.all(
			[...projects].map(async (projectId) => {
				if (await canAccessProject(identityId, projectId)) permitted.add(projectId)
			}),
		)
		return requested.filter((asset) => permitted.has(asset.project_id))
	}

	private async documentIdOfShare(token: string): Promise<string> {
		const [row] = await this.db
			.select({ documentId: shares.document_id, access: shares.access })
			.from(shares)
			.innerJoin(documents, eq(shares.document_id, documents.id))
			.where(eq(shares.token, token))
			.limit(1)

		if (!row?.documentId) throw AppError.notFound('Share link tidak ditemukan')
		// Aturan yang sama persis dengan ShareService.getByToken: tautan terbatas
		// tetap menuntut sesi. Kalau keduanya menyimpang, aset jadi celah yang
		// melewati pembatasan dokumennya sendiri.
		if (row.access === 'restricted' && !this.context.get('userId')) {
			throw AppError.forbidden('Dokumen ini dibatasi, silakan masuk terlebih dahulu')
		}
		return row.documentId
	}

	private async readUpload(file: File, mime: string): Promise<{ bytes: Uint8Array; sanitized?: string[] }> {
		const raw = new Uint8Array(await file.arrayBuffer())
		if (mime !== SVG_MIME) return { bytes: raw }

		const cleaned = sanitizeSvg(new TextDecoder().decode(raw))
		if (!cleaned) throw AppError.badRequest('Berkas ini bukan SVG yang sah')
		return { bytes: new TextEncoder().encode(cleaned.svg), sanitized: cleaned.removed }
	}

	private async serveBytes(asset: Asset): Promise<Response> {
		const bytes = await getAsset(asset.key)
		// Disalin ke Blob, bukan diserahkan sebagai Uint8Array: `bytes` bisa
		// berupa view atas ArrayBuffer yang lebih besar, dan Response akan
		// mengirim seluruh buffer itu.
		return new Response(new Blob([bytes], { type: asset.mime }), {
			headers: {
				'content-type': asset.mime,
				'content-length': String(bytes.byteLength),
				/*
				 * Tiga penjagaan untuk kasus SVG. Isinya sudah dibersihkan saat
				 * unggah, tapi respons ini bisa dibuka langsung di tab, dan di sana
				 * SVG adalah dokumen - bukan gambar. `sandbox` membuatnya lembam,
				 * `nosniff` menahan berkas lain berubah jenis, dan CSP kosong
				 * memutus semua rujukan keluar.
				 */
				'content-security-policy': "default-src 'none'; sandbox",
				'x-content-type-options': 'nosniff',
				'cache-control': 'private, max-age=300',
			},
		})
	}

	private toSummary(asset: Asset): AssetSummary {
		return {
			id: asset.id,
			projectId: asset.project_id,
			name: asset.name,
			mime: asset.mime,
			bytes: asset.bytes,
			width: asset.width,
			height: asset.height,
			createdAt: asset.created_at.getTime(),
		}
	}
}
