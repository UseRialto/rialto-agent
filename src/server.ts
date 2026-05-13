import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import Fastify from 'fastify'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { RialtoAgentCore, type ProductAgentRuntime } from './agent/core.js'
import { OpenAIAgentsProductRuntime } from './agent/openai-agents-runtime.js'
import { registerUploadedWorkbook } from './agent/workbook-attachments.js'
import { evaluateQuoteComparison } from './comparison/evaluate.js'
import { InMemoryUserContextProvider } from './context/user-context-provider.js'
import type { AgentProgressEvent } from './domain/types.js'
import { homePageHtml } from './demo/home-page.js'
import { sampleComparison } from './demo/sample-comparison.js'
import { defaultToolRegistry } from './tools/registry.js'
import { loadLocalEnv } from './env.js'

loadLocalEnv()

const userSchema = z.object({
  id: z.string(),
  contractorOrganizationId: z.string(),
  role: z.enum(['estimator', 'admin', 'vendor']),
  name: z.string(),
  email: z.string().email(),
})

const turnRequestSchema = z.object({
  requestId: z.string().default(() => crypto.randomUUID()),
  user: userSchema,
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).min(1),
  debug: z.boolean().optional(),
  currentPage: z.object({
    path: z.string(),
    title: z.string().optional(),
  }).optional(),
  quoteComparison: z.object({
    currentView: z.unknown().optional(),
    sheetSchema: z.unknown().optional(),
    snapshot: z.unknown().optional(),
    pendingProposal: z.unknown().optional(),
    pendingPreviewPatch: z.unknown().optional(),
    attachments: z.array(z.object({
      id: z.string(),
      filename: z.string(),
      sourceKind: z.enum(['pdf', 'excel', 'csv', 'docx', 'text']),
      workbookId: z.string().optional(),
      textId: z.string().optional(),
      summary: z.unknown().optional(),
    })).optional(),
  }).optional(),
})

export interface BuildServerOptions {
  runtime?: ProductAgentRuntime
}

export function buildServer(options: BuildServerOptions = {}) {
  const app = Fastify({ logger: true })
  const core = new RialtoAgentCore(
    new InMemoryUserContextProvider(),
    options.runtime ?? new OpenAIAgentsProductRuntime(),
  )

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
    const parsed = turnRequestSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid agent turn request.', issues: parsed.error.issues })
    }
    if (!process.env.OPENAI_API_KEY) {
      return reply.status(503).send({
        status: 'blocked',
        error: 'Rialto Agent requires OPENAI_API_KEY.',
      })
    }
    try {
      return await core.runTurn(parsed.data)
    } catch (error) {
      request.log.error(error)
      return reply.status(502).send({
        status: 'tool_error',
        error: agentRuntimeFailureMessage(error),
      })
    }
  })

  app.post('/agent/turn/stream', async (request, reply) => {
    const parsed = turnRequestSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Invalid agent turn request.', issues: parsed.error.issues })
    }
    if (!process.env.OPENAI_API_KEY) {
      return reply.status(503).send({
        status: 'blocked',
        error: 'Rialto Agent requires OPENAI_API_KEY.',
      })
    }

    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    })

    const sendEvent = (event: string, data: unknown) => {
      reply.raw.write(`event: ${event}\n`)
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`)
    }
    const sendProgress = (event: AgentProgressEvent) => sendEvent('progress', event)

    try {
      sendProgress({ type: 'status', message: 'HTTP stream: accepted agent turn request.' })
      const response = await core.runTurn(parsed.data, { onProgress: sendProgress })
      sendEvent('final', response)
    } catch (error) {
      request.log.error(error)
      sendEvent('error', {
        status: 'tool_error',
        error: agentRuntimeFailureMessage(error),
      })
    } finally {
      reply.raw.end()
    }
  })

  app.post('/comparison/propose-patch', async (request, reply) => {
    return reply.status(410).send({
      status: 'blocked',
      error: 'Use /agent/turn for Quote Comparison proposals.',
    })
  })

  app.post('/tools/document/extract', async (request, reply) => {
    const userHeader = request.headers['x-rialto-user']
    if (typeof userHeader !== 'string') {
      return reply.status(401).send({ error: 'Missing x-rialto-user header.' })
    }
    const user = userSchema.safeParse(JSON.parse(userHeader))
    if (!user.success) {
      return reply.status(401).send({ error: 'Invalid x-rialto-user header.' })
    }

    const file = await request.file()
    if (!file) return reply.status(400).send({ error: 'Upload a file.' })
    const buffer = await file.toBuffer()
    const uploadedWorkbook = isExcelFile(file.filename, file.mimetype)
      ? await registerUploadedWorkbook({ filename: file.filename, buffer })
      : undefined
    const context = await new InMemoryUserContextProvider().buildForUser(user.data)
    const extracted = await defaultToolRegistry.execute('direct-document-extract', 'document.extract_line_items', {
      filename: file.filename,
      mimeType: file.mimetype,
      bytesBase64: buffer.toString('base64'),
    }, {
      userContext: context,
      requestId: crypto.randomUUID(),
    })
    if (uploadedWorkbook && extracted.data && typeof extracted.data === 'object') {
      return {
        ...extracted,
        data: {
          ...extracted.data,
          attachment: {
            id: uploadedWorkbook.id,
            filename: uploadedWorkbook.filename,
            sourceKind: uploadedWorkbook.sourceKind,
            workbookId: uploadedWorkbook.workbookId,
            summary: uploadedWorkbook.summary,
          },
        },
      }
    }
    return extracted
  })

  return app
}

function isExcelFile(filename: string, mimeType?: string) {
  const lower = filename.toLowerCase()
  return lower.endsWith('.xlsx')
    || lower.endsWith('.xls')
    || mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    || mimeType === 'application/vnd.ms-excel'
    || /spreadsheet|excel/i.test(mimeType ?? '')
}

function agentRuntimeFailureMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (/connection error|fetch failed|getaddrinfo|enotfound|api\.openai\.com/i.test(message)) {
    return 'Rialto Agent could not reach the OpenAI model API. Check network/DNS and retry.'
  }
  return 'Rialto Agent model request failed while preparing the response.'
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 8787)
  const host = process.env.HOST ?? '0.0.0.0'
  const app = buildServer()
  await app.listen({ port, host })
}
