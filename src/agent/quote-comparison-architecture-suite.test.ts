import { describe, expect, it } from 'vitest'
import { InMemoryUserContextProvider } from '../context/user-context-provider.js'
import type { AgentTurnResponse, ComparisonOperation } from '../domain/types.js'
import { RialtoAgentCore } from './core.js'
import {
  quoteComparisonArchitectureFixture,
  quoteComparisonArchitectureScenarios,
  QuoteComparisonArchitectureRuntime,
} from './quote-comparison-architecture-suite.js'

const user = {
  id: 'arch-user',
  contractorOrganizationId: 'arch-org',
  role: 'estimator' as const,
  name: 'Architecture Estimator',
  email: 'architecture@example.com',
}

describe('Quote Comparison spreadsheet AI architecture contract', () => {
  it('passes the requested scenarios plus 20 additional non-similar robustness scenarios', async () => {
    const scenarios = quoteComparisonArchitectureScenarios()
    expect(scenarios).toHaveLength(44)

    const core = new RialtoAgentCore(new InMemoryUserContextProvider(), new QuoteComparisonArchitectureRuntime())
    const failures: string[] = []

    for (const scenario of scenarios) {
      const response = await core.runTurn({
        requestId: `architecture:${scenario.name}`,
        user,
        messages: [{ role: 'user', content: scenario.prompt }],
        currentPage: { path: '/contractor/quote-comparison', title: 'Quote Comparison' },
        quoteComparison: { snapshot: quoteComparisonArchitectureFixture() },
        debug: true,
      })

      failures.push(...assertScenario(response, scenario.name, {
        expectedStatus: scenario.expectedStatus,
        expectedToolIds: scenario.expectedToolIds,
        expectedOperationKinds: scenario.expectedOperationKinds,
        expectedPlanIncludes: scenario.expectedPlanIncludes,
        expectedReplyIncludes: scenario.expectedReplyIncludes,
        expectedPatchIncludes: scenario.expectedPatchIncludes,
        expectedNoProposal: scenario.expectedNoProposal,
      }))
    }

    expect(failures).toEqual([])
  })

  it('creates a final spreadsheet state for the Qty in thousands workflow without mutating original Qty', async () => {
    const fixture = quoteComparisonArchitectureFixture()
    const core = new RialtoAgentCore(new InMemoryUserContextProvider(), new QuoteComparisonArchitectureRuntime())
    const response = await core.runTurn({
      requestId: 'architecture:qty-state',
      user,
      messages: [{ role: 'user', content: 'Add a new column called Qty in thousands linear ft and populate it based on Qty.' }],
      currentPage: { path: '/contractor/quote-comparison', title: 'Quote Comparison' },
      quoteComparison: { snapshot: fixture },
    })

    const next = applyOperations(fixture, response.proposal?.operations ?? [])
    expect(next.columns.map((column) => column.key)).toContain('qty-thousand-lf')
    expect(next.rows.find((row) => row.id === 'A')?.values.qty).toBe('12,500 LF')
    expect(next.rows.find((row) => row.id === 'A')?.values['qty-thousand-lf']).toBe('12.5')
    expect(next.rows.find((row) => row.id === 'B')?.values['qty-thousand-lf']).toBe('8')
    expect(next.rows.find((row) => row.id === 'G')?.values['qty-thousand-lf']).toBeUndefined()
    expect(next.rows.find((row) => row.id === 'D')?.values['qty-thousand-lf']).toBeUndefined()
  })
})

function assertScenario(
  response: AgentTurnResponse,
  name: string,
  expected: {
    expectedStatus: AgentTurnResponse['status']
    expectedToolIds: string[]
    expectedOperationKinds?: string[]
    expectedPlanIncludes?: string[]
    expectedReplyIncludes?: string[]
    expectedPatchIncludes?: Array<Partial<ComparisonOperation>>
    expectedNoProposal?: boolean
  },
) {
  const failures: string[] = []
  const toolIds = response.toolResults.map((result) => result.toolId)
  const operationKinds: string[] = response.proposal?.operations.map((operation) => operation.kind) ?? []
  const planText = (response.plan ?? []).join('\n').toLowerCase()
  const replyText = response.reply.toLowerCase()
  const operations = response.proposal?.operations ?? []

  if (response.status !== expected.expectedStatus) failures.push(`${name}: expected status ${expected.expectedStatus}, got ${response.status}`)
  for (const toolId of expected.expectedToolIds) {
    if (!toolIds.includes(toolId)) failures.push(`${name}: missing tool call ${toolId}; got ${toolIds.join(', ')}`)
  }
  if (expected.expectedToolIds[0] === 'quoteComparison.inspectSnapshot' && toolIds[0] !== 'quoteComparison.inspectSnapshot') {
    failures.push(`${name}: first tool must inspect snapshot; got ${toolIds[0]}`)
  }
  for (const kind of expected.expectedOperationKinds ?? []) {
    if (!operationKinds.includes(kind)) failures.push(`${name}: missing operation kind ${kind}; got ${operationKinds.join(', ')}`)
  }
  for (const phrase of expected.expectedPlanIncludes ?? []) {
    if (!planText.includes(phrase.toLowerCase())) failures.push(`${name}: plan did not include ${phrase}`)
  }
  for (const phrase of expected.expectedReplyIncludes ?? []) {
    if (!replyText.includes(phrase.toLowerCase())) failures.push(`${name}: reply did not include ${phrase}`)
  }
  for (const partial of expected.expectedPatchIncludes ?? []) {
    if (!operations.some((operation) => matchesPartial(operation, partial))) failures.push(`${name}: missing patch partial ${JSON.stringify(partial)}`)
  }
  if (expected.expectedNoProposal && response.proposal) failures.push(`${name}: expected no mutation proposal`)
  if (!expected.expectedNoProposal && response.status === 'completed' && !response.proposal && expected.expectedOperationKinds?.length) {
    failures.push(`${name}: expected one approval patch proposal`)
  }
  if (response.proposal?.approvalMode && response.proposal.approvalMode !== 'approve-all-or-discard') {
    failures.push(`${name}: proposal must be approve-all-or-discard`)
  }

  return failures
}

function matchesPartial(operation: ComparisonOperation, partial: Partial<ComparisonOperation>) {
  return Object.entries(partial).every(([key, value]) => JSON.stringify((operation as unknown as Record<string, unknown>)[key]) === JSON.stringify(value))
}

function applyOperations(snapshot: ReturnType<typeof quoteComparisonArchitectureFixture>, operations: ComparisonOperation[]) {
  const next = {
    columns: snapshot.columns.map((column) => ({ ...column })),
    rows: snapshot.rows.map((row) => ({ ...row, values: { ...row.values } })),
    vendors: snapshot.vendors,
  }
  for (const operation of operations) {
    if (operation.kind === 'insert-column') {
      next.columns.push({ key: operation.colKey, label: operation.label })
    } else if (operation.kind === 'set-cell') {
      const row = next.rows.find((candidate) => candidate.id === operation.rowKey)
      if (row) row.values[operation.colKey] = operation.value
    } else if (operation.kind === 'delete-column') {
      next.columns = next.columns.filter((column) => column.key !== operation.colKey)
    } else if (operation.kind === 'delete-row') {
      next.rows = next.rows.filter((row) => row.id !== operation.rowKey)
    }
  }
  return next
}
