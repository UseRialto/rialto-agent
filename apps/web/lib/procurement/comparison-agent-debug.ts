export interface ComparisonAgentDebugTrace {
  responseState?: string
  plan?: string[]
  operationPlan?: {
    planId?: string
    mode?: string
    riskLevel?: string
    requiresApproval?: boolean
    steps?: Array<{ id?: string; toolName?: string; expectedObservation?: string }>
  }
  observations?: Array<{ stepId?: string; toolName?: string; status?: string; summary?: string; warnings?: string[] }>
  verification?: { ok?: boolean; checks?: Array<{ id?: string; ok?: boolean; message?: string }>; warnings?: string[] }
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

export interface ComparisonAgentProgressEvent {
  type?: 'status' | 'tool_result'
  message?: string
  toolId?: string
  status?: string
}

export function initialAgentProgressSteps(message: string) {
  const trimmed = message.trim()
  return [
    trimmed ? `Received request: ${trimmed}` : 'Received request.',
  ]
}

export function debugStepsFromAgentResponse(response: ComparisonAgentDebugResponse) {
  const trace = response.debugTrace
  const steps: string[] = []

  const plan = trace?.plan ?? response.plan ?? []
  for (const step of plan) steps.push(`Plan: ${step}`)

  if (trace?.operationPlan?.steps?.length) {
    steps.push(`Operation plan: ${trace.operationPlan.steps.length} typed step${trace.operationPlan.steps.length === 1 ? '' : 's'} (${trace.operationPlan.mode ?? 'operation'}, ${trace.operationPlan.riskLevel ?? 'risk'}).`)
  }

  for (const observation of trace?.observations ?? []) {
    const tool = observation.toolName ? prettyToolId(observation.toolName) : 'operation tool'
    const status = observation.status ? ` (${observation.status})` : ''
    steps.push(`Observation: ${tool}${status}${observation.summary ? ` - ${observation.summary}` : ''}`)
    for (const warning of observation.warnings ?? []) steps.push(`Warning: ${warning}`)
  }

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
    steps.push(`Change batch: ${operationCount} operation${operationCount === 1 ? '' : 's'} ready for approve-all-or-discard.`)
  }

  if (trace?.verification) {
    steps.push(`Verification: ${trace.verification.ok ? 'passed' : 'failed'}.`)
  }

  for (const warning of trace?.warnings ?? []) steps.push(`Warning: ${warning}`)
  for (const error of trace?.errors ?? []) steps.push(`Error: ${error}`)

  if (steps.length === 0 && trace?.responseState) steps.push(`Agent finished with status: ${trace.responseState}`)
  return steps
}

export function debugStepFromProgressEvent(event: ComparisonAgentProgressEvent) {
  if (event.type === 'tool_result') {
    const tool = event.toolId ? prettyToolId(event.toolId) : 'tool'
    const status = event.status ? ` (${event.status})` : ''
    return `Tool: ${tool}${status}${event.message ? ` - ${event.message}` : ''}`
  }
  return event.message ?? 'Rialto Agent is working.'
}

function prettyToolId(toolId: string) {
  return toolId.replace(/^quoteComparison\./, '').replace(/([a-z])([A-Z])/g, '$1 $2')
}
