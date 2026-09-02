import { ACADEMIC_ID_TEMPLATES } from './academic-id'
import { BUSINESS_TEMPLATES } from './business'
import type { BuiltinTemplateDefinition } from './definition'
import { MARKETING_TEMPLATES } from './marketing'
import { PAPER_TEMPLATES } from './paper'

export type { BuiltinTemplateDefinition } from './definition'

/** Seluruh template bawaan, di-seed ke tabel `templates` saat boot. */
export const BUILTIN_TEMPLATES: BuiltinTemplateDefinition[] = [
	...ACADEMIC_ID_TEMPLATES,
	...PAPER_TEMPLATES,
	...BUSINESS_TEMPLATES,
	...MARKETING_TEMPLATES,
]
