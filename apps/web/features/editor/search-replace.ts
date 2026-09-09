import type { Dispatch, Range } from '@tiptap/core'
import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { type EditorState, Plugin, PluginKey, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export interface SearchAndReplaceOptions {
	searchResultClass: string
}

/** Saklar pencarian lanjutan - semuanya ikut menentukan pola yang dibangun. */
export interface SearchModifiers {
	caseSensitive: boolean
	regex: boolean
	wholeWord: boolean
	ignoreDiacritics: boolean
}

/** Teks aslinya ikut disimpan supaya `$1` di kolom ganti punya bahan. */
export interface SearchResult extends Range {
	text: string
}

export interface SearchAndReplaceStorage extends SearchModifiers {
	searchTerm: string
	replaceTerm: string
	results: SearchResult[]
	resultIndex: number
	/** Pola yang diketik pengguna tidak bisa dikompilasi - bukan "tidak ada hasil". */
	invalidRegex: boolean
	lastSignature: string
}

export const DEFAULT_SEARCH_MODIFIERS: SearchModifiers = {
	caseSensitive: false,
	regex: false,
	wholeWord: false,
	ignoreDiacritics: false,
}

export const searchAndReplacePluginKey = new PluginKey('searchAndReplacePlugin')

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		search: {
			setSearchTerm: (searchTerm: string) => ReturnType
			setReplaceTerm: (replaceTerm: string) => ReturnType
			setSearchOptions: (options: Partial<SearchModifiers>) => ReturnType
			resetIndex: () => ReturnType
			setResultIndex: (index: number) => ReturnType
			nextSearchResult: () => ReturnType
			previousSearchResult: () => ReturnType
			scrollToSearchResult: () => ReturnType
			replace: () => ReturnType
			replaceAll: () => ReturnType
		}
	}
	interface Storage {
		searchAndReplace: SearchAndReplaceStorage
	}
}

interface TextNodesWithPosition {
	text: string
	pos: number
}

const ESCAPE_PATTERN = /[.*+?^${}()|[\]\\]/g
const NON_ASCII = /[^\u0020-\u007e]/

/*
 * Pelipatan diakritik wajib mempertahankan panjang string: posisi hasil cocok
 * dipetakan balik ke dokumen apa adanya. Karena itu satu karakter hanya diganti
 * kalau bentuk terurainya menyisakan jumlah unit yang sama ("ä" → "a"); tanda
 * gabung yang berdiri sendiri dan huruf di luar BMP dibiarkan utuh.
 */
const foldCache = new Map<string, string>()

function foldChar(char: string): string {
	const cached = foldCache.get(char)
	if (cached !== undefined) return cached
	const stripped = char.normalize('NFD').replace(/\p{M}/gu, '')
	const folded = stripped.length === char.length ? stripped : char
	foldCache.set(char, folded)
	return folded
}

export function foldDiacritics(text: string): string {
	if (!NON_ASCII.test(text)) return text
	let folded = ''
	for (const char of text) folded += foldChar(char)
	return folded
}

const WORD_GUARD = {
	unicode: ['(?<![\\p{L}\\p{N}_])', '(?![\\p{L}\\p{N}_])'],
	ascii: ['(?<![A-Za-z0-9_])', '(?![A-Za-z0-9_])'],
} as const

/**
 * Mengembalikan `null` kalau polanya tidak sah - pemanggilnya yang memutuskan
 * cara memberi tahu pengguna, bukan dengan melempar ke tengah transaksi editor.
 */
export function buildSearchRegex(term: string, modifiers: SearchModifiers, global = true): RegExp | null {
	if (!term) return null
	const body = modifiers.regex ? term : term.replace(ESCAPE_PATTERN, '\\$&')
	const flags = `${global ? 'g' : ''}${modifiers.caseSensitive ? '' : 'i'}`
	const wrap = (guard: readonly [string, string]) =>
		modifiers.wholeWord ? `${guard[0]}(?:${body})${guard[1]}` : body

	/* Sebagian pola tulisan tangan hanya sah tanpa flag `u` (mis. `\-`), jadi
	 * mode Unicode cuma percobaan pertama, bukan syarat. */
	const attempts: Array<[string, string]> = [
		[wrap(WORD_GUARD.unicode), `${flags}u`],
		[wrap(WORD_GUARD.ascii), flags],
	]
	for (const [source, attemptFlags] of attempts) {
		try {
			return new RegExp(source, attemptFlags)
		} catch {
			/* pola ditolak dengan flag ini - coba yang berikutnya */
		}
	}
	return null
}

/**
 * Teks pengganti untuk satu hasil. Di mode regex `$1` dst. ikut berlaku; di mode
 * biasa teks ganti dipakai apa adanya, termasuk kalau isinya mengandung `$`.
 * Saat diakritik diabaikan, pencocokan ulang dilakukan atas bentuk terlipat -
 * jadi rujukan balik membawa huruf tanpa aksen, sama seperti yang dicocokkan.
 */
export function replacementFor(
	matchText: string,
	searchTerm: string,
	replaceTerm: string,
	modifiers: SearchModifiers,
): string {
	if (!modifiers.regex) return replaceTerm
	const single = buildSearchRegex(searchTerm, modifiers, false)
	if (!single) return replaceTerm
	const haystack = modifiers.ignoreDiacritics ? foldDiacritics(matchText) : matchText
	return haystack.replace(single, replaceTerm)
}

export function collectResults(doc: PMNode, regex: RegExp, ignoreDiacritics: boolean): SearchResult[] {
	const results: SearchResult[] = []
	let textNodesWithPosition: TextNodesWithPosition[] = []
	let index = 0

	doc.descendants((node, pos) => {
		if (node.isText) {
			if (textNodesWithPosition[index]) {
				textNodesWithPosition[index] = {
					text: textNodesWithPosition[index].text + node.text,
					pos: textNodesWithPosition[index].pos,
				}
			} else {
				textNodesWithPosition[index] = { text: `${node.text}`, pos }
			}
		} else {
			index += 1
		}
	})

	textNodesWithPosition = textNodesWithPosition.filter(Boolean)

	for (const element of textNodesWithPosition) {
		const { text, pos } = element
		const haystack = ignoreDiacritics ? foldDiacritics(text) : text
		for (const match of haystack.matchAll(regex)) {
			/* Cocok sepanjang nol (mis. `a*`) tidak menyorot apa pun dan tidak bisa
			 * diganti - dilewati, bukan menghentikan sisa dokumen. */
			if (!match[0] || match.index === undefined) continue
			const from = pos + match.index
			results.push({
				from,
				to: from + match[0].length,
				text: text.slice(match.index, match.index + match[0].length),
			})
		}
	}

	return results
}

const replaceCurrent = (
	storage: SearchAndReplaceStorage,
	{ state, dispatch }: { state: EditorState; dispatch: Dispatch },
): void => {
	const current = storage.results[storage.resultIndex] ?? storage.results[0]
	if (!current) return
	const text = replacementFor(current.text, storage.searchTerm, storage.replaceTerm, storage)
	if (dispatch) dispatch(state.tr.insertText(text, current.from, current.to))
}

const replaceEvery = (
	storage: SearchAndReplaceStorage,
	{ tr, dispatch }: { tr: Transaction; dispatch: Dispatch },
): void => {
	if (!storage.results.length) return
	/* Dari belakang ke depan: penggantian di ekor dokumen tidak menggeser posisi
	 * hasil di depannya, jadi tidak ada offset yang perlu dihitung ulang. */
	for (let i = storage.results.length - 1; i >= 0; i -= 1) {
		const result = storage.results[i]
		tr.insertText(
			replacementFor(result.text, storage.searchTerm, storage.replaceTerm, storage),
			result.from,
			result.to,
		)
	}
	if (dispatch) dispatch(tr)
}

function signatureOf(storage: SearchAndReplaceStorage): string {
	return [
		storage.searchTerm,
		storage.caseSensitive,
		storage.regex,
		storage.wholeWord,
		storage.ignoreDiacritics,
		storage.resultIndex,
	].join(' ')
}

export const SearchAndReplace = Extension.create<SearchAndReplaceOptions, SearchAndReplaceStorage>({
	name: 'searchAndReplace',

	addOptions() {
		return { searchResultClass: 'search-result' }
	},

	addStorage() {
		return {
			...DEFAULT_SEARCH_MODIFIERS,
			searchTerm: '',
			replaceTerm: '',
			results: [],
			resultIndex: 0,
			invalidRegex: false,
			lastSignature: '',
		}
	},

	addCommands() {
		return {
			setSearchTerm: (searchTerm: string) => () => {
				this.storage.searchTerm = searchTerm
				return false
			},
			setReplaceTerm: (replaceTerm: string) => () => {
				this.storage.replaceTerm = replaceTerm
				return false
			},
			setSearchOptions: (options: Partial<SearchModifiers>) => () => {
				Object.assign(this.storage, options)
				return false
			},
			resetIndex: () => () => {
				this.storage.resultIndex = 0
				return false
			},
			setResultIndex: (index: number) => () => {
				if (this.storage.results[index]) this.storage.resultIndex = index
				return false
			},
			nextSearchResult: () => () => {
				const { results, resultIndex } = this.storage
				this.storage.resultIndex = results[resultIndex + 1] ? resultIndex + 1 : 0
				return false
			},
			previousSearchResult: () => () => {
				const { results, resultIndex } = this.storage
				this.storage.resultIndex = results[resultIndex - 1] ? resultIndex - 1 : results.length - 1
				return false
			},
			scrollToSearchResult:
				() =>
				({ editor }) => {
					const current = this.storage.results[this.storage.resultIndex]
					if (!current || editor.isDestroyed) return false
					const at = editor.view.domAtPos(current.from)
					const element = at.node.nodeType === 3 ? at.node.parentElement : (at.node as HTMLElement)
					element?.scrollIntoView({ block: 'center', inline: 'nearest' })
					return false
				},
			replace:
				() =>
				({ state, dispatch }) => {
					replaceCurrent(this.storage, { state, dispatch })
					return false
				},
			replaceAll:
				() =>
				({ tr, dispatch }) => {
					replaceEvery(this.storage, { tr, dispatch })
					return false
				},
		}
	},

	addProseMirrorPlugins() {
		const storage = this.storage
		const { searchResultClass } = this.options

		return [
			new Plugin({
				key: searchAndReplacePluginKey,
				state: {
					init: () => DecorationSet.empty,
					apply({ doc, docChanged }, oldState) {
						if (!docChanged && signatureOf(storage) === storage.lastSignature) return oldState

						if (!storage.searchTerm) {
							storage.results = []
							storage.resultIndex = 0
							storage.invalidRegex = false
							storage.lastSignature = signatureOf(storage)
							return DecorationSet.empty
						}

						const regex = buildSearchRegex(storage.searchTerm, storage)
						storage.invalidRegex = regex === null
						if (!regex) {
							storage.results = []
							storage.lastSignature = signatureOf(storage)
							return DecorationSet.empty
						}

						const results = collectResults(doc, regex, storage.ignoreDiacritics)
						storage.results = results
						/* Indeks bisa tertinggal di luar rentang setelah kata kunci berubah
						 * atau dokumen menyusut - dijepit dulu, baru jadi tanda tangan. */
						if (storage.resultIndex >= results.length) storage.resultIndex = 0
						storage.lastSignature = signatureOf(storage)

						const decorations = results.map((result, index) =>
							Decoration.inline(result.from, result.to, {
								class:
									index === storage.resultIndex
										? `${searchResultClass} ${searchResultClass}-current`
										: searchResultClass,
							}),
						)
						return DecorationSet.create(doc, decorations)
					},
				},
				props: {
					decorations(state) {
						return this.getState(state)
					},
				},
			}),
		]
	},
})
