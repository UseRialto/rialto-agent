# Rialto Agent SDK Overhaul Handoff

This handoff records the May 2026 architecture grilling session for replacing the current custom Rialto Agent planner with an OpenAI Agents SDK-backed runtime. It supersedes the older “generic planner plus deterministic fallback” handoff.

## Decisions

- Rebuild the entire `RialtoAgentCore`, not only the Quote Comparison assistant.
- Use the OpenAI Agents SDK in TypeScript. Do not introduce a Python agent runtime.
- Use one root Rialto agent with product-module tools. Do not add SDK handoffs yet.
- Require `OPENAI_API_KEY`. Do not keep a deterministic fallback planner or direct Chat Completions patch planner as a parallel product path.
- Material write tools produce proposals, not committed mutations. Read-only tools may execute immediately.
- Quote Comparison approval is request-level: one estimator request produces one overlaid Comparison Patch Proposal, approved or discarded as a single unit.
- The agent may compose multiple backend tool calls for one request; each tool returns patch fragments and `RialtoAgentCore` aggregates them.
- Quote Comparison tools should be mostly domain-level, with a small generic sheet-edit escape hatch.
- Read-only analysis questions can be answered directly. Visual or persistent changes still go through proposal approval.
- Document reading should be generic; document-to-sheet interpretation should be Quote Comparison-specific.
- Agent turns are stateless. Every request supplies fresh current context.
- The agent reasons over the estimator-visible Comparison Sheet Snapshot, not raw database records alone.
- Approved edits should become versioned workbook operations applied on top of the current sheet state, Google Sheets-style.
- Selection-state edits are allowed inside the same patch proposal, but external follow-up actions such as vendor notification, award, decline, or purchasing handoff are out of scope.
- Derived columns and formulas are in scope, with explicit preview and approval.
- Visible plans appear for broad, risky, structural, formula-changing, bulk, import, or external-consequence-adjacent work. Tiny edits can go straight to overlay.
- Ambiguity should not be annoying: ask only when ambiguity affects material correctness.
- Clarification responses should be structured: one concise question plus detected choices when possible.
- Response states must be explicit: `completed`, `needs_clarification`, `blocked`, and `tool_error`.
- Add an easily enabled, ephemeral Agent Debug Trace in the webapp for the current chat/turn.

## New Terms

See `CONTEXT.md` for the canonical definitions:

- **Comparison Patch Proposal**
- **Comparison Sheet Snapshot**
- **Product Agent Runtime**
- **Agent Debug Trace**

The durable architecture decision is recorded in `docs/adr/0002-agent-tools-return-quote-comparison-patch-proposals.md`.

## Target Flow

```text
Estimator prompt
→ webapp builds fresh Comparison Sheet Snapshot when on Quote Comparison
→ /api/bid-comparison/ai-propose or /api/rialto-agent/turn
→ /agent/turn
→ Agents SDK-backed RialtoAgentCore
→ one root Rialto agent calls product-module tools
→ tools return read results and/or patch fragments
→ RialtoAgentCore aggregates fragments into one Comparison Patch Proposal
→ webapp overlays all changes on the live sheet
→ estimator approves or discards the whole proposal
→ approval applies versioned workbook operations on top of current state
```

## Recommended First Slice

Implement the new spine before filling in every spreadsheet operation:

1. Install and configure the OpenAI Agents SDK for TypeScript.
2. Replace the custom `LlmPlanner` loop inside `src/agent/core.ts` with a single SDK-backed root agent.
3. Make missing `OPENAI_API_KEY` a hard configuration error in the backend, with a graceful UI message.
4. Extend `AgentTurnResponse` with first-class `status`, `proposal`, `clarification`, and optional `debugTrace`.
5. Introduce domain-stable Quote Comparison patch fragments and aggregation in `RialtoAgentCore`.
6. Hydrate `ComparisonSheetSnapshot` in the Quote Comparison product module, then pass it into the agent request.
7. Implement a small representative tool set first:
   - `quoteComparison.inspectSnapshot`
   - `quoteComparison.answerSheetQuestion`
   - `quoteComparison.proposeHighlights`
   - `quoteComparison.proposeCellEdits`
   - `quoteComparison.proposeSheetStructureEdits`
   - `document.readSource`
   - `quoteComparison.proposeDocumentGroundedEdits`
8. Keep the existing browser `ComparisonViewPatch` adapter working by adapting from the new domain patch proposal at the edge.
9. Retire direct patch planning in `src/comparison/patch-planner.ts` and deterministic product-agent fallbacks once the SDK path owns proposal generation.

## Tool Shape Guidance

Model-visible tools should be compositional but not raw cell-by-cell plumbing by default:

- Use domain-level tools for procurement semantics such as lowest complete comparable quote, missing lead times, no-bids, alternates, selection state, and derived comparison metrics.
- Use a generic sheet-edit escape hatch for straightforward workbook operations like rename column, set explicit cells, hide/show rows or columns, insert rows or columns, and simple structure edits.
- Tools return patch fragments with summaries, warnings, provenance notes, and operations. The user sees one aggregated proposal.

## Response Shape Sketch

```ts
type AgentTurnResponse =
  | {
      status: 'completed'
      requestId: string
      reply: string
      plan?: string[]
      toolCalls: AgentToolCall[]
      toolResults: ToolResult[]
      proposal?: AgentProposal
      debugTrace?: AgentDebugTrace
    }
  | {
      status: 'needs_clarification'
      requestId: string
      reply: string
      clarification: {
        question: string
        choices?: Array<{ id: string; label: string }>
      }
      debugTrace?: AgentDebugTrace
    }
  | {
      status: 'blocked' | 'tool_error'
      requestId: string
      reply: string
      reason: string
      debugTrace?: AgentDebugTrace
    }
```

## Debug Trace

Debug trace should be ephemeral and visible only when enabled for the current webapp session/chat. It should show:

- response state
- plan
- tool calls
- tool results
- patch fragments
- aggregated proposal
- warnings
- errors

Do not expose API keys, secret env values, or hidden system prompts.

## Open Implementation Questions

- The first implementation pass uses `@openai/agents` in the TypeScript backend.
- `ComparisonPatchProposal` is now the domain proposal shape returned by `RialtoAgentCore` from aggregated tool patch fragments.
- `/api/bid-comparison/ai-propose` remains a thin compatibility route for the existing Quote Comparison assistant and adapts proposals into browser overlay patches.
- Direct patch planning and deterministic planner fallbacks have been removed from product code. `/comparison/propose-patch` is retired with HTTP 410.
- Approved versioned workbook operations land through the existing comparison sheet view state and now append durable `comparison_sheet_versions` history. Restoring an older workbook version creates a new `restore` version.
- The old `ToolRegistry` remains exported for existing non-agent tool surfaces, but Quote Comparison agent proposal generation is owned by the Agents SDK runtime.
