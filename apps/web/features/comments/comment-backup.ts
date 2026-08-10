'use client'

import type { CommentThread } from '@/features/sessions/types'

/**
 * Salinan komentar per tab server, di peramban ini saja.
 *
 * Komentar belum ikut naik ke server: yang dikirim sebuah tab hanyalah judul,
 * naskah, ikon, dan bahasanya. Mark-nya sendiri selamat - ia bagian dari naskah
 * - tapi utasnya tidak, jadi dokumen yang disimpan ke cloud lalu dibuka lagi
 * lewat Library kembali dengan sorotan yang tidak bisa diklik dan komentar yang
 * hilang tanpa penjelasan.
 *
 * Sampai komentar punya tempat di server, salinan inilah penambalnya. Batasnya
 * jujur dan perlu diingat saat membaca kode ini: ia hanya menolong di peramban
 * yang sama. Dibuka di perangkat lain, utasnya tetap belum ada - dan itu memang
 * pekerjaan mode kolaborasi, bukan pekerjaan localStorage.
 */

const STORAGE_KEY = 'writer-hub-comment-backup'

/** Berapa tab server yang salinannya disimpan sebelum yang terlama dibuang. */
const MAX_ENTRIES = 60

interface BackupEntry {
	at: number
	threads: CommentThread[]
}

type BackupStore = Record<string, BackupEntry>

function read(): BackupStore {
	if (typeof window === 'undefined') return {}
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY)
		if (!raw) return {}
		const parsed = JSON.parse(raw) as BackupStore
		return parsed && typeof parsed === 'object' ? parsed : {}
	} catch {
		return {}
	}
}

function write(store: BackupStore): void {
	if (typeof window === 'undefined') return
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
	} catch {
		// Kuota penuh atau mode privat: cadangan memang bonus, bukan sumber
		// kebenaran - kegagalannya tidak boleh menggagalkan penyimpanan naskah.
	}
}

/** Simpan komentar sebuah tab server. Daftar kosong menghapus catatannya. */
export function backupComments(serverTabId: string, threads: CommentThread[]): void {
	const store = read()

	if (threads.length === 0) {
		if (!(serverTabId in store)) return
		delete store[serverTabId]
		write(store)
		return
	}

	store[serverTabId] = { at: Date.now(), threads }

	// Yang terlama dibuang lebih dulu: catatan ini menumpang localStorage yang
	// dipakai fitur lain juga, jadi ia tidak boleh tumbuh tanpa batas.
	const keys = Object.keys(store)
	if (keys.length > MAX_ENTRIES) {
		const stale = keys
			.sort((left, right) => store[left].at - store[right].at)
			.slice(0, keys.length - MAX_ENTRIES)
		for (const key of stale) delete store[key]
	}

	write(store)
}

/** Komentar yang tersimpan untuk tab server ini; kosong kalau belum ada. */
export function restoreComments(serverTabId: string): CommentThread[] {
	const entry = read()[serverTabId]
	return Array.isArray(entry?.threads) ? entry.threads : []
}
