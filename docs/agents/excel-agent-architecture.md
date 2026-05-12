# Spreadsheet Agent Architecture

This note records the v1 architecture implemented from `excel_agent.txt`.

## Reference Patterns

- `tmustier/pi-for-excel`: keep core workbook tools as one source of truth; expose workbook overview, read range, search, write/fill/structure/format tools; wrap writes with overwrite protection and verification.
- `SylvianAI/sv-excel-agent`: keep Excel manipulation behind a tool-server boundary with a broad deterministic tool set and eval harness; adapt the tool design into OpenAI Agents SDK functions rather than adding an MCP runtime in v1.
- `jenyss/ExcelWorkerLLMToolCallAgent`: split preview/metadata extraction from query execution; add validation of query results before answering.
- `iOfficeAI/OfficeCLI`: treat render/HTML/PNG verification as an optional future verifier, not the core mutation path.
- `colonel-aureliano/Excel-Agent`: borrow planner/action/reflection terminology, but keep destructive workbook changes proposal-only.
- `parthvadhadiya/ExcelFlow`: use realtime UI preview ideas, but prefer Rialto's existing Comparison Sheet state and API routes over a new React/FastAPI/WebSocket stack.
- `martinsione/opensheets`: no core v1 dependency; keep the architecture product-tool first.

## V1 Shape

Rialto uses one OpenAI Agents SDK-backed Product Agent Runtime. The root agent receives fresh User Context and a Quote Comparison Sheet Snapshot, classifies the prompt, inspects sheet state, calls deterministic Quote Comparison tools, and returns one of four explicit states: `completed`, `needs_clarification`, `blocked`, or `tool_error`.

Read-only prompts return answers. Write-like prompts call proposal tools that return `ComparisonPatchFragment` objects. `RialtoAgentCore` aggregates fragments into one `ComparisonPatchProposal` with `approvalMode: "approve-all-or-discard"`. The webapp adapts that proposal to a yellow preview overlay. Approval applies the patch to the estimator-visible Comparison Sheet state and appends workbook-version provenance; discard drops the proposal. Restoring an old workbook version creates a new `restore` version.

## Tool Interface

The first useful tool slice is in `src/tools/quote-comparison-agent-tools.ts` and surfaced through `src/agent/openai-agents-runtime.ts`:

- Workbook/context: inspect snapshot and analyze work.
- Insight/query: answer sheet questions and quote-comparison analysis through deterministic snapshot inspection.
- Edit/proposal: cell edits, structure edits, deletions, bulk numeric edits, converted quantity columns, lowest total price columns, derived columns, highlights, selection state, and document-grounded edits.
- Verification/audit: patch fragments include summaries, warnings, provenance notes, tool calls, tool results, and debug trace. Complex scenario tests verify row-count stability, no source quantity overwrite, skipped incompatible rows, and proposal aggregation.

## Patch, Preview, Rollback

Patch proposals contain a summary, operations, warnings, provenance notes, and all-or-discard approval mode. Risky changes are not committed by the agent runtime. Deletions, overwrites, formulas, vendor-selection state, bulk edits, and structural changes are represented as visible operations and require estimator approval through the proposal overlay.

Rollback is workbook-version based. Approved agent proposals are stored as `agent-proposal` versions with original proposal JSON. Restoring a previous version appends a new `restore` version rather than deleting history.

## Implementation Plan

1. Keep expanding deterministic domain tools before adding generic low-level operations.
2. Add richer verification helpers around formula ranges, overwrite detection, row-count stability, and query result validation.
3. Consider OfficeCLI rendering only after the core proposal/apply/version loop is stable.
4. Add real OpenAI Agents SDK evals for prompt-to-tool routing once live API credentials are available in CI.
