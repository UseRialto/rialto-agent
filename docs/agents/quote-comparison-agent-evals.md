# Quote Comparison Agent Evals

Use scenario evals before manual usefulness testing when changing Quote Comparison agent behavior.

Important: the deterministic architecture suite is not proof that the real agent works. See `docs/agents/real-quote-comparison-agent-eval-handoff.md` before claiming Quote Comparison agent usefulness is tested end to end.

The eval seam is `runQuoteComparisonScenarioEvals` in `src/agent/quote-comparison-scenario-evals.ts`.

Each scenario supplies:

- an estimator prompt
- a Comparison Sheet Snapshot
- an expected response status
- expected proposal operation kinds

The harness runs through `RialtoAgentCore`, so it checks the same aggregation path as production while letting tests provide a controlled `ProductAgentRuntime`. Keep deterministic assertions at the tool/proposal boundary. For live model smoke tests, provide `OpenAIAgentsProductRuntime` and require `OPENAI_API_KEY`, but do not make live model evals part of the default unit test suite.

Run the skipped-by-default live smoke eval before browser usefulness testing:

```bash
OPENAI_API_KEY=... npm run test:agent:live
```

The live smoke eval has two live-gated layers:

- `quoteComparisonLiveSmokeScenarios()` checks coarse behavior on a tiny fixture: edit prompts should complete with proposal operations, and read-only questions should complete through the sheet question tool without a proposal.
- `quoteComparisonLiveArchitectureSubsetScenarios()` reuses the architecture fixture and the representative architecture scenario prompts against `OpenAIAgentsProductRuntime`. It verifies the real runtime inspects sheet state first, calls the expected real tool boundary, creates approve-all-or-discard proposals for mutations, avoids proposals for read-only prompts, and returns concise structured clarification for ambiguous prompts.

The architecture subset intentionally maps some deterministic contract tool names to the real runtime's current tool surface, such as `quoteComparison.proposeDerivedColumns` for calculated columns and `quoteComparison.answerSheetQuestion` for read-only analysis. Failing live evals should be fixed in the real agent instructions, tool schemas, backend tools, aggregation, or web adapter. Do not add a local deterministic prompt parser.

Manual browser test checklist:

1. Apply migrations with `npm run db:migrate --prefix apps/web`.
2. Start the API with `OPENAI_API_KEY=... npm run dev:api`.
3. Start the web app with `npm run dev:web`.
4. Enable ephemeral trace in the browser console with `localStorage.setItem('rialto:agent-debug', 'true')`.
5. On a Quote Comparison sheet, test:
   - `Highlight missing lead times`
   - `Add 10 dollars to Acme unit price and update Acme totals from quantity`
   - `What is the lowest total?`
6. Confirm edit prompts show one proposal overlay, approval creates a History version, and read-only questions do not create a proposal.

Recommended baseline scenarios:

- highlight missing lead times -> `add-highlight`
- increase unit price and update totals -> `set-cell`
- sort by vendor total -> `sort-rows`
- filter blank notes -> `filter-blank-rows`
- add a derived comparison column -> `add-derived-column`
- mark a vendor selected -> `set-selection-state`
