'use client'

import {
	BookMarked,
	Bot,
	Images,
	Languages,
	MessageSquare,
	MessagesSquare,
	RefreshCw,
	Search,
	SpellCheck,
	UserCheck,
} from 'lucide-react'
import { RailIsland, type RailItem } from './rail-island'

/**
 * Rail kanan, dua pulau.
 *
 * Pembagiannya bukan estetika melainkan pertanyaan yang berbeda. Pulau atas
 * **memeriksa naskah yang sudah ada** - proofreader, detektor, plagiarisme,
 * terjemahan. Pulau bawah **memasukkan sumber ke dalam naskah** - aset hari
 * ini, lalu dokumen dan referensi menyusul. Menamai bedanya sekarang
 * menentukan ke mana perkakas berikutnya pergi; tanpa itu keduanya menyatu
 * lagi menjadi satu daftar panjang tanpa urutan yang bisa dijelaskan.
 */
export const ANALYSIS_PANELS: readonly RailItem[] = [
	{ id: 'ai_chat', icon: MessagesSquare, label: 'AI Chat' },
	{ id: 'proofreader', icon: SpellCheck, label: 'Proofreader' },
	{ id: 'ai_detector', icon: Bot, label: 'AI Detector' },
	{ id: 'ai_rewriter', icon: RefreshCw, label: 'AI Rewriter' },
	{ id: 'humanizer', icon: UserCheck, label: 'Humanizer' },
	{ id: 'plagiarism', icon: Search, label: 'Plagiarism' },
	{ id: 'translator', icon: Languages, label: 'Translator' },
	{ id: 'glossary', icon: BookMarked, label: 'Glossary' },
	{ id: 'comments', icon: MessageSquare, label: 'Comments' },
]

export const SOURCE_PANELS: readonly RailItem[] = [{ id: 'assets', icon: Images, label: 'Aset' }]

/** Daftar rata untuk pemakai yang tidak peduli pengelompokannya (menu Tools). */
export const PANELS: readonly RailItem[] = [...ANALYSIS_PANELS, ...SOURCE_PANELS]

export function PanelRail() {
	/*
	 * Kedua pulau hidup di SATU kolom flex yang di-center, bukan dua elemen
	 * `absolute` yang masing-masing memposisikan diri. Kalau keduanya absolut,
	 * pulau bawah harus menebak tinggi pulau atas - dan tebakan itu meleset
	 * begitu satu perkakas ditambahkan, lalu keduanya bertumpuk di layar
	 * pendek. Sebagai satu kolom, keduanya tetap ter-center sebagai grup dan
	 * yang bawah selalu di bawah.
	 */
	return (
		<div className="absolute right-4 top-1/2 z-30 flex -translate-y-1/2 flex-col items-end gap-2">
			<RailIsland items={ANALYSIS_PANELS} />
			<RailIsland items={SOURCE_PANELS} />
		</div>
	)
}
