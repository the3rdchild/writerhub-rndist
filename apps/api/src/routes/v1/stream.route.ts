import { streamSSE } from 'hono/streaming'
import { createRouter } from '@/lib/create-app'
import { pipeJobStream } from '@/lib/job-stream'

const stream = createRouter().basePath('/stream')

stream.get('/:jobId', (c) => {
	const jobId = c.req.param('jobId')
	return streamSSE(c, (sse) => pipeJobStream(sse, jobId))
})

export default stream
