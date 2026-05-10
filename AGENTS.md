# rialto-agent Agent Guide

This repo is the product codebase for Rialto Agent. Keep product code, architecture notes, and agent-facing project context here; keep reusable Codex skills installed outside the repo in `~/.codex/skills`.

## Agent skills

### Issue tracker

Issues and PRDs are tracked in GitHub Issues for `UseRialto/rialto-agent`. See `docs/agents/issue-tracker.md`.

### Triage labels

This repo uses the standard mattpocock/skills triage label vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repo with one root `CONTEXT.md` and architecture decisions under `docs/adr/`. See `docs/agents/domain.md`.

## Working agreements

- Read `CONTEXT.md` before substantial planning or implementation.
- Read relevant ADRs in `docs/adr/` before changing architecture, persistence, runtime boundaries, or agent behavior.
- Prefer small vertical slices with tests or executable verification.
- Update `CONTEXT.md` when a stable domain term becomes clear.
- Add an ADR when a decision would be expensive to reverse or future agents are likely to wonder why it was made.
