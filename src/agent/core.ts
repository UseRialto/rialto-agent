import type { AgentTurnRequest, AgentTurnResponse } from '../domain/types.js'
import type { UserContextProvider } from '../context/user-context-provider.js'
import type { LlmPlanner } from './llm.js'
import type { ToolRegistry } from '../tools/registry.js'

export class RialtoAgentCore {
  constructor(
    private readonly contextProvider: UserContextProvider,
    private readonly planner: LlmPlanner,
    private readonly tools: ToolRegistry,
  ) {}

  async runTurn(request: AgentTurnRequest): Promise<AgentTurnResponse> {
    const userContext = await this.contextProvider.buildForUser(request.user)
    const plan = await this.planner.plan({
      userContext,
      messages: request.messages,
      tools: this.tools.list(),
    })

    const toolResults = []
    for (const call of plan.toolCalls) {
      toolResults.push(await this.tools.execute(call.id, call.toolId, call.input, {
        userContext,
        requestId: request.requestId,
      }))
    }

    return {
      requestId: request.requestId,
      reply: plan.reply,
      plan: plan.plan,
      toolCalls: plan.toolCalls,
      toolResults,
    }
  }
}

