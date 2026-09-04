/**
 * Mengunduh berkas font yang dipakai editor dari Google Fonts ke dalam repo.
 *
 * Alasannya ada di `features/editor/fonts.ts`: `next/font/google` mengunduh
 * ratusan berkas sekaligus setiap kali cache Turbopack dingin, sebagian gagal,
 * dan kegagalannya ikut tersimpan di cache sehingga build patah secara permanen
 * sampai `.next` dihapus. Dengan font tersimpan di repo, build tidak lagi
 * menyentuh jaringan sama sekali.
 *
 * Jalankan hanya saat daftar font berubah:
 *
 *     bun run apps/web/scripts/download-fonts.ts
 *
 * Skrip mengunduh berurutan dengan percobaan ulang - bukan paralel - persis
 * supaya tidak mengulang ledakan permintaan yang jadi sumber masalah tadi.
 */

/** Google hanya menyajikan woff2 kepada peramban modern. */
const USER_AGENT =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

/**
 * Hanya subset `latin` yang diambil. `next/font/local` tidak bisa menyatakan
 * `unicode-range` per berkas, jadi satu pasangan berat+gaya hanya boleh
 * dipetakan ke satu berkas - subset lain (cyrillic, greek, vietnamese) tidak
 * bisa ikut tanpa membuat dua `@font-face` yang saling bertabrakan. Untuk
 * aplikasi berbahasa Indonesia, `latin` sudah menutup seluruh alfabet, tanda
 * baca tipografis, dan simbol mata uang yang dipakai.
 */
const SUBSET = 'latin'

type Family = {
	/** Nama seperti yang dikenal Google Fonts. */
	family: string
	/** Awalan nama berkas hasil unduhan. */
	slug: string
	/**
	 * Sumbu berat yang diminta: rentang `100..900` untuk variable font (satu
	 * berkas menutup semua berat), atau daftar `400;700` untuk font statis.
	 */
	weights: string
	styles: Array<'normal' | 'italic'>
}

const FAMILIES: Family[] = [
	{ family: 'Inter', slug: 'inter', weights: '100..900', styles: ['normal'] },
	{ family: 'Source Serif 4', slug: 'source-serif-4', weights: '200..900', styles: ['normal', 'italic'] },
	{ family: 'Lato', slug: 'lato', weights: '400;700', styles: ['normal', 'italic'] },
	{ family: 'Lexend', slug: 'lexend', weights: '100..900', styles: ['normal'] },
	{ family: 'Montserrat', slug: 'montserrat', weights: '100..900', styles: ['normal', 'italic'] },
	{ family: 'Nunito', slug: 'nunito', weights: '200..1000', styles: ['normal', 'italic'] },
	{ family: 'Open Sans', slug: 'open-sans', weights: '300..800', styles: ['normal', 'italic'] },
	{ family: 'Oswald', slug: 'oswald', weights: '200..700', styles: ['normal'] },
	{ family: 'Poppins', slug: 'poppins', weights: '400;700', styles: ['normal', 'italic'] },
	{ family: 'Raleway', slug: 'raleway', weights: '100..900', styles: ['normal', 'italic'] },
	{ family: 'Roboto', slug: 'roboto', weights: '100..900', styles: ['normal', 'italic'] },
	{ family: 'EB Garamond', slug: 'eb-garamond', weights: '400..800', styles: ['normal', 'italic'] },
	{
		family: 'Libre Baskerville',
		slug: 'libre-baskerville',
		weights: '400..700',
		styles: ['normal', 'italic'],
	},
	{ family: 'Lora', slug: 'lora', weights: '400..700', styles: ['normal', 'italic'] },
	{ family: 'Merriweather', slug: 'merriweather', weights: '300..900', styles: ['normal', 'italic'] },
	{
		family: 'Playfair Display',
		slug: 'playfair-display',
		weights: '400..900',
		styles: ['normal', 'italic'],
	},
	{ family: 'Roboto Slab', slug: 'roboto-slab', weights: '100..900', styles: ['normal'] },
	{ family: 'Spectral', slug: 'spectral', weights: '400;700', styles: ['normal', 'italic'] },
	{ family: 'JetBrains Mono', slug: 'jetbrains-mono', weights: '100..800', styles: ['normal', 'italic'] },
	{ family: 'Roboto Mono', slug: 'roboto-mono', weights: '100..700', styles: ['normal', 'italic'] },
	{ family: 'Caveat', slug: 'caveat', weights: '400..700', styles: ['normal'] },
	{ family: 'Lobster', slug: 'lobster', weights: '400', styles: ['normal'] },
	{ family: 'Pacifico', slug: 'pacifico', weights: '400', styles: ['normal'] },
]

const OUT_DIR = new URL('../public/fonts/', import.meta.url).pathname

/**
 * Google mensyaratkan tupel sumbu terurut menaik, dan menuntut sumbu `ital`
 * ikut disebut begitu gaya miring diminta.
 */
function cssUrl(spec: Family): string {
	const weights = spec.weights.split(';')
	const axis = spec.styles.includes('italic')
		? `ital,wght@${spec.styles
				.map((style) => (style === 'normal' ? 0 : 1))
				.flatMap((ital) => weights.map((weight) => `${ital},${weight}`))
				.join(';')}`
		: `wght@${weights.join(';')}`
	return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(spec.family).replace(/%20/g, '+')}:${axis}&display=swap`
}

type Face = { style: string; weight: string; url: string }

/**
 * CSS dari Google menandai tiap blok dengan komentar nama subset, misalnya
 * `/* latin *\/` tepat sebelum `@font-face`-nya. Itu satu-satunya penanda
 * subset yang tersedia, jadi blok diambil berpasangan dengan komentarnya.
 */
function parseFaces(css: string): Face[] {
	const faces: Face[] = []
	const blocks = css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g)
	for (const [, subset, body] of blocks) {
		if (subset !== SUBSET) continue
		const style = body.match(/font-style:\s*([^;]+);/)?.[1]?.trim()
		const weight = body.match(/font-weight:\s*([^;]+);/)?.[1]?.trim()
		const url = body.match(/src:\s*url\(([^)]+)\)/)?.[1]?.trim()
		if (!style || !weight || !url) continue
		faces.push({ style, weight, url })
	}
	return faces
}

async function fetchWithRetry(url: string, attempts = 4): Promise<Response> {
	let lastError: unknown
	for (let attempt = 1; attempt <= attempts; attempt++) {
		try {
			const response = await fetch(url, { headers: { 'user-agent': USER_AGENT } })
			if (!response.ok) throw new Error(`HTTP ${response.status}`)
			return response
		} catch (error) {
			lastError = error
			if (attempt < attempts) await Bun.sleep(attempt * 500)
		}
	}
	throw new Error(`gagal mengambil ${url}: ${lastError}`)
}

const entries: string[] = []
let written = 0

for (const spec of FAMILIES) {
	const css = await (await fetchWithRetry(cssUrl(spec))).text()
	const faces = parseFaces(css)
	if (faces.length === 0) throw new Error(`tidak ada wajah subset ${SUBSET} untuk ${spec.family}`)

	const lines: string[] = []
	for (const face of faces) {
		const name = `${spec.slug}-${face.style}-${face.weight.replace(/\s+/g, '-')}.woff2`
		const bytes = await (await fetchWithRetry(face.url)).arrayBuffer()
		await Bun.write(`${OUT_DIR}${name}`, bytes)
		written++
		lines.push(
			`\t\t{ path: '../../public/fonts/${name}', weight: '${face.weight}', style: '${face.style}' },`,
		)
	}
	entries.push(`\t// ${spec.family}\n${lines.join('\n')}`)
	console.log(`${spec.family}: ${faces.length} berkas`)
}

console.log(`\n${written} berkas tersimpan di apps/web/public/fonts/\n`)
console.log('Entri `src` untuk features/editor/fonts.ts:\n')
console.log(entries.join('\n'))
