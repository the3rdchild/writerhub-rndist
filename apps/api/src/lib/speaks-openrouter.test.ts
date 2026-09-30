import { afterEach, describe, expect, test } from 'bun:test'
import { env } from '@/config/env'
import { openRouterRouting } from '@/lib/speaks-openrouter'

const mutableEnv = env as unknown as Record<string, unknown>
const saved = env.AI_PROVIDER_ORDER

afterEach(() => {
	mutableEnv.AI_PROVIDER_ORDER = saved
})

describe('openRouterRouting', () => {
	test('urutan provider dikirim ke OpenRouter, dengan cadangan tetap diizinkan', () => {
		mutableEnv.AI_PROVIDER_ORDER = ' deepinfra , baseten,'
		expect(openRouterRouting('https://openrouter.ai/api/v1')).toEqual({
			provider: { order: ['deepinfra', 'baseten'], allow_fallbacks: true },
		})
	})

	test('provider selain OpenRouter tidak menerima medan asing', () => {
		mutableEnv.AI_PROVIDER_ORDER = 'deepinfra'
		expect(openRouterRouting('https://api.deepseek.com/v1')).toEqual({})
	})

	test('tanpa setelan, perutean bawaan OpenRouter dipakai', () => {
		mutableEnv.AI_PROVIDER_ORDER = ''
		expect(openRouterRouting('https://openrouter.ai/api/v1')).toEqual({})
	})
})
