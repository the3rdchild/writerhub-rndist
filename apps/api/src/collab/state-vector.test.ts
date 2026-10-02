import { describe, expect, test } from 'bun:test'
import * as Y from 'yjs'
import { snapshotOf, stateVectorCovers, stateVectorsEqual } from './state-vector'

function editedBy(clientID: number, text: string, base?: Y.Doc): Y.Doc {
	const doc = new Y.Doc()
	doc.clientID = clientID
	if (base) Y.applyUpdate(doc, Y.encodeStateAsUpdate(base))
	doc.getText('t').insert(0, text)
	return doc
}

describe('state vector', () => {
	test('state yang memuat semuanya mencakup yang lebih lama', () => {
		const older = editedBy(1, 'a')
		const newer = editedBy(2, 'b', older)
		expect(stateVectorCovers(Y.encodeStateVector(newer), Y.encodeStateVector(older))).toBe(true)
		expect(stateVectorCovers(Y.encodeStateVector(older), Y.encodeStateVector(newer))).toBe(false)
	})

	test('dua state konkuren tidak saling mencakup', () => {
		const left = editedBy(1, 'a')
		const right = editedBy(2, 'b')
		expect(stateVectorCovers(Y.encodeStateVector(left), Y.encodeStateVector(right))).toBe(false)
		expect(stateVectorCovers(Y.encodeStateVector(right), Y.encodeStateVector(left))).toBe(false)
	})

	test('tanpa turunan tersimpan, apa pun mencakup', () => {
		expect(stateVectorCovers(Y.encodeStateVector(editedBy(1, 'a')), null)).toBe(true)
	})

	test('kesamaan tidak bergantung urutan pengodean', () => {
		const doc = editedBy(2, 'b', editedBy(1, 'a'))
		const copy = new Y.Doc()
		Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc))
		expect(stateVectorsEqual(Y.encodeStateVector(doc), Y.encodeStateVector(copy))).toBe(true)
		expect(stateVectorsEqual(Y.encodeStateVector(doc), null)).toBe(false)
		expect(stateVectorsEqual(null, null)).toBe(true)
	})
})

describe('snapshot log', () => {
	test('gabungan beberapa pembaruan sama isinya dengan menerapkan satu per satu', () => {
		const doc = new Y.Doc()
		const updates: Uint8Array[] = []
		doc.on('update', (update: Uint8Array) => updates.push(update))
		const text = doc.getText('t')
		text.insert(0, 'halo dunia')
		text.delete(0, 5)
		text.insert(0, 'selamat ')

		const restored = new Y.Doc()
		Y.applyUpdate(restored, snapshotOf(updates))
		expect(restored.getText('t').toString()).toBe('selamat dunia')
	})

	test('pembaruan yang menunggu ketergantungannya tidak hilang dari snapshot', () => {
		const doc = new Y.Doc()
		const updates: Uint8Array[] = []
		doc.on('update', (update: Uint8Array) => updates.push(update))
		doc.getText('t').insert(0, 'a')
		doc.getText('t').insert(1, 'b')

		// Hanya pembaruan kedua: ia menggantung tanpa yang pertama.
		const partial = snapshotOf([updates[1]])
		const restored = new Y.Doc()
		Y.applyUpdate(restored, updates[0])
		Y.applyUpdate(restored, partial)
		expect(restored.getText('t').toString()).toBe('ab')
	})
})
