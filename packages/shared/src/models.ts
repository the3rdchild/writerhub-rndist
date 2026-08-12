/**
 * Model chat yang boleh dipilih dari UI.
 *
 * Daftar kurasi, bukan daftar hidup dari provider, dan itu disengaja: id yang
 * dikirim klien dipakai apa adanya sebagai `model` ke provider, jadi ia harus
 * divalidasi di server. Daftar bersama ini yang jadi validatornya - UI dan
 * server membaca sumber yang sama, sehingga tidak mungkin berselisih.
 *
 * Id-nya id OpenRouter (`vendor/model`), karena itulah base URL bawaan API
 * (`AI_BASE_URL`). Kalau provider seorang pengguna diresolusi dari admin-ppe ke
 * base URL lain, pilihan ini diabaikan server dan model bawaan yang dipakai -
 * lihat catatan di apps/api/src/services/chat/service.ts.
 *
 * `tools: false` berarti model itu tidak mendukung tool calling. Ia tetap boleh
 * dipilih - jawaban prosa biasa tetap jalan - tapi klien akan jatuh ke protokol
 * blok teks (`fallbackToolPrompt`) untuk mengoperasikan editor, dan itu jauh
 * lebih rapuh. UI menandainya supaya pilihannya sadar.
 */

export interface ChatModel {
	/** Id model di provider; dikirim apa adanya sebagai `model`. */
	id: string
	/** Nama yang ditampilkan di pemilih. */
	label: string
	/** Keterangan singkat di bawah nama. */
	hint: string
	/** Mendukung tool calling - alat editor hanya andal pada model ini. */
	tools: boolean
	/** Gratis di OpenRouter (id berakhiran `:free`). */
	free?: boolean
}

/**
 * Nilai khusus "ikuti bawaan server": klien tidak mengirim `model` sama sekali,
 * jadi yang berlaku adalah provider dari admin-ppe atau `AI_MODEL` di env.
 * Ada sebagai pilihan tersendiri supaya pengguna punya jalan kembali yang jelas.
 */
export const DEFAULT_CHAT_MODEL = ''

export const CHAT_MODELS: readonly ChatModel[] = [
	{
		id: DEFAULT_CHAT_MODEL,
		label: 'Bawaan',
		hint: 'Model yang disetel untuk akun ini',
		tools: true,
	},

	{
		id: 'deepseek/deepseek-v4-flash',
		label: 'DeepSeek V4 Flash',
		hint: 'Cepat dan murah; konteks 1 juta token',
		tools: true,
	},
	{
		id: 'deepseek/deepseek-v4-pro',
		label: 'DeepSeek V4 Pro',
		hint: 'Lebih kuat untuk penalaran panjang',
		tools: true,
	},
	{
		id: 'google/gemini-3.6-flash',
		label: 'Gemini 3.6 Flash',
		hint: 'Cepat, konteks 1 juta token',
		tools: true,
	},
	{
		id: 'anthropic/claude-sonnet-5',
		label: 'Claude Sonnet 5',
		hint: 'Kuat untuk menyunting naskah panjang',
		tools: true,
	},
	{
		id: 'anthropic/claude-opus-5',
		label: 'Claude Opus 5',
		hint: 'Paling kuat, paling mahal',
		tools: true,
	},
	{
		id: 'openai/gpt-5.6-sol',
		label: 'GPT-5.6 Sol',
		hint: 'Serba bisa dari OpenAI',
		tools: true,
	},
	{
		id: 'moonshotai/kimi-k3',
		label: 'Kimi K3',
		hint: 'Konteks besar, kuat di teks non-Inggris',
		tools: true,
	},

	// Gratis - berguna untuk mencoba tanpa membakar kuota. Yang tidak mendukung
	// tool calling tidak dimasukkan sama sekali: pada panel ini ia hanya akan
	// tampak rusak.
	{
		id: 'inclusionai/ling-3.0-tiny:free',
		label: 'Ling 3.0 Tiny',
		hint: 'Gratis; kecil, untuk tanya jawab ringan',
		tools: true,
		free: true,
	},
	{
		id: 'poolside/laguna-s-2.1:free',
		label: 'Laguna S 2.1',
		hint: 'Gratis; condong ke tugas terstruktur',
		tools: true,
		free: true,
	},
]

const CHAT_MODEL_IDS = new Set(CHAT_MODELS.map((model) => model.id))

/** Penjaga di server: id di luar daftar diabaikan, bukan diteruskan ke provider. */
export function isKnownChatModel(id: string): boolean {
	return CHAT_MODEL_IDS.has(id)
}

export function findChatModel(id: string): ChatModel | undefined {
	return CHAT_MODELS.find((model) => model.id === id)
}
