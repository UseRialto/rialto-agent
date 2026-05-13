import { describe, expect, it } from 'vitest'
import { comparisonAssistantPayloadFromAgentTurn } from './comparison-agent-response'

describe('comparisonAssistantPayloadFromAgentTurn', () => {
  it('returns answer-only payloads for completed read-only agent turns', () => {
    const payload = comparisonAssistantPayloadFromAgentTurn({
      status: 'completed',
      reply: 'The lowest visible price is $280 for Fasteners / BuildCo Total Price.',
      toolResults: [{
        callId: 'call-1',
        toolId: 'quoteComparison.answerSheetQuestion',
        status: 'ok',
        summary: 'Answered a read-only sheet question.',
      }],
    }, {})

    expect(payload).toMatchObject({
      answer: 'The lowest visible price is $280 for Fasteners / BuildCo Total Price.',
      usedFallback: false,
      toolResults: [{ toolId: 'quoteComparison.answerSheetQuestion' }],
    })
    expect(payload.patch).toBeUndefined()
  })

  it('returns patch payloads for comparison patch proposals', () => {
    const payload = comparisonAssistantPayloadFromAgentTurn({
      status: 'completed',
      reply: 'Prepared changes.',
      proposal: {
        kind: 'comparison-patch-proposal',
        summary: 'Prepared changes.',
        operations: [{ kind: 'set-cell', rowKey: 'row-1', colKey: 'notes', value: 'Review' }],
      },
    }, {})

    expect(payload.patch).toMatchObject({
      summary: 'Prepared changes.',
      setCells: [{ rowKey: 'row-1', colKey: 'notes', value: 'Review' }],
    })
    expect(payload.answer).toBeUndefined()
  })
})
