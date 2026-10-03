import { normalizeBrief } from '@writer-hub/shared'
import { z } from 'zod'

/**
 * Batas ukuran brief utuh di kawat. `normalizeBrief` sudah memangkas tiap isian,
 * tapi ia baru berjalan sesudah JSON-nya diurai - batas ini menolak muatan yang
 * tidak masuk akal sebelum ada yang sempat membaca isinya.
 */
const MAX_BRIEF_JSON = 120_000

/**
 * Brief penelitian dari klien. Bentuknya tidak divalidasi ketat di sini -
 * `normalizeBrief` yang membuang apa pun yang tidak dikenal - karena brief
 * tersimpan bisa lebih tua atau lebih muda dari server yang menerimanya, dan
 * menolak seluruh sinkronisasi karena satu isian asing lebih buruk daripada
 * membuang isian itu.
 */
export const researchBriefSchema = z
	.unknown()
	.refine((value) => JSON.stringify(value ?? null).length <= MAX_BRIEF_JSON, 'Brief too large')
	.transform(normalizeBrief)
