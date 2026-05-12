# rialto-agent

Product codebase for Rialto Agent: an agentic construction procurement system for requesting quotes, receiving vendor responses, and comparing quotes. V1 stops at quote comparison; award, purchase order, and order tracking workflows are outside the product boundary.

## Database Notes

The web app uses Drizzle migrations under `apps/web/lib/db/migrations/`. Before running Quote Comparison workbook persistence, apply the latest migrations from `apps/web`:

```bash
npm run db:migrate --prefix apps/web
```

The current agentic Quote Comparison work depends on `0011_comparison_sheet_views.sql` and `0012_comparison_sheet_versions.sql`: the latest sheet view is stored for fast loading, and every changed save appends a durable workbook version for history/restore.

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

Before browser-testing Quote Comparison agent usefulness, run the skipped-by-default live smoke eval with a real OpenAI key:

```bash
OPENAI_API_KEY=... npm run test:agent:live
```

## API

- `GET /health`
- `GET /tools`
- `POST /agent/turn`
- `POST /tools/document/extract`

Quote Comparison agent editing requires `OPENAI_API_KEY`; there is no deterministic spreadsheet-edit fallback. The single Rialto Agent OpenAI core uses `OPENAI_MODEL` when set.

Document extraction currently supports PDF, XLSX, CSV/TSV/text, and DOCX. Legacy binary `.xls` is intentionally not supported until it can be handled through a safer converter.

## Quote Comparison Agent Architecture

The Quote Comparison agent is a spreadsheet-editing agent. It is not a procurement super-agent yet. The v1 loop is:

```text
Estimator prompt
-> web sheet assistant sends visible sheet state
-> Rialto Agent Core builds user/app context
-> OpenAI Agents SDK agent parses intent
-> agent calls typed Quote Comparison backend tools
-> core aggregates tool fragments into one patch proposal
-> web app overlays the proposed changes on the live sheet
-> estimator approves all changes or discards
-> approved patch persists as a workbook version
```

The important boundary is that GPT parses the user request and chooses tools, but it does not directly mutate the browser sheet. Sheet edits are backend tool outputs represented as structured patch operations such as `insert-column`, `set-cell`, `delete-column`, `delete-row`, `add-highlight`, and `sort-rows`. The web app turns those operations into a `ComparisonViewPatch` preview. Applying the preview is still a user-approved action.

There is intentionally no local deterministic intent parser in the web route. `/api/bid-comparison/ai-propose` always sends the prompt, `currentView`, `sheetSchema`, and `snapshot` to `/agent/turn`. The OpenAI Agents SDK agent then decides whether to inspect the sheet, answer a read-only question, ask for clarification, or call tools such as:

- `quoteComparison.inspectSnapshot`
- `quoteComparison.answerSheetQuestion`
- `quoteComparison.proposeConvertedQuantityColumn`
- `quoteComparison.proposeDeletions`
- `quoteComparison.proposeHighlights`
- `quoteComparison.proposeCellEdits`
- `quoteComparison.proposeSheetStructureEdits`
- `quoteComparison.proposeDerivedColumns`
- `quoteComparison.proposeSelectionState`

Patch proposals are approve-all-or-discard. This is deliberate: the estimator sees one coherent overlay on top of the current visible workbook state rather than approving individual cell edits one by one.

### Runtime Pieces

- `src/agent/core.ts` is the module boundary for `RialtoAgentCore`. It builds context, invokes a product-agent runtime, extracts Quote Comparison patch fragments from tool results, and returns the final `AgentTurnResponse`.
- `src/agent/openai-agents-runtime.ts` is the OpenAI Agents SDK implementation. It defines one root agent, structured output, instructions, and typed tools.
- `src/tools/quote-comparison-agent-tools.ts` contains the deterministic backend operations that the agent may call after it has parsed intent.
- `apps/web/app/api/bid-comparison/ai-propose/route.ts` is the Quote Comparison web proxy. It forwards the visible sheet state to `/agent/turn`, converts returned proposals into web sheet patches, and forwards ephemeral debug trace data.
- `apps/web/app/contractor/projects/[projectId]/rfqs/[rfqId]/_components/BidComparisonAssistant.tsx` is the sheet assistant UI. Debug mode is on by default and shows the major request steps, returned plan, tool calls, and patch batch summary.
- `apps/web/lib/procurement/comparison-sheet-state.ts` and `apps/web/app/api/rfqs/[rfqId]/comparison-sheet-view/` persist the live workbook view and append workbook versions.

### Persistence And Versioning

The estimator-visible sheet state is the agent's source of truth. The web app builds a `ComparisonSheetSnapshot` from the current sheet view, including manual columns, hidden/deleted rows and columns, cell overrides, and highlights. The agent receives that snapshot on each request.

Approved agent patches are saved as durable workbook versions. This gives Google-Sheets-like history semantics: edits are applied on top of the current visible state, and restoring a version creates a new restore version rather than mutating history in place.

### Debug Mode

Debug mode is ephemeral and meant for the current chat/session. It is enabled with `localStorage["rialto:agent-debug"]`, defaults on in the Quote Comparison assistant, and is sent as `debug: true` to `/agent/turn`.

When debug is enabled, the response may include:

- `plan`: major plan steps from the agent.
- `toolCalls`: typed tool invocations selected by the agent.
- `toolResults`: backend tool results.
- `patchFragments`: individual proposed edit fragments.
- `proposal`: the one approval batch sent back to the sheet UI.

This is not durable audit logging. Durable history is the workbook version record created after approval.

### OpenAI Connectivity

The agent requires `OPENAI_API_KEY`. There is no fallback model and no local parser fallback.

The Agents SDK uses a custom OpenAI client with a narrow resilient fetch layer in `src/agent/openai-resilient-fetch.ts`. It only affects `api.openai.com`: it tries the system DNS resolver first, then falls back to public DNS (`1.1.1.1`, `8.8.8.8`) while preserving HTTPS host/SNI. This was added because the local system resolver has been observed returning `ENOTFOUND api.openai.com` even when public DNS resolves the host.

If OpenAI is unreachable, `/agent/turn` returns structured JSON:

```json
{
  "status": "tool_error",
  "error": "Rialto Agent could not reach the OpenAI model API. Check network/DNS and retry."
}
```

### Known Current Failure Modes

- Real model calls can be slow. A live smoke request has succeeded but took about 75 seconds. The UI shows progress and has a 90 second client timeout, but latency still needs product work.
- Complex Quote Comparison behavior is covered by architecture and tool tests, but browser-level usefulness testing is still in progress.
- The v1 agent can propose spreadsheet patches, answer sheet questions, and ask clarifying questions. It does not yet run long procurement workflows such as emailing vendors, waiting for responses, PO generation, or reminders.
- Document-grounded sheet filling is only a first slice. It can carry provenance notes, but richer document retrieval and evidence review need more work.
- Legacy binary `.xls` remains unsupported.
