# Procurement Fix Plan

Date: 2026-04-29
Scope: failures and mismatches discovered during the E2E validation pass

## 1. RFQ/RFP Authoring Uploads

### CSV import does not populate line items

- User-visible symptom: uploading `sample-bom-concrete.csv` never shows the green import status and does not populate imported rows into `Expanded Line Items`.
- Route: `/contractor/projects/proj-s001/rfqs/new` and `/contractor/projects/proj-s001/rfps/new`
- Likely root cause: the browser flow around the file input / upload button and `handleCsvFile()` is not completing successfully, so `parseCsv()` never drives `onItemsChange(parsed)` in a live page session.
- Required fix:
  - verify the actual DOM wiring for the CSV upload control
  - confirm the hidden/native file input is reachable and `onChange` fires in the browser
  - add a browser-level assertion that `csvStatus` is rendered after upload
  - verify uploaded attachment URLs and parsed item rows both update state
- Recommended verification:
  - upload `/docs/sample-bom-concrete.csv`
  - confirm the success message appears
  - confirm `Ready-mix concrete 4000 PSI` appears in the first line item
  - confirm the CSV also appears under attached files
- Severity / workflow impact: High. This blocks both RFQ and RFP happy paths.

### Invalid CSV upload error does not surface

- User-visible symptom: uploading a non-CSV file does not show the expected “Only .csv files are supported...” message.
- Route: `/contractor/projects/proj-s001/rfqs/new`
- Likely root cause: invalid upload attempts are being swallowed before `setCsvError(...)` is rendered, or the visible control is not bound to the actual input element that triggers validation.
- Required fix:
  - ensure invalid file selection reaches `handleCsvFile()`
  - make the error message render in the same request frame as the file control
- Recommended verification:
  - upload a `.txt` file through the CSV control
  - confirm the validation copy appears immediately
- Severity / workflow impact: Medium.

### Category chips remain disabled in the browser

- User-visible symptom: category filter chips like `Concrete` remain disabled and cannot be clicked.
- Route: `/contractor/projects/proj-s001/rfqs/new`
- Likely root cause: the chip buttons are permanently gated by the hydration flag or another stale disabled-state path.
- Required fix:
  - verify `isHydrated` transitions to `true`
  - remove unnecessary disabled state from category chips if they do not need hydration gating
- Recommended verification:
  - open RFQ create
  - click `Concrete`
  - confirm `aria-pressed="true"` and filtered SKU suggestions update
- Severity / workflow impact: High. This breaks discoverability and SKU filtering.

## 2. Wizard Progression And Invite Step Reachability

### Minimal RFQ authoring does not reliably reach Invite Vendors / Review

- User-visible symptom: even with a title and a manual line item, the test flow could not reliably reach the invite input or complete the review-step path.
- Route: `/contractor/projects/proj-s001/rfqs/new`
- Likely root cause: hidden validation or step-transition logic is blocking progression without surfacing a clear inline error.
- Required fix:
  - audit the `Next →` transition conditions in the RFQ wizard
  - surface inline validation errors if title, bid deadline, or item data is incomplete
  - add a deterministic E2E for “minimum valid RFQ can reach Invite Vendors”
- Recommended verification:
  - create a one-item RFQ manually
  - click `Next →`
  - confirm the `Vendor name or email…` input appears
- Severity / workflow impact: High.

## 3. RFP Authoring Semantics And AI Flow

### RFP route exists, but the usable authoring path is still blocked

- User-visible symptom: the dedicated RFP route renders, but a full draft/publish workflow cannot complete because the CSV/spec path never becomes usable.
- Route: `/contractor/projects/proj-s001/rfps/new`
- Likely root cause: the RFP flow depends on the same broken CSV import path as RFQ, and the AI spec selector remains disabled when no spec values are parsed.
- Required fix:
  - fix CSV import first
  - ensure parsed spec values populate the RFP spec dropdown
  - verify the assistant can run and return the short answer payload
- Recommended verification:
  - upload the sample CSV
  - confirm the `Spec` dropdown becomes enabled
  - select a spec, ask a PM question, and confirm the assistant returns an answer paragraph
- Severity / workflow impact: High.

### RFP brief fields need more accessible field wiring

- User-visible symptom: several RFP fields are visibly present, but they are not consistently addressable through programmatic label selectors.
- Route: `/contractor/projects/proj-s001/rfps/new`
- Likely root cause: visible `<label>` text is not associated with its corresponding `textarea`/`input` via `htmlFor` and `id`.
- Required fix:
  - add stable `id` / `htmlFor` pairs to the RFP brief fields
  - keep placeholders, but make labels first-class accessible names
- Recommended verification:
  - verify Playwright `getByLabel()` works for `Procurement Objective`, `Scope / Package Summary`, `Desired Outcome`, and `Performance / Spec Requirements`
- Severity / workflow impact: Medium. Functionality exists, but accessibility and testability are weaker than they should be.

## 4. Comparison Dashboard

### Lead-time sorting does not reorder vendors

- User-visible symptom: clicking the `Lead Time` column in the sortable summary table leaves `Pacific Steel Supply` as the first row instead of moving the faster vendor to the top.
- Route: `/contractor/demo/quote-comparison`
- Likely root cause: either the new sort state is not being applied for `lead_time_days`, or the rendered row set is not reordering even though the state toggles.
- Required fix:
  - inspect `BidVendorSummaryTable` sort state updates for `lead_time_days`
  - verify row order changes after the click and after React rerender
  - add a focused component or E2E regression test that asserts the top row changes on `Lead Time`
- Recommended verification:
  - open `/contractor/demo/quote-comparison`
  - click `Lead Time`
  - confirm the first row changes to the fastest vendor
- Severity / workflow impact: High. This directly impacts the primary quote comparison experience.

## 5. Lifecycle Coverage Blockers

### Full contractor-to-vendor lifecycle is blocked by authoring failures

- User-visible symptom: the new lifecycle test cannot reach vendor bidding, decision support, PO award, or order tracking on a fresh RFQ because request creation is not stable.
- Route: end-to-end flow across `/contractor/projects/proj-s001/rfqs/new`, `/vendor/rfqs/:rfqId`, `/contractor/projects/proj-s001/rfqs/:rfqId`, `/vendor/orders`, `/contractor/orders`
- Likely root cause: upstream authoring regressions cascade into the rest of the lifecycle.
- Required fix:
  - fix RFQ wizard progression
  - fix CSV/manual item authoring stability
  - rerun the lifecycle test after a clean RFQ can be created and published
- Recommended verification:
  - create and publish an RFQ
  - submit at least one vendor bid
  - mark a preferred vendor
  - offer and accept a PO
  - verify order tracking on both sides
- Severity / workflow impact: High.

## 6. Spec Drift Cleanup

### `features.md` still documents superseded behavior

- User-visible symptom: the checklist still asks testers to verify removed or redesigned behavior, which creates false bug reports.
- Route: `features.md`
- Likely root cause: the walkthrough file was not updated after the RFQ/RFP split and the newer RFP assistant design.
- Required fix:
  - update `features.md` to reflect current branch behavior:
    - RFQ no longer includes the AI spec assistant
    - RFP assistant is spec-selector based and returns a short answer
    - public anonymity is explanatory copy, not a user toggle
    - award flow is preferred-vendor driven
- Recommended verification:
  - compare the revised markdown against the current UI routes and this validation report
- Severity / workflow impact: Medium. It confuses testing and triage even when the product is behaving as designed.
