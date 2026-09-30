'use client'

import { ChevronDown, ChevronRight, Circle, CircleCheck, CircleDot } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ChatTodos } from '@/features/chat/chat-context'
import { currentTodo, type TodoStatus, todoCounts } from '@/features/chat/todos'
import { cn } from '@/lib/utils'

function TodoIcon({ status }: { status: TodoStatus }) {
	switch (status) {
		case 'completed':
			return <CircleCheck className="h-3.5 w-3.5 shrink-0 text-green-400" />
		case 'in-progress':
			return <CircleDot className="h-3.5 w-3.5 shrink-0 text-accent" />
		case 'not-started':
			return <Circle className="h-3.5 w-3.5 shrink-0 text-faint" />
	}
}

/**
 * Daftar tugas AI di atas kotak chat, seperti panel Todos di chat VS Code.
 *
 * Terbuka selama tugasnya berjalan, terlipat sendiri begitu selesai, dan
 * tetap ada sampai penulis mengirim permintaan baru (keputusan pengguna
 * 29 Sep). Terlipat, ia hanya menyebut butir yang sedang dikerjakan.
 */
export function TodosPanel({ todos, running }: { todos: ChatTodos; running: boolean }) {
	const [open, setOpen] = useState(running)
	useEffect(
		function foldWhenTaskEnds() {
			if (!running) setOpen(false)
		},
		[running],
	)

	const { done, total } = todoCounts(todos.items)
	const current = currentTodo(todos.items)
	const title = `Todos (${done}/${total})`

	return (
		<div className="rounded-xl border border-foreground/10 bg-surface-raised text-xs" data-todos-panel>
			<button
				type="button"
				onClick={() => setOpen(!open)}
				aria-expanded={open}
				title={title}
				className="flex w-full items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-left transition-colors hover:bg-[var(--overlay-hover)]"
			>
				{open ? (
					<ChevronDown className="h-3.5 w-3.5 shrink-0 text-subtle" />
				) : (
					<ChevronRight className="h-3.5 w-3.5 shrink-0 text-subtle" />
				)}
				{open || !current ? (
					<span className="min-w-0 flex-1 truncate font-medium text-foreground">{title}</span>
				) : (
					<>
						<TodoIcon status={current.status} />
						<span className="min-w-0 flex-1 truncate text-foreground">{current.text}</span>
						<span className="shrink-0 tabular-nums text-faint">
							{done}/{total}
						</span>
					</>
				)}
			</button>
			{open && (
				<ol className="flex max-h-48 flex-col gap-0.5 overflow-y-auto overscroll-contain px-2.5 pb-2">
					{todos.items.map((todo) => (
						<li key={todo.text} className="flex items-center gap-2 py-0.5">
							<TodoIcon status={todo.status} />
							<span
								className={cn(
									'min-w-0 flex-1 truncate',
									todo.status === 'completed' ? 'text-subtle' : 'text-foreground',
									todo.status === 'in-progress' && 'font-medium',
								)}
							>
								{todo.text}
							</span>
						</li>
					))}
				</ol>
			)}
		</div>
	)
}
