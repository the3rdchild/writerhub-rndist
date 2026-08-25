export interface CommentReply {
	author: string
	authorId?: string
	text: string
	at: number
}
export interface CommentSuggestion {
	text: string
	author: string
	authorId?: string
	at: number
	status?: 'accepted' | 'rejected'
	decidedAt?: number
	replaced?: string
}
export interface CommentThread {
	id: string
	quote: string
	author?: string
	authorId?: string
	replies: CommentReply[]
	suggestion?: CommentSuggestion
	resolved: boolean
	createdAt: number
}
