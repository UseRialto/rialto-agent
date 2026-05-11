# rialto-agent

Production backend for Rialto Agent: a single intelligence core attached to explicit product tools for construction procurement workflows.

## Shape

- `apps/web/` contains the imported Rialto web app shell from `insite_marketplace`, with the assistant/file upload flow bridged to this repo's backend.
- `src/agent/` contains the single Rialto Agent core and LLM planner boundary.
- `src/context/` builds User Context, the readable app/database state available to the agent.
- `src/tools/` exposes constrained visible product tools:
  - `site.navigate`
  - `email.draft_vendor_outreach`
  - `sheet.preview_comparison_patch`
  - `document.extract_line_items`
- `src/server.ts` exposes the HTTP API.

## Run

```bash
npm install
npm run dev
```

Default API port is `8787`.

To run the transplanted web app:

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
