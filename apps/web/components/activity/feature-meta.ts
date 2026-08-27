import {
	BookMarked,
	Bot,
	Globe,
	Languages,
	type LucideIcon,
	RefreshCw,
	Search,
	SpellCheck,
	UserCheck,
} from 'lucide-react'
import type { HistoryFeature } from '@/features/history/types'

export const FEATURE_META: Record<HistoryFeature, { label: string; icon: LucideIcon }> = {
	grammar: { label: 'Proofreader', icon: SpellCheck },
	research: { label: 'Riset Web', icon: Globe },
	ai_detector: { label: 'AI Detector', icon: Bot },
	ai_rewriter: { label: 'AI Rewriter', icon: RefreshCw },
	humanizer: { label: 'Humanizer', icon: UserCheck },
	translator: { label: 'Translator', icon: Languages },
	glossary: { label: 'Glosarium', icon: BookMarked },
	plagiarism: { label: 'Plagiarism', icon: Search },
}

export const STATUS_LABELS: Record<string, string> = {
	pending: 'Menunggu',
	processing: 'Diproses',
	completed: 'Selesai',
	failed: 'Gagal',
}
