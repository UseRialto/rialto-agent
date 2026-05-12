import { describe, expect, it } from 'vitest'
import { debugStepsFromAgentResponse, initialAgentProgressSteps } from './comparison-agent-debug'

describe('comparison agent debug UI steps', () => {
  it('shows immediate progress before the agent returns', () => {
    expect(initialAgentProgressSteps('add a new qty in hundreds linear ft')).toEqual([
      'Received request: add a new qty in hundreds linear ft',
      'Reading the visible quote comparison sheet state.',
      'Sending the sheet snapshot to Rialto Agent.',
      'Waiting for plan, tool calls, and one preview patch batch.',
    ])
  })

  it('turns an ephemeral agent trace into user-visible major steps', () => {
    expect(debugStepsFromAgentResponse({
      debugTrace: {
        responseState: 'completed',
        plan: ['Find Qty and add Qty in hundreds linear ft to its right.'],
        toolResults: [{
          toolId: 'quoteComparison.proposeConvertedQuantityColumn',
          status: 'ok',
          summary: 'Prepared a Quote Comparison patch fragment.',
        }],
        patchFragments: [{
          summary: 'Added Qty in hundreds linear ft and converted 2 quantity values.',
          operations: [{ kind: 'insert-column' }, { kind: 'set-cell' }, { kind: 'set-cell' }],
        }],
        proposal: {
          operations: [{ kind: 'insert-column' }, { kind: 'set-cell' }, { kind: 'set-cell' }],
        },
      },
    })).toEqual([
      'Plan: Find Qty and add Qty in hundreds linear ft to its right.',
      'Tool: propose Converted Quantity Column (ok) - Prepared a Quote Comparison patch fragment.',
      'Patch fragment: Added Qty in hundreds linear ft and converted 2 quantity values.',
      'Preview batch: 3 operations ready for approve-all-or-discard.',
    ])
  })
})
