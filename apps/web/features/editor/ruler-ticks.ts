import { INCH } from './page-geometry'

/*
 * Garis skala penggaris atas dan kiri - satu hitungan untuk keduanya, dalam
 * satuan yang dipilih pengguna (cm atau inci).
 *
 * Posisi tiap garis dihitung dari INDEKS bulat, bukan dengan menguji sisa bagi
 * posisi pecahan: `x % (96 / 2,54)` sesekali jatuh tepat di bawah satu satuan
 * (≈ satuan − ε) sehingga angka 5, 9, 10, 11, 15… tidak pernah tergambar di
 * penggaris kiri (KOL-13).
 */

export type RulerUnit = 'cm' | 'in'

export interface RulerTick {
	/** Posisi dalam px dokumen (tanpa zoom) dari tepi kertas. */
	at: number
	kind: 'label' | 'major' | 'minor'
	/** Angka satuan untuk garis berlabel. */
	value?: number
}

export function rulerTicks(length: number, unit: RulerUnit, zoom: number): RulerTick[] {
	const unitPx = unit === 'cm' ? INCH / 2.54 : INCH
	/* cm: tiap 0,25 cm (0,5 cm saat diperkecil); inci: tiap 1/8 (1/4). */
	const parts = unit === 'cm' ? (zoom < 0.75 ? 2 : 4) : zoom < 0.75 ? 4 : 8
	const step = unitPx / parts
	const ticks: RulerTick[] = []
	const count = Math.floor(length / step + 1e-6)
	for (let index = 1; index <= count; index += 1) {
		const at = index * step
		if (index % parts === 0) ticks.push({ at, kind: 'label', value: index / parts })
		else ticks.push({ at, kind: index % (parts / 2) === 0 ? 'major' : 'minor' })
	}
	return ticks
}
