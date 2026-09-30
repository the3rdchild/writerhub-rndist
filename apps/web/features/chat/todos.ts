/**
 * Daftar tugas AI - alat `plan` - seperti panel Todos di chat VS Code.
 *
 * Dulu `plan` hanya daftar kalimat, dan aplikasi mencentang satu butirnya
 * setiap kali model memanggil alat baca: membaca kerangka lima kali berarti
 * lima butir "selesai" padahal belum ada yang dikerjakan. Kini modelnya
 * sendiri yang menandai status tiap butir, dengan mengirim ulang daftar
 * lengkapnya setiap kali ada yang berubah. Butir yang tidak ditandai tetap
 * terbuka (keputusan pengguna 29 Sep): tampilan yang jujur lebih berguna
 * daripada yang rapi.
 */

export type TodoStatus = 'not-started' | 'in-progress' | 'completed'

export interface Todo {
	text: string
	status: TodoStatus
}

/** Butir terbanyak yang dibaca dari satu panggilan; daftar lebih panjang dari ini bukan rencana. */
export const MAX_TODOS = 20

const TEXT_KEYS = ['title', 'text', 'step', 'task', 'description', 'content', 'name'] as const

function statusOf(value: unknown): TodoStatus {
	const status = String(value ?? '')
		.toLowerCase()
		.replace(/[\s_]+/g, '-')
	if (/^(completed|complete|done|finished|selesai)$/.test(status)) return 'completed'
	if (/^(in-progress|active|doing|current|running|berjalan|dikerjakan)$/.test(status)) return 'in-progress'
	return 'not-started'
}

/*
 * Model tidak selalu mengirim bentuk yang diminta: string polos (bentuk lama),
 * atau objek dengan kunci lain dari `title`. Dulu objek itu diubah dengan
 * `String()` dan tampil sebagai "[object Object]".
 */
function todoOf(item: unknown): Todo | null {
	if (typeof item === 'string') return item.trim() ? { text: item.trim(), status: 'not-started' } : null
	if (!item || typeof item !== 'object') return null
	const record = item as Record<string, unknown>
	const text = TEXT_KEYS.map((key) => record[key]).find((value) => typeof value === 'string' && value.trim())
	if (typeof text !== 'string') return null
	return { text: text.trim(), status: statusOf(record.status ?? record.state) }
}

/** Daftar tugas dari argumen `plan`; kosong kalau tidak ada yang terbaca. Butir kembar dibuang. */
export function parseTodos(args: Record<string, unknown>): Todo[] {
	const raw = args.steps ?? args.todos ?? args.items
	if (!Array.isArray(raw)) return []
	const seen = new Set<string>()
	return raw
		.map(todoOf)
		.filter((todo): todo is Todo => todo !== null && !seen.has(todo.text) && Boolean(seen.add(todo.text)))
		.slice(0, MAX_TODOS)
}

export function todoCounts(todos: readonly Todo[]): { done: number; total: number } {
	return { done: todos.filter((todo) => todo.status === 'completed').length, total: todos.length }
}

/** Butir yang sedang dikerjakan, atau yang berikutnya - yang tampil saat panelnya terlipat. */
export function currentTodo(todos: readonly Todo[]): Todo | undefined {
	return (
		todos.find((todo) => todo.status === 'in-progress') ?? todos.find((todo) => todo.status !== 'completed')
	)
}

export function hasOpenTodos(todos: readonly Todo[]): boolean {
	return todos.some((todo) => todo.status !== 'completed')
}

const MARK: Record<TodoStatus, string> = { completed: '[x]', 'in-progress': '[~]', 'not-started': '[ ]' }

/**
 * Daftar tugas untuk konteks editor di setiap giliran. Model 0731 mudah lupa
 * rencananya sendiri di tengah tugas panjang; melihatnya lagi setiap giliran
 * adalah pengingat yang sama dengan yang dipakai VS Code.
 */
export function todosForModel(todos: readonly Todo[]): string {
	const { done, total } = todoCounts(todos)
	const lines = todos.map((todo, index) => `${MARK[todo.status]} ${index + 1}. ${todo.text}`)
	return [
		`${done} of ${total} done. [x] completed, [~] in progress, [ ] not started.`,
		...lines,
		'Update it with plan (the full list) as soon as a step starts or finishes.',
	].join('\n')
}
