import { describe, expect, test } from 'bun:test'
import { currentTodo, hasOpenTodos, MAX_TODOS, parseTodos, todoCounts, todosForModel } from './todos'

describe('parseTodos', () => {
	test('objek dengan status - bentuk yang diminta', () => {
		expect(
			parseTodos({
				steps: [
					{ title: 'Baca kerangka', status: 'completed' },
					{ title: 'Tulis BAB I', status: 'in-progress' },
					{ title: 'Tulis BAB II', status: 'not-started' },
				],
			}),
		).toEqual([
			{ text: 'Baca kerangka', status: 'completed' },
			{ text: 'Tulis BAB I', status: 'in-progress' },
			{ text: 'Tulis BAB II', status: 'not-started' },
		])
	})

	/* Gambar 29 Sep: lima butir "[object Object]" di kartu Rencana. */
	test('objek dengan kunci lain tidak lagi menjadi "[object Object]"', () => {
		const todos = parseTodos({
			steps: [{ step: 'Riset data BPS' }, { description: 'Susun tabel', state: 'done' }],
		})
		expect(todos.map((todo) => todo.text)).toEqual(['Riset data BPS', 'Susun tabel'])
		expect(todos[1]?.status).toBe('completed')
	})

	test('string polos (bentuk lama) belum dimulai; yang kosong dan rusak dibuang', () => {
		expect(parseTodos({ steps: ['Satu', '  ', 3, null, { status: 'done' }] })).toEqual([
			{ text: 'Satu', status: 'not-started' },
		])
	})

	test('ejaan status yang longgar', () => {
		const statuses = parseTodos({
			steps: [
				{ title: 'a', status: 'in_progress' },
				{ title: 'b', status: 'In Progress' },
				{ title: 'c', status: 'DONE' },
				{ title: 'd', status: 'pending' },
			],
		}).map((todo) => todo.status)
		expect(statuses).toEqual(['in-progress', 'in-progress', 'completed', 'not-started'])
	})

	test('butir kembar dibuang', () => {
		expect(
			parseTodos({ steps: ['Tulis BAB I', 'Tulis BAB I', 'Tulis BAB II'] }).map((todo) => todo.text),
		).toEqual(['Tulis BAB I', 'Tulis BAB II'])
	})

	test('dibatasi jumlahnya; argumen tanpa daftar menjadi kosong', () => {
		expect(parseTodos({ steps: Array.from({ length: 50 }, (_, i) => `langkah ${i}`) })).toHaveLength(
			MAX_TODOS,
		)
		expect(parseTodos({})).toEqual([])
	})
})

describe('progres', () => {
	const todos = parseTodos({
		steps: [
			{ title: 'a', status: 'completed' },
			{ title: 'b', status: 'not-started' },
			{ title: 'c', status: 'in-progress' },
		],
	})

	test('hitungan dan butir saat ini', () => {
		expect(todoCounts(todos)).toEqual({ done: 1, total: 3 })
		expect(currentTodo(todos)?.text).toBe('c')
		expect(currentTodo(parseTodos({ steps: [{ title: 'x', status: 'done' }, 'y'] }))?.text).toBe('y')
		expect(hasOpenTodos(todos)).toBe(true)
		expect(hasOpenTodos(parseTodos({ steps: [{ title: 'x', status: 'done' }] }))).toBe(false)
	})

	test('baris konteks untuk model menandai status tiap butir', () => {
		const text = todosForModel(todos)
		expect(text).toContain('1 of 3 done')
		expect(text).toContain('[x] 1. a')
		expect(text).toContain('[ ] 2. b')
		expect(text).toContain('[~] 3. c')
		expect(text).toContain('Update it with plan')
	})
})
