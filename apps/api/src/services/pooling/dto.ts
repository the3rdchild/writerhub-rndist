import { z } from 'zod'

export const poolingParamSchema = z.object({
	jobId: z.string().uuid({ message: 'Invalid jobId format' }),
})
