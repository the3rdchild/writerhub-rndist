import { Bot, type LucideIcon, RefreshCw, Search, SpellCheck, UserCheck } from 'lucide-react'
import type { HistoryFeature } from '@/features/history/types'

/** Ikon & label tampil tiap modul - selaras dengan ikon di panel rail. */
export const FEATURE_META: Record<HistoryFeature, { label: string; icon: LucideIcon }> = {
	grammar: { label: 'Proofreader', icon: SpellCheck },
	ai_detector: { label: 'AI Detector', icon: Bot },
	ai_rewriter: { label: 'AI Rewriter', icon: RefreshCw },
	humanizer: { label: 'Humanizer', icon: UserCheck },
	plagiarism: { label: 'Plagiarism', icon: Search },
}

/** Label status job untuk lencana kecil di daftar & detail. */
export const STATUS_LABELS: Record<string, string> = {
	pending: 'Menunggu',
	processing: 'Diproses',
	completed: 'Selesai',
	failed: 'Gagal',
}
