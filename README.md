# rialto-agent

Product codebase for Rialto Agent: an agentic construction procurement system for requesting quotes, receiving vendor responses, and comparing quotes. V1 stops at quote comparison; award, purchase order, and order tracking workflows are outside the product boundary.

## Architecture

Rialto v1 has three product modules. Future agents should understand and edit code through these modules before touching individual pages.

1. **Requesting Quotes**
   - Domain job: help an estimator create a Quote Request, define the Bill of Materials, choose vendors, review vendor email drafts, and send requests.
   - Primary code: `apps/web/app/contractor/projects/[projectId]/rfqs/new/`, `apps/web/lib/procurement/quote-request.ts`, `apps/web/lib/ai/request-authoring.ts`, `apps/web/lib/mail/rfq-email-draft.ts`, and `src/tools/email-draft.ts`.
   - Module interface: a Quote Request plus a Vendor Response Workbook handoff shape. Keep outbound-send side effects visible and estimator-approved.

2. **Vendor Response Intake**
   - Domain job: receive vendor quote form submissions, email replies, PDFs, spreadsheets, and externally imported quote files; extract structured values; preserve provenance and review issues.
   - Primary code: `apps/web/lib/procurement/vendor-response-intake.ts`, `apps/web/lib/procurement/external-quote-import.ts`, `apps/web/lib/magic-rfq/service.ts`, `apps/web/lib/mail/service.ts`, `apps/web/app/vendor/magic-rfq/[token]/`, `apps/web/app/api/external-quote-import/route.ts`, and `src/tools/document-read.ts`.
   - Module interface: Vendor Quote Responses and Vendor Response Workbooks. Do not merge uncertain vendor identity, price, quantity, unit, alternate, or scope data without review issues.

3. **Quote Comparison**
   - Domain job: compare returned quotes in a spreadsheet-like workflow, distinguish complete comparable quotes from partial totals, preserve review caveats, and support visible agent edits.
   - Primary code: `apps/web/lib/procurement/quote-comparison.ts`, `apps/web/app/contractor/projects/[projectId]/rfqs/[rfqId]/_components/`, `src/comparison/`, and `src/tools/spreadsheet-edit.ts`.
   - Module interface: Quote Comparison evaluation plus visible comparison-sheet patches. Partial quote totals may be displayed, but must never be crowned as the lowest complete comparable quote.

Supporting runtime modules:

- `apps/web/` is the active Next.js app.
- `src/agent/` contains the Rialto Agent core and LLM planner boundary.
- `src/context/` builds User Context, the readable app/database state available to the agent.
- `src/tools/` exposes constrained visible product tools.
- `src/server.ts` exposes the agent HTTP API.

## Editing Rules For Future Agents

- Read `CONTEXT.md` before substantial work and use its domain terms.
- Keep changes inside one product module when possible; if a change crosses modules, name the handoff explicitly.
- Preserve the Workbook Handoff ADR: Requesting Quotes produces a Vendor Response Workbook; Quote Comparison consumes it and can also start from an external workbook.
- Do not reintroduce marketplace, award, purchase order, or order tracking behavior as v1 product scope.
- Prefer module-level tests such as `apps/web/lib/procurement/quote-workflow.test.ts` and `src/comparison/evaluate.test.ts` when changing comparison semantics.

## Run

```bash
npm install
npm run dev
```

Default API port is `8787`.

To run the web app:

```bash
cd apps/web
npm install
npm run dev
```

The web app proxies agent turns and document extraction through `/api/rialto-agent/*` to `RIALTO_AGENT_API_URL`, defaulting to `http://localhost:8787`.

From the repo root you can also run:

```bash
npm run dev:api
npm run dev:web
```

## API

- `GET /health`
- `GET /tools`
- `POST /agent/turn`
- `POST /tools/document/extract`

Without `OPENAI_API_KEY`, the backend uses a deterministic local planner so development still exercises the tool boundary without a paid model call. With `OPENAI_API_KEY`, the single Rialto Agent LLM core uses `OPENAI_MODEL`, defaulting to `gpt-5-mini`, to choose tool calls from the same registry.

Document extraction currently supports PDF, XLSX, CSV/TSV/text, and DOCX. Legacy binary `.xls` is intentionally not supported until it can be handled through a safer converter.
