import {
  comparisonViewPatchFromAgentToolPatch,
  comparisonViewPatchFromProposal,
  type ComparisonAgentToolPatch,
  type ComparisonPatchProposal,
  type ComparisonViewPatch,
} from './comparison-agent-tools'
import type { ComparisonAgentDebugTrace } from './comparison-agent-debug'

export interface AgentTurnData {
  error?: string
  status?: string
  reply?: string
  reason?: string
  plan?: string[]
  debugTrace?: ComparisonAgentDebugTrace
  proposal?: ComparisonPatchProposal
  toolResults?: Array<{ callId?: string; toolId?: string; status?: string; summary?: string; data?: unknown }>
}

export interface ComparisonAssistantPayload {
  patch?: ComparisonViewPatch
  answer?: string
  usedFallback: false
  plan?: string[]
  debugTrace?: ComparisonAgentDebugTrace
  toolResults?: AgentTurnData['toolResults']
}

export function comparisonAssistantPayloadFromAgentTurn(
  data: AgentTurnData,
  sheetSchema: Parameters<typeof comparisonViewPatchFromAgentToolPatch>[1],
): ComparisonAssistantPayload {
  const debug = {
    plan: data.plan,
    debugTrace: data.debugTrace,
    toolResults: data.toolResults,
  }

  if (data.proposal?.kind === 'comparison-patch-proposal') {
    return {
      patch: comparisonViewPatchFromProposal(data.proposal),
      usedFallback: false,
      ...debug,
    }
  }

  const toolPatch = data.toolResults
    ?.map((result) => result.data)
    .find((value): value is { action: 'preview-spreadsheet-patch'; patch: ComparisonAgentToolPatch } => (
      Boolean(value)
      && typeof value === 'object'
      && (value as { action?: unknown }).action === 'preview-spreadsheet-patch'
      && Boolean((value as { patch?: unknown }).patch)
    ))
    ?.patch
  if (toolPatch) {
    return {
      patch: comparisonViewPatchFromAgentToolPatch(toolPatch, sheetSchema),
      usedFallback: false,
      ...debug,
    }
  }

  if (data.status === 'completed' && data.reply?.trim()) {
    return {
      answer: data.reply.trim(),
      usedFallback: false,
      ...debug,
    }
  }

  throw new Error(data.error ?? 'Rialto Agent did not return an answer or a Quote Comparison patch.')
}
