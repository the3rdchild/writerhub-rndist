export type XmlParser = (source: string) => Element

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
	if (localNameOf(root) === 'parsererror') throw new Error(`XML rusak: ${root.textContent ?? ''}`)
	return root
}

function localNameOf(node: { localName?: string | null; nodeName: string }): string {
	return node.localName ?? node.nodeName.replace(/^.*:/, '')
}

const ELEMENT_NODE = 1

export function children(parent: Element, name?: string): Element[] {
	const result: Element[] = []
	for (let node = parent.firstChild; node; node = node.nextSibling) {
		if (node.nodeType !== ELEMENT_NODE) continue
		const element = node as Element
		if (name === undefined || localNameOf(element) === name) result.push(element)
	}
	return result
}

export function child(parent: Element | null | undefined, name: string): Element | null {
	if (!parent) return null
	for (let node = parent.firstChild; node; node = node.nextSibling) {
		if (node.nodeType === ELEMENT_NODE && localNameOf(node as Element) === name) {
			return node as Element
		}
	}
	return null
}

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

export function attr(element: Element | null | undefined, name: string): string | undefined {
	if (!element) return undefined
	const attributes = element.attributes
	for (let index = 0; index < attributes.length; index += 1) {
		const attribute = attributes[index]
		if (attribute && localNameOf(attribute) === name) return attribute.value
	}
	return undefined
}

export function val(element: Element | null | undefined): string | undefined {
	return attr(element, 'val')
}

export function intVal(element: Element | null | undefined): number | undefined {
	const raw = val(element)
	if (raw === undefined) return undefined
	const parsed = Number.parseInt(raw, 10)
	return Number.isFinite(parsed) ? parsed : undefined
}

export function onOff(element: Element | null | undefined): boolean | undefined {
	if (!element) return undefined
	const raw = val(element)
	if (raw === undefined) return true
	return raw !== '0' && raw !== 'false' && raw !== 'off'
}
