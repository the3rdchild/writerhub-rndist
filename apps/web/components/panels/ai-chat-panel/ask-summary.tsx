'use client'

import type { ToolCall } from '@writer-hub/shared'
import { ArrowDown, CircleHelp } from 'lucide-react'
import { type ReactNode, useMemo } from 'react'
import { parseAskQuestions, requestedBriefFields, responseValue } from '@/features/chat/ask'
import { useChat } from '@/features/chat/chat-context'

/**
 * Jejak pertanyaan AI di percakapan. Kartunya sendiri hidup di tempat kotak
 * chat; di sini hanya yang perlu diingat sesudahnya - apa yang ditanyakan dan
 * apa jawaban penulis - supaya percakapannya tetap terbaca urut.
 */
export function AskSummary({ call, expired }: { call: ToolCall; expired?: boolean }) {
	const { askAnswer, pendingAsk } = useChat()
	const answer = askAnswer(call.id)
	const questions = useMemo(() => parseAskQuestions(call.arguments), [call.arguments])
	const requested = useMemo(() => requestedBriefFields(call.arguments), [call.arguments])

	const shell = (children: ReactNode) => (
		<div className="flex flex-col gap-1.5 rounded-xl border border-line bg-surface-raised px-3 py-2">
			<p className="flex items-center gap-1.5 text-[11px] font-medium text-muted">
				<CircleHelp className="h-3.5 w-3.5 text-accent" />
				{call.name === 'request_brief' ? 'AI meminta metadata' : 'The AI asked'}
			</p>
			{children}
		</div>
	)

	if (!answer) {
		const waiting = pendingAsk?.id === call.id
		return shell(
			<p className="flex items-center gap-1 text-xs text-subtle">
				{waiting ? (
					<>
						Waiting for your answer below
						<ArrowDown className="h-3 w-3" />
					</>
				) : expired ? (
					'Not answered.'
				) : (
					'Waiting for an answer.'
				)}
			</p>,
		)
	}

	if (answer.skipped) return shell(<p className="text-xs text-subtle">You skipped this question.</p>)

	if (call.name === 'request_brief') {
		const filled = answer.filled ?? []
		return shell(
			<p className="text-xs leading-snug text-foreground">
				{filled.length > 0
					? `Anda melengkapi ${filled.map((entry) => entry.label).join(', ')}.`
					: `None of the ${requested.length} requested fields are filled yet.`}
			</p>,
		)
	}

	return shell(
		<dl className="flex flex-col gap-1">
			{(answer.responses ?? []).map((response, index) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: jawaban yang tersimpan tidak pernah berubah urutan, dan pertanyaannya boleh kembar.
				<div key={index} className="flex flex-col">
					<dt className="text-[11px] leading-snug text-subtle">
						{questions[index]?.question ?? response.question}
					</dt>
					<dd className="text-xs leading-snug text-foreground">
						{responseValue(response) || <span className="italic text-faint">not answered</span>}
					</dd>
				</div>
			))}
		</dl>,
	)
}
