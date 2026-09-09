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
	TextSearch,
	UserCheck,
} from 'lucide-react'
import { useSearch } from '@/features/editor/search-context'
import { RailIsland, type RailItem } from './rail-island'

/**
 * Rail kanan, tiga pulau.
 *
 * Pembagiannya bukan estetika melainkan pertanyaan yang berbeda. Pulau atas
 * **memeriksa naskah yang sudah ada** - proofreader, detektor, plagiarisme,
 * terjemahan. Pulau tengah **memasukkan sumber ke dalam naskah** - aset hari
 * ini, lalu dokumen dan referensi menyusul. Menamai bedanya sekarang
 * menentukan ke mana perkakas berikutnya pergi; tanpa itu keduanya menyatu
 * lagi menjadi satu daftar panjang tanpa urutan yang bisa dijelaskan.
 *
 * Pulau ketiga **menyunting apa yang sedang dipegang** dan karena itu hanya
 * ada saat ada yang dipegang: cari & ganti muncul selama pencarian hidup, dan
 * perkakas gambar akan muncul saat gambar terpilih. Ia sengaja tidak permanen -
 * perkakas yang tidak berlaku pada apa pun hanyalah ikon mati.
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

/* `Search` sudah dipakai Plagiarism, jadi pencarian naskah memakai ikon lain -
 * dua ikon kaca pembesar di rail yang sama berarti tidak ada yang menandakan
 * apa pun. */
export const CONTEXT_PANELS: readonly RailItem[] = [{ id: 'search', icon: TextSearch, label: 'Cari & ganti' }]

/** Daftar rata untuk pemakai yang tidak peduli pengelompokannya (menu Tools). */
export const PANELS: readonly RailItem[] = [...ANALYSIS_PANELS, ...SOURCE_PANELS, ...CONTEXT_PANELS]

export function PanelRail() {
	const { live } = useSearch()

	/*
	 * Dua pulau tetapnya hidup di SATU kolom flex yang di-center, bukan dua
	 * elemen `absolute` yang masing-masing memposisikan diri. Kalau keduanya
	 * absolut, pulau bawah harus menebak tinggi pulau atas - dan tebakan itu
	 * meleset begitu satu perkakas ditambahkan, lalu keduanya bertumpuk di layar
	 * pendek. Sebagai satu kolom, keduanya tetap ter-center sebagai grup dan
	 * yang bawah selalu di bawah.
	 */
	return (
		<div className="absolute top-1/2 right-4 z-30 flex -translate-y-1/2 flex-col items-end gap-2">
			<RailIsland items={ANALYSIS_PANELS} />
			<RailIsland items={SOURCE_PANELS} />
			{/* Pulau kontekstual digantung DI BAWAH kolomnya, bukan ikut di dalamnya:
			    kolom ini ter-center, jadi menambah satu pulau ke dalamnya akan
			    mendorong dua pulau lain ke atas tepat saat pengguna hendak menekan
			    salah satunya. `top-full` tidak menebak tinggi apa pun - ia persis
			    tepi bawah kolom - jadi keberatan yang sama tentang pulau absolut
			    tidak berlaku di sini. */}
			{live && (
				<div className="absolute top-full right-0 pt-2">
					<RailIsland items={CONTEXT_PANELS} />
				</div>
			)}
		</div>
	)
}
