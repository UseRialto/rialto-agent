import { z } from 'zod'
import { RialtoAgentCore, type ProductAgentRuntime } from './core.js'
import { OpenAIAgentsProductRuntime } from './openai-agents-runtime.js'
import { registerUploadedWorkbook } from './workbook-attachments.js'
import { InMemoryUserContextProvider } from '../context/user-context-provider.js'
import type { AgentProgressEvent } from '../domain/types.js'
import { defaultToolRegistry } from '../tools/registry.js'

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

export interface AgentServiceResult {
  status: number
  body: unknown
}

export interface DocumentExtractInput {
  user: unknown
  filename: string
  mimeType?: string
  buffer: Buffer
}

export interface AgentHttpServiceOptions {
  runtime?: ProductAgentRuntime
}

export class AgentHttpService {
  private readonly core: RialtoAgentCore

  constructor(options: AgentHttpServiceOptions = {}) {
    this.core = new RialtoAgentCore(
      new InMemoryUserContextProvider(),
      options.runtime ?? new OpenAIAgentsProductRuntime(),
    )
  }

  async runTurn(body: unknown): Promise<AgentServiceResult> {
    const parsed = turnRequestSchema.safeParse(body)
    if (!parsed.success) {
      return { status: 400, body: { error: 'Invalid agent turn request.', issues: parsed.error.issues } }
    }
    if (!process.env.OPENAI_API_KEY) {
      return {
        status: 503,
        body: {
          status: 'blocked',
          error: 'Rialto Agent requires OPENAI_API_KEY.',
        },
      }
    }

    try {
      return { status: 200, body: await this.core.runTurn(parsed.data) }
    } catch (error) {
      console.error('Rialto Agent turn failed:', error)
      return {
        status: 502,
        body: {
          status: 'tool_error',
          error: agentRuntimeFailureMessage(error),
        },
      }
    }
  }

  async streamTurn(
    body: unknown,
    emit: (event: string, data: unknown) => void,
  ): Promise<AgentServiceResult | null> {
    const parsed = turnRequestSchema.safeParse(body)
    if (!parsed.success) {
      return { status: 400, body: { error: 'Invalid agent turn request.', issues: parsed.error.issues } }
    }
    if (!process.env.OPENAI_API_KEY) {
      return {
        status: 503,
        body: {
          status: 'blocked',
          error: 'Rialto Agent requires OPENAI_API_KEY.',
        },
      }
    }

    const sendProgress = (event: AgentProgressEvent) => emit('progress', event)

    try {
      sendProgress({ type: 'status', message: 'HTTP stream: accepted agent turn request.' })
      const response = await this.core.runTurn(parsed.data, { onProgress: sendProgress })
      emit('final', response)
    } catch (error) {
      console.error('Rialto Agent streaming turn failed:', error)
      emit('error', {
        status: 'tool_error',
        error: agentRuntimeFailureMessage(error),
      })
    }

    return null
  }

  async extractDocument(input: DocumentExtractInput): Promise<AgentServiceResult> {
    const user = userSchema.safeParse(input.user)
    if (!user.success) return { status: 401, body: { error: 'Invalid user.' } }

    const uploadedWorkbook = isExcelFile(input.filename, input.mimeType)
      ? await registerUploadedWorkbook({ filename: input.filename, buffer: input.buffer })
      : undefined
    const context = await new InMemoryUserContextProvider().buildForUser(user.data)
    const extracted = await defaultToolRegistry.execute('direct-document-extract', 'document.extract_line_items', {
      filename: input.filename,
      mimeType: input.mimeType,
      bytesBase64: input.buffer.toString('base64'),
    }, {
      userContext: context,
      requestId: crypto.randomUUID(),
    })

    if (uploadedWorkbook && extracted.data && typeof extracted.data === 'object') {
      return {
        status: 200,
        body: {
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
        },
      }
    }

    return { status: 200, body: extracted }
  }
}

let defaultService: AgentHttpService | undefined

export function getDefaultAgentHttpService() {
  defaultService ??= new AgentHttpService()
  return defaultService
}

export function isExcelFile(filename: string, mimeType?: string) {
  const lower = filename.toLowerCase()
  return lower.endsWith('.xlsx')
    || lower.endsWith('.xls')
    || mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    || mimeType === 'application/vnd.ms-excel'
    || /spreadsheet|excel/i.test(mimeType ?? '')
}

export function agentRuntimeFailureMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (/exceeded your current quota|check your plan and billing|insufficient_quota/i.test(message)) {
    return 'The configured OpenAI API key has exceeded its quota. Check OpenAI billing or replace OPENAI_API_KEY in Vercel.'
  }
  if (/\b429\b|rate limit/i.test(message)) {
    return 'Rialto Agent hit an OpenAI rate limit. Retry shortly or check the configured model/API key limits.'
  }
  if (/\b401\b|invalid api key|incorrect api key|unauthorized/i.test(message)) {
    return 'Rialto Agent could not authenticate with OpenAI. Check OPENAI_API_KEY in Vercel.'
  }
  if (/connection error|fetch failed|getaddrinfo|enotfound|api\.openai\.com/i.test(message)) {
    return 'Rialto Agent could not reach the OpenAI model API. Check network/DNS and retry.'
  }
  return 'Rialto Agent model request failed while preparing the response.'
}
