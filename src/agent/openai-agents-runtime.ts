import { Agent, Runner, setTracingDisabled, tool, type RunContext } from '@openai/agents'
import { setDefaultOpenAIClient } from '@openai/agents-openai'
import { OpenAI } from 'openai'
import { z } from 'zod'
import type { ProductAgentRuntime, ProductAgentRuntimeRequest, ProductAgentRuntimeResult } from './core.js'
import type { AgentToolCall, ComparisonPatchFragment, ToolResult } from '../domain/types.js'
import { createOpenAIResilientFetch } from './openai-resilient-fetch.js'
import {
  answerQuoteComparisonQuestion,
  inspectQuoteComparisonSnapshot,
  proposeQuoteComparisonBulkNumericEdit,
  proposeQuoteComparisonCellEdits,
  proposeQuoteComparisonConvertedQuantityColumn,
  proposeQuoteComparisonDeletions,
  proposeQuoteComparisonDerivedColumns,
  proposeQuoteComparisonHighlights,
  proposeQuoteComparisonSelectionState,
  proposeQuoteComparisonSheetStructureEdits,
} from '../tools/quote-comparison-agent-tools.js'

const AgentFinalOutput = z.object({
  status: z.enum(['completed', 'needs_clarification', 'blocked', 'tool_error']),
  reply: z.string(),
  plan: z.array(z.string()).optional(),
  clarification: z.object({
    question: z.string(),
    choices: z.array(z.object({ id: z.string(), label: z.string() })).optional(),
  }).nullable().optional(),
  reason: z.string().nullable().optional(),
})

type AgentFinalOutput = z.infer<typeof AgentFinalOutput>

setTracingDisabled(process.env.OPENAI_AGENTS_REMOTE_TRACING !== 'true')

interface RialtoRunContext extends ProductAgentRuntimeRequest {
  toolCalls: AgentToolCall[]
  toolResults: ToolResult[]
}

type ToolCallDetails = { toolCall?: { callId: string } }

export class OpenAIAgentsProductRuntime implements ProductAgentRuntime {
  private readonly runner: Runner
  private readonly agent: Agent<unknown, typeof AgentFinalOutput>

  constructor() {
    if (process.env.OPENAI_API_KEY) {
      const client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        fetch: createOpenAIResilientFetch(),
      })
      setDefaultOpenAIClient(client as unknown as Parameters<typeof setDefaultOpenAIClient>[0])
    }
    this.runner = new Runner()
    this.agent = new Agent({
      name: 'Rialto Agent',
      model: process.env.OPENAI_MODEL ?? 'gpt-5.4-mini',
      instructions: [
        'You are Rialto Agent, the Product Agent Runtime for construction procurement.',
        'Use one root agent with product-module tools. Use tools when answering Quote Comparison questions or preparing sheet changes.',
        'Material write actions must be proposed for approval rather than committed.',
        'For sheet mutations, call one or more quoteComparison proposal tools. The runtime will aggregate their patch fragments into one Comparison Patch Proposal.',
        'For read-only sheet questions, call quoteComparison_answerSheetQuestion when the answer depends on sheet state.',
        'Use quoteComparison_proposeDeletions for delete row, delete column, and delete selected cell contents requests.',
        'Use bulk, derived-column, structure, and selection-state tools when those operations match the request instead of emitting many tiny unrelated edits.',
        'Use quoteComparison_proposeConvertedQuantityColumn for requests to add a Qty/quantity column converted into hundreds or thousands of linear feet, hLF, kLF, or similar visible quantity unit conversions. Use divisor 100 for hundreds and 1000 for thousands.',
        'Never return completed for a Quote Comparison sheet edit unless you have called at least one quoteComparison proposal tool.',
        'When ambiguity affects material correctness, return needs_clarification with one concise question.',
        'When a request is outside the v1 product boundary, return blocked with a clear reason.',
        'Return the structured output schema exactly.',
      ].join('\n'),
      outputType: AgentFinalOutput,
      tools: quoteComparisonTools(),
    })
  }

  async runTurn(request: ProductAgentRuntimeRequest): Promise<ProductAgentRuntimeResult> {
    const latestMessage = request.messages.at(-1)?.content ?? ''
    const runContext: RialtoRunContext = { ...request, toolCalls: [], toolResults: [] }
    const result = await this.runner.run(
      this.agent,
      [
        `Request id: ${request.requestId}`,
        `User Context: ${JSON.stringify(request.userContext)}`,
        `Request Context: ${JSON.stringify(request.requestContext ?? {})}`,
        `Conversation: ${JSON.stringify(request.messages)}`,
        `Current user request: ${latestMessage}`,
      ].join('\n\n'),
      { context: runContext },
    )
    const output = AgentFinalOutput.parse(result.finalOutput)
    if (output.status === 'needs_clarification' && !output.clarification) {
      return {
        status: 'tool_error',
        reply: 'Rialto Agent could not ask a complete clarification question.',
        reason: 'The model returned needs_clarification without clarification details.',
        toolCalls: runContext.toolCalls,
        toolResults: runContext.toolResults,
      }
    }
    if ((output.status === 'blocked' || output.status === 'tool_error') && !output.reason) {
      return {
        status: 'tool_error',
        reply: 'Rialto Agent could not complete the request.',
        reason: `The model returned ${output.status} without a reason.`,
        toolCalls: runContext.toolCalls,
        toolResults: runContext.toolResults,
      }
    }
    if (output.status === 'needs_clarification') {
      return {
        status: 'needs_clarification',
        reply: output.reply,
        clarification: output.clarification!,
        toolCalls: runContext.toolCalls,
        toolResults: runContext.toolResults,
      }
    }
    if (output.status === 'blocked' || output.status === 'tool_error') {
      return {
        status: output.status,
        reply: output.reply,
        reason: output.reason!,
        toolCalls: runContext.toolCalls,
        toolResults: runContext.toolResults,
      }
    }
    return {
      status: 'completed',
      reply: output.reply,
      plan: output.plan,
      toolCalls: runContext.toolCalls,
      toolResults: runContext.toolResults,
    }
  }
}

function quoteComparisonTools() {
  return [
    tool({
      name: 'quoteComparison_inspectSnapshot',
      description: 'Inspect the estimator-visible Comparison Sheet Snapshot and summarize available columns, rows, and vendors. Read-only.',
      parameters: z.object({}),
      execute(_input, context, details) {
        const runContext = rialtoContext(context)
        return recordTool(runContext, details, 'quoteComparison.inspectSnapshot', {}, inspectQuoteComparisonSnapshot(quoteComparisonToolContext(runContext?.context)))
      },
    }),
    tool({
      name: 'quoteComparison_answerSheetQuestion',
      description: 'Answer a read-only question about the current Comparison Sheet Snapshot. Use for questions like lowest total, missing values, or vendor comparison when no sheet mutation is requested.',
      parameters: z.object({ question: z.string() }),
      execute(input, context, details) {
        const runContext = rialtoContext(context)
        return recordTool(runContext, details, 'quoteComparison.answerSheetQuestion', input, answerQuoteComparisonQuestion(quoteComparisonToolContext(runContext?.context), input.question))
      },
    }),
    tool({
      name: 'quoteComparison_proposeHighlights',
      description: 'Return a patch fragment with comparison highlights. Use for visual changes such as highlighting missing lead times or lowest prices. Does not commit changes.',
      parameters: z.object({
        rule: z.enum(['missing-lead-times', 'lowest-price-per-row']),
        color: z.enum(['red', 'orange', 'blue', 'green', 'yellow']).optional(),
      }),
      execute(input, context, details) {
        return recordPatchFragmentTool(
          rialtoContext(context),
          details,
          'quoteComparison.proposeHighlights',
          input,
          proposeQuoteComparisonHighlights(quoteComparisonToolContext(rialtoContext(context)?.context), input),
        )
      },
    }),
    tool({
      name: 'quoteComparison_proposeCellEdits',
      description: 'Return a patch fragment for explicit cell edits. Use only when row, column, and value are clear. Does not commit changes.',
      parameters: z.object({
        edits: z.array(z.object({
          rowKey: z.string(),
          colKey: z.string(),
          value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
          note: z.string().optional(),
        })),
        summary: z.string().optional(),
      }),
      execute(input, context, details) {
        return recordPatchFragmentTool(rialtoContext(context), details, 'quoteComparison.proposeCellEdits', input, proposeQuoteComparisonCellEdits(input))
      },
    }),
    tool({
      name: 'quoteComparison_proposeSheetStructureEdits',
      description: 'Return a patch fragment for sheet structure edits such as hiding, showing, deleting, sorting, filtering rows, or renaming columns. Does not commit changes.',
      parameters: z.object({
        operations: z.array(z.union([
          z.object({ kind: z.enum(['hide-column', 'delete-column', 'show-column']), colKey: z.string() }),
          z.object({ kind: z.enum(['hide-row', 'delete-row', 'show-row']), rowKey: z.string() }),
          z.object({ kind: z.literal('set-column-label'), colKey: z.string(), label: z.string() }),
          z.object({ kind: z.literal('sort-rows'), colKey: z.string(), direction: z.enum(['asc', 'desc']) }),
          z.object({ kind: z.literal('filter-blank-rows'), colKey: z.string() }),
        ])),
        summary: z.string().optional(),
      }),
      execute(input, context, details) {
        return recordPatchFragmentTool(rialtoContext(context), details, 'quoteComparison.proposeSheetStructureEdits', input, proposeQuoteComparisonSheetStructureEdits(input))
      },
    }),
    tool({
      name: 'quoteComparison_proposeDeletions',
      description: 'Return a patch fragment for deterministic Quote Comparison deletion commands: delete columns, delete rows, and delete selected cell contents. Cell deletion clears cell contents. Does not commit changes.',
      parameters: z.object({
        columns: z.array(z.object({ colKey: z.string() })).optional(),
        rows: z.array(z.object({ rowKey: z.string() })).optional(),
        cells: z.array(z.object({ rowKey: z.string(), colKey: z.string() })).optional(),
        summary: z.string().optional(),
      }),
      execute(input, context, details) {
        return recordPatchFragmentTool(rialtoContext(context), details, 'quoteComparison.proposeDeletions', input, proposeQuoteComparisonDeletions(input))
      },
    }),
    tool({
      name: 'quoteComparison_proposeBulkNumericEdit',
      description: 'Return a patch fragment for applying the same numeric adjustment to a visible numeric column, optionally updating a dependent total by multiplying the adjusted number by quantity. Does not commit changes.',
      parameters: z.object({
        colKey: z.string(),
        amount: z.number(),
        dependentColKey: z.string().optional(),
        dependentFormula: z.enum(['multiply-by-quantity']).optional(),
        summary: z.string().optional(),
      }),
      execute(input, context, details) {
        return recordPatchFragmentTool(
          rialtoContext(context),
          details,
          'quoteComparison.proposeBulkNumericEdit',
          input,
          proposeQuoteComparisonBulkNumericEdit(quoteComparisonToolContext(rialtoContext(context)?.context), input),
        )
      },
    }),
    tool({
      name: 'quoteComparison_proposeConvertedQuantityColumn',
      description: 'Return a patch fragment that inserts a converted quantity column and fills it from the visible quantity column, e.g. Qty in hundreds linear ft / hLF or Qty in thousands linear ft / kLF. Use divisor 100 for hundreds and 1000 for thousands. Use for requests like "add a Qty column in hundreds linear ft and apply the Qty data." Does not commit changes.',
      parameters: z.object({
        sourceColKey: z.string().optional(),
        colKey: z.string().optional(),
        label: z.string().optional(),
        afterColKey: z.string().optional(),
        divisor: z.number().optional(),
        summary: z.string().optional(),
      }),
      execute(input, context, details) {
        return recordPatchFragmentTool(
          rialtoContext(context),
          details,
          'quoteComparison.proposeConvertedQuantityColumn',
          input,
          proposeQuoteComparisonConvertedQuantityColumn(quoteComparisonToolContext(rialtoContext(context)?.context), input),
        )
      },
    }),
    tool({
      name: 'quoteComparison_proposeDerivedColumns',
      description: 'Return a patch fragment for adding derived comparison columns or formulas. Does not commit changes.',
      parameters: z.object({
        columns: z.array(z.object({
          colKey: z.string(),
          label: z.string(),
          formula: z.string(),
          afterColKey: z.string().optional(),
          beforeColKey: z.string().optional(),
        })),
        summary: z.string().optional(),
      }),
      execute(input, context, details) {
        return recordPatchFragmentTool(rialtoContext(context), details, 'quoteComparison.proposeDerivedColumns', input, proposeQuoteComparisonDerivedColumns(input))
      },
    }),
    tool({
      name: 'quoteComparison_proposeSelectionState',
      description: 'Return a patch fragment for marking Quote Comparison row selection state, such as selected vendor, no-award, deferred, or out-of-scope. Does not trigger external follow-up.',
      parameters: z.object({
        selections: z.array(z.object({
          rowKey: z.string(),
          state: z.enum(['selected-vendor', 'no-award', 'deferred', 'out-of-scope']),
          vendorId: z.string().optional(),
          reason: z.string().optional(),
        })),
        summary: z.string().optional(),
      }),
      execute(input, context, details) {
        return recordPatchFragmentTool(rialtoContext(context), details, 'quoteComparison.proposeSelectionState', input, proposeQuoteComparisonSelectionState(input))
      },
    }),
    tool({
      name: 'document_readSource',
      description: 'Read provided source text or extracted document text for later product-module interpretation. Generic read-only document tool for this first slice.',
      parameters: z.object({ sourceId: z.string().optional(), text: z.string() }),
      execute(input, context, details) {
        return recordTool(rialtoContext(context), details, 'document.readSource', { sourceId: input.sourceId }, {
          action: 'document-read',
          sourceId: input.sourceId,
          text: input.text,
        })
      },
    }),
    tool({
      name: 'quoteComparison_proposeDocumentGroundedEdits',
      description: 'Return a patch fragment for filling sheet cells from document-grounded extracted facts. Include provenance notes. Does not commit changes.',
      parameters: z.object({
        sourceId: z.string().optional(),
        edits: z.array(z.object({
          rowKey: z.string(),
          colKey: z.string(),
          value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
          evidence: z.string(),
        })),
        summary: z.string().optional(),
      }),
      execute(input, context, details) {
        return recordPatchFragmentTool(rialtoContext(context), details, 'quoteComparison.proposeDocumentGroundedEdits', input, {
          summary: input.summary ?? `Prepared ${input.edits.length} document-grounded edit${input.edits.length === 1 ? '' : 's'}.`,
          operations: input.edits.map((edit) => ({
            kind: 'set-cell' as const,
            rowKey: edit.rowKey,
            colKey: edit.colKey,
            value: edit.value,
            note: edit.evidence,
          })),
          provenanceNotes: input.edits.map((edit) => ({
            rowKey: edit.rowKey,
            colKey: edit.colKey,
            sourceId: input.sourceId,
            note: edit.evidence,
          })),
        })
      },
    }),
  ]
}

function rialtoContext(context: RunContext<unknown> | undefined): RunContext<RialtoRunContext> | undefined {
  return context as RunContext<RialtoRunContext> | undefined
}

function recordTool(
  context: RunContext<RialtoRunContext> | undefined,
  details: ToolCallDetails | undefined,
  toolId: string,
  input: unknown,
  data: unknown,
) {
  const callId = details?.toolCall?.callId ?? `call-${context?.context.toolCalls.length ?? 0}`
  context?.context.toolCalls.push({ id: callId, toolId, input })
  context?.context.toolResults.push({
    callId,
    toolId,
    status: 'ok',
    summary: toolSummary(toolId),
    data,
  })
  return data
}

function recordPatchFragmentTool(
  context: RunContext<RialtoRunContext> | undefined,
  details: ToolCallDetails | undefined,
  toolId: string,
  input: unknown,
  fragment: ComparisonPatchFragment,
) {
  return recordTool(context, details, toolId, input, {
    action: 'comparison-patch-fragment',
    fragment,
  })
}

function toolSummary(toolId: string) {
  if (toolId.includes('propose')) return 'Prepared a Quote Comparison patch fragment.'
  if (toolId.includes('inspect')) return 'Inspected the Comparison Sheet Snapshot.'
  if (toolId.includes('answer')) return 'Answered a read-only sheet question.'
  if (toolId.includes('document')) return 'Read document source text.'
  return 'Tool completed.'
}

function quoteComparisonToolContext(context: RialtoRunContext | undefined) {
  return {
    snapshot: context?.requestContext?.quoteComparison?.snapshot,
    sheetSchema: context?.requestContext?.quoteComparison?.sheetSchema,
  }
}
