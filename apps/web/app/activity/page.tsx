'use client'

import { ActivityView } from '@/components/activity/activity-view'

/**
 * Aktivitas AI (fitur F): catatan pemakaian modul AI milik user, lintas
 * Proofreader / AI Detector / AI Rewriter / Humanizer / Plagiarism.
 *
 * Halaman berdiri sendiri dengan kepala sendiri (pola /library), bukan di
 * dalam AppShell. Sengaja dinamai "Aktivitas AI" - kata "Riwayat" sudah
 * dipakai dua fitur lain (sesi terakhir & riwayat versi).
 */
export default function ActivityPage() {
	return <ActivityView />
}
