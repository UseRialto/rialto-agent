import type {
  AgentRequestContext,
  AgentDebugTrace,
  AgentToolCall,
  AgentTurnRequest,
  AgentTurnResponse,
  ComparisonPatchFragment,
  ComparisonPatchProposal,
  ToolResult,
  UserContext,
} from '../domain/types.js'
import type { UserContextProvider } from '../context/user-context-provider.js'

export interface ProductAgentRuntimeRequest {
  requestId: string
  userContext: UserContext
  requestContext?: AgentRequestContext
  messages: AgentTurnRequest['messages']
  debug?: boolean
}

export type ProductAgentRuntimeResult =
  | {
      status: 'completed'
      reply: string
      plan?: string[]
      toolCalls?: AgentToolCall[]
      toolResults?: ToolResult[]
    }
  | {
      status: 'needs_clarification'
      reply: string
      clarification: {
        question: string
        choices?: Array<{ id: string; label: string }>
      }
      toolCalls?: AgentToolCall[]
      toolResults?: ToolResult[]
    }
  | {
      status: 'blocked' | 'tool_error'
      reply: string
      reason: string
      toolCalls?: AgentToolCall[]
      toolResults?: ToolResult[]
    }

export interface ProductAgentRuntime {
  runTurn(request: ProductAgentRuntimeRequest): Promise<ProductAgentRuntimeResult>
}

export class RialtoAgentCore {
  constructor(
    private readonly contextProvider: UserContextProvider,
    private readonly runtime: ProductAgentRuntime,
  ) {}

  async runTurn(request: AgentTurnRequest): Promise<AgentTurnResponse> {
    const userContext = await this.contextProvider.buildForUser(request.user)
    const requestContext = requestContextFromTurn(request)
    const result = await this.runtime.runTurn({
      requestId: request.requestId,
      userContext,
      requestContext,
      messages: request.messages,
      debug: request.debug,
    })
    const toolCalls = result.toolCalls ?? []
    const toolResults = result.toolResults ?? []
    const fragments = comparisonFragmentsFromToolResults(toolResults)
    const proposal = comparisonProposalFromFragments(fragments)
    const plan = result.status === 'completed' ? result.plan : undefined
    const debugTrace = request.debug
      ? debugTraceFromTurn(result.status, plan, toolCalls, toolResults, fragments, proposal)
      : undefined

    if (result.status === 'needs_clarification') {
      return {
        requestId: request.requestId,
        status: 'needs_clarification',
        reply: result.reply,
        clarification: result.clarification,
        toolCalls,
        toolResults,
        debugTrace,
      }
    }

    if (result.status === 'blocked' || result.status === 'tool_error') {
      return {
        requestId: request.requestId,
        status: result.status,
        reply: result.reply,
        reason: result.reason,
        toolCalls,
        toolResults,
        debugTrace,
      }
    }

    return {
      requestId: request.requestId,
      status: 'completed',
      reply: result.reply,
      plan,
      toolCalls,
      toolResults,
      proposal,
      debugTrace,
    }
  }
}

function requestContextFromTurn(request: AgentTurnRequest): AgentRequestContext {
  return {
    currentPage: request.currentPage,
    quoteComparison: request.quoteComparison,
  }
}

function isComparisonPatchFragment(value: unknown): value is ComparisonPatchFragment {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<ComparisonPatchFragment>
  return typeof candidate.summary === 'string' && Array.isArray(candidate.operations)
}

function fragmentFromToolResult(result: ToolResult): ComparisonPatchFragment | null {
  const data = result.data
  if (!data || typeof data !== 'object') return null
  const candidate = data as { action?: unknown; fragment?: unknown }
  if (candidate.action !== 'comparison-patch-fragment') return null
  return isComparisonPatchFragment(candidate.fragment) ? candidate.fragment : null
}

function comparisonFragmentsFromToolResults(results: ToolResult[]): ComparisonPatchFragment[] {
  return results.map(fragmentFromToolResult).filter((fragment): fragment is ComparisonPatchFragment => Boolean(fragment))
}

function comparisonProposalFromFragments(fragments: ComparisonPatchFragment[]): ComparisonPatchProposal | undefined {
  if (fragments.length === 0) return undefined
  return {
    kind: 'comparison-patch-proposal',
    summary: fragments.map((fragment) => fragment.summary).filter(Boolean).join(' '),
    approvalMode: 'approve-all-or-discard',
    operations: fragments.flatMap((fragment) => fragment.operations),
    warnings: Array.from(new Set(fragments.flatMap((fragment) => fragment.warnings ?? []))),
    provenanceNotes: fragments.flatMap((fragment) => fragment.provenanceNotes ?? []),
  }
}

function debugTraceFromTurn(
  responseState: AgentDebugTrace['responseState'],
  plan: string[] | undefined,
  toolCalls: AgentDebugTrace['toolCalls'],
  toolResults: ToolResult[],
  patchFragments: ComparisonPatchFragment[],
  proposal: ComparisonPatchProposal | undefined,
): AgentDebugTrace {
  return {
    responseState,
    plan,
    toolCalls,
    toolResults,
    patchFragments,
    proposal,
    warnings: proposal?.warnings,
    errors: toolResults.filter((result) => result.status === 'error').map((result) => result.summary),
  }
}
