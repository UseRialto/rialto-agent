# Spreadsheet Agent Architecture Brief For Next Agent

This is the handoff context for a deeper architecture pass on Rialto's spreadsheet / Excel AI system.

## Where You Are

Main product repo:

- `/Users/tomasz/Desktop/rialto/rialto-agent`

Local inspiration repos:

- `/Users/tomasz/Desktop/rialto/spreadsheet_ai_inspiration_repos/pi-for-excel`
- `/Users/tomasz/Desktop/rialto/spreadsheet_ai_inspiration_repos/sv-excel-agent`
- `/Users/tomasz/Desktop/rialto/spreadsheet_ai_inspiration_repos/ExcelWorkerLLMToolCallAgent`
- `/Users/tomasz/Desktop/rialto/spreadsheet_ai_inspiration_repos/OfficeCLI`

Read first:

- `CONTEXT.md`
- `docs/agents/spreadsheet-agent-overhaul-handoff.md`
- `docs/agents/excel-agent-architecture.md`
- Relevant ADRs under `docs/adr/`, especially workbook handoff, patch proposals, and workbook history.

## Product Goal

Rialto is building a production-grade agentic spreadsheet system for construction procurement quote comparison. Users upload or work inside Excel-like RFQ / vendor quote comparison sheets. The agent must answer analytical questions and safely propose or apply spreadsheet changes.

The system should feel like a capable spreadsheet analyst for construction estimators:

- inspect workbook structure,
- understand RFQ line items, quantities, units, vendor prices, lead times, exclusions, alternates, totals, partial quotes, and missing quote values,
- answer questions like "which vendor is cheapest per item?",
- propose changes like adding recommendation columns, normalizing prices, filling formulas, highlighting lowest valid quotes, and creating summary sheets,
- avoid reckless mutation,
- preserve auditability, preview, approval, apply, history, and rollback.

## Architectural North Star

Use a single OpenAI Agents SDK orchestrator with deterministic backend workbook tools underneath.

The LLM should plan and call tools. It should not mutate spreadsheets through arbitrary generated Python, browser navigation, or unreviewed workbook writes.

Desired loop:

1. User asks a question or requests an edit.
2. Runtime builds workbook context/schema from the visible Comparison Sheet state or uploaded workbook.
3. Agent classifies intent as insight-only, edit, mixed, ambiguous, or risky/destructive.
4. Agent creates a structured plan when useful.
5. Agent calls deterministic workbook tools.
6. Tools produce answer data or patch previews.
7. System verifies results.
8. User sees answer and/or one previewable patch proposal.
9. Approval applies the patch to durable Comparison Sheet state.
10. History/audit supports rollback.

## Current State In This Repo

The previous pass did real work, but it is an architecture slice, not a complete product overhaul.

Implemented:

- `src/tools/workbook-agent.ts`
  - In-memory workbook model.
  - Sheet/table/schema detection.
  - Range reads, search, deterministic table query.
  - RFQ quote analysis: vendor column identification, missing quote detection, partial-vs-total rows, lowest valid quote, recommendations, price outliers, anomaly reports.
  - JSON workbook patch creation, preview, simple risk scoring, apply, rollback, audit log, versions.

- `src/workbook/excel-workbook-agent.ts`
  - ExcelJS-backed `.xlsx` adapter.
  - Can ingest a real workbook buffer, inspect schema, read ranges, compare vendors, preview/apply/rollback patches.

- `src/agent/openai-agents-runtime.ts`
  - Adds workbook tools to the OpenAI Agents SDK runtime.
  - Existing `quoteComparison_*` proposal tools remain the main path for UI-visible patches.

- Tests:
  - `src/tools/workbook-agent.test.ts`
  - `src/workbook/excel-workbook-agent.test.ts`

Targeted tests pass with:

```bash
npm test -- src/tools/workbook-agent.test.ts src/workbook/excel-workbook-agent.test.ts
```

Important limitations:

- `WorkbookModel` is reconstructed from the current snapshot per turn; it is not persisted.
- `workbook_applyPatch` mutates only the in-turn workbook session, not durable app state.
- The ExcelJS adapter is tested but not wired into upload/session lifecycle APIs.
- Workbook JSON patches are not yet converted into the existing UI-visible `ComparisonPatchProposal` flow.
- No real DuckDB dependency; `queryTable` is a simple deterministic helper.
- Risk scoring and verification are useful but shallow.
- The previous "reference repo research" was mostly conceptual. You now have four repos locally; inspect them for actual code patterns.

## Your Job

Do a real architecture pass using the local inspiration repos. Do not just write a doc. Inspect their code, extract the strongest usable patterns, and then improve Rialto's implementation pragmatically.

Focus on building a minimal but powerful v1, not a giant speculative framework.

Primary deliverables:

1. A concise architecture proposal grounded in the actual Rialto codebase and the four local inspiration repos.
2. A clear tool interface design for the OpenAI Agents SDK runtime.
3. A patch / preview / approval / apply / rollback design that maps to the existing app's Comparison Sheet state.
4. Actual code changes for the highest-leverage slice.
5. Tests that prove complex quote-comparison behavior.

## What To Inspect In Inspiration Repos

### pi-for-excel

Path:

- `/Users/tomasz/Desktop/rialto/spreadsheet_ai_inspiration_repos/pi-for-excel`

Look for:

- workbook overview / blueprint concepts,
- read/write range tools,
- search,
- formula fill,
- structure modification,
- formatting,
- dependency tracing or formula explanation,
- workbook history / recovery patterns,
- tool schemas and test/eval patterns.

Borrow if useful:

- a richer workbook context model,
- stronger deterministic tool boundaries,
- better apply/recovery mechanics.

### sv-excel-agent

Path:

- `/Users/tomasz/Desktop/rialto/spreadsheet_ai_inspiration_repos/sv-excel-agent`

Look for:

- Excel MCP server architecture,
- tool-server separation,
- file input/output handling,
- breadth and granularity of Excel editing tools,
- evals.

Borrow if useful:

- the tool shape, not necessarily the MCP runtime.
- Keep OpenAI Agents SDK as Rialto's orchestrator unless there is a very strong reason otherwise.

### ExcelWorkerLLMToolCallAgent

Path:

- `/Users/tomasz/Desktop/rialto/spreadsheet_ai_inspiration_repos/ExcelWorkerLLMToolCallAgent`

Look for:

- pandas / DuckDB query tools,
- preview and metadata extraction,
- validation of query results,
- how it separates analysis from mutation.

Borrow if useful:

- a more expressive deterministic query layer,
- data-frame-like intermediate model,
- validation/reporting patterns.

### OfficeCLI

Path:

- `/Users/tomasz/Desktop/rialto/spreadsheet_ai_inspiration_repos/OfficeCLI`

Look for:

- JSON-first document/spreadsheet operations,
- CLI-based file manipulation,
- render to HTML/PNG/PDF or other preview strategies,
- schemas for operations.

Borrow if useful:

- operation schema discipline,
- optional render/preview verification.

Do not make rendering core unless it genuinely helps Rialto's v1.

## Recommended Implementation Direction

The most valuable next slice is likely:

1. Unify or clearly bridge:
   - existing `quoteComparison_*` UI proposal tools,
   - new `WorkbookPatch` JSON patches,
   - durable Comparison Sheet version storage.

2. Make workbook patch previews able to become visible `ComparisonPatchProposal` objects, so the app can actually preview and approve them.

3. Add a typed tool layer that separates:
   - read-only inspection/query tools,
   - patch-building tools,
   - apply tools,
   - verification tools.

4. Persist applied agent proposals through the existing comparison sheet version machinery rather than only in an in-turn `WorkbookModel`.

5. Improve risk and verification:
   - destructive operations require approval,
   - overwriting non-empty values requires approval,
   - formula changes require approval,
   - recommendation / award-like columns require approval,
   - summary sheet creation should not overwrite existing summary sheets without approval,
   - row count should stay stable unless the patch explicitly changes rows,
   - no unintended overwritten cells.

6. Add tests around real product pathways, not only isolated workbook helpers.

## Tool Surface To Aim For

Workbook/context tools:

- `inspect_workbook`
- `get_workbook_overview`
- `list_sheets`
- `inspect_sheet`
- `detect_tables`
- `get_table_schema`
- `find_column`
- `search_workbook`
- `read_range`

Insight/query tools:

- `query_table`
- `query_dataframe` or `query_duckdb` if justified
- `summarize_sheet`
- `detect_missing_values`
- `compute_basic_stats`
- `identify_quote_columns`
- `identify_line_items`
- `identify_vendor_columns`
- `compare_vendors_by_line_item`
- `detect_missing_quotes`
- `detect_partial_vs_total_quotes`
- `find_lowest_valid_quote`
- `recommend_vendor`
- `analyze_workbook_anomalies`

Patch/edit tools:

- `create_patch`
- `add_column`
- `delete_column`
- `rename_column`
- `set_cell`
- `set_range_values`
- `set_range_formula`
- `fill_formula`
- `format_cells`
- `highlight_cells`
- `sort_table`
- `create_summary_sheet`
- `apply_patch`
- `rollback_patch`

Verification tools:

- `verify_patch`
- `verify_column_added`
- `verify_formula_range`
- `verify_no_unintended_overwrites`
- `verify_row_count_stable`
- `verify_query_result`
- optional `render_workbook_preview`

## Patch Shape

Keep or improve this JSON-ish model:

```json
{
  "patch_id": "patch-123",
  "summary": "Add Qty (k LF) converted from Qty.",
  "risk_level": "safe | medium | destructive",
  "requires_approval": true,
  "operations": [
    {
      "op": "add_column",
      "sheet": "Vendor Quotes",
      "after": "Qty",
      "name": "Qty (k LF)"
    },
    {
      "op": "set_range_formula",
      "sheet": "Vendor Quotes",
      "range": "F2:F82",
      "formula": "=E2/1000"
    }
  ],
  "preview": {
    "changed_cells": 81,
    "sample_before_after": [
      {
        "row": 2,
        "before": { "Qty": 2500 },
        "after": { "Qty (k LF)": 2.5 }
      }
    ],
    "warnings": []
  },
  "verification": {
    "ok": true,
    "checks": []
  }
}
```

But make sure this maps to the app's existing visible proposal shape:

- `ComparisonPatchProposal`
- `ComparisonViewPatch`
- durable version source `agent-proposal`

## Complex Tests To Add Or Preserve

Prioritize these as product-level tests:

1. "Add a new column called Qty (k LF), convert the Qty column from linear feet into thousands of linear feet, and populate it."
   - Finds Qty / Quantity / LF source.
   - Adds column.
   - Populates Qty / 1000.
   - Verifies row count unchanged.
   - Shows sample before/after.

2. "What is the lowest partial quote for items X, Y, Z, without taking total package quotes into account?"
   - Identifies item rows.
   - Identifies vendor quote columns.
   - Excludes total/package rows.
   - Computes lowest valid quote per requested item.
   - Explains assumptions.

3. "Highlight the cheapest valid vendor price in every row."
   - Ignores blanks, non-numeric values, exclusions, and total-only rows.
   - Creates a preview patch.
   - Verifies highlights match computed minima.

4. "Add a recommendation column picking the cheapest vendor, but ignore vendors with missing lead times."
   - Maps vendor price columns to lead-time columns.
   - Excludes vendors with missing lead times.
   - Adds recommendation column.
   - Returns patch preview.

5. "Which vendors did not quote all requested items?"
   - Computes coverage by vendor.
   - Returns missing counts and item names.
   - Does not mutate workbook.

6. "Clean up this quote comparison sheet."
   - Recognizes ambiguity.
   - Asks clarification or proposes a safe plan.
   - Does not blindly edit.

7. "Delete all columns that are probably unnecessary."
   - Marks destructive/risky.
   - Does not apply immediately.
   - Produces proposed patch with rationale and approval required.

8. "Create a summary sheet comparing vendors by total price, coverage, average lead time, and missing quotes."
   - Creates summary sheet patch.
   - Verifies formulas/data.
   - Does not overwrite an existing summary sheet without approval.

9. "Normalize all dollar amounts."
   - Handles "$1,200", "1200 USD", "1.2k", "TBD", "included", "N/A".
   - Preserves or flags ambiguous values.
   - Requires approval if overwriting originals; safer default is new normalized columns.

10. "Tell me what is weird in this spreadsheet."
   - Detects missing quotes, outliers, unit mismatches, duplicated line items, suspicious totals, and ambiguous vendor columns.
   - Returns insight report only.

## Constraints

- Keep OpenAI Agents SDK as the main orchestrator.
- Do not introduce a browser-navigation spreadsheet agent.
- Do not let the LLM execute arbitrary spreadsheet mutation code.
- Prefer deterministic backend functions with tests.
- Keep code changes scoped and compatible with existing Rialto product concepts.
- Preserve existing user/app changes; do not reset or wipe unrelated files.
- Run targeted tests and typecheck where practical.

## What "Good" Looks Like

A good result is not a giant universal spreadsheet automation platform.

A good result is a coherent Rialto-specific v1 where:

- the agent can inspect a quote comparison sheet,
- understand construction procurement spreadsheet semantics,
- call deterministic analysis tools,
- produce previewable patches,
- require approval for risky edits,
- apply approved patches into durable app state,
- write version/audit provenance,
- support rollback,
- and pass complex tests that resemble real RFQ quote comparison workflows.

