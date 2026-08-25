import { attr, child, children, intVal, onOff, val } from './xml'
export interface NumberingLevel {
	start: number
	format: string
	text: string
	isLegal: boolean
	restart?: number
}

interface AbstractNumbering {
	levels: Map<number, NumberingLevel>
}

interface NumberingInstance {
	abstractId: number
	levels: Map<number, NumberingLevel>
	starts: Map<number, number>
}

export interface Numbering {
	abstracts: Map<number, AbstractNumbering>
	instances: Map<number, NumberingInstance>
}

function readLevel(lvl: Element): { ilvl: number; level: NumberingLevel } | null {
	const ilvl = Number.parseInt(attr(lvl, 'ilvl') ?? '', 10)
	if (!Number.isFinite(ilvl)) return null

	return {
		ilvl,
		level: {
			start: intVal(child(lvl, 'start')) ?? 1,
			format: val(child(lvl, 'numFmt')) ?? 'decimal',
			text: val(child(lvl, 'lvlText')) ?? '',
			isLegal: onOff(child(lvl, 'isLgl')) === true,
			restart: intVal(child(lvl, 'lvlRestart')),
		},
	}
}

export function readNumbering(root: Element | null): Numbering {
	const numbering: Numbering = { abstracts: new Map(), instances: new Map() }
	if (!root) return numbering

	for (const abstract of children(root, 'abstractNum')) {
		const id = Number.parseInt(attr(abstract, 'abstractNumId') ?? '', 10)
		if (!Number.isFinite(id)) continue

		const levels = new Map<number, NumberingLevel>()
		for (const lvl of children(abstract, 'lvl')) {
			const parsed = readLevel(lvl)
			if (parsed) levels.set(parsed.ilvl, parsed.level)
		}
		numbering.abstracts.set(id, { levels })
	}

	for (const num of children(root, 'num')) {
		const id = Number.parseInt(attr(num, 'numId') ?? '', 10)
		const abstractId = intVal(child(num, 'abstractNumId'))
		if (!Number.isFinite(id) || abstractId === undefined) continue

		const instance: NumberingInstance = { abstractId, levels: new Map(), starts: new Map() }
		for (const override of children(num, 'lvlOverride')) {
			const ilvl = Number.parseInt(attr(override, 'ilvl') ?? '', 10)
			if (!Number.isFinite(ilvl)) continue

			const startOverride = intVal(child(override, 'startOverride'))
			if (startOverride !== undefined) instance.starts.set(ilvl, startOverride)

			const lvl = child(override, 'lvl')
			if (lvl) {
				const parsed = readLevel(lvl)
				if (parsed) instance.levels.set(ilvl, parsed.level)
			}
		}

		numbering.instances.set(id, instance)
	}

	return numbering
}

const ROMAN: [number, string][] = [
	[1000, 'M'],
	[900, 'CM'],
	[500, 'D'],
	[400, 'CD'],
	[100, 'C'],
	[90, 'XC'],
	[50, 'L'],
	[40, 'XL'],
	[10, 'X'],
	[9, 'IX'],
	[5, 'V'],
	[4, 'IV'],
	[1, 'I'],
]

function toRoman(value: number): string {
	if (value <= 0) return String(value)

	let remaining = value
	let result = ''
	for (const [amount, numeral] of ROMAN) {
		while (remaining >= amount) {
			result += numeral
			remaining -= amount
		}
	}
	return result
}
function toLetter(value: number): string {
	if (value <= 0) return String(value)

	const index = (value - 1) % 26
	const repeat = Math.floor((value - 1) / 26) + 1
	return String.fromCharCode(65 + index).repeat(repeat)
}

function formatCounter(value: number, format: string): string {
	switch (format) {
		case 'decimalZero':
			return value < 10 ? `0${value}` : String(value)
		case 'upperRoman':
			return toRoman(value)
		case 'lowerRoman':
			return toRoman(value).toLowerCase()
		case 'upperLetter':
			return toLetter(value)
		case 'lowerLetter':
			return toLetter(value).toLowerCase()
		default:
			return String(value)
	}
}
const BULLETS: Record<string, string> = {
	'\uf0b7': '•', // Symbol, butir bulat - yang paling sering dipakai
	'\uf0a7': '▪', // Wingdings, kotak kecil pejal
	'\uf0d8': '➢', // Wingdings, panah
	'\uf06c': '●', // Wingdings, bulatan besar
	'\uf0a8': '▫', // Wingdings, kotak kecil kosong
	'\uf0fc': '✔', // Wingdings, centang
	'\uf0d2': '❑', // Wingdings, kotak
	'\uf04a': '☺', // Wingdings, wajah
}

function toBullet(text: string): string {
	return [...text]
		.map((character) => {
			const mapped = BULLETS[character]
			if (mapped) return mapped
			const code = character.codePointAt(0) ?? 0
			return code >= 0xe000 && code <= 0xf8ff ? '•' : character
		})
		.join('')
}
export type Numberer = (numId: number, ilvl: number) => string | null

const MAX_LEVELS = 9

export function createNumberer(numbering: Numbering): Numberer {
	const counters = new Map<number, number[]>()
	const started = new Map<number, boolean[]>()

	const levelOf = (numId: number, ilvl: number): NumberingLevel | null => {
		const instance = numbering.instances.get(numId)
		if (!instance) return null

		return (
			instance.levels.get(ilvl) ??
			numbering.abstracts.get(instance.abstractId)?.levels.get(ilvl) ??
			null
		)
	}

	const startOf = (numId: number, ilvl: number): number => {
		const instance = numbering.instances.get(numId)
		return instance?.starts.get(ilvl) ?? levelOf(numId, ilvl)?.start ?? 1
	}

	return (numId, ilvl) => {
		const level = levelOf(numId, ilvl)
		if (!level) return null
		if (level.format === 'none') return null

		if (!counters.has(numId)) {
			counters.set(
				numId,
				Array.from({ length: MAX_LEVELS }, (_, index) => startOf(numId, index)),
			)
			started.set(numId, Array.from({ length: MAX_LEVELS }, () => false))
		}
		const counter = counters.get(numId) as number[]
		const seen = started.get(numId) as boolean[]

		if (seen[ilvl]) counter[ilvl] = (counter[ilvl] as number) + 1
		else {
			counter[ilvl] = startOf(numId, ilvl)
			seen[ilvl] = true
		}
		for (let deeper = ilvl + 1; deeper < MAX_LEVELS; deeper += 1) {
			if (levelOf(numId, deeper)?.restart === 0) continue
			counter[deeper] = startOf(numId, deeper)
			seen[deeper] = false
		}

		if (level.format === 'bullet') return toBullet(level.text)
		return level.text.replace(/%(\d)/g, (_, digit: string) => {
			const index = Number.parseInt(digit, 10) - 1
			if (index < 0 || index >= MAX_LEVELS) return ''

			const format = level.isLegal ? 'decimal' : (levelOf(numId, index)?.format ?? 'decimal')
			return formatCounter(counter[index] as number, format)
		})
	}
}
