export type ShortcutCategory = 'Text' | 'Paragraph' | 'Document' | 'Tools' | 'View'
export type ShortcutOwner = 'tiptap' | 'editor' | 'app'

export interface Shortcut {
	id: ShortcutId
	keys: string
	label: string
	category: ShortcutCategory
	owner: ShortcutOwner
}

export type ShortcutId =
	| 'text.bold'
	| 'text.italic'
	| 'text.underline'
	| 'text.strike'
	| 'text.code'
	| 'text.highlight'
	| 'text.link'
	| 'text.clearFormatting'
	| 'para.heading1'
	| 'para.heading2'
	| 'para.heading3'
	| 'para.heading4'
	| 'para.heading5'
	| 'para.heading6'
	| 'para.heading7'
	| 'para.heading8'
	| 'para.heading9'
	| 'para.paragraph'
	| 'para.bulletList'
	| 'para.orderedList'
	| 'para.taskList'
	| 'para.blockquote'
	| 'para.alignLeft'
	| 'para.alignCenter'
	| 'para.alignRight'
	| 'para.alignJustify'
	| 'para.indent'
	| 'para.outdent'
	| 'doc.pageBreak'
	| 'doc.footnote'
	| 'doc.undo'
	| 'doc.redo'
	| 'doc.selectAll'
	| 'doc.cut'
	| 'doc.copy'
	| 'doc.paste'
	| 'doc.pastePlain'
	| 'doc.print'
	| 'doc.find'
	| 'doc.findReplace'
	| 'doc.newTab'
	| 'doc.nextTab'
	| 'doc.prevTab'
	| 'doc.closeTab'
	| 'tools.proofreader'
	| 'tools.aiDetector'
	| 'tools.aiRewriter'
	| 'tools.humanizer'
	| 'tools.plagiarism'
	| 'view.focusMode'
	| 'view.ruler'
	| 'view.documentTabs'
	| 'view.zoomIn'
	| 'view.zoomOut'
	| 'view.zoomReset'
	| 'view.shortcuts'

export const SHORTCUTS: readonly Shortcut[] = [
	{ id: 'text.bold', keys: 'Mod-b', label: 'Bold', category: 'Text', owner: 'tiptap' },
	{ id: 'text.italic', keys: 'Mod-i', label: 'Italic', category: 'Text', owner: 'tiptap' },
	{ id: 'text.underline', keys: 'Mod-u', label: 'Underline', category: 'Text', owner: 'tiptap' },
	{ id: 'text.strike', keys: 'Mod-Shift-s', label: 'Strikethrough', category: 'Text', owner: 'tiptap' },
	{ id: 'text.code', keys: 'Mod-e', label: 'Inline code', category: 'Text', owner: 'tiptap' },
	{ id: 'text.highlight', keys: 'Mod-Shift-h', label: 'Highlight', category: 'Text', owner: 'tiptap' },
	{ id: 'text.link', keys: 'Mod-k', label: 'Link', category: 'Text', owner: 'editor' },
	{
		id: 'text.clearFormatting',
		keys: 'Mod-\\',
		label: 'Clear formatting',
		category: 'Text',
		owner: 'editor',
	},

	{ id: 'para.heading1', keys: 'Mod-Alt-1', label: 'Heading 1', category: 'Paragraph', owner: 'tiptap' },
	{ id: 'para.heading2', keys: 'Mod-Alt-2', label: 'Heading 2', category: 'Paragraph', owner: 'tiptap' },
	{ id: 'para.heading3', keys: 'Mod-Alt-3', label: 'Heading 3', category: 'Paragraph', owner: 'tiptap' },
	{ id: 'para.heading4', keys: 'Mod-Alt-4', label: 'Heading 4', category: 'Paragraph', owner: 'tiptap' },
	{ id: 'para.heading5', keys: 'Mod-Alt-5', label: 'Heading 5', category: 'Paragraph', owner: 'tiptap' },
	{ id: 'para.heading6', keys: 'Mod-Alt-6', label: 'Heading 6', category: 'Paragraph', owner: 'tiptap' },
	{ id: 'para.heading7', keys: 'Mod-Alt-7', label: 'Heading 7', category: 'Paragraph', owner: 'tiptap' },
	{ id: 'para.heading8', keys: 'Mod-Alt-8', label: 'Heading 8', category: 'Paragraph', owner: 'tiptap' },
	{ id: 'para.heading9', keys: 'Mod-Alt-9', label: 'Heading 9', category: 'Paragraph', owner: 'tiptap' },
	{ id: 'para.paragraph', keys: 'Mod-Alt-0', label: 'Normal text', category: 'Paragraph', owner: 'tiptap' },
	{
		id: 'para.bulletList',
		keys: 'Mod-Shift-8',
		label: 'Bulleted list',
		category: 'Paragraph',
		owner: 'tiptap',
	},
	{
		id: 'para.orderedList',
		keys: 'Mod-Shift-7',
		label: 'Numbered list',
		category: 'Paragraph',
		owner: 'tiptap',
	},
	{
		id: 'para.taskList',
		keys: 'Mod-Shift-9',
		label: 'Checklist',
		category: 'Paragraph',
		owner: 'tiptap',
	},
	{ id: 'para.blockquote', keys: 'Mod-Shift-b', label: 'Quote', category: 'Paragraph', owner: 'tiptap' },
	{ id: 'para.alignLeft', keys: 'Mod-Shift-l', label: 'Align left', category: 'Paragraph', owner: 'tiptap' },
	{
		id: 'para.alignCenter',
		keys: 'Mod-Shift-e',
		label: 'Align center',
		category: 'Paragraph',
		owner: 'tiptap',
	},
	{
		id: 'para.alignRight',
		keys: 'Mod-Shift-r',
		label: 'Align right',
		category: 'Paragraph',
		owner: 'tiptap',
	},
	{
		id: 'para.alignJustify',
		keys: 'Mod-Shift-j',
		label: 'Justify',
		category: 'Paragraph',
		owner: 'tiptap',
	},
	{ id: 'para.indent', keys: 'Tab', label: 'Increase indent', category: 'Paragraph', owner: 'editor' },
	{
		id: 'para.outdent',
		keys: 'Shift-Tab',
		label: 'Decrease indent',
		category: 'Paragraph',
		owner: 'editor',
	},

	{ id: 'doc.pageBreak', keys: 'Mod-Enter', label: 'Page break', category: 'Document', owner: 'editor' },
	{ id: 'doc.footnote', keys: 'Mod-Alt-f', label: 'Footnote', category: 'Document', owner: 'editor' },
	{ id: 'doc.undo', keys: 'Mod-z', label: 'Undo', category: 'Document', owner: 'tiptap' },
	{ id: 'doc.redo', keys: 'Mod-Shift-z', label: 'Redo', category: 'Document', owner: 'tiptap' },
	{ id: 'doc.selectAll', keys: 'Mod-a', label: 'Select all', category: 'Document', owner: 'tiptap' },
	{ id: 'doc.cut', keys: 'Mod-x', label: 'Cut', category: 'Document', owner: 'tiptap' },
	{ id: 'doc.copy', keys: 'Mod-c', label: 'Copy', category: 'Document', owner: 'tiptap' },
	{ id: 'doc.paste', keys: 'Mod-v', label: 'Paste', category: 'Document', owner: 'tiptap' },
	{
		id: 'doc.pastePlain',
		keys: 'Mod-Shift-v',
		label: 'Paste without formatting',
		category: 'Document',
		owner: 'editor',
	},
	{ id: 'doc.print', keys: 'Mod-p', label: 'Print', category: 'Document', owner: 'app' },
	{ id: 'doc.find', keys: 'Mod-f', label: 'Find in document', category: 'Document', owner: 'app' },
	{
		id: 'doc.findReplace',
		keys: 'Mod-h',
		label: 'Find and replace',
		category: 'Document',
		owner: 'app',
	},
	{ id: 'doc.newTab', keys: 'Mod-Alt-n', label: 'New tab', category: 'Document', owner: 'app' },
	{
		id: 'doc.nextTab',
		keys: 'Mod-Alt-ArrowRight',
		label: 'Next tab',
		category: 'Document',
		owner: 'app',
	},
	{
		id: 'doc.prevTab',
		keys: 'Mod-Alt-ArrowLeft',
		label: 'Previous tab',
		category: 'Document',
		owner: 'app',
	},
	{ id: 'doc.closeTab', keys: 'Mod-Alt-w', label: 'Delete tab', category: 'Document', owner: 'app' },

	{ id: 'tools.proofreader', keys: 'Mod-Shift-1', label: 'Proofreader', category: 'Tools', owner: 'app' },
	{ id: 'tools.aiDetector', keys: 'Mod-Shift-2', label: 'AI Detector', category: 'Tools', owner: 'app' },
	{ id: 'tools.aiRewriter', keys: 'Mod-Shift-3', label: 'AI Rewriter', category: 'Tools', owner: 'app' },
	{ id: 'tools.humanizer', keys: 'Mod-Shift-4', label: 'Humanizer', category: 'Tools', owner: 'app' },
	{
		id: 'tools.plagiarism',
		keys: 'Mod-Shift-5',
		label: 'Plagiarism Checker',
		category: 'Tools',
		owner: 'app',
	},

	{ id: 'view.focusMode', keys: 'Mod-Shift-f', label: 'Focus mode', category: 'View', owner: 'app' },
	{ id: 'view.ruler', keys: 'Mod-Alt-r', label: 'Ruler', category: 'View', owner: 'app' },
	{
		id: 'view.documentTabs',
		keys: 'Mod-Alt-b',
		label: 'Document tabs sidebar',
		category: 'View',
		owner: 'app',
	},
	{ id: 'view.zoomIn', keys: 'Mod-=', label: 'Zoom in', category: 'View', owner: 'app' },
	{ id: 'view.zoomOut', keys: 'Mod--', label: 'Zoom out', category: 'View', owner: 'app' },
	{ id: 'view.zoomReset', keys: 'Mod-0', label: 'Zoom to 100%', category: 'View', owner: 'app' },
	{ id: 'view.shortcuts', keys: 'Mod-/', label: 'Keyboard shortcuts', category: 'View', owner: 'app' },
]

export const CATEGORY_ORDER: readonly ShortcutCategory[] = ['Text', 'Paragraph', 'Document', 'Tools', 'View']

const BY_ID = new Map(SHORTCUTS.map((shortcut) => [shortcut.id, shortcut]))

export function shortcut(id: ShortcutId): Shortcut {
	const found = BY_ID.get(id)
	if (!found) throw new Error(`Shortcut not registered: ${id}`)
	return found
}

export function shortcutKeys(id: ShortcutId): string {
	return shortcut(id).keys
}

interface KeyCombo {
	mod: boolean
	shift: boolean
	alt: boolean
	code: string
}

function toCode(key: string): string {
	if (/^[0-9]$/.test(key)) return `Digit${key}`
	if (/^[a-z]$/i.test(key)) return `Key${key.toUpperCase()}`

	switch (key) {
		case '=':
			return 'Equal'
		case '-':
			return 'Minus'
		case '/':
			return 'Slash'
		default:
			return key
	}
}

/**
 * Pecah "Mod-Shift-k" menjadi pengubah dan tombol. Tombol "-" sendiri
 * ("Mod--") tidak boleh ikut terbelah oleh pemisahnya: dulu tombolnya jadi
 * string kosong - Ctrl+- tidak pernah cocok dan labelnya "Ctrl++" (TKS-15).
 */
export function splitKeys(keys: string): { modifiers: string[]; key: string } {
	if (keys === '-' || keys.endsWith('--')) {
		return { modifiers: keys.slice(0, -2).split('-').filter(Boolean), key: '-' }
	}
	const parts = keys.split('-')
	return { modifiers: parts.slice(0, -1), key: parts[parts.length - 1] }
}

function parseCombo(keys: string): KeyCombo {
	const { modifiers, key } = splitKeys(keys)

	return {
		mod: modifiers.includes('Mod'),
		shift: modifiers.includes('Shift'),
		alt: modifiers.includes('Alt'),
		code: toCode(key),
	}
}

export function isMacPlatform(): boolean {
	if (typeof navigator === 'undefined') return false
	return /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent)
}

function matches(event: KeyboardEvent, combo: KeyCombo, mac: boolean): boolean {
	const modPressed = mac ? event.metaKey : event.ctrlKey
	const otherMod = mac ? event.ctrlKey : event.metaKey

	return (
		modPressed === combo.mod &&
		event.shiftKey === combo.shift &&
		event.altKey === combo.alt &&
		!otherMod &&
		event.code === combo.code
	)
}

const APP_COMBOS = SHORTCUTS.filter((item) => item.owner === 'app').map((item) => ({
	shortcut: item,
	combo: parseCombo(item.keys),
}))

export function matchAppShortcut(event: KeyboardEvent, mac: boolean): Shortcut | null {
	for (const entry of APP_COMBOS) {
		if (matches(event, entry.combo, mac)) return entry.shortcut
	}
	return null
}

const SYMBOLS: Record<string, string> = {
	ArrowLeft: '←',
	ArrowRight: '→',
	ArrowUp: '↑',
	ArrowDown: '↓',
	Enter: '↵',
}

export function formatKeys(keys: string, mac: boolean): string {
	const { modifiers, key } = splitKeys(keys)

	const label = SYMBOLS[key] ?? (key.length === 1 ? key.toUpperCase() : key)

	if (mac) {
		const prefix = modifiers
			.map((modifier) => {
				if (modifier === 'Mod') return '⌘'
				if (modifier === 'Shift') return '⇧'
				if (modifier === 'Alt') return '⌥'
				return modifier
			})
			.join('')
		return `${prefix}${label}`
	}

	const prefix = modifiers.map((modifier) => (modifier === 'Mod' ? 'Ctrl' : modifier))
	return [...prefix, label].join('+')
}
