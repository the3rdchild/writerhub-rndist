/**
 * Daftar tunggal seluruh pintasan papan tik.
 *
 * Sebelumnya menu menampilkan `shortcut="Ctrl+Alt+N"` sebagai teks belaka —
 * tidak ada yang mendaftarkannya, jadi labelnya berbohong. Di sini kombinasi
 * tombol ditulis sekali, lalu dipakai bersama oleh tiga tempat: keymap Tiptap,
 * penangan tombol level aplikasi, dan label yang tampil di menu maupun dialog
 * bantuan. Label tidak bisa lagi menyimpang dari binding-nya karena keduanya
 * membaca baris yang sama.
 *
 * Notasi `keys` mengikuti Tiptap: `Mod` berarti Ctrl di Windows/Linux dan ⌘ di
 * macOS, bagian dipisah tanda hubung.
 */

export type ShortcutCategory = 'Teks' | 'Paragraf' | 'Dokumen' | 'Tools' | 'Tampilan'

/**
 * Siapa yang benar-benar mendaftarkan pintasannya.
 *
 * `tiptap` berarti binding-nya datang dari ekstensi bawaan dan baris di sini
 * hanya mendokumentasikannya — mengubah `keys` tidak akan memindahkan tombolnya.
 * `editor` dan `app` dibaca balik oleh kode kita, jadi barisnya memang mengikat.
 */
export type ShortcutOwner = 'tiptap' | 'editor' | 'app'

export interface Shortcut {
	id: ShortcutId
	keys: string
	label: string
	category: ShortcutCategory
	owner: ShortcutOwner
}

export type ShortcutId =
	// Teks
	| 'text.bold'
	| 'text.italic'
	| 'text.underline'
	| 'text.strike'
	| 'text.code'
	| 'text.highlight'
	| 'text.link'
	// Paragraf
	| 'para.heading1'
	| 'para.heading2'
	| 'para.heading3'
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
	// Dokumen
	| 'doc.pageBreak'
	| 'doc.undo'
	| 'doc.redo'
	| 'doc.selectAll'
	| 'doc.print'
	| 'doc.newTab'
	| 'doc.nextTab'
	| 'doc.prevTab'
	| 'doc.closeTab'
	// Tools
	| 'tools.proofreader'
	| 'tools.aiDetector'
	| 'tools.aiRewriter'
	| 'tools.humanizer'
	| 'tools.plagiarism'
	// Tampilan
	| 'view.focusMode'
	| 'view.ruler'
	| 'view.documentTabs'
	| 'view.zoomIn'
	| 'view.zoomOut'
	| 'view.zoomReset'
	| 'view.shortcuts'

export const SHORTCUTS: readonly Shortcut[] = [
	{ id: 'text.bold', keys: 'Mod-b', label: 'Tebal', category: 'Teks', owner: 'tiptap' },
	{ id: 'text.italic', keys: 'Mod-i', label: 'Miring', category: 'Teks', owner: 'tiptap' },
	{ id: 'text.underline', keys: 'Mod-u', label: 'Garis bawah', category: 'Teks', owner: 'tiptap' },
	{ id: 'text.strike', keys: 'Mod-Shift-s', label: 'Coret', category: 'Teks', owner: 'tiptap' },
	{ id: 'text.code', keys: 'Mod-e', label: 'Kode sebaris', category: 'Teks', owner: 'tiptap' },
	{ id: 'text.highlight', keys: 'Mod-Shift-h', label: 'Sorot', category: 'Teks', owner: 'tiptap' },
	{ id: 'text.link', keys: 'Mod-k', label: 'Tautan', category: 'Teks', owner: 'editor' },

	{ id: 'para.heading1', keys: 'Mod-Alt-1', label: 'Judul 1', category: 'Paragraf', owner: 'tiptap' },
	{ id: 'para.heading2', keys: 'Mod-Alt-2', label: 'Judul 2', category: 'Paragraf', owner: 'tiptap' },
	{ id: 'para.heading3', keys: 'Mod-Alt-3', label: 'Judul 3', category: 'Paragraf', owner: 'tiptap' },
	{ id: 'para.paragraph', keys: 'Mod-Alt-0', label: 'Teks biasa', category: 'Paragraf', owner: 'tiptap' },
	{ id: 'para.bulletList', keys: 'Mod-Shift-8', label: 'Daftar butir', category: 'Paragraf', owner: 'tiptap' },
	{ id: 'para.orderedList', keys: 'Mod-Shift-7', label: 'Daftar nomor', category: 'Paragraf', owner: 'tiptap' },
	{ id: 'para.taskList', keys: 'Mod-Shift-9', label: 'Daftar centang', category: 'Paragraf', owner: 'tiptap' },
	{ id: 'para.blockquote', keys: 'Mod-Shift-b', label: 'Kutipan', category: 'Paragraf', owner: 'tiptap' },
	{ id: 'para.alignLeft', keys: 'Mod-Shift-l', label: 'Rata kiri', category: 'Paragraf', owner: 'tiptap' },
	{ id: 'para.alignCenter', keys: 'Mod-Shift-e', label: 'Rata tengah', category: 'Paragraf', owner: 'tiptap' },
	{ id: 'para.alignRight', keys: 'Mod-Shift-r', label: 'Rata kanan', category: 'Paragraf', owner: 'tiptap' },
	{ id: 'para.alignJustify', keys: 'Mod-Shift-j', label: 'Rata kanan-kiri', category: 'Paragraf', owner: 'tiptap' },
	{ id: 'para.indent', keys: 'Tab', label: 'Tambah indentasi', category: 'Paragraf', owner: 'editor' },
	{ id: 'para.outdent', keys: 'Shift-Tab', label: 'Kurangi indentasi', category: 'Paragraf', owner: 'editor' },

	{ id: 'doc.pageBreak', keys: 'Mod-Enter', label: 'Halaman baru', category: 'Dokumen', owner: 'editor' },
	{ id: 'doc.undo', keys: 'Mod-z', label: 'Urungkan', category: 'Dokumen', owner: 'tiptap' },
	{ id: 'doc.redo', keys: 'Mod-Shift-z', label: 'Ulangi', category: 'Dokumen', owner: 'tiptap' },
	{ id: 'doc.selectAll', keys: 'Mod-a', label: 'Pilih semua', category: 'Dokumen', owner: 'tiptap' },
	{ id: 'doc.print', keys: 'Mod-p', label: 'Cetak', category: 'Dokumen', owner: 'tiptap' },
	{ id: 'doc.newTab', keys: 'Mod-Alt-n', label: 'Tab baru', category: 'Dokumen', owner: 'app' },
	{ id: 'doc.nextTab', keys: 'Mod-Alt-ArrowRight', label: 'Tab berikutnya', category: 'Dokumen', owner: 'app' },
	{ id: 'doc.prevTab', keys: 'Mod-Alt-ArrowLeft', label: 'Tab sebelumnya', category: 'Dokumen', owner: 'app' },
	{ id: 'doc.closeTab', keys: 'Mod-Alt-w', label: 'Tutup tab', category: 'Dokumen', owner: 'app' },

	{ id: 'tools.proofreader', keys: 'Mod-Shift-1', label: 'Proofreader', category: 'Tools', owner: 'app' },
	{ id: 'tools.aiDetector', keys: 'Mod-Shift-2', label: 'AI Detector', category: 'Tools', owner: 'app' },
	{ id: 'tools.aiRewriter', keys: 'Mod-Shift-3', label: 'AI Rewriter', category: 'Tools', owner: 'app' },
	{ id: 'tools.humanizer', keys: 'Mod-Shift-4', label: 'Humanizer', category: 'Tools', owner: 'app' },
	{ id: 'tools.plagiarism', keys: 'Mod-Shift-5', label: 'Plagiarism Checker', category: 'Tools', owner: 'app' },

	{ id: 'view.focusMode', keys: 'Mod-Shift-f', label: 'Mode fokus', category: 'Tampilan', owner: 'app' },
	// Mod-Shift-r sengaja dihindari: itu muat ulang paksa di browser.
	{ id: 'view.ruler', keys: 'Mod-Alt-r', label: 'Penggaris', category: 'Tampilan', owner: 'app' },
	{ id: 'view.documentTabs', keys: 'Mod-Alt-b', label: 'Sidebar tab dokumen', category: 'Tampilan', owner: 'app' },
	{ id: 'view.zoomIn', keys: 'Mod-=', label: 'Perbesar', category: 'Tampilan', owner: 'app' },
	{ id: 'view.zoomOut', keys: 'Mod--', label: 'Perkecil', category: 'Tampilan', owner: 'app' },
	{ id: 'view.zoomReset', keys: 'Mod-0', label: 'Perbesaran 100%', category: 'Tampilan', owner: 'app' },
	{ id: 'view.shortcuts', keys: 'Mod-/', label: 'Daftar pintasan', category: 'Tampilan', owner: 'app' },
]

export const CATEGORY_ORDER: readonly ShortcutCategory[] = [
	'Teks',
	'Paragraf',
	'Dokumen',
	'Tools',
	'Tampilan',
]

const BY_ID = new Map(SHORTCUTS.map((shortcut) => [shortcut.id, shortcut]))

export function shortcut(id: ShortcutId): Shortcut {
	const found = BY_ID.get(id)
	if (!found) throw new Error(`Pintasan tidak terdaftar: ${id}`)
	return found
}

/** Kombinasi dalam notasi Tiptap — untuk `addKeyboardShortcuts`. */
export function shortcutKeys(id: ShortcutId): string {
	return shortcut(id).keys
}

// ── pencocokan dengan KeyboardEvent ────────────────────────────────────────

interface KeyCombo {
	mod: boolean
	shift: boolean
	alt: boolean
	/** `KeyboardEvent.code`, bukan `.key`. */
	code: string
}

/**
 * Tombol dicocokkan lewat `event.code`, posisi fisiknya, bukan `event.key`.
 *
 * `event.key` berubah begitu Shift atau Alt ditekan — Shift+1 menghasilkan "!",
 * dan Alt+huruf di macOS menghasilkan karakter lain sama sekali — sehingga
 * "Mod-Shift-1" tidak akan pernah cocok kalau dibandingkan dengan `.key`.
 */
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

function parseCombo(keys: string): KeyCombo {
	const parts = keys.split('-')
	const key = parts[parts.length - 1]
	const modifiers = parts.slice(0, -1)

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
	// Modifier yang tidak diminta harus benar-benar tidak ditekan, supaya
	// Mod-Shift-1 tidak ikut menyala saat Mod-1 yang ditekan.
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

/** Pintasan level aplikasi yang cocok dengan event, atau null. */
export function matchAppShortcut(event: KeyboardEvent, mac: boolean): Shortcut | null {
	for (const entry of APP_COMBOS) {
		if (matches(event, entry.combo, mac)) return entry.shortcut
	}
	return null
}

// ── tampilan ───────────────────────────────────────────────────────────────

const SYMBOLS: Record<string, string> = {
	ArrowLeft: '←',
	ArrowRight: '→',
	ArrowUp: '↑',
	ArrowDown: '↓',
	Enter: '↵',
}

/**
 * Label yang dibaca manusia. macOS memakai lambang modifier tanpa pemisah,
 * seperti aplikasi lain di sana; sisanya memakai gaya "Ctrl+Shift+1".
 */
export function formatKeys(keys: string, mac: boolean): string {
	const parts = keys.split('-')
	const key = parts[parts.length - 1]
	const modifiers = parts.slice(0, -1)

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
