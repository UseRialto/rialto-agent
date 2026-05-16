# Deterministic quote import with GPT fallback

External Quote Import uses one user-facing quote upload path. Rialto first tries deterministic file text extraction and deterministic quote-row parsing for every uploaded file, including PDFs, spreadsheets, XML, text, and other formats. If either extraction or parsing fails, the Quote Comparison import module privately sends the source through the GPT-5.5 normalization path, then feeds the normalized table back into the same deterministic importer.

This keeps the normal importer as the source of truth for quote comparison shape, line matching, per-thousand unit-price normalization, imported-note handling, and alternate/substitution flags. GPT-5.5 is a repair normalizer, not a parallel importer and not a separate visible dropzone. During the import hardening phase, successful imports may surface a debug banner that says whether normal import or GPT fallback was used and includes the exception reason that triggered fallback.

The agent-facing Quote Comparison tool surface must expose the same visible workbook operations the UI supports. Sorting is therefore available as an Excel-like sort proposal tool in addition to the broader sheet-structure edit tool, and formula-dependent edits such as Unit Price recomputing Total Price should flow through Comparison Sheet patch/override state rather than changing hidden bid source data.
