import { readFileSync } from 'node:fs'

const src = readFileSync('/tmp/docx-analisis/extracted/word/numbering.xml', 'utf-8')
const doc = readFileSync('/tmp/docx-analisis/extracted/word/document.xml', 'utf-8')

// abstractNum → levels (fmt, lvlText)
console.log('=== abstractNum ===')
for (const abs of src.matchAll(/<w:abstractNum [^>]*w:abstractNumId="(\d+)"[^>]*>([\s\S]*?)<\/w:abstractNum>/g)) {
	const [, id, body] = abs
	const levels = [...body.matchAll(/<w:lvl w:ilvl="(\d+)"[^>]*>[\s\S]*?<w:numFmt w:val="(\w+)"\/>[\s\S]*?<w:lvlText w:val="([^"]*)"\/>/g)]
		.slice(0, 4)
		.map((m) => `L${m[1]}:${m[2]}(${m[3]})`)
	console.log(`abstract ${id}:`, levels.join(' '))
}

console.log('\n=== num → abstract ===')
for (const num of src.matchAll(/<w:num w:numId="(\d+)"[^>]*>\s*<w:abstractNumId w:val="(\d+)"/g)) {
	console.log(`num ${num[1]} → abstract ${num[2]}`)
}

console.log('\n=== numPr usage in document ===')
const usage = new Map<string, number>()
for (const m of doc.matchAll(/<w:numId w:val="(\d+)"\/><\/w:numPr>/g)) {
	usage.set(m[1] as string, (usage.get(m[1] as string) ?? 0) + 1)
}
for (const [numId, count] of usage) console.log(`numId ${numId}: ${count} paragraf`)

console.log('\n=== ilvl per numId ===')
for (const m of doc.matchAll(/<w:numPr><w:ilvl w:val="(\d+)"\/><w:numId w:val="(\d+)"\/>/g)) {
	const key = `numId ${m[2]} ilvl ${m[1]}`
	console.log(key)
}
