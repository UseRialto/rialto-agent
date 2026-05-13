# Spreadsheet Agent Overhaul Handoff

This document summarizes the spreadsheet/Excel agent overhaul work so another Codex instance can review, test, and continue it.

## Objective

Build a more powerful spreadsheet/Excel AI system for Rialto quote-comparison and RFQ workbooks while keeping the OpenAI Agents SDK as the orchestrator. The architecture should avoid browser-navigation agents and avoid free-form LLM spreadsheet mutation. The LLM should call deterministic backend tools for workbook inspection, querying, patch generation, verification, audit logging, apply, and rollback.

## Reference Repos Used

The implementation borrows patterns conceptually from the linked repos:

- `tmustier/pi-for-excel`: workbook overview, range reads, search, formula fill, formatting, and workbook history/recovery.
- `SylvianAI/sv-excel-agent`: deterministic Excel tool boundary, adapted into OpenAI Agents SDK tools instead of adding a separate MCP runtime.
- `jenyss/ExcelWorkerLLMToolCallAgent`: query/preview/metadata split, validation of query outputs, stats and table-query style tools.
- `iOfficeAI/OfficeCLI`: JSON-first batch operations and future optional render/preview verification.
- `colonel-aureliano/Excel-Agent`: planner/action/reflection idea, but with proposal-only risky edits.
- `parthvadhadiya/ExcelFlow`: realtime spreadsheet preview direction, but without adding a second React/FastAPI/WebSocket stack.
- `martinsione/opensheets`: simple read/search/table interaction surface, not a core dependency.

These mappings are also recorded in `docs/agents/excel-agent-architecture.md`.

## Main Files Added Or Changed

- `src/tools/workbook-agent.ts`
  - In-memory deterministic workbook model and tool layer.
  - Ingests workbook-shaped sheets and quote-comparison snapshots.
  - Extracts sheet/table schema and semantic column roles.
  - Supports overview, sheet inspection, range reads, search, query, quote analysis, anomaly detection, patch preview, apply, rollback, audit log, and versions.

- `src/tools/workbook-agent.test.ts`
  - Complex RFQ test coverage for schema extraction, query, missing quotes, partial-vs-total rows, vendor recommendations, large generated patches, formula fill, summary sheets, audit log, verification, and rollback.

- `src/workbook/excel-workbook-agent.ts`
  - ExcelJS-backed `.xlsx` adapter.
  - Ingests a real workbook buffer.
  - Extracts schema.
  - Reads ranges.
  - Compares vendors by line item.
  - Creates/preview/applies/rolls back patches against actual ExcelJS workbook state.
  - Verifies row stability and overwrite warnings.

- `src/workbook/excel-workbook-agent.test.ts`
  - Tests real workbook ingestion and ExcelJS patch behavior for RFQ spreadsheets.

- `src/agent/openai-agents-runtime.ts`
  - Wires deterministic workbook tools into the OpenAI Agents SDK runtime.
  - Adds tool instructions that tell the model to use workbook tools for uploaded/spreadsheet-shaped quote-comparison work.

- `docs/agents/excel-agent-architecture.md`
  - Updated with the v1 architecture and reference-repo pattern mapping.

- `CONTEXT.md`
  - Adds the stable domain term `Deterministic Workbook Tools`.

## Deterministic Workbook Tool Coverage

Current `src/tools/workbook-agent.ts` exports include:

- Workbook/context:
  - `ingestWorkbookFromSheets`
  - `workbookFromQuoteComparisonSnapshot`
  - `getWorkbookOverview`
  - `listSheets`
  - `inspectSheet`
  - `detectTables`
  - `getTableSchema`
  - `findColumn`
  - `searchWorkbook`
  - `readRange`

- Query/insight:
  - `queryTable`
  - `verifyQueryResult`
  - `computeBasicStats`
  - `identifyVendorColumns`
  - `detectMissingQuotes`
  - `detectPartialVsTotalQuotes`
  - `findLowestValidQuote`
  - `recommendVendor`
  - `detectPriceOutliers`
  - `analyzeWorkbookAnomalies`
  - `quoteComparisonSummaryRows`

- Patch/edit:
  - `createWorkbookPatch`
  - `createRecommendationColumnPatch`
  - `createNormalizeCurrencyPatch`
  - `createFormulaFillPatch`
  - `applyWorkbookPatch`
  - `rollbackWorkbookPatch`
  - Patch operation types for add/delete/rename column, set cell, set range values, set range formula, highlight cells, format cells, and create summary sheet.

- Verification/history/audit:
  - `verifyPatch`
  - `verifyQueryResult`
  - apply-time row-count stability checks
  - append-only versions
  - audit events for inspect/create/apply/rollback

## OpenAI Agents SDK Tool Surface

`src/agent/openai-agents-runtime.ts` now exposes workbook tools alongside the existing quote-comparison proposal tools:

- `workbook_getOverview`
- `workbook_readRange`
- `workbook_queryTable`
- `workbook_findLowestValidQuote`
- `workbook_detectMissingQuotes`
- `workbook_computeBasicStats`
- `workbook_detectPriceOutliers`
- `workbook_analyzeAnomalies`
- `workbook_recommendVendor`
- `workbook_createPatchPreview`
- `workbook_applyPatch`
- `workbook_rollbackPatch`

Important behavior:

- Workbook tools operate on an in-turn workbook session built from the Quote Comparison snapshot.
- Patch creation returns structured JSON patch metadata.
- Apply requires approval when the patch requires approval.
- Rollback restores the prior workbook version and appends rollback audit/version history.

## Key Behaviors Covered By Tests

`src/tools/workbook-agent.test.ts` verifies:

- Workbook ingestion from RFQ rows.
- Overview/table schema extraction.
- Semantic column detection, including vendor price/lead/type/exclusion columns.
- Column search by label and semantic type.
- Range reads.
- Query filtering and query validation.
- Lowest partial quote for items `X`, `Y`, `Z` excluding total/package quote rows.
- Missing quote detection for `TBD`, blanks, `N/A`, and no-bid-like values.
- Recommendations while ignoring missing/invalid lead times.
- Risk-scored patch preview for adding `Qty (k LF)`.
- Apply and rollback with audit log and version history.
- Large generated patch with cheapest highlights, recommendation column, numeric price column, formula fill, formatting, and summary sheet.
- Basic stats.
- Broad anomaly report for missing quotes, price outliers, unit mismatches, total quote rows, and ambiguous vendor columns.
- Generated large-scale recommendation, normalized currency, and formula-fill patches.

`src/workbook/excel-workbook-agent.test.ts` verifies:

- Real `.xlsx` ingestion via ExcelJS.
- Schema extraction from a workbook buffer.
- Range reads.
- Vendor comparison by line item, excluding total package rows.
- Partial-vendor missing item counts.
- Converted quantity patch preview/apply/verify/rollback.
- Cheapest valid quote highlighting in actual workbook cells.
- Approval requirement when overwriting existing values or creating summary sheets.

## Commands Run

These passed after the implementation:

```bash
npm test
npm run typecheck
```

Latest observed result:

- `npm test`: 24 passed, 1 skipped; 76 tests passed, 2 skipped.
- `npm run typecheck`: passed.

## Suggested Review Checklist

1. Read `src/tools/workbook-agent.ts` and confirm the deterministic model is sufficient for current app snapshot workflows.
2. Read `src/workbook/excel-workbook-agent.ts` and confirm the ExcelJS adapter should remain separate from the in-memory model or be merged later.
3. Confirm the OpenAI tool descriptions in `src/agent/openai-agents-runtime.ts` are specific enough for complex prompts and not too broad.
4. Run:

```bash
npm test
npm run typecheck
```

5. Manually inspect the large-patch tests and decide whether approval/risk rules should be stricter for:
   - formula changes,
   - summary sheet creation,
   - normalized currency columns,
   - recommendation columns,
   - overwrites,
   - destructive column deletion.
6. Check whether workbook state should be persisted in app storage next, rather than reconstructed from snapshots per turn.

## Known Follow-Ups

- Persist `WorkbookModel` or real workbook versions behind the existing Comparison Sheet storage boundary.
- Add richer OpenAI live evals for prompt-to-tool routing when API credentials are available.
- Consider optional render verification later, likely inspired by OfficeCLI, but do not make render verification the core mutation path yet.
- Add more advanced formula dependency tracing if formula-heavy client workbooks become common.
- Decide whether DuckDB should be added as a real dependency. Current `queryTable` is deterministic and testable but not actual DuckDB.
- Add API endpoints for workbook upload/session lifecycle if this moves beyond in-turn agent context.
