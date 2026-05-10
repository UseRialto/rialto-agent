# Domain Docs

How engineering skills should consume this repo's domain documentation.

## Before Exploring

Read these when they are relevant to the work:

- `CONTEXT.md` at the repo root for product language and concepts.
- `docs/adr/` for architecture decisions that touch the area being changed.

If a file does not exist yet, proceed silently. The docs should grow when real terms and decisions emerge.

## File Structure

This is a single-context repo:

```text
/
├── AGENTS.md
├── CONTEXT.md
├── docs/
│   ├── agents/
│   └── adr/
└── README.md
```

## Use the Glossary's Vocabulary

When output names a domain concept in an issue title, refactor proposal, hypothesis, test name, or implementation note, use the term as defined in `CONTEXT.md`.

If the concept is missing from the glossary, either avoid inventing language or note the gap for a future `grill-with-docs` session.

## Flag ADR Conflicts

If an implementation or recommendation contradicts an existing ADR, surface that explicitly instead of silently overriding it.
