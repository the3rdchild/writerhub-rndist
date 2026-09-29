import { env } from '@/config/env'

/**
 * Apakah `baseUrl` memahami dialek OpenRouter: memilih model per permintaan
 * dan menerima saklar `reasoning`.
 *
 * OpenRouter sendiri dikenali dari hostnya. Proksi yang meneruskan ke
 * OpenRouter (misalnya adapter lokal) tidak bisa dikenali dari URL-nya, jadi
 * ia harus dinyatakan lewat `AI_BASE_URL_OPENROUTER` - dan pernyataan itu
 * hanya berlaku untuk `AI_BASE_URL`, bukan untuk provider dari admin-ppe yang
 * kebetulan dipakai di permintaan yang sama.
 */
export function speaksOpenRouter(baseUrl: string): boolean {
	if (baseUrl.includes('openrouter.ai')) return true

	return env.AI_BASE_URL_OPENROUTER && baseUrl === env.AI_BASE_URL
}
