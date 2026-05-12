import { afterEach, describe, expect, it, vi } from 'vitest'
import { agentTurnFailureMessage, postAgentTurnWithRetry } from './comparison-agent-api-client'

describe('postAgentTurnWithRetry', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('retries transient agent fetch failures before surfacing an error to the sheet UI', async () => {
    const response = new Response(JSON.stringify({ status: 'completed' }), { status: 200 })
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(response)

    await expect(postAgentTurnWithRetry({ messages: [] }, {
      apiUrl: 'http://agent.test',
      attempts: 3,
      timeoutMs: 1000,
      retryDelayMs: () => 0,
    })).resolves.toBe(response)

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://agent.test/agent/turn')
  })

  it('replaces raw fetch failed with a user-actionable backend unavailable message', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'))

    await expect(postAgentTurnWithRetry({ messages: [] }, {
      apiUrl: 'http://agent.test',
      attempts: 2,
      timeoutMs: 1000,
      retryDelayMs: () => 0,
    })).rejects.toThrow('Rialto Agent backend was temporarily unreachable while preparing the Quote Comparison proposal.')
  })

  it('replaces raw agent 500 internal errors with a useful connectivity message', () => {
    expect(agentTurnFailureMessage(500, 'Internal Server Error'))
      .toBe('Rialto Agent hit a backend or model connectivity error while preparing the Quote Comparison proposal.')
  })
})
