# Quote Comparison Module

This module owns the External Quote Import and Comparison Sheet path for Rialto v1.

## Product Shape

- Quote Request can still collect vendor responses through the normal RFQ workflow.
- External Quote Import lets an estimator start Quote Comparison from a client-provided PDF or Excel file.
- A single-vendor quote import creates an active Quote Request, infers requested line items from the quoted rows, creates one imported vendor response, and opens the existing spreadsheet-style Quote Comparison page.
- Imported rows are review-first data. Quantities, units, price basis, negative credits, alternates, and wrapped PDF descriptions should remain visible for estimator review.

## Main Files

- `apps/web/lib/procurement/external-quote-import.ts` parses extracted PDF/Excel text into a `ContractorRFQ` plus imported `ContractorBid`.
- `apps/web/app/api/external-quote-import/route.ts` accepts the uploaded PDF/XLS/XLSX, extracts text, saves the Quote Request and imported vendor response, and returns the comparison route.
- `apps/web/app/contractor/projects/[projectId]/_components/ExternalQuoteImportButton.tsx` is the project-level entry point.
- `apps/web/app/contractor/projects/[projectId]/rfqs/[rfqId]/_components/BidDashboard.tsx` renders the Google-Sheets-style Comparison Sheet and exports the visible view as CSV, Excel, or PDF.
- `apps/web/app/contractor/projects/[projectId]/rfqs/[rfqId]/_components/comparison-sheet-view.ts` owns the browser workbook view state: hidden rows/columns, row order, highlights, derived columns, manual rows/columns, column label overrides, and cell overrides.
- `src/tools/spreadsheet-edit.ts` is the agent-facing preview tool schema for visible workbook operations. Keep user UI operations and agent operations aligned: cell edits, row/column insertion, column rename, sorting, filtering, derived columns, highlights, hides, and sheet rename should all be available as visible patches before persistent automation is added.
- `apps/web/lib/procurement/quote-request.ts`, `vendor-response-intake.ts`, and `quote-comparison.ts` define the workbook handoff and quote comparison evaluation.

## Test Surface

- `apps/web/lib/procurement/external-quote-import.test.ts` covers the single-vendor client quote import behavior.
- `apps/web/lib/procurement/comparison-command-fallback.test.ts` covers deterministic fallback parsing for workbook edit commands when the external comparison patch backend is unavailable.
- `apps/web/lib/procurement/quote-workflow.test.ts` covers the Quote Request -> Vendor Response Workbook -> Quote Comparison handoff.

## Agent Behavior

The comparison assistant receives a sheet schema from `BidDashboard` and can propose visible sheet patches such as editing cells, inserting rows or columns, renaming columns, sorting rows, filtering rows, hiding columns, adding derived columns, or highlighting rows/cells. These are previewed and applied in the browser. Persistent imported quote data still lives in the Quote Request and Bid tables; do not bypass those modules when adding future backend tools. Direct estimator edits currently live in comparison view state, while RFQ title rename is persisted through `/api/rfqs/[rfqId]/title`.
