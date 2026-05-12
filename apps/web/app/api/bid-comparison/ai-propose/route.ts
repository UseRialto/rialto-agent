import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import {
  comparisonViewPatchFromAgentToolPatch,
  comparisonViewPatchFromProposal,
  type ComparisonAgentToolPatch,
  type ComparisonPatchProposal,
} from '@/lib/procurement/comparison-agent-tools'
import { agentTurnFailureMessage, postAgentTurnWithRetry } from '@/lib/procurement/comparison-agent-api-client'
import type { ComparisonAgentDebugTrace } from '@/lib/procurement/comparison-agent-debug'

interface SchemaColumn {
  key: string
  label: string
  kind: 'rfq-core' | 'rfq-attribute' | 'rfq-standard' | 'vendor' | 'derived' | 'manual'
  vendorId?: string
  vendorName?: string
  metric?: 'unit_price' | 'total' | 'lead'
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
  debug?: boolean
  stream?: boolean
  sheetSchema?: {
    columns?: SchemaColumn[]
    lineItems?: SchemaItem[]
    vendors?: SchemaVendor[]
  }
}

interface AgentTurnData {
  error?: string
  status?: string
  plan?: string[]
  debugTrace?: ComparisonAgentDebugTrace
  proposal?: ComparisonPatchProposal
  toolResults?: Array<{ toolId?: string; status?: string; summary?: string; data?: { action?: string; patch?: ComparisonAgentToolPatch } }>
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
  return {
    user: {
      id: session.userId,
      contractorOrganizationId: session.userId,
      role: session.role === 'vendor' ? 'vendor' : 'estimator',
      name: session.name || 'Estimator',
      email: session.email || 'estimator@example.com',
    },
    messages: [{ role: 'user' as const, content: message }],
    currentPage: {
      path: '/contractor/quote-comparison',
      title: 'Quote Comparison',
    },
    quoteComparison: {
      currentView: body.currentView,
      sheetSchema: body.sheetSchema,
      snapshot: body.snapshot,
    },
    debug: body.debug,
  }
}

function proposalResponsePayload(data: AgentTurnData, sheetSchema: RequestBody['sheetSchema']) {
  if (data.proposal?.kind === 'comparison-patch-proposal') {
    return {
      patch: comparisonViewPatchFromProposal(data.proposal),
      usedFallback: false,
      ...debugPayload(data),
    }
  }

  const toolPatch = data.toolResults?.find((result) => result.data?.action === 'preview-spreadsheet-patch')?.data?.patch
  if (!toolPatch) throw new Error(data.error ?? 'Rialto Agent did not return a Quote Comparison tool patch.')
  return {
    patch: comparisonViewPatchFromAgentToolPatch(toolPatch, sheetSchema ?? {}),
    usedFallback: false,
    ...debugPayload(data),
  }
}

function sseEvent(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
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
    const payload = agentPayload(body, session, message)
    if (body.stream) return streamAgentProposal(payload, body.sheetSchema)

    const response = await postAgentTurnWithRetry(payload)
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
  const apiUrl = process.env.RIALTO_AGENT_API_URL ?? 'http://localhost:8787'
  const response = await fetch(`${apiUrl}/agent/turn/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

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

function parseSseEvent(rawEvent: string): { event: string; data: unknown } | null {
  const event = rawEvent.split('\n').find((line) => line.startsWith('event: '))?.slice('event: '.length).trim()
  const dataLine = rawEvent.split('\n').find((line) => line.startsWith('data: '))
  if (!event || !dataLine) return null
  return { event, data: JSON.parse(dataLine.slice('data: '.length)) }
}
