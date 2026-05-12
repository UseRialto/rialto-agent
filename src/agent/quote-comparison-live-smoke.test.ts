import { describe, expect, it } from 'vitest'
import { OpenAIAgentsProductRuntime } from './openai-agents-runtime.js'
import {
  quoteComparisonLiveArchitectureSubsetScenarios,
  quoteComparisonLiveSmokeScenarios,
  runQuoteComparisonScenarioEvals,
} from './quote-comparison-scenario-evals.js'

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

  maybeIt('runs the representative architecture scenario subset against the real OpenAI Agents runtime', async () => {
    const scenarios = quoteComparisonLiveArchitectureSubsetScenarios()
    const results = await runQuoteComparisonScenarioEvals({
      scenarios,
      runtime: new OpenAIAgentsProductRuntime(),
    })

    expect(scenarios.map((scenario) => scenario.name)).toEqual([
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
    ])
    expect(results).toHaveLength(scenarios.length)
    expect(results).toEqual(results.map((result) => ({ ...result, passed: true, failures: [] })))
  }, 1_200_000)
})
