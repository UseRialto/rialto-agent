# Spreadsheet Agent Operational Runtime Brief

This is the practical architecture context for building Rialto's real spreadsheet agent. The prior pass added useful workbook helpers, but the product needs a stronger operation runtime: plan, execute deterministic tools, observe results, repair, verify, and return a safe preview or applied result.

## Core Product Bar

The system must handle complex spreadsheet editing commands, not just answer questions.

Canonical hard scenario:

> The estimator has a semi-filled quote comparison sheet open. They attach another vendor's Excel response in chat and say: "This is another vendor response, merge its data into this existing comparison."

This should be easy for the system.

Expected behavior:

1. Inspect the current comparison sheet.
2. Inspect the attached workbook.
3. Identify vendor identity, quote columns, lead times, exclusions, notes, alternates, and totals.
4. Map attached workbook rows to existing RFQ line items.
5. Detect ambiguous matches, missing items, extra items, unit/quantity mismatches, total-only quotes, and conflicts with existing cells.
6. Build a merge plan.
7. Build a previewable patch.
8. Verify no unintended overwrites.
9. Ask for clarification only when ambiguity blocks safe execution.
10. Apply only when safe or approved.
11. Persist version/audit/provenance so rollback works.

If this scenario is not well supported, the architecture is not good enough.



## Architecture Shape

Use one product agent runtime with a required plan/execute/observe/verify loop.

High-level flow:

1. `classify_request`
   - insight-only,
   - simple edit,
   - complex workbook operation,
   - file merge/import,
   - ambiguous,
   - destructive/risky.

2. `build_context`
   - current Comparison Sheet snapshot,
   - uploaded workbook(s),
   - extracted attachment text if any,
   - user/project/procurement context.

3. `plan_operation`
   - returns a typed operation plan.
   - The plan is not prose. It is structured JSON with steps, dependencies, expected inputs, tool calls, verification checks, risk, and approval gates.

4. `execute_plan`
   - runs deterministic tools step-by-step.
   - Captures observations after every tool call.
   - Stops for clarification or approval when needed.
   - Can revise plan when a tool result invalidates an assumption.

5. `build_patch_preview`
   - produces a single previewable patch proposal for the visible Comparison Sheet or workbook.

6. `verify_patch`
   - row count stability,
   - no unintended overwrites,
   - expected columns added,
   - formulas/ranges valid,
   - row mapping confidence acceptable,
   - all risky operations flagged.

7. `return_result`
   - answer-only report, clarification, patch preview, or applied result with audit/version metadata.

## Required Runtime Concepts

### Operation Plan

A typed execution contract for complex spreadsheet work.

Minimum shape:

```ts
interface SpreadsheetOperationPlan {
  planId: string
  userIntent: string
  mode: 'answer' | 'propose_patch' | 'apply_safe_patch' | 'needs_clarification'
  riskLevel: 'safe' | 'medium' | 'destructive'
  requiresApproval: boolean
  assumptions: string[]
  clarification?: {
    question: string
    blockingReason: string
  }
  steps: SpreadsheetPlanStep[]
  expectedPatch?: {
    summary: string
    targetWorkbookId: string
  }
}

interface SpreadsheetPlanStep {
  id: string
  kind:
    | 'inspect_workbook'
    | 'inspect_attachment'
    | 'infer_schema'
    | 'map_rows'
    | 'extract_vendor_response'
    | 'detect_conflicts'
    | 'create_patch'
    | 'verify_patch'
    | 'apply_patch'
  dependsOn: string[]
  toolName: string
  toolInput: unknown
  expectedObservation: string
  onFailure: 'ask_clarification' | 'revise_plan' | 'block' | 'continue_with_warning'
}
```

### Observation Log

Every deterministic tool call returns an observation. Keep these visible in debug traces and available to the planner/executor.

Minimum shape:

```ts
interface SpreadsheetObservation {
  stepId: string
  toolName: string
  status: 'ok' | 'warning' | 'error'
  summary: string
  data: unknown
  warnings: string[]
}
```

This is the useful idea from ReAct and OpenHands: action -> observation -> next action. But Rialto actions are product workbook tools, not arbitrary shell/browser actions.

## Deterministic Tool Families

### Workbook Ingestion / Context

- `load_current_comparison_workbook`
- `load_uploaded_workbook`
- `inspect_workbook`
- `inspect_sheet`
- `detect_tables`
- `get_table_schema`
- `read_range`
- `search_workbook`
- `profile_workbook`

### Schema / Semantics

- `identify_line_item_columns`
- `identify_quantity_unit_columns`
- `identify_vendor_columns`
- `identify_price_columns`
- `identify_lead_time_columns`
- `identify_exclusion_note_columns`
- `classify_rows`
- `detect_total_package_rows`
- `detect_alternates`
- `detect_unit_quantity_mismatches`

### Vendor Response Extraction

These are essential for the attached-workbook merge scenario.

- `extract_vendor_response_from_workbook`
- `infer_vendor_identity`
- `infer_vendor_quote_schema`
- `extract_quote_rows`
- `extract_quote_totals`
- `extract_terms_notes_exclusions`
- `extract_lead_times`
- `normalize_vendor_response`

Output should be structured:

```ts
interface ExtractedVendorResponse {
  sourceWorkbookId: string
  vendorName: string | null
  confidence: number
  lineItems: ExtractedVendorLineItem[]
  totals: ExtractedQuoteTotal[]
  notes: string[]
  warnings: string[]
}

interface ExtractedVendorLineItem {
  sourceSheet: string
  sourceRow: number
  itemCode?: string
  description: string
  qty?: number
  unit?: string
  unitPrice?: number
  totalPrice?: number
  leadTime?: string
  exclusions?: string
  alternate?: string
  confidence: number
  provenance: {
    cells: string[]
    rawValues: Record<string, unknown>
  }
}
```

### Row Matching / Reconciliation

This is the heart of merge quality.

- `match_vendor_rows_to_comparison_items`
- `score_line_item_match`
- `detect_unmatched_source_rows`
- `detect_unquoted_target_items`
- `detect_conflicting_existing_values`
- `detect_duplicate_vendor_response`
- `detect_unit_mismatch`
- `detect_quantity_mismatch`
- `build_merge_decision_report`

Output should include confidence and reasons:

```ts
interface LineItemMatch {
  targetRowId: string
  targetDescription: string
  sourceRow: number
  sourceDescription: string
  confidence: number
  matchBasis: Array<'item_code' | 'description_exact' | 'description_fuzzy' | 'quantity_unit' | 'manual_hint'>
  warnings: string[]
}
```

### Patch Creation

- `create_vendor_merge_patch`
- `create_add_vendor_columns_patch`
- `create_fill_vendor_prices_patch`
- `create_fill_lead_times_patch`
- `create_notes_exclusions_patch`
- `create_normalized_currency_patch`
- `create_recommendation_column_patch`
- `create_summary_sheet_patch`
- `create_highlight_patch`
- `create_formula_fill_patch`

### Verification

- `verify_patch_schema`
- `verify_no_unintended_overwrites`
- `verify_row_count_stable`
- `verify_added_columns_exist`
- `verify_formula_ranges`
- `verify_highlights_match_expected_cells`
- `verify_vendor_merge_completeness`
- `verify_unmatched_rows_reported`
- `verify_conflicts_require_approval`
- `verify_no_total_package_rows_used_as_line_items`

### Apply / History

- `apply_approved_patch`
- `rollback_patch`
- `append_workbook_version`
- `append_agent_audit_event`
- `get_version_history`

## Planner Tool

Add an explicit planner tool or planner phase. For complex operations, the root agent must call it before edit tools.

Example tool:

```ts
plan_spreadsheet_operation(input: {
  userRequest: string
  currentWorkbookSummary: unknown
  attachmentsSummary: unknown[]
  availableToolNames: string[]
}): SpreadsheetOperationPlan
```

The planner can be LLM-backed, but its output must be schema-validated. It should never mutate anything.

The executor should reject plans that:

- call unknown tools,
- skip inspection before editing,
- apply destructive edits without approval,
- overwrite non-empty cells without approval,
- merge attached workbook data without row-match confidence or conflict checks,
- lack verification steps.

## Executor Loop

Do not rely on one model response to do everything.

Use a loop:

1. Get plan.
2. Validate plan.
3. Execute next ready step.
4. Store observation.
5. If observation contradicts plan, call `revise_spreadsheet_operation_plan`.
6. Continue until:
   - answer is ready,
   - patch preview is ready,
   - approval is required,
   - clarification is required,
   - operation is blocked.

This is the practical version of ReAct/Plan-and-Execute for Rialto.

## What To Borrow From Agent Frameworks And Local Inspiration Repos

### ReAct

Borrow:

- interleaved reasoning/action/observation,
- exception handling,
- plan updates after observations.

Do not borrow:

- free-form hidden reasoning as the artifact.

Make the artifact a typed plan and observation log.

### OpenHands

Borrow:

- action -> observation event stream,
- runtime boundary,
- debug trace,
- executor validates and records every action,
- stateful workspace/session idea.

Do not borrow:

- arbitrary code/shell as the main spreadsheet mutation path,
- general software-engineering agent architecture,
- browser-navigation style operation.

Rialto's runtime should execute typed workbook actions, not arbitrary code.

## Local Inspiration Repos To Inspect

The local inspiration repos live at:

`/Users/tomasz/Desktop/rialto/spreadsheet_ai_inspiration_repos`

The next implementation agent should inspect these repos directly before proposing major architecture. Do not just cite them conceptually.

### pi-for-excel

Path:

`/Users/tomasz/Desktop/rialto/spreadsheet_ai_inspiration_repos/pi-for-excel`

Why it matters:

Pi for Excel is the closest local reference for an AI agent that lives with a workbook, receives automatic workbook context, calls workbook tools, checkpoints mutations, and supports recovery.

Patterns to inspect and borrow/adapt:

- workbook blueprint / overview generation,
- compact `read_range` modes,
- `write_cells` with overwrite protection and auto-verification,
- `fill_formula`,
- `search_workbook`,
- `modify_structure`,
- `format_cells`,
- `conditional_format`,
- formula dependency tracing and formula explanation,
- comments as workflow/provenance surface,
- workbook history and automatic in-between-save backups,
- persistent workbook/user instructions,
- formatting conventions,
- session management and auto-context injection,
- audit log and workbook change tracking,
- tool registry and prompt/context builder.

Rialto adaptation:

- Keep the product runtime server-side and procurement-specific.
- Borrow the workbook context, recovery, and tool discipline.
- Do not adopt Office taskpane/Office.js as the main product surface.

### sv-excel-agent

Path:

`/Users/tomasz/Desktop/rialto/spreadsheet_ai_inspiration_repos/sv-excel-agent`

Why it matters:

This repo separates an Excel MCP server from an Excel agent runner and exposes roughly 30 spreadsheet editing tools. It also has evals against SpreadsheetBench.

Patterns to inspect and borrow/adapt:

- Excel MCP server tool boundary,
- input file -> output file copy/edit flow,
- breadth/granularity of Excel edit tools,
- agent runner loop,
- task input/output shape,
- eval harness,
- Microsoft Excel or LibreOffice-based formula/format verification strategy.

Rialto adaptation:

- Keep OpenAI Agents SDK as Rialto's orchestrator.
- Consider adapting tool designs, schemas, and eval patterns.
- Do not add MCP as a required internal hop unless it clearly improves modularity.
- Do not require desktop Excel for core production behavior; optional verification can be separate.

### ExcelWorkerLLMToolCallAgent

Path:

`/Users/tomasz/Desktop/rialto/spreadsheet_ai_inspiration_repos/ExcelWorkerLLMToolCallAgent`

Why it matters:

This repo is useful for stateful analysis workflows over Excel data: preview/metadata extraction, DuckDB queries, pandas-style operations, validation, iteration limits, and recovery.

Patterns to inspect and borrow/adapt:

- StateGraph-style state management,
- two-stage query generation and validation,
- preview/metadata tool before deeper querying,
- DuckDB query tool,
- pandas/dataframe query tool,
- safe execution limits,
- validation node,
- conditional routing,
- max iteration/tool call caps,
- error propagation and recovery.

Rialto adaptation:

- Use these ideas for read-only analysis and verification.
- Add DuckDB only if it materially improves quote-comparison queries.
- Avoid arbitrary dataframe eval for mutations.
- Preserve deterministic, typed tools for all workbook writes.

### OfficeCLI

Path:

`/Users/tomasz/Desktop/rialto/spreadsheet_ai_inspiration_repos/OfficeCLI`

Why it matters:

OfficeCLI is an agent-friendly Office document manipulation and rendering layer. It can create/read/modify Office docs and render documents to HTML/PNG without requiring Office.

Patterns to inspect and borrow/adapt:

- JSON/path-oriented document operation schema,
- structured read/get output,
- Excel cells/sheets/tables/sort/conditional formatting/charts/pivots/named ranges/data validation APIs,
- render -> inspect -> fix loop,
- live preview/watch concept,
- document quality validation,
- no-Office rendering strategy.

Rialto adaptation:

- Use as inspiration for operation schemas and optional preview/render verification.
- Do not make OfficeCLI the core spreadsheet engine unless it clearly beats the current SheetJS/ExcelJS/product-state path.
- Rendering can be a later verifier, especially for formulas/formatting/preview screenshots.

## Rialto Differentiation

The goal is not to build a generic Excel clone or general spreadsheet copilot. Rialto should win on procurement-specific spreadsheet operations:

- construction procurement domain semantics,
- existing comparison sheet plus attached vendor response workflows,
- RFQ line-item matching,
- quote completeness and partial quote logic,
- lead time, exclusion, alternate, unit, and quantity handling,
- estimator approval and audit history,
- provenance from source vendor files,
- product-integrated comparison sheet state,
- rollback/version history.

## Highest-Leverage Next Code Slice

Build the attached-vendor-response merge path end to end.

Suggested slice:

1. Add operation-plan types.
2. Add deterministic tools:
   - `extractVendorResponseFromWorkbook`
   - `matchVendorRowsToComparisonItems`
   - `createVendorMergePatch`
   - `verifyVendorMergePatch`
3. Bridge resulting patch into existing `ComparisonPatchProposal`.
4. Add tests with:
   - current comparison snapshot,
   - attached vendor workbook fixture,
   - unmatched rows,
   - ambiguous row match,
   - existing vendor conflict,
   - total package row exclusion,
   - approval required on overwrite.

The test should simulate:

> User: "This attached workbook is BuildCo's response. Merge it into the current comparison."

Expected:

- identifies BuildCo or asks if not confident,
- adds BuildCo columns if absent,
- fills matched rows only,
- reports unmatched attached rows,
- flags target rows not quoted,
- does not treat total/package rows as line items,
- returns one previewable patch,
- requires approval if overwriting existing BuildCo cells.

## Minimal UI/API Implication

The current app already passes attachments as text in some paths. For Excel merge, the product needs the actual workbook content available to the agent backend, not only extracted text.

Add or adapt an attachment pipeline:

- upload `.xlsx`,
- parse workbook server-side,
- create an attachment workbook context,
- pass attachment id + workbook summary to the agent runtime,
- deterministic tools can load the full workbook by id during execution.

Do not stuff whole workbooks into the prompt.

## Success Criteria

The system is good when a user can say:

- "Merge this vendor response into the comparison."
- "Add a recommendation column but ignore vendors with missing lead times."
- "Normalize all dollar amounts but don't overwrite originals."
- "Highlight cheapest valid quote per row."
- "Which vendors did not quote everything?"
- "What's weird in this spreadsheet?"

And the runtime reliably:

- plans,
- inspects,
- executes deterministic tools,
- observes,
- verifies,
- produces one safe preview or answer,
- persists audit/version history,
- and only asks questions when needed for safe correctness.
