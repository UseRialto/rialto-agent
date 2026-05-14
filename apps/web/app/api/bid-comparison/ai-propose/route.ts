import { NextRequest, NextResponse } from 'next/server'
import { getDefaultAgentHttpService } from '@rialto-agent/agent/http-service'
import { getSession } from '@/lib/auth/session'
import { comparisonAssistantPayloadFromAgentTurn, type AgentTurnData } from '@/lib/procurement/comparison-agent-response'
import { comparisonFastCommandPatch } from '@/lib/procurement/comparison-fast-commands'
import { isQuoteComparisonSummaryRequest } from '@/lib/procurement/comparison-analytics'

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
  const agentMessage = summaryPrompt(message)
  const content = attachmentText
    ? `${agentMessage}\n\nUploaded document text for document.readSource:\n\n${attachmentText}`
    : agentMessage
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

function summaryPrompt(message: string) {
  if (!isQuoteComparisonSummaryRequest(message)) return message
  return [
    message,
    '',
    'Write a short estimator-facing quote comparison summary in no more than 5 sentences.',
    'Use the current Comparison Sheet Snapshot and call quoteComparison_answerSheetQuestion for sheet facts before answering.',
    'Include relevant figures: item count, vendor count, complete vs incomplete/partial quote status, material gaps or no-bids, pricing mistake/review flags, and the best choice with caveats.',
    'Do not propose sheet edits. Do not use a canned template. Make the summary specific to this sheet.',
  ].join('\n')
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

    const result = await getDefaultAgentHttpService().runTurn(payload)
    const data = result.body as AgentTurnData

    if (result.status < 200 || result.status >= 300) {
      return NextResponse.json({
        error: data.error ?? 'Rialto Agent could not prepare a Quote Comparison proposal.',
        status: data.status ?? 'tool_error',
        ...debugPayload(data),
      }, { status: result.status })
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
  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const earlyResult = await getDefaultAgentHttpService().streamTurn(payload, (event, data) => {
          if (event === 'final') {
            controller.enqueue(encoder.encode(sseEvent('final', proposalResponsePayload(data as AgentTurnData, sheetSchema))))
            return
          }
          controller.enqueue(encoder.encode(sseEvent(event, data)))
        })
        if (earlyResult) controller.enqueue(encoder.encode(sseEvent('error', earlyResult.body)))
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
