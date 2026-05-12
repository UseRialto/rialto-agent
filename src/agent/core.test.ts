import { describe, expect, it } from 'vitest'
import { RialtoAgentCore, type ProductAgentRuntime } from './core.js'
import { InMemoryUserContextProvider } from '../context/user-context-provider.js'
import type { AgentTurnRequest } from '../domain/types.js'

const user = {
  id: 'user-1',
  contractorOrganizationId: 'org-1',
  role: 'estimator' as const,
  name: 'Estimator One',
  email: 'estimator@example.com',
}

function request(content: string): AgentTurnRequest {
  return {
    requestId: 'req-1',
    user,
    messages: [{ role: 'user', content }],
  }
}

describe('RialtoAgentCore', () => {
  it('aggregates Quote Comparison patch fragments into one proposal for the turn', async () => {
    const runtime: ProductAgentRuntime = {
      async runTurn() {
        return {
          status: 'completed',
          reply: 'I prepared the comparison changes.',
          plan: ['Find missing lead times.', 'Highlight the affected cells.'],
          toolCalls: [{ id: 'call-1', toolId: 'quoteComparison.proposeHighlights', input: { rule: 'missing-lead-times' } }],
          toolResults: [{
            callId: 'call-1',
            toolId: 'quoteComparison.proposeHighlights',
            status: 'ok',
            summary: 'Prepared highlight patch fragment.',
            data: {
              action: 'comparison-patch-fragment',
              fragment: {
                summary: 'Highlight missing lead times.',
                operations: [{
                  kind: 'add-highlight',
                  id: 'hl-1',
                  selector: { kind: 'cell', rowKey: 'line-1', colKey: 'vendor-acme:lead' },
                  color: 'red',
                  note: 'Missing lead time.',
                }],
                warnings: ['1 missing lead time found.'],
              },
            },
          }],
        }
      },
    }
    const core = new RialtoAgentCore(new InMemoryUserContextProvider(), runtime)

    const response = await core.runTurn({
      ...request('highlight missing lead times'),
      currentPage: { path: '/contractor/quote-comparison', title: 'Quote Comparison' },
      quoteComparison: {
        currentView: { hiddenColumnKeys: [] },
        sheetSchema: { columns: [{ key: 'vendor-acme:lead', label: 'Acme Lead Time' }] },
      },
    })

    expect(response).toMatchObject({
      status: 'completed',
      reply: 'I prepared the comparison changes.',
      proposal: {
        kind: 'comparison-patch-proposal',
        summary: 'Highlight missing lead times.',
        approvalMode: 'approve-all-or-discard',
        operations: [{
          kind: 'add-highlight',
          id: 'hl-1',
          selector: { kind: 'cell', rowKey: 'line-1', colKey: 'vendor-acme:lead' },
        }],
        warnings: ['1 missing lead time found.'],
      },
    })
  })

  it('includes an ephemeral debug trace when requested', async () => {
    const runtime: ProductAgentRuntime = {
      async runTurn() {
        return {
          status: 'completed',
          reply: 'Ready.',
          plan: ['Prepare highlights.'],
          toolCalls: [{ id: 'call-1', toolId: 'quoteComparison.proposeHighlights', input: {} }],
          toolResults: [{
            callId: 'call-1',
            toolId: 'quoteComparison.proposeHighlights',
            status: 'ok',
            summary: 'Prepared fragment.',
            data: {
              action: 'comparison-patch-fragment',
              fragment: {
                summary: 'Highlight missing lead times.',
                operations: [{
                  kind: 'add-highlight',
                  id: 'hl-1',
                  selector: { kind: 'cell', rowKey: 'line-1', colKey: 'lead' },
                  color: 'red',
                }],
              },
            },
          }],
        }
      },
    }
    const core = new RialtoAgentCore(new InMemoryUserContextProvider(), runtime)

    const response = await core.runTurn({ ...request('highlight missing lead times'), debug: true })

    expect(response.debugTrace).toMatchObject({
      responseState: 'completed',
      plan: ['Prepare highlights.'],
      toolCalls: [{ id: 'call-1' }],
      toolResults: [{ callId: 'call-1' }],
      patchFragments: [{ summary: 'Highlight missing lead times.' }],
      proposal: { kind: 'comparison-patch-proposal' },
    })
  })
})
