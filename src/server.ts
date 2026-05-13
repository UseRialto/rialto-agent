import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import Fastify from 'fastify'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ProductAgentRuntime } from './agent/core.js'
import { AgentHttpService } from './agent/http-service.js'
import { evaluateQuoteComparison } from './comparison/evaluate.js'
import { homePageHtml } from './demo/home-page.js'
import { sampleComparison } from './demo/sample-comparison.js'
import { defaultToolRegistry } from './tools/registry.js'
import { loadLocalEnv } from './env.js'

loadLocalEnv()

export interface BuildServerOptions {
  runtime?: ProductAgentRuntime
}

export function buildServer(options: BuildServerOptions = {}) {
  const app = Fastify({ logger: true })
  const agentService = new AgentHttpService(options)

  app.register(cors, { origin: true })
  app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } })

  app.get('/', async (_request, reply) => reply.type('text/html').send(homePageHtml()))

  app.get('/assets/:filename', async (request, reply) => {
    const { filename } = request.params as { filename: string }
    if (!['Rialto_Full_Logo_CLEAR.png', 'Rialto_Icon_CLEAR.png'].includes(filename)) {
      return reply.status(404).send({ error: 'Asset not found.' })
    }
    const data = await readFile(join(process.cwd(), 'public', filename))
    return reply.type('image/png').send(data)
  })

  app.get('/health', async () => ({ ok: true }))

  app.get('/tools', async () => ({ tools: defaultToolRegistry.list() }))

  app.get('/demo/comparison/evaluate', async () => evaluateQuoteComparison(sampleComparison))

  app.post('/agent/turn', async (request, reply) => {
    const result = await agentService.runTurn(request.body)
    return reply.status(result.status).send(result.body)
  })

  app.post('/agent/turn/stream', async (request, reply) => {
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    })

    const sendEvent = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\n`)
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`)
    }
    const earlyResult = await agentService.streamTurn(request.body, sendEvent)
    if (earlyResult) sendEvent('error', earlyResult.body)
    reply.raw.end()
  })

  app.post('/comparison/propose-patch', async (request, reply) => {
    return reply.status(410).send({
      status: 'blocked',
      error: 'Use /agent/turn for Quote Comparison proposals.',
    })
  })

  app.post('/tools/document/extract', async (request, reply) => {
    const userHeader = request.headers['x-rialto-user']
    let user: unknown
    try {
      user = typeof userHeader === 'string' ? JSON.parse(userHeader) : undefined
    } catch {
      user = undefined
    }
    if (!user) {
      return reply.status(401).send({ error: 'Invalid x-rialto-user header.' })
    }

    const file = await request.file()
    if (!file) return reply.status(400).send({ error: 'Upload a file.' })
    const buffer = await file.toBuffer()
    const result = await agentService.extractDocument({
      user,
      filename: file.filename,
      mimeType: file.mimetype,
      buffer,
    })
    return reply.status(result.status).send(result.body)
  })

  return app
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 8787)
  const host = process.env.HOST ?? '0.0.0.0'
  const app = buildServer()
  await app.listen({ port, host })
}
