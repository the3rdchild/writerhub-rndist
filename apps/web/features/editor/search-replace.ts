
import type { Dispatch, Range } from '@tiptap/core'
import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { type EditorState, Plugin, PluginKey, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
export interface SearchAndReplaceOptions {
	searchResultClass: string
	disableRegex: boolean
}

export interface SearchAndReplaceStorage {
	searchTerm: string
	replaceTerm: string
	results: Range[]
	lastSearchTerm: string
	caseSensitive: boolean
	lastCaseSensitive: boolean
	resultIndex: number
	lastResultIndex: number
}

export const searchAndReplacePluginKey = new PluginKey('searchAndReplacePlugin')

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		search: {
			setSearchTerm: (searchTerm: string) => ReturnType
			setReplaceTerm: (replaceTerm: string) => ReturnType
			setCaseSensitive: (caseSensitive: boolean) => ReturnType
			resetIndex: () => ReturnType
			nextSearchResult: () => ReturnType
			previousSearchResult: () => ReturnType
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

const getRegex = (s: string, disableRegex: boolean, caseSensitive: boolean): RegExp =>
	RegExp(disableRegex ? s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : s, caseSensitive ? 'gu' : 'gui')

interface ProcessedSearches {
	decorationsToReturn: DecorationSet
	results: Range[]
}

function processSearches(
	doc: PMNode,
	searchTerm: RegExp,
	searchResultClass: string,
	resultIndex: number,
): ProcessedSearches {
	const decorations: Decoration[] = []
	const results: Range[] = []

	if (!searchTerm) return { decorationsToReturn: DecorationSet.empty, results: [] }

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
		const matches = Array.from(text.matchAll(searchTerm)).filter(([matchText]) => matchText.trim())
		for (const m of matches) {
			if (m[0] === '') break
			if (m.index !== undefined) {
				results.push({ from: pos + m.index, to: pos + m.index + m[0].length })
			}
		}
	}

	for (let i = 0; i < results.length; i += 1) {
		const r = results[i]
		const className = i === resultIndex ? `${searchResultClass} ${searchResultClass}-current` : searchResultClass
		decorations.push(Decoration.inline(r.from, r.to, { class: className }))
	}

	return { decorationsToReturn: DecorationSet.create(doc, decorations), results }
}

const replace = (
	replaceTerm: string,
	results: Range[],
	{ state, dispatch }: { state: EditorState; dispatch: Dispatch },
): void => {
	const firstResult = results[0]
	if (!firstResult) return
	const { from, to } = results[0]
	if (dispatch) dispatch(state.tr.insertText(replaceTerm, from, to))
}

const rebaseNextResult = (
	replaceTerm: string,
	index: number,
	lastOffset: number,
	results: Range[],
): [number, Range[]] | null => {
	const nextIndex = index + 1
	if (!results[nextIndex]) return null
	const { from: currentFrom, to: currentTo } = results[index]
	const offset = currentTo - currentFrom - replaceTerm.length + lastOffset
	const { from, to } = results[nextIndex]
	results[nextIndex] = { to: to - offset, from: from - offset }
	return [offset, results]
}

const replaceAll = (
	replaceTerm: string,
	results: Range[],
	{ tr, dispatch }: { tr: Transaction; dispatch: Dispatch },
): void => {
	let offset = 0
	let resultsCopy = results.slice()
	if (!resultsCopy.length) return

	for (let i = 0; i < resultsCopy.length; i += 1) {
		const { from, to } = resultsCopy[i]
		tr.insertText(replaceTerm, from, to)
		const response = rebaseNextResult(replaceTerm, i, offset, resultsCopy)
		if (!response) continue
		offset = response[0]
		resultsCopy = response[1]
	}
	if (dispatch) dispatch(tr)
}

export const SearchAndReplace = Extension.create<SearchAndReplaceOptions, SearchAndReplaceStorage>({
	name: 'searchAndReplace',

	addOptions() {
		return { searchResultClass: 'search-result', disableRegex: true }
	},

	addStorage() {
		return {
			searchTerm: '',
			replaceTerm: '',
			results: [],
			lastSearchTerm: '',
			caseSensitive: false,
			lastCaseSensitive: false,
			resultIndex: 0,
			lastResultIndex: 0,
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
			setCaseSensitive: (caseSensitive: boolean) => () => {
				this.storage.caseSensitive = caseSensitive
				return false
			},
			resetIndex: () => () => {
				this.storage.resultIndex = 0
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
			replace:
				() =>
				({ state, dispatch }) => {
					replace(this.storage.replaceTerm, this.storage.results, { state, dispatch })
					return false
				},
			replaceAll:
				() =>
				({ tr, dispatch }) => {
					replaceAll(this.storage.replaceTerm, this.storage.results, { tr, dispatch })
					return false
				},
		}
	},

	addProseMirrorPlugins() {
		const storage = this.storage
		const { searchResultClass, disableRegex } = this.options

		return [
			new Plugin({
				key: searchAndReplacePluginKey,
				state: {
					init: () => DecorationSet.empty,
					apply({ doc, docChanged }, oldState) {
						const {
							searchTerm,
							lastSearchTerm,
							caseSensitive,
							lastCaseSensitive,
							resultIndex,
							lastResultIndex,
						} = storage

						if (
							!docChanged &&
							lastSearchTerm === searchTerm &&
							lastCaseSensitive === caseSensitive &&
							lastResultIndex === resultIndex
						)
							return oldState

						storage.lastSearchTerm = searchTerm
						storage.lastCaseSensitive = caseSensitive
						storage.lastResultIndex = resultIndex

						if (!searchTerm) {
							storage.results = []
							return DecorationSet.empty
						}

						const { decorationsToReturn, results } = processSearches(
							doc,
							getRegex(searchTerm, disableRegex, caseSensitive),
							searchResultClass,
							resultIndex,
						)
						storage.results = results
						return decorationsToReturn
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
