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

The second implementation pass borrows more directly from the linked repos:

- Pi for Excel's workbook blueprint and in-between-save recovery pattern maps to `getWorkbookOverview`, table schema extraction, append-only versions, and rollback.
- sv-excel-agent's copy-in/copy-out tool-server pattern maps to deterministic functions that operate on workbook models and return structured tool results instead of mutating through browser navigation.
- ExcelWorker's preview/query/validate split maps to `queryTable`, `computeBasicStats`, `detectPriceOutliers`, and `verifyQueryResult`.
- OfficeCLI's JSON-first batch operations and render/validate loop maps to risk-scored JSON patches, before/after samples, and a future optional render verifier.
- Excel-Agent's action/reflection loop maps to `createWorkbookPatch` followed by `applyWorkbookPatch` verification, without immediate autosave for risky edits.
- ExcelFlow/OpenSheets inform the read/search/filter/query surface and realtime preview handoff, without adopting a second web stack.

## V1 Shape

Rialto uses one OpenAI Agents SDK-backed Product Agent Runtime. The root agent receives fresh User Context and a Quote Comparison Sheet Snapshot or workbook-shaped upload context, classifies the prompt, inspects sheet state, calls deterministic workbook and Quote Comparison tools, and returns one of four explicit states: `completed`, `needs_clarification`, `blocked`, or `tool_error`.

Read-only prompts return answers. Write-like prompts call proposal tools that return `ComparisonPatchFragment` objects. `RialtoAgentCore` aggregates fragments into one `ComparisonPatchProposal` with `approvalMode: "approve-all-or-discard"`. The webapp adapts that proposal to a yellow preview overlay. Approval applies the patch to the estimator-visible Comparison Sheet state and appends workbook-version provenance; discard drops the proposal. Restoring an old workbook version creates a new `restore` version.

## Tool Interface

The first useful tool slices are in `src/tools/workbook-agent.ts`, `src/workbook/excel-workbook-agent.ts`, and `src/tools/quote-comparison-agent-tools.ts`, surfaced through `src/agent/openai-agents-runtime.ts` where request context is already available:

- Workbook/context: ingest workbook-shaped sheets, real `.xlsx` buffers, or a Quote Comparison snapshot; inspect workbook overview; list sheets; inspect sheets; detect tables; get table schema; find columns; search workbook; and read A1 ranges.
- Insight/query: deterministic table queries, missing-value detection, missing quote detection, partial-vs-total quote classification, lowest valid quote analysis, quote-column identification, basic stats, price outlier detection, broad anomaly reports, and vendor recommendations with lead-time/exclusion filters.
- Edit/proposal: risk-scored JSON workbook patch previews for adding/deleting/renaming columns, setting cells/ranges/formulas, formula fill, normalized currency columns, recommendation columns, formatting, highlighting, and summary-sheet creation; Quote Comparison patch fragments for the existing visible sheet preview UI.
- Verification/audit: workbook patches carry changed-cell counts, before/after samples, warnings, risk, approval requirement, verification checks, append-only audit events, and workbook versions for rollback. The ExcelJS adapter verifies the same behavior on an actual workbook buffer. Complex tests verify row-count stability, no source quantity overwrite, skipped incompatible rows, query validation, proposal aggregation, apply, formatting/highlighting, and rollback.

## Patch, Preview, Rollback

Patch proposals contain a summary, operations, warnings, provenance notes, and all-or-discard approval mode. Workbook JSON patches additionally include `patch_id`, `risk_level`, `requires_approval`, `preview.changed_cells`, `preview.sample_before_after`, and verification checks. Risky changes are not committed by the agent runtime. Deletions, overwrites, formulas, vendor-selection state, bulk edits, and structural changes are represented as visible operations and require estimator approval through the proposal overlay or workbook patch approval path.

Rollback is workbook-version based. Approved workbook patches append a new version and audit event. Rolling back a patch restores the prior snapshot, then appends a new rollback version rather than deleting later history. Approved agent proposals are stored as `agent-proposal` versions with original proposal JSON in the app persistence layer; restoring a previous version appends a new `restore` version rather than deleting history.

## Implementation Plan

1. Persist `WorkbookModel` / ExcelJS workbook versions behind the existing Comparison Sheet storage boundary instead of reconstructing from snapshots per request.
2. Add richer verification helpers around formula ranges, overwrite detection, row-count stability, and query result validation.
3. Consider OfficeCLI rendering only after the core proposal/apply/version loop is stable.
4. Add real OpenAI Agents SDK evals for prompt-to-tool routing once live API credentials are available in CI.
