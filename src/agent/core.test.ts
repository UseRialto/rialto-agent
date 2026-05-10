import { describe, expect, it } from 'vitest'
import { RialtoAgentCore } from './core.js'
import type { LlmPlanner } from './llm.js'
import { InMemoryUserContextProvider } from '../context/user-context-provider.js'
import { defaultToolRegistry } from '../tools/registry.js'
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
  it('executes visible email draft tools without sending', async () => {
    const planner: LlmPlanner = {
      async plan() {
        return {
          reply: 'Draft ready.',
          toolCalls: [{
            id: 'call-1',
            toolId: 'email.draft_vendor_outreach',
            input: {
              to: ['vendor@example.com'],
              subject: 'RFQ: Doors',
              body: 'Please quote.',
            },
          }],
        }
      },
    }
    const core = new RialtoAgentCore(new InMemoryUserContextProvider(), planner, defaultToolRegistry)
    const response = await core.runTurn(request('draft an email'))
    expect(response.toolResults[0]?.status).toBe('needs-user-action')
    expect(response.toolResults[0]?.data).toMatchObject({
      action: 'show-email-draft',
      sendPolicy: 'user-must-send',
    })
  })

  it('returns an error result for unknown tools instead of crashing', async () => {
    const planner: LlmPlanner = {
      async plan() {
        return {
          reply: 'Trying a tool.',
          toolCalls: [{ id: 'call-1', toolId: 'unknown.tool', input: {} }],
        }
      },
    }
    const core = new RialtoAgentCore(new InMemoryUserContextProvider(), planner, defaultToolRegistry)
    const response = await core.runTurn(request('do something'))
    expect(response.toolResults[0]).toMatchObject({
      status: 'error',
      summary: 'Unknown tool: unknown.tool',
    })
  })
})

