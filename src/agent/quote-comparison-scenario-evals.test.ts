import { describe, expect, it } from 'vitest'
import type { ProductAgentRuntime } from './core.js'
import { runQuoteComparisonScenarioEvals } from './quote-comparison-scenario-evals.js'

const user = {
  id: 'user-1',
  contractorOrganizationId: 'org-1',
  role: 'estimator' as const,
  name: 'Estimator One',
  email: 'estimator@example.com',
}

const snapshot = {
  columns: [
    { key: '__qty_unit', label: 'Qty' },
    { key: 'acme-unit', label: 'Acme Unit Price', metric: 'unit_price' },
    { key: 'acme-total', label: 'Acme Total', metric: 'total' },
    { key: 'acme-lead', label: 'Acme Lead Time', metric: 'lead' },
  ],
  rows: [{
    id: 'steel-frame',
    description: 'Steel frame',
    values: { __qty_unit: '2 EA', 'acme-unit': '$100', 'acme-total': '$200', 'acme-lead': '' },
  }],
  vendors: [{ id: 'acme', name: 'Acme Supply' }],
}

describe('Quote Comparison scenario evals', () => {
  it('runs prompt plus snapshot scenarios against the product runtime seam', async () => {
    const evals = await runQuoteComparisonScenarioEvals({
      scenarios: [{
        name: 'highlight missing lead times',
        prompt: 'highlight missing lead times',
        snapshot,
        expectStatus: 'completed',
        expectOperationKinds: ['add-highlight'],
      }],
      runtime: {
        async runTurn() {
          return {
            status: 'completed',
            reply: 'Prepared highlights.',
            toolResults: [{
              callId: 'call-1',
              toolId: 'quoteComparison.proposeHighlights',
              status: 'ok',
              summary: 'Prepared fragment.',
              data: {
                action: 'comparison-patch-fragment',
                fragment: {
                  summary: 'Highlighted missing lead times.',
                  operations: [{
                    kind: 'add-highlight',
                    id: 'hl-missing-lead-steel-frame-acme-lead',
                    selector: { kind: 'cell', rowKey: 'steel-frame', colKey: 'acme-lead' },
                    color: 'red',
                  }],
                },
              },
            }],
          }
        },
      },
    })

    expect(evals).toEqual([{
      name: 'highlight missing lead times',
      passed: true,
      status: 'completed',
      operationKinds: ['add-highlight'],
      failures: [],
    }])
  })
})
