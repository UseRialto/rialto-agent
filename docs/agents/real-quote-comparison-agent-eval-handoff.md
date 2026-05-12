# Real Quote Comparison Agent Eval Handoff

This handoff is for the next agent. The important correction is simple:

**Do not treat `QuoteComparisonArchitectureRuntime` as proof that the spreadsheet AI agent works.**

That runtime is a deterministic contract harness. It is useful scaffolding, but it does not test whether the OpenAI Agents SDK agent understands real estimator prompts, chooses the right tools, handles ambiguity, or produces useful patches. The product path is `OpenAIAgentsProductRuntime`, and that is what must be tested and fixed next.

## Current State

The repo now has two different kinds of tests:

1. **Architecture contract tests**
   - Files:
     - `src/agent/quote-comparison-architecture-suite.ts`
     - `src/agent/quote-comparison-architecture-suite.test.ts`
   - Runtime:
     - `QuoteComparisonArchitectureRuntime`
   - What they prove:
     - Desired prompt categories are enumerated.
     - Desired fixture shape exists.
     - Desired tool-call order and patch shapes are specified.
     - `RialtoAgentCore` can aggregate patch fragments into one approve-all-or-discard proposal.
   - What they do **not** prove:
     - The actual OpenAI agent will parse prompts correctly.
     - The actual OpenAI agent will choose the right tools.
     - The actual OpenAI agent will avoid mutation for read-only questions.
     - The browser assistant will display and persist the result correctly.

2. **Live smoke tests**
   - Files:
     - `src/agent/quote-comparison-live-smoke.test.ts`
     - `src/agent/quote-comparison-scenario-evals.ts`
   - Runtime:
     - `OpenAIAgentsProductRuntime`
   - Status:
     - Skipped by default.
     - Too small. It only covers a handful of coarse prompts.

## Product Path To Test

The actual Quote Comparison request path is:

```text
Browser Quote Comparison assistant
-> /api/bid-comparison/ai-propose
-> /agent/turn
-> RialtoAgentCore
-> OpenAIAgentsProductRuntime
-> OpenAI Agents SDK root agent
-> quoteComparison.* typed backend tools
-> ToolResult patch fragments
-> Comparison Patch Proposal
-> ComparisonViewPatch overlay
-> user approve/discard
-> versioned workbook persistence
```

There should be no local deterministic parser deciding user intent before the agent. GPT parses the prompt. Backend tools are deterministic operations that execute only after the agent chooses them.

## What The Next Agent Should Build

### 1. Reuse The Scenario Definitions Against The Real Runtime

Create a real-runtime eval that reuses:

- `quoteComparisonArchitectureFixture()`
- `quoteComparisonArchitectureScenarios()`

But run them through:

- `RialtoAgentCore`
- `OpenAIAgentsProductRuntime`

The eval should be live-gated:

```bash
RUN_LIVE_AGENT_EVALS=true OPENAI_API_KEY=... npm run test:agent:live
```

Do not put full live model evals in the default `npm test` path.

### 2. Start With A Representative Subset, Then Expand

The full 43-scenario suite may be expensive and slow. Start with a representative subset that covers:

- Add Qty in thousands LF and populate from Qty.
- Add unit price per thousand.
- Normalize prices.
- Read-only lowest partial quote.
- Read-only cheapest comparable overall.
- Highlight cheapest valid quote.
- Missing lead time highlight plus note.
- Recommendation column.
- Ambiguous “Make this cleaner.”
- Ambiguous “Pick the best quote.”
- “Compare the quotes” as read-only.
- Multi-step normalized price + unit price + highlight + summary.

Once those pass, add the remaining scenarios.

### 3. Assert Real Behaviors, Not Exact Model Wording

For each real-runtime eval, assert:

- status: `completed`, `needs_clarification`, `blocked`, or `tool_error`
- first relevant tool is `quoteComparison.inspectSnapshot` when sheet state matters
- expected tool ids are present
- mutation prompts produce one `proposal`
- read-only prompts do not produce `proposal`
- proposal approval mode is `approve-all-or-discard`
- expected operation kinds are present
- important columns/cells are present in operations
- clarification prompts return one concise clarification question

Avoid brittle exact-response wording. Match stable facts and operation shapes.

### 4. Fix The Real Agent, Not The Tests

When a real-runtime eval fails, diagnose which layer failed:

- Agent instruction problem:
  - Fix `src/agent/openai-agents-runtime.ts`.
- Tool schema/description problem:
  - Fix the relevant tool definition in `src/agent/openai-agents-runtime.ts`.
- Backend tool behavior problem:
  - Fix `src/tools/quote-comparison-agent-tools.ts`.
- Proposal aggregation problem:
  - Fix `src/agent/core.ts`.
- Web adapter problem:
  - Fix `apps/web/lib/procurement/comparison-agent-tools.ts`.
- UI/debug/persistence problem:
  - Fix Quote Comparison web components and sheet view persistence.

Do not reintroduce a deterministic prompt parser or fallback planner.

## Known Risks To Verify

### Latency

Live model calls have been observed taking roughly 75 seconds. The UI has a 90 second timeout. This may make tests slow and flaky. Consider:

- smaller live subsets
- higher test timeout only for live evals
- preserving debug trace output on failure
- measuring request duration per scenario

### DNS

Local system DNS has returned `ENOTFOUND api.openai.com`. The runtime now uses `src/agent/openai-resilient-fetch.ts`, which falls back to public DNS for `api.openai.com` only. Verify real model calls still succeed on the current machine before running the full suite.

### Model Variance

The model may choose a more generic tool than the expected specific tool. Decide case-by-case:

- If the generic tool still produces a correct safe patch, maybe the expectation should allow it.
- If the tool choice loses domain semantics, improve instructions/tool descriptions.

### Ambiguity

The agent should ask only when ambiguity affects material correctness. It should not ask for confirmation for every normal edit because the UI already provides approve/discard preview.

## Acceptance Criteria

The next agent should not call this complete until:

- A live-gated OpenAI eval runs through `OpenAIAgentsProductRuntime`.
- The representative subset passes.
- Failures are documented with layer attribution.
- At least the Qty thousands prompt that originally failed is covered by a live real-runtime eval.
- Read-only analytical prompts are proven not to mutate state.
- Ambiguous prompts are proven to produce structured clarification.
- The handoff/eval docs clearly distinguish deterministic contract tests from real agent evals.

## Suggested Commands

```bash
npm test
npm run typecheck
npm run typecheck:web
RUN_LIVE_AGENT_EVALS=true OPENAI_API_KEY=... npm run test:agent:live
```

For browser validation:

```bash
npm run dev:api
npm run dev:web
```

Then use the Quote Comparison assistant with debug mode enabled and verify the visible overlay, approve/discard behavior, and workbook history persistence.
