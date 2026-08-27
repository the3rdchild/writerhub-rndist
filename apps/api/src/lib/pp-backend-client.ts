import { env } from '@/config/env'
import { signPpApiKey } from '@/lib/pp-signature'
import LoggerClient from '@/lib/logger'

const log = LoggerClient.getInstance()

export interface ExtendedUserPackage {
	user_id: string
	username: string
	user_email: string
	_id: string
	name: string
	category_name: string
	extended_expires_at: string
}

interface ExtendedUserPackageResponse {
	data: ExtendedUserPackage
	message: string
}

export async function getExtendedUserPackage(token: string): Promise<ExtendedUserPackage | null> {
	if (!env.PP_BACKEND_URL) {
		log.warn('[pp-backend] PP_BACKEND_URL belum dikonfigurasi, lewati getExtendedUserPackage')
		return null
	}
	if (!token) return null

	try {
		const { signature, timestamp } = signPpApiKey()
		const res = await fetch(`${env.PP_BACKEND_URL}/users/extended-package`, {
			method: 'GET',
			headers: {
				authorization: `Bearer ${token}`,
				'x-pp-api-key': signature,
				'x-pp-timestamp': timestamp,
				'x-client': 'pp-extended',
			},
		})

		if (!res.ok) {
			log.warn({ status: res.status }, '[pp-backend] getExtendedUserPackage gagal')
			return null
		}

		const body = (await res.json()) as ExtendedUserPackageResponse
		return body.data ?? null
	} catch (err) {
		log.error({ err }, '[pp-backend] getExtendedUserPackage error')
		return null
	}
}
