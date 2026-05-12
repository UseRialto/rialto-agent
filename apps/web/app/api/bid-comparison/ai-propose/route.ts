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
    const response = await postAgentTurnWithRetry({
      user: {
        id: session.userId,
        contractorOrganizationId: session.userId,
        role: session.role === 'vendor' ? 'vendor' : 'estimator',
        name: session.name || 'Estimator',
        email: session.email || 'estimator@example.com',
      },
      messages: [{ role: 'user', content: message }],
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
    })
    const data = await response.json() as AgentTurnData

    if (!response.ok) {
      return NextResponse.json({
        error: agentTurnFailureMessage(response.status, data.error),
        status: data.status ?? 'tool_error',
        ...debugPayload(data),
      }, { status: response.status })
    }

    if (data.proposal?.kind === 'comparison-patch-proposal') {
      return NextResponse.json({
        patch: comparisonViewPatchFromProposal(data.proposal),
        usedFallback: false,
        ...debugPayload(data),
      })
    }

    const toolPatch = data.toolResults?.find((result) => result.data?.action === 'preview-spreadsheet-patch')?.data?.patch
    if (!toolPatch) throw new Error(data.error ?? 'Rialto Agent did not return a Quote Comparison tool patch.')
    return NextResponse.json({
      patch: comparisonViewPatchFromAgentToolPatch(toolPatch, body.sheetSchema ?? {}),
      usedFallback: false,
      ...debugPayload(data),
    })
  } catch (error) {
    console.error('bid-comparison ai-propose failed:', error instanceof Error ? error.message : error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Rialto Agent could not prepare a Quote Comparison proposal.',
      status: 'tool_error',
    }, { status: 502 })
  }
}
