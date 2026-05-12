export interface ComparisonAgentDebugTrace {
  responseState?: string
  plan?: string[]
  toolCalls?: Array<{ toolId?: string; input?: unknown }>
  toolResults?: Array<{ toolId?: string; status?: string; summary?: string }>
  patchFragments?: Array<{ summary?: string; operations?: Array<{ kind?: string }> }>
  proposal?: { summary?: string; operations?: Array<{ kind?: string }> }
  warnings?: string[]
  errors?: string[]
}

export interface ComparisonAgentDebugResponse {
  plan?: string[]
  debugTrace?: ComparisonAgentDebugTrace
  toolResults?: Array<{ toolId?: string; status?: string; summary?: string }>
}

export function initialAgentProgressSteps(message: string) {
  const trimmed = message.trim()
  return [
    trimmed ? `Received request: ${trimmed}` : 'Received request.',
    'Reading the visible quote comparison sheet state.',
    'Sending the sheet snapshot to Rialto Agent.',
    'Waiting for plan, tool calls, and one preview patch batch.',
  ]
}

export function debugStepsFromAgentResponse(response: ComparisonAgentDebugResponse) {
  const trace = response.debugTrace
  const steps: string[] = []

  const plan = trace?.plan ?? response.plan ?? []
  for (const step of plan) steps.push(`Plan: ${step}`)

  const toolResults = trace?.toolResults ?? response.toolResults ?? []
  for (const result of toolResults) {
    const tool = result.toolId ? prettyToolId(result.toolId) : 'tool'
    const status = result.status ? ` (${result.status})` : ''
    steps.push(`Tool: ${tool}${status}${result.summary ? ` - ${result.summary}` : ''}`)
  }

  for (const fragment of trace?.patchFragments ?? []) {
    const operationCount = fragment.operations?.length ?? 0
    steps.push(`Patch fragment: ${fragment.summary ?? `${operationCount} operation${operationCount === 1 ? '' : 's'}`}`)
  }

  if (trace?.proposal) {
    const operationCount = trace.proposal.operations?.length ?? 0
    steps.push(`Preview batch: ${operationCount} operation${operationCount === 1 ? '' : 's'} ready for approve-all-or-discard.`)
  }

  for (const warning of trace?.warnings ?? []) steps.push(`Warning: ${warning}`)
  for (const error of trace?.errors ?? []) steps.push(`Error: ${error}`)

  if (steps.length === 0 && trace?.responseState) steps.push(`Agent finished with status: ${trace.responseState}`)
  return steps
}

function prettyToolId(toolId: string) {
  return toolId.replace(/^quoteComparison\./, '').replace(/([a-z])([A-Z])/g, '$1 $2')
}
