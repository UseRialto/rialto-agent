# Procurement Feature Validation Report

Date: 2026-04-29
App: `apps/insiteai-web`
Environment: local Next.js app on `http://127.0.0.1:3000`
Primary project: `proj-s001`

## Summary

- Source checklist: `features.md`
- Automated coverage added this pass:
  - `tests/e2e/project-dashboard.spec.ts`
  - `tests/e2e/rfq-authoring.spec.ts`
  - `tests/e2e/rfp-authoring.spec.ts`
  - `tests/e2e/comparison-and-decision.spec.ts`
  - `tests/e2e/procurement-lifecycle.spec.ts`
  - updated `tests/e2e/rfq-step-items.spec.ts`
  - added shared helpers in `tests/e2e/helpers/auth.ts` and `tests/e2e/helpers/procurement.ts`
- Total E2E tests now in suite: `12`
- Cleanest full run result: `3 passed / 9 failed`
- Follow-up rerun after harness cleanup stayed red in the same core product areas and also picked up extra route-load timeouts after state mutation, so the first stable run is the baseline used for pass/fail accounting below.
- Type check: `pnpm exec tsc --noEmit` passed

## Traceability

| Checklist item | Route | Test type | Current expected behavior | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| Project dashboard loads and shows project header | `/contractor/projects/proj-s001` | Automated | Contractor can open the project dashboard without error | Pass | Covered by `project-dashboard.spec.ts` on the stable run |
| `Create RFQ` and `Create RFP` buttons are visible | `/contractor/projects/proj-s001` | Automated | Both CTAs render from the project page | Pass | Stable run passed |
| Project tabs filter request data | `/contractor/projects/proj-s001` | Automated | `All`, `Drafts`, `Active`, `Closed`, `Purchase Orders` are visible and routable | Pass | Stable run passed |
| `PO Offered` is human-readable | `/contractor/projects/proj-s001` | Automated | Raw `po_offered` should not surface | Pass | Stable run passed; no raw snake_case text remained |
| RFQ CSV upload imports rows into line items | `/contractor/projects/proj-s001/rfqs/new` | Automated | Import status appears and items populate below | Fail | `csvStatus` never surfaced; imported rows did not appear |
| RFQ invalid CSV upload shows friendly error | `/contractor/projects/proj-s001/rfqs/new` | Automated | `.txt` upload should show the CSV-only error | Fail | Validation message did not appear |
| RFQ category chips are interactive | `/contractor/projects/proj-s001/rfqs/new` | Automated | Category chips should be enabled after hydration | Fail | Chips remained disabled in the browser snapshot |
| RFQ attachments appear in authoring flow | `/contractor/projects/proj-s001/rfqs/new` | Automated | CSV and files should stay visible as attached files | Fail | Blocked by the upload/import issue |
| RFQ invite-vendors step is reachable and editable | `/contractor/projects/proj-s001/rfqs/new` | Automated | Contractor should reach invite step and add off-platform vendor rows | Fail | Test could not reliably reach the vendor invite input with a minimal authored RFQ |
| RFQ review step shows editable email draft and PDF preview | `/contractor/projects/proj-s001/rfqs/new` | Automated | Review step should surface draft email controls and PDF preview | Mixed / blocked | PDF preview endpoints passed, but the full review-step UI flow was blocked upstream by wizard progression issues |
| RFP dedicated route renders | `/contractor/projects/proj-s001/rfps/new` | Automated | Dedicated RFP route loads with RFP brief fields | Fail | Route existed, but the end-to-end authoring path was blocked by upload and field-targeting issues |
| RFP AI Spec Assistant works from imported spec context | `/contractor/projects/proj-s001/rfps/new` | Automated | CSV-imported spec values should enable the spec selector and assistant | Fail | CSV import never produced usable spec values, so the assistant path stayed blocked |
| RFP brief fields persist into draft reopen | `/contractor/projects/proj-s001/rfps/new?rfqId=...` | Automated | Draft reopen should preserve entered RFP brief text | Fail | Could not complete a stable draft round-trip because the authoring flow did not complete |
| Request detail page shows authored procurement data | `/contractor/projects/proj-s001/rfqs/:rfqId` | Automated | Published RFQ/RFP should render detail blocks, files, and summary info | Blocked | Not reached for new requests because authoring publish flow is failing |
| Vendor RFQ response supports bid terms and submission | `/vendor/rfqs/:rfqId` | Automated | Vendors can enter price, lead time, and commercial terms | Blocked | Lifecycle test did not get far enough to create a clean RFQ for vendor submission |
| Comparison dashboard summary table sorts by lead time and terms | `/contractor/demo/quote-comparison` | Automated | Column clicks should reorder rows in the summary table | Fail | Lead-time sort did not change the first row; likely a real sorting bug |
| Decision support persists status and rationale | `/contractor/projects/proj-s001/rfqs/:rfqId` | Automated | Preferred/alternate/etc. should persist after refresh | Blocked | Lifecycle test never reached comparison on a fresh RFQ |
| Preferred vendor drives `Award PO` | `/contractor/projects/proj-s001/rfqs/:rfqId` | Automated | Award CTA should depend on the preferred bid | Blocked | Lifecycle test never reached award state |
| Vendor negotiation replies appear back on contractor thread | `/vendor/rfqs/:rfqId` and `/contractor/projects/proj-s001/rfqs/:rfqId` | Automated | Contractor note and vendor reply should persist in the shared thread | Blocked | Not reached in the current lifecycle run |
| Project `Purchase Orders` tab links to Track Orders | `/contractor/projects/proj-s001?status=purchase_orders` | Automated | PO rows should click into `/contractor/orders/:orderId` | Pass on stable run | The tab route itself passed; end-to-end order creation was not revalidated in this pass |
| Vendor order fulfillment persists stage changes | `/vendor/orders/:orderId` | Automated | Stage progression should persist after reload | Blocked | Requires a clean awarded order from the lifecycle flow |
| Contractor order tracking and follow-up persist | `/contractor/orders/:orderId` | Automated | Follow-up fields should persist after save and refresh | Blocked | Requires a clean awarded order from the lifecycle flow |

## Spec Drift From `features.md`

These are checklist items in `features.md` that no longer match the current branch behavior and should not be treated as product bugs:

| Old checklist expectation | Current branch behavior | Classification |
| --- | --- | --- |
| RFQ step should expose an RFQ-side `AI Spec Assistant` | RFQ no longer includes the spec assistant; that flow is now RFP-only | Spec drift |
| RFP assistant should take pasted spec text and return `Summary / Missing Info / Vendor Questions / Suggested Specs` | Current RFP assistant is spec-selector based and returns a short direct answer paragraph | Spec drift |
| Visibility selection is a contractor toggle to test during authoring | Current authoring UI shows public-marketplace anonymity as explanatory copy; there is no interactive toggle in Step Items | Spec drift |
| Award flow is initiated from any vendor row | Current branch design is “award preferred vendor” only | Spec drift |

## Manual / Conditional Matrix

| Feature | Route | Account | Preconditions | Expected result | Actual result | Status | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Mailbox-thread negotiation email send | `/contractor/projects/proj-s001/rfqs/:rfqId` | Contractor | Connected Gmail or Outlook mailbox with valid refresh token | Contractor note sends into the original email thread | Not executed in local deterministic run | Conditional | External provider dependency |
| Mailbox sync / resend / full resync controls | `/contractor/projects/proj-s001/rfqs/rfq-s001-b` | Contractor | Seeded mailbox demo data and, ideally, a live connected mailbox | Mailbox panel renders provider state and sync actions | Not fully validated live | Conditional | Seed data exists, but live provider state is not deterministic in local E2E |
| Off-platform email delivery receipt | Vendor inbox | Off-platform vendor | Valid outbound mailbox and reachable destination inbox | Secure quote email arrives with rendered first-name greeting and magic link | Not executed | Conditional | External delivery path |
| Live magic-link quoting from email | `/vendor/magic-rfq/:token` | Off-platform vendor | Valid non-expired token from a sent invite | Magic form shows request context and accepts quote | Not executed end-to-end from live email | Conditional | Best verified after mailbox path is healthy |

## Artifacts

- Validation targets source: `features.md`
- Added tests live in `apps/insiteai-web/tests/e2e`
- Failing Playwright artifacts are under `apps/insiteai-web/test-results`
