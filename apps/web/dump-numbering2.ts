import { readFileSync } from 'node:fs'

const doc = readFileSync('/tmp/docx-analisis/extracted/word/document.xml', 'utf-8')
const num = readFileSync('/tmp/docx-analisis/extracted/word/numbering.xml', 'utf-8')

// numId → abstractId
const numToAbs = new Map<string, string>()
for (const m of num.matchAll(/<w:num w:numId="(\d+)"[^>]*>\s*<w:abstractNumId w:val="(\d+)"/g))
	numToAbs.set(m[1] as string, m[2] as string)

// abstractId → ilvl → { fmt, text, start }
interface Level {
	fmt: string
	text: string
	start: number
}
const absLevels = new Map<string, Map<number, Level>>()
for (const abs of num.matchAll(/<w:abstractNum [^>]*w:abstractNumId="(\d+)"[^>]*>([\s\S]*?)<\/w:abstractNum>/g)) {
	const levels = new Map<number, Level>()
	for (const lvl of (abs[2] as string).matchAll(/<w:lvl w:ilvl="(\d+)"[^>]*>([\s\S]*?)<\/w:lvl>/g)) {
		const ilvl = Number(lvl[1])
		const fmt = /<w:numFmt w:val="(\w+)"/.exec(lvl[2] as string)?.[1] ?? 'decimal'
		const text = /<w:lvlText w:val="([^"]*)"/.exec(lvl[2] as string)?.[1] ?? ''
		const start = Number(/<w:start w:val="(\d+)"/.exec(lvl[2] as string)?.[1] ?? '1')
		levels.set(ilvl, { fmt, text, start })
	}
	absLevels.set(abs[1] as string, levels)
}

// counter per numId
const counters = new Map<string, number[]>()

for (const p of doc.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)) {
	const body = p[1] as string
	const numPr = /<w:ilvl w:val="(\d+)"\/><w:numId w:val="(\d+)"\/>/.exec(body)
	if (!numPr) continue
	const ilvl = Number(numPr[1])
	const numId = numPr[2] as string
	const absId = numToAbs.get(numId) ?? '?'
	const level = absLevels.get(absId)?.get(ilvl)

	if (!counters.has(numId)) counters.set(numId, [])
	const arr = counters.get(numId) as number[]
	arr[ilvl] = (arr[ilvl] ?? level?.start ?? 1 - 1) + 1

	const texts = [...body.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((t) => t[1]).join('')
	const style = /<w:pStyle w:val="([^"]+)"/.exec(body)?.[1] ?? ''
	console.log(
		`numId ${numId}(abs ${absId}) ilvl ${ilvl} [${level?.fmt}/${level?.text}] #${arr[ilvl]} style=${style} | ${texts.slice(0, 60)}`,
	)
}
