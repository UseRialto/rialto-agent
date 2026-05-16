# Deterministic quote import without automatic GPT fallback

External Quote Import uses one user-facing quote upload path. Rialto uses deterministic file text extraction and deterministic quote-row parsing for every uploaded file, including PDFs, spreadsheets, XML, text, and other formats. If extraction or parsing fails, the user-facing import fails with the deterministic error instead of privately retrying through GPT-5.5.

This keeps the normal importer as the source of truth for quote comparison shape, line matching, per-thousand unit-price normalization, imported-note handling, and alternate/substitution flags. GPT-5.5 is not an automatic repair path for quote comparison imports because it hides deterministic parser gaps, creates confusing two-stage failures, and can return normalized tables that still do not match the importer contract. Explicit development or operator-only repair flows may still call the agent normalizer through `forceAgent`, but the product import path should harden deterministic extractors instead of relying on that path.

For PDFs, the deterministic extraction layer may use multiple non-LLM readers before parsing. The current PDF path tries the repo PDF.js runtime first and then an independent `pdf-parse` text extractor if the runtime fails or returns no text. Both paths feed the same schema-validated quote row parser.

The agent-facing Quote Comparison tool surface must expose the same visible workbook operations the UI supports. Sorting is therefore available as an Excel-like sort proposal tool in addition to the broader sheet-structure edit tool, and formula-dependent edits such as Unit Price recomputing Total Price should flow through Comparison Sheet patch/override state rather than changing hidden bid source data.
