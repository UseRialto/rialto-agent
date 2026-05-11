# Quote Comparison Agent Handoff

## Current State

The Quote Comparison assistant now routes estimator prompts through Rialto Agent first. The intended path is:

1. `BidComparisonAssistant` sends the estimator instruction, current view, and sheet schema to `/api/bid-comparison/ai-propose`.
2. `/api/bid-comparison/ai-propose` calls the backend `/agent/turn` endpoint.
3. Rialto Agent chooses backend-callable Quote Comparison Agent Tools from `src/tools/spreadsheet-edit.ts`.
4. `apps/web/lib/procurement/comparison-agent-tools.ts` adapts the returned tool patch into a browser `ComparisonViewPatch`.
5. The browser previews the patch and applies it to Comparison Sheet view state after user approval.

The fallback path still exists: if the backend agent call fails, `/api/bid-comparison/ai-propose` uses `apps/web/lib/procurement/comparison-command-fallback.ts`.

## What Was Added

- Quote Comparison tools are marked with `productModule: 'quote-comparison'`.
- The LLM prompt groups tools by Product Module.
- `delete-column` and `delete-row` are first-class backend tool operations.
- `bulk-adjust-number-column` is a first-class backend tool operation for prompts like:
  - `add 69 to all entries in unit price and then update total price accordingly`
- The browser now includes visible cell values in `sheetSchema.lineItems[].values`.
- The browser adapter can expand `bulk-adjust-number-column` into concrete `setCells` changes, including dependent Total Price updates using displayed Qty.
- The old fallback message was replaced with `AI is unsure.`

## Known Diagnosis Target

The next agent should diagnose why the real agent path still struggles with messy multi-step natural language like:

```text
.add 999 to all entries in unit price and then update total price accordinggly.
```

Likely causes to investigate:

- The deterministic fallback handles only narrow wording and typo tolerance, while the real OpenAI planner may not be choosing `bulk-adjust-number-column` reliably.
- The OpenAI prompt may not expose enough examples of multi-step Quote Comparison Agent Tool use.
- The tool interface may still be too shallow: one generic `sheet.preview_comparison_patch` tool contains many operations, so the LLM has to infer the right operation shape from description text rather than from a clearer module-level interface.
- The request sent to `/agent/turn` currently includes only the user message and generic current page. It does not include the sheet schema or current view in `UserContext`, so the LLM cannot reason over actual column keys, row ids, or values before selecting a tool.

## Recommended Next Step

Deepen the Quote Comparison Agent Tools module:

- Add a Quote Comparison-specific agent turn request that includes sheet schema and current view in the context passed to Rialto Agent.
- Expose Quote Comparison tools as a small set of semantically named tools or a richer module-specific tool interface, rather than only a generic spreadsheet patch tool.
- Add integration tests through `/api/bid-comparison/ai-propose` for messy prompts, including punctuation and typos:
  - `add 999 to all entries in unit price and then update total price accordinggly`
  - `.add 999 to all entries in unit price and then update total price accordinggly.`
  - `increase every unit price by 999 and recalc total price`

## Verification Before This Handoff

Passing commands before this handoff was written:

```bash
npm test
npm run typecheck
npm run typecheck --prefix apps/web
```

