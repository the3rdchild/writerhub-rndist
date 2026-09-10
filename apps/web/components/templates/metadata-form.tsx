'use client'

import type { DocumentMetadata, TemplateMetadataField } from '@writer-hub/shared'

const FIELD_CLASS =
	'w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-foreground text-sm outline-none transition-colors focus:border-accent'

/**
 * Isian metadata template - satu bentuk, dua jalan masuk: sebelum dokumen
 * dibuat di galeri, dan kapan pun sesudahnya dari dalam editor.
 *
 * Isian tanpa `placeholder` sengaja tidak menyentuh naskah sama sekali; ia ada
 * semata supaya AI tahu dokumen ini tentang apa. Bedanya dinyatakan di tiap
 * barisnya, bukan disembunyikan - pengguna berhak tahu mana yang akan tertulis
 * di kertasnya.
 */
export function MetadataForm({
	fields,
	values,
	onChange,
}: {
	fields: readonly TemplateMetadataField[]
	values: DocumentMetadata
	onChange: (next: DocumentMetadata) => void
}) {
	const set = (key: string, value: string) => onChange({ ...values, [key]: value })

	return (
		<div className="flex flex-col gap-3">
			{fields.map((field) => {
				const id = `metadata-${field.key}`
				return (
					<div key={field.key} className="flex flex-col gap-1">
						<label htmlFor={id} className="flex items-baseline gap-2">
							<span className="font-medium text-muted text-xs">{field.label}</span>
							{!field.placeholder && <span className="text-[10px] text-faint">tidak ditulis ke naskah</span>}
						</label>

						{field.kind === 'multiline' ? (
							<textarea
								id={id}
								value={values[field.key] ?? ''}
								onChange={(event) => set(field.key, event.target.value)}
								placeholder={field.example}
								rows={4}
								className={`${FIELD_CLASS} resize-y`}
							/>
						) : (
							<input
								id={id}
								type="text"
								value={values[field.key] ?? ''}
								onChange={(event) => set(field.key, event.target.value)}
								placeholder={field.example}
								className={FIELD_CLASS}
							/>
						)}

						{field.hint && <span className="text-[11px] text-subtle leading-snug">{field.hint}</span>}
					</div>
				)
			})}
		</div>
	)
}

/**
 * Konsekuensi yang harus dibaca, bukan ditemukan: sampul diisi SEKALI saat
 * dokumen lahir, jadi mengubah judul di sini belakangan tidak mengubah naskah
 * yang sudah tertulis.
 */
export function MetadataScopeNote({ afterCreation }: { afterCreation: boolean }) {
	return (
		<p className="rounded-lg border border-line bg-surface-inset px-3 py-2 text-[11px] text-subtle leading-relaxed">
			{afterCreation ? (
				<>
					Perubahan di sini <strong className="text-muted">tidak menulis ulang naskah</strong> - sampul sudah
					terisi saat dokumen dibuat, dan menimpanya berarti menghapus suntingan Anda. Yang ikut berubah
					adalah penjelasan yang dibaca AI.
				</>
			) : (
				<>
					Isian ini menggantikan teks contoh di kerangka saat dokumen dibuat, lalu tetap tersimpan sebagai
					penjelasan untuk AI. Mengubahnya nanti <strong className="text-muted">tidak</strong> menulis ulang
					naskah.
				</>
			)}
		</p>
	)
}
