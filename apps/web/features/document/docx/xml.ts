/**
 * Lapisan tipis di atas XML, secukupnya untuk membaca OOXML.
 *
 * Semua pencarian memakai nama lokal - `pPr`, bukan `w:pPr`. Prefiks namespace
 * sebenarnya bebas dipilih penulis berkas; Word memang selalu memakai `w:`,
 * tapi mengunci diri pada prefiks berarti berkas dari penghasil lain gagal
 * dibaca tanpa alasan yang benar.
 */

/** Mengubah teks XML jadi elemen akar. */
export type XmlParser = (source: string) => Element

/**
 * Menyiapkan pengurai yang cocok dengan tempat kode ini berjalan.
 *
 * Di peramban dipakai `DOMParser` bawaan - ia asli dan jauh lebih cepat untuk
 * `document.xml` yang bisa ratusan kilobyte. Di luar peramban (uji berjalan di
 * Bun, yang tidak punya DOM) barulah xmldom dimuat, dan hanya di sana, supaya
 * tidak ikut membebani bundel halaman.
 */
export async function createXmlParser(): Promise<XmlParser> {
	if (typeof DOMParser !== 'undefined') {
		const parser = new DOMParser()
		return (source) => documentElementOf(parser.parseFromString(source, 'application/xml'))
	}

	const { DOMParser: XmldomParser } = await import('@xmldom/xmldom')
	const parser = new XmldomParser()
	return (source) =>
		documentElementOf(parser.parseFromString(source, 'application/xml') as unknown as Document)
}

function documentElementOf(document: Document): Element {
	const root = document.documentElement
	if (!root) throw new Error('XML tanpa elemen akar')
	// DOMParser tidak melempar saat gagal; ia mengembalikan dokumen berisi
	// <parsererror>. Tanpa pemeriksaan ini kegagalan menyamar jadi berkas kosong.
	if (localNameOf(root) === 'parsererror') throw new Error(`XML rusak: ${root.textContent ?? ''}`)
	return root
}

/** Nama tanpa prefiks namespace. */
function localNameOf(node: { localName?: string | null; nodeName: string }): string {
	return node.localName ?? node.nodeName.replace(/^.*:/, '')
}

const ELEMENT_NODE = 1

/** Anak langsung, disaring nama lokalnya bila diminta. */
export function children(parent: Element, name?: string): Element[] {
	const result: Element[] = []
	for (let node = parent.firstChild; node; node = node.nextSibling) {
		if (node.nodeType !== ELEMENT_NODE) continue
		const element = node as Element
		if (name === undefined || localNameOf(element) === name) result.push(element)
	}
	return result
}

/** Anak langsung pertama dengan nama tersebut. */
export function child(parent: Element | null | undefined, name: string): Element | null {
	if (!parent) return null
	for (let node = parent.firstChild; node; node = node.nextSibling) {
		if (node.nodeType === ELEMENT_NODE && localNameOf(node as Element) === name) {
			return node as Element
		}
	}
	return null
}

/** Menelusuri rantai anak; berhenti begitu satu mata rantai tidak ada. */
export function descend(parent: Element | null | undefined, ...names: string[]): Element | null {
	let current = parent ?? null
	for (const name of names) {
		current = child(current, name)
		if (!current) return null
	}
	return current
}

export function tagName(element: Element): string {
	return localNameOf(element)
}

/**
 * Atribut, dicari tanpa memedulikan prefiks.
 *
 * `getAttribute('w:val')` gagal begitu berkas memakai prefiks lain, dan
 * `getAttributeNS` menuntut kita hafal namespace tiap atribut - padahal di
 * OOXML nama lokalnya sudah cukup membedakan.
 */
export function attr(element: Element | null | undefined, name: string): string | undefined {
	if (!element) return undefined
	const attributes = element.attributes
	for (let index = 0; index < attributes.length; index += 1) {
		const attribute = attributes[index]
		if (attribute && localNameOf(attribute) === name) return attribute.value
	}
	return undefined
}

/** Atribut `val`, yang dipakai hampir seluruh elemen properti OOXML. */
export function val(element: Element | null | undefined): string | undefined {
	return attr(element, 'val')
}

export function intVal(element: Element | null | undefined): number | undefined {
	const raw = val(element)
	if (raw === undefined) return undefined
	const parsed = Number.parseInt(raw, 10)
	return Number.isFinite(parsed) ? parsed : undefined
}

/**
 * Properti nyala/mati OOXML.
 *
 * Kehadiran elemennya sudah berarti nyala - `<w:b/>` adalah tebal. Atribut
 * `val` hanya muncul ketika seseorang ingin mematikannya kembali, biasanya
 * untuk membatalkan warisan dari gaya induk.
 */
export function onOff(element: Element | null | undefined): boolean | undefined {
	if (!element) return undefined
	const raw = val(element)
	if (raw === undefined) return true
	return raw !== '0' && raw !== 'false' && raw !== 'off'
}
