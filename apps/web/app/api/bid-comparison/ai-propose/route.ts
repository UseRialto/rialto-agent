import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { comparisonAssistantPayloadFromAgentTurn, type AgentTurnData } from '@/lib/procurement/comparison-agent-response'
import { comparisonFastCommandPatch } from '@/lib/procurement/comparison-fast-commands'
import { agentFetchErrorMessage, agentTurnFailureMessage, postAgentTurnWithRetry } from '@/lib/procurement/comparison-agent-api-client'

export const runtime = 'nodejs'

interface SchemaColumn {
  key: string
  label: string
  kind: 'rfq-core' | 'rfq-attribute' | 'rfq-standard' | 'vendor' | 'derived' | 'manual'
  vendorId?: string
  vendorName?: string
  metric?: 'unit_price' | 'total' | 'lead' | 'alternate'
  isEmpty?: boolean
}

interface SchemaItem {
  id: string
  description: string
  values?: Record<string, string>
}

interface SchemaVendor {
  id: string
  name: string
}

interface RequestBody {
  message?: string
  currentView?: unknown
  snapshot?: unknown
  pendingProposal?: unknown
  pendingPreviewPatch?: unknown
  debug?: boolean
  stream?: boolean
  attachments?: Array<{
    sourceId?: string
    filename: string
    text: string
    sourceKind?: 'pdf' | 'excel' | 'csv' | 'docx' | 'text'
    workbookId?: string
    summary?: unknown
  }>
  sheetSchema?: {
    columns?: SchemaColumn[]
    lineItems?: SchemaItem[]
    vendors?: SchemaVendor[]
  }
}

function debugPayload(data: Pick<AgentTurnData, 'plan' | 'debugTrace' | 'toolResults'>) {
  return {
    plan: data.plan,
    debugTrace: data.debugTrace,
    toolResults: data.toolResults,
  }
}

function agentPayload(body: RequestBody, session: Awaited<ReturnType<typeof getSession>>, message: string) {
  if (!session) throw new Error('Not authenticated.')
  const attachmentText = (body.attachments ?? [])
    .filter((attachment) => attachment.text.trim())
    .map((attachment, index) => [
      `Attachment ${index + 1}: ${attachment.filename}`,
      `Source id: ${attachment.sourceId ?? attachment.filename}`,
      attachment.text,
    ].join('\n'))
    .join('\n\n')
  const content = attachmentText
    ? `${message}\n\nUploaded document text for document.readSource:\n\n${attachmentText}`
    : message
  return {
    requestId: crypto.randomUUID(),
    user: {
      id: session.userId,
      contractorOrganizationId: session.userId,
      role: session.role === 'vendor' ? 'vendor' as const : 'estimator' as const,
      name: session.name || 'Estimator',
      email: session.email || 'estimator@example.com',
    },
    messages: [{ role: 'user' as const, content }],
    currentPage: {
      path: '/contractor/quote-comparison',
      title: 'Quote Comparison',
    },
    quoteComparison: {
      currentView: body.currentView,
      sheetSchema: body.sheetSchema,
      snapshot: body.snapshot,
      pendingProposal: body.pendingProposal,
      pendingPreviewPatch: body.pendingPreviewPatch,
      attachments: (body.attachments ?? []).map((attachment) => ({
        id: attachment.sourceId ?? attachment.filename,
        filename: attachment.filename,
        sourceKind: attachment.sourceKind ?? 'text',
        workbookId: attachment.workbookId,
        textId: attachment.text.trim() ? (attachment.sourceId ?? attachment.filename) : undefined,
        summary: attachment.summary,
      })),
    },
    debug: body.debug,
  }
}

function proposalResponsePayload(data: AgentTurnData, sheetSchema: RequestBody['sheetSchema']) {
  return comparisonAssistantPayloadFromAgentTurn(data, sheetSchema ?? {})
}

function sseEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

function agentApiUrl() {
  return (process.env.RIALTO_AGENT_API_URL?.trim() || 'http://localhost:8787').replace(/\/+$/, '')
}

function fastCommandPayload(body: RequestBody, message: string) {
  const patch = comparisonFastCommandPatch(message, body.sheetSchema ?? {})
  if (!patch) return null
  return {
    patch,
    usedFallback: false,
    usedFastCommand: true,
    plan: ['Matched a deterministic visible Comparison Sheet command.', 'Prepared a previewable Comparison Sheet patch without calling the Product Agent Runtime.'],
    toolResults: [{
      toolId: 'quoteComparison.fastCommand',
      status: 'ok',
      summary: patch.summary,
      data: { action: 'comparison-fast-command', patch },
    }],
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })

  let body: RequestBody
  try {
    body = (await request.json()) as RequestBody
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const message = (body.message ?? '').trim()
  if (!message) return NextResponse.json({ error: 'message is required.' }, { status: 400 })

  try {
    const fastPayload = fastCommandPayload(body, message)
    if (fastPayload) {
      if (body.stream) {
        return new Response(sseEvent('final', fastPayload), {
          headers: {
            'content-type': 'text/event-stream; charset=utf-8',
            'cache-control': 'no-cache, no-transform',
          },
        })
      }
      return NextResponse.json(fastPayload)
    }

    const payload = agentPayload(body, session, message)
    if (body.stream) return await streamAgentProposal(payload, body.sheetSchema)

    const response = await postAgentTurnWithRetry(payload, { apiUrl: agentApiUrl() })
    const data = await response.json() as AgentTurnData

    if (!response.ok) {
      return NextResponse.json({
        error: agentTurnFailureMessage(response.status, data.error),
        status: data.status ?? 'tool_error',
        ...debugPayload(data),
      }, { status: response.status })
    }

    return NextResponse.json(proposalResponsePayload(data, body.sheetSchema))
  } catch (error) {
    console.error('bid-comparison ai-propose failed:', error instanceof Error ? error.message : error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Rialto Agent could not prepare a Quote Comparison proposal.',
      status: 'tool_error',
    }, { status: 502 })
  }
}

async function streamAgentProposal(payload: unknown, sheetSchema: RequestBody['sheetSchema']) {
  const apiUrl = agentApiUrl()
  let response: Response
  try {
    response = await fetch(`${apiUrl}/agent/turn/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch (error) {
    return agentStreamErrorResponse(agentFetchErrorMessage(error))
  }

  if (!response.ok || !response.body) {
    const data = await response.json().catch(() => ({})) as AgentTurnData
    return NextResponse.json({
      error: agentTurnFailureMessage(response.status, data.error),
      status: data.status ?? 'tool_error',
      ...debugPayload(data),
    }, { status: response.status })
  }

  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  let buffer = ''

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = response.body!.getReader()
      try {
        while (true) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const events = buffer.split('\n\n')
          buffer = events.pop() ?? ''
          for (const rawEvent of events) {
            const parsed = parseSseEvent(rawEvent)
            if (!parsed) continue
            if (parsed.event === 'final') {
              controller.enqueue(encoder.encode(sseEvent('final', proposalResponsePayload(parsed.data as AgentTurnData, sheetSchema))))
            } else {
              controller.enqueue(encoder.encode(sseEvent(parsed.event, parsed.data)))
            }
          }
        }
        if (buffer.trim()) {
          const parsed = parseSseEvent(buffer)
          if (parsed?.event === 'final') {
            controller.enqueue(encoder.encode(sseEvent('final', proposalResponsePayload(parsed.data as AgentTurnData, sheetSchema))))
          } else if (parsed) {
            controller.enqueue(encoder.encode(sseEvent(parsed.event, parsed.data)))
          }
        }
      } catch (error) {
        controller.enqueue(encoder.encode(sseEvent('error', {
          status: 'tool_error',
          error: error instanceof Error ? error.message : 'Rialto Agent stream failed.',
        })))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
    },
  })
}

function agentStreamErrorResponse(error: string) {
  return new Response(sseEvent('error', {
    status: 'tool_error',
    error,
  }), {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
    },
  })
}

function parseSseEvent(rawEvent: string): { event: string; data: unknown } | null {
  const event = rawEvent.split('\n').find((line) => line.startsWith('event: '))?.slice('event: '.length).trim()
  const dataLine = rawEvent.split('\n').find((line) => line.startsWith('data: '))
  if (!event || !dataLine) return null
  return { event, data: JSON.parse(dataLine.slice('data: '.length)) }
}
