import { describe, expect, test } from 'bun:test'
import { getSchema } from '@tiptap/core'
import { buildEditorExtensions } from './extensions'
describe('image schema', () => {
	test('node image membawa atribut src, alt, title, width, dan height', () => {
		const schema = getSchema(buildEditorExtensions({}))
		const imageNode = schema.nodes.image

		expect(imageNode).toBeDefined()
		expect(Object.keys(imageNode?.spec.attrs ?? {})).toContain('src')
		expect(Object.keys(imageNode?.spec.attrs ?? {})).toContain('alt')
		expect(Object.keys(imageNode?.spec.attrs ?? {})).toContain('title')
		expect(Object.keys(imageNode?.spec.attrs ?? {})).toContain('width')
		expect(Object.keys(imageNode?.spec.attrs ?? {})).toContain('height')
	})
})
