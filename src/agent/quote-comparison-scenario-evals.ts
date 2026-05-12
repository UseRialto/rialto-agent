import { InMemoryUserContextProvider } from '../context/user-context-provider.js'
import type { AgentTurnRequest, AgentTurnResponse } from '../domain/types.js'
import { RialtoAgentCore, type ProductAgentRuntime } from './core.js'
import {
  quoteComparisonArchitectureFixture,
  quoteComparisonArchitectureScenarios,
} from './quote-comparison-architecture-suite.js'

export interface QuoteComparisonScenario {
  name: string
  prompt: string
  snapshot: unknown
  expectStatus: AgentTurnResponse['status']
  expectOperationKinds?: string[]
  expectProposal?: boolean
  expectToolIds?: string[]
  expectFirstToolId?: string
  expectProposalApprovalMode?: 'approve-all-or-discard'
  expectClarification?: boolean
}

export interface QuoteComparisonScenarioEvalResult {
  name: string
  passed: boolean
  status: AgentTurnResponse['status']
  operationKinds: string[]
  toolIds: string[]
  firstToolId?: string
  proposalApprovalMode?: string
  clarificationQuestion?: string
  failures: string[]
}

export async function runQuoteComparisonScenarioEvals(input: {
  scenarios: QuoteComparisonScenario[]
  runtime: ProductAgentRuntime
  user?: AgentTurnRequest['user']
}): Promise<QuoteComparisonScenarioEvalResult[]> {
  const core = new RialtoAgentCore(new InMemoryUserContextProvider(), input.runtime)
  const user = input.user ?? {
    id: 'eval-user',
    contractorOrganizationId: 'eval-org',
    role: 'estimator',
    name: 'Eval Estimator',
    email: 'eval@example.com',
  } satisfies AgentTurnRequest['user']

  const results = []
  for (const scenario of input.scenarios) {
    const request: AgentTurnRequest = {
      requestId: `eval:${scenario.name}`,
      user,
      messages: [{ role: 'user', content: scenario.prompt }],
      currentPage: { path: '/contractor/quote-comparison', title: 'Quote Comparison' },
      quoteComparison: { snapshot: scenario.snapshot },
    }
    const response = await core.runTurn(request)
    const operationKinds = response.proposal?.operations.map((operation) => operation.kind) ?? []
    const operationKindSet = new Set<string>(operationKinds)
    const toolIds = response.toolResults.map((result) => result.toolId)
    const toolIdSet = new Set(toolIds)
    const clarificationQuestion = response.clarification?.question
    const failures = [
      ...(response.status === scenario.expectStatus ? [] : [`Expected status ${scenario.expectStatus}, got ${response.status}.`]),
      ...(scenario.expectProposal === undefined || Boolean(response.proposal) === scenario.expectProposal ? [] : [`Expected proposal presence ${scenario.expectProposal}, got ${Boolean(response.proposal)}.`]),
      ...(scenario.expectFirstToolId === undefined || toolIds[0] === scenario.expectFirstToolId ? [] : [`Expected first tool ${scenario.expectFirstToolId}, got ${toolIds[0] ?? 'none'}.`]),
      ...(scenario.expectProposalApprovalMode === undefined || response.proposal?.approvalMode === scenario.expectProposalApprovalMode ? [] : [`Expected proposal approval mode ${scenario.expectProposalApprovalMode}, got ${response.proposal?.approvalMode ?? 'none'}.`]),
      ...(scenario.expectClarification === undefined || Boolean(clarificationQuestion) === scenario.expectClarification ? [] : [`Expected clarification presence ${scenario.expectClarification}, got ${Boolean(clarificationQuestion)}.`]),
      ...(scenario.expectClarification && clarificationQuestion && clarificationQuestion.split(/\s+/).length > 20 ? [`Expected one concise clarification question, got ${clarificationQuestion.split(/\s+/).length} words.`] : []),
      ...((scenario.expectOperationKinds ?? [])
        .filter((kind) => !operationKindSet.has(kind))
        .map((kind) => `Missing operation kind ${kind}.`)),
      ...((scenario.expectToolIds ?? [])
        .filter((toolId) => !toolIdSet.has(toolId))
        .map((toolId) => `Missing tool result ${toolId}.`)),
    ]
    results.push({
      name: scenario.name,
      passed: failures.length === 0,
      status: response.status,
      operationKinds,
      toolIds,
      firstToolId: toolIds[0],
      proposalApprovalMode: response.proposal?.approvalMode,
      clarificationQuestion,
      failures,
    })
  }
  return results
}

export function quoteComparisonLiveArchitectureSubsetScenarios(): QuoteComparisonScenario[] {
  const fixture = quoteComparisonArchitectureFixture()
  const architectureScenarios = new Map(quoteComparisonArchitectureScenarios().map((scenario) => [scenario.name, scenario]))
  const scenarioNames = [
    'qty in thousands lf',
    'unit price per thousand',
    'normalize prices',
    'lowest partial A B C',
    'cheapest comparable overall',
    'highlight cheapest valid',
    'mark missing lead yellow notes',
    'recommendation column',
    'make cleaner',
    'pick best quote',
    'compare quotes',
    'multi step leveling patch',
  ]

  return scenarioNames.map((name) => {
    const scenario = architectureScenarios.get(name)
    if (!scenario) throw new Error(`Missing architecture scenario ${name}`)
    const expectProposal = !scenario.expectedNoProposal && scenario.expectedStatus === 'completed'
    return {
      name,
      prompt: scenario.prompt,
      snapshot: fixture,
      expectStatus: scenario.expectedStatus,
      expectProposal,
      expectOperationKinds: realRuntimeOperationKindsFor(name, scenario.expectedOperationKinds),
      expectToolIds: realRuntimeToolIdsFor(name),
      expectFirstToolId: 'quoteComparison.inspectSnapshot',
      expectProposalApprovalMode: expectProposal ? 'approve-all-or-discard' : undefined,
      expectClarification: scenario.expectedStatus === 'needs_clarification',
    }
  })
}

function realRuntimeOperationKindsFor(name: string, architectureOperationKinds?: string[]): string[] | undefined {
  switch (name) {
    case 'unit price per thousand':
    case 'normalize prices':
      return ['add-derived-column']
    case 'recommendation column':
      return ['add-derived-column', 'set-cell']
    case 'multi step leveling patch':
      return ['add-derived-column', 'add-highlight']
    default:
      return architectureOperationKinds
  }
}

function realRuntimeToolIdsFor(name: string): string[] {
  switch (name) {
    case 'qty in thousands lf':
      return ['quoteComparison.inspectSnapshot', 'quoteComparison.proposeConvertedQuantityColumn']
    case 'unit price per thousand':
    case 'normalize prices':
      return ['quoteComparison.inspectSnapshot', 'quoteComparison.proposeDerivedColumns']
    case 'lowest partial A B C':
    case 'cheapest comparable overall':
    case 'compare quotes':
      return ['quoteComparison.inspectSnapshot', 'quoteComparison.answerSheetQuestion']
    case 'highlight cheapest valid':
      return ['quoteComparison.inspectSnapshot', 'quoteComparison.proposeHighlights']
    case 'mark missing lead yellow notes':
      return ['quoteComparison.inspectSnapshot', 'quoteComparison.proposeHighlights', 'quoteComparison.proposeCellEdits']
    case 'recommendation column':
      return ['quoteComparison.inspectSnapshot', 'quoteComparison.proposeDerivedColumns', 'quoteComparison.proposeCellEdits']
    case 'multi step leveling patch':
      return ['quoteComparison.inspectSnapshot', 'quoteComparison.proposeDerivedColumns', 'quoteComparison.proposeHighlights']
    case 'make cleaner':
    case 'pick best quote':
      return ['quoteComparison.inspectSnapshot']
    default:
      return ['quoteComparison.inspectSnapshot']
  }
}

export function quoteComparisonLiveSmokeScenarios(): QuoteComparisonScenario[] {
  const snapshot = {
    columns: [
      { key: '__desc', label: 'Description' },
      { key: '__qty_unit', label: 'Qty' },
      { key: 'acme-unit', label: 'Acme Unit Price', metric: 'unit_price', vendorId: 'acme' },
      { key: 'acme-total', label: 'Acme Total', metric: 'total', vendorId: 'acme' },
      { key: 'acme-lead', label: 'Acme Lead Time', metric: 'lead', vendorId: 'acme' },
      { key: 'notes', label: 'Notes' },
    ],
    rows: [
      {
        id: 'steel-frame',
        description: 'Steel frame',
        values: {
          __desc: 'Steel frame',
          __qty_unit: '2,420 lf',
          'acme-unit': '$100',
          'acme-total': '$200',
          'acme-lead': '',
          notes: '',
        },
      },
      {
        id: 'door-hardware',
        description: 'Door hardware',
        values: {
          __desc: 'Door hardware',
          __qty_unit: '458 lf',
          'acme-unit': '$50',
          'acme-total': '$150',
          'acme-lead': '5d',
          notes: 'Confirm finish',
        },
      },
    ],
    vendors: [{ id: 'acme', name: 'Acme Supply' }],
  }

  return [
    {
      name: 'highlight missing lead times',
      prompt: 'Highlight missing lead times.',
      snapshot,
      expectStatus: 'completed',
      expectProposal: true,
      expectOperationKinds: ['add-highlight'],
    },
    {
      name: 'increase unit price and update totals',
      prompt: 'Add 10 dollars to Acme unit price and update Acme totals from quantity.',
      snapshot,
      expectStatus: 'completed',
      expectProposal: true,
      expectOperationKinds: ['set-cell'],
    },
    {
      name: 'add converted quantity column',
      prompt: 'Add a Qty column in thousands of linear ft and apply the Qty data accordingly.',
      snapshot,
      expectStatus: 'completed',
      expectProposal: true,
      expectOperationKinds: ['insert-column', 'set-cell'],
      expectToolIds: ['quoteComparison.proposeConvertedQuantityColumn'],
    },
    {
      name: 'delete row column and cells',
      prompt: 'Delete the Notes column, delete the Door hardware row, and delete the Acme Lead Time cell for Steel frame.',
      snapshot,
      expectStatus: 'completed',
      expectProposal: true,
      expectOperationKinds: ['delete-column', 'delete-row', 'set-cell'],
      expectToolIds: ['quoteComparison.proposeDeletions'],
    },
    {
      name: 'answer lowest total',
      prompt: 'What is the lowest total?',
      snapshot,
      expectStatus: 'completed',
      expectProposal: false,
      expectToolIds: ['quoteComparison.answerSheetQuestion'],
    },
  ]
}
