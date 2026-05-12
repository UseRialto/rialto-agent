import { describe, expect, it } from 'vitest'
import { OpenAIAgentsProductRuntime } from './openai-agents-runtime.js'
import { quoteComparisonLiveSmokeScenarios, runQuoteComparisonScenarioEvals } from './quote-comparison-scenario-evals.js'

const runLiveAgentEvals = process.env.RUN_LIVE_AGENT_EVALS === 'true' && Boolean(process.env.OPENAI_API_KEY)
const maybeIt = runLiveAgentEvals ? it : it.skip

describe('Quote Comparison live agent smoke evals', () => {
  maybeIt('runs the baseline edit and read-only scenarios against the real OpenAI Agents runtime', async () => {
    const results = await runQuoteComparisonScenarioEvals({
      scenarios: quoteComparisonLiveSmokeScenarios(),
      runtime: new OpenAIAgentsProductRuntime(),
    })

    expect(results).toHaveLength(quoteComparisonLiveSmokeScenarios().length)
    expect(results).toEqual(results.map((result) => ({ ...result, passed: true, failures: [] })))
  }, 120_000)
})
