# Quote Comparison Module

This module owns the External Quote Import and Comparison Sheet path for Rialto v1.

## Product Shape

- Quote Request can still collect vendor responses through the normal RFQ workflow.
- External Quote Import lets an estimator start Quote Comparison from client-provided quote files. The UI has one quote dropzone; the module tries deterministic extraction/import first and privately falls back to GPT-5.5 normalization only when the normal path fails.
- A single-vendor quote import creates an active Quote Request, infers requested line items from the quoted rows, creates one imported vendor response, and opens the existing spreadsheet-style Quote Comparison page.
- Imported rows are review-first data. Quantities, units, price basis, negative credits, alternates, and wrapped PDF descriptions should remain visible for estimator review.

## Main Files

- `apps/web/lib/procurement/external-quote-import.ts` parses extracted quote text into a `ContractorRFQ` plus imported `ContractorBid`; GPT-normalized fallback text must re-enter this importer rather than bypass it.
- `apps/web/app/api/external-quote-import/route.ts` accepts the uploaded PDF/XLS/XLSX, extracts text, saves the Quote Request and imported vendor response, and returns the comparison route.
- `apps/web/app/contractor/projects/[projectId]/_components/ExternalQuoteImportButton.tsx` is the project-level entry point.
- `apps/web/app/contractor/projects/[projectId]/rfqs/[rfqId]/_components/BidDashboard.tsx` renders the Google-Sheets-style Comparison Sheet and exports the visible view as CSV, Excel, or PDF.
- `apps/web/app/contractor/projects/[projectId]/rfqs/[rfqId]/_components/comparison-sheet-view.ts` owns the browser workbook view state: hidden rows/columns, row order, highlights, derived columns, manual rows/columns, column label overrides, and cell overrides.
- `src/tools/spreadsheet-edit.ts` is the Quote Comparison Agent Tools schema for backend-callable visible workbook operations. Keep user UI operations and agent operations aligned: cell edits, bulk numeric edits with dependent total recomputation, row/column deletion, row/column hiding and showing, row/column insertion, column rename, sorting, filtering, derived columns, highlights, and sheet rename should all be available as visible patches before persistent automation is added.
- `src/tools/quote-comparison-agent-tools.ts` owns the testable Quote Comparison agent tool contract used by the OpenAI Agents SDK runtime, including the explicit Excel-like sort proposal tool.
- `src/agent/quote-comparison-scenario-evals.ts` provides prompt + snapshot scenario evals through the `RialtoAgentCore` seam.
- `apps/web/lib/procurement/comparison-agent-tools.ts` adapts backend Rialto Agent tool patches into browser `ComparisonViewPatch` objects for preview and apply in the Comparison Sheet.
- `apps/web/lib/procurement/quote-request.ts`, `vendor-response-intake.ts`, and `quote-comparison.ts` define the workbook handoff and quote comparison evaluation.

## Test Surface

- `apps/web/lib/procurement/external-quote-import.test.ts` covers the single-vendor client quote import behavior.
- `src/tools/quote-comparison-agent-tools.test.ts` covers Quote Comparison agent tool behavior against fixed visible sheet snapshots.
- `src/agent/quote-comparison-scenario-evals.test.ts` covers the reusable scenario eval harness.
- `apps/web/lib/procurement/comparison-agent-tools-proposal.test.ts` covers adapting one aggregated Comparison Patch Proposal into the browser overlay patch.
- `apps/web/lib/procurement/comparison-agent-approval-version.test.ts` covers approved agent proposals becoming durable workbook-version provenance.
- `apps/web/lib/procurement/quote-workflow.test.ts` covers the Quote Request -> Vendor Response Workbook -> Quote Comparison handoff.

## Agent Behavior

The comparison assistant sends estimator instructions through Rialto Agent, which chooses from backend-callable Quote Comparison Agent Tools. Tool results are adapted into visible sheet patches such as editing cells, applying bulk comparison edits, deleting or hiding rows and columns, inserting rows or columns, renaming columns, Excel-like sorting rows, filtering rows, adding derived columns, or highlighting rows/cells. These are previewed and applied in the browser. Unit Price edits in the visible sheet should recompute dependent Total Price cells through comparison view overrides/formula behavior so history and export reflect the same workbook state. Persistent imported quote data still lives in the Quote Request and Bid tables; do not bypass those modules when adding future backend tools. Direct estimator edits currently live in comparison view state, while RFQ title rename is persisted through `/api/rfqs/[rfqId]/title`.
