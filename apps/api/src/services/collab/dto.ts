import { z } from 'zod'

export const issueTicketBodySchema = z.object({
	/** Id tab SERVER. */
	tabId: z.uuid(),
})

export type IssueTicketBody = z.infer<typeof issueTicketBodySchema>
