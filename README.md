# rialto-agent

Production backend for Rialto Agent: a single intelligence core attached to explicit product tools for construction procurement workflows.

## Shape

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

Default port is `8787`.

## API

- `GET /health`
- `GET /tools`
- `POST /agent/turn`
- `POST /tools/document/extract`

Without `ANTHROPIC_API_KEY`, the backend uses a deterministic planner so local development still exercises the tool boundary. With `ANTHROPIC_API_KEY`, the LLM planner chooses tool calls from the same registry.

Document extraction currently supports PDF, XLSX, CSV/TSV/text, and DOCX. Legacy binary `.xls` is intentionally not supported until it can be handled through a safer converter.
