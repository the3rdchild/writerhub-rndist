export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Pencarian referensi lewat Crossref.
 *
 * Diperantarai di sisi server, bukan dipanggil langsung dari browser: dengan
 * begitu alamat IP pembaca tidak ikut terkirim ke layanan luar, dan kalau
 * sumbernya suatu saat diganti (Semantic Scholar, OpenAlex) yang berubah hanya
 * berkas ini.
 *
 * Perlu diketahui: potongan teks yang dicari memang dikirim keluar ke Crossref.
 */
const CROSSREF_URL = 'https://api.crossref.org/works'
const MAX_QUERY_LENGTH = 400
const RESULT_COUNT = 5
const TIMEOUT_MS = 12_000

interface CrossrefItem {
	DOI?: string
	title?: string[]
	author?: Array<{ given?: string; family?: string }>
	'container-title'?: string[]
	issued?: { 'date-parts'?: number[][] }
	URL?: string
}

export interface Citation {
	doi: string | null
	title: string
	authors: string[]
	year: number | null
	source: string | null
	url: string | null
}

function toCitation(item: CrossrefItem): Citation {
	return {
		doi: item.DOI ?? null,
		title: item.title?.[0]?.trim() || 'Tanpa judul',
		authors: (item.author ?? [])
			.map((author) => [author.given, author.family].filter(Boolean).join(' ').trim())
			.filter(Boolean)
			.slice(0, 6),
		year: item.issued?.['date-parts']?.[0]?.[0] ?? null,
		source: item['container-title']?.[0] ?? null,
		url: item.URL ?? (item.DOI ? `https://doi.org/${item.DOI}` : null),
	}
}

export async function GET(request: Request): Promise<Response> {
	const query = new URL(request.url).searchParams.get('q')?.trim().slice(0, MAX_QUERY_LENGTH)

	if (!query) {
		return Response.json({ message: 'Bad Request', errors: ['Parameter q wajib diisi'] }, { status: 400 })
	}

	const url = new URL(CROSSREF_URL)
	url.searchParams.set('query.bibliographic', query)
	url.searchParams.set('rows', String(RESULT_COUNT))
	url.searchParams.set('select', 'DOI,title,author,container-title,issued,URL')

	try {
		const response = await fetch(url, {
			headers: {
				// Crossref meminta kontak di User-Agent supaya lalu lintasnya bisa
				// ditelusuri; tanpa itu permintaan bisa dibatasi lebih ketat.
				'user-agent': 'writer-hub/0.1 (https://github.com/the3rdchild/writer-hub)',
			},
			signal: AbortSignal.timeout(TIMEOUT_MS),
			cache: 'no-store',
		})

		if (!response.ok) {
			return Response.json(
				{ message: 'Pencarian gagal', errors: [`Crossref membalas ${response.status}`] },
				{ status: 502 },
			)
		}

		const body = await response.json()
		const items: CrossrefItem[] = body?.message?.items ?? []

		return Response.json({ message: 'sukses', data: items.map(toCitation) })
	} catch (error) {
		const reason = error instanceof Error ? error.message : 'Gagal menghubungi Crossref'
		return Response.json({ message: 'Pencarian gagal', errors: [reason] }, { status: 502 })
	}
}
