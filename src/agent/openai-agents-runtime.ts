import { Agent, Runner, setTracingDisabled, tool, type RunContext } from '@openai/agents'
import { setDefaultOpenAIClient } from '@openai/agents-openai'
import { OpenAI } from 'openai'
import { z } from 'zod'
import type { ProductAgentRuntime, ProductAgentRuntimeRequest, ProductAgentRuntimeResult } from './core.js'
import type { AgentToolCall, ComparisonPatchFragment, ToolResult } from '../domain/types.js'
import { createOpenAIResilientFetch } from './openai-resilient-fetch.js'
import { SpreadsheetOperationRuntime } from './spreadsheet-operation-runtime.js'
import {
  analyzeQuoteComparisonWork,
  answerQuoteComparisonQuestion,
  inspectQuoteComparisonSnapshot,
  proposeQuoteComparisonBulkNumericEdit,
  proposeQuoteComparisonCellEdits,
  proposeQuoteComparisonConvertedQuantityColumn,
  proposeQuoteComparisonDeletions,
  proposeQuoteComparisonDerivedColumns,
  proposeQuoteComparisonHighlights,
  proposeQuoteComparisonLowestTotalPriceColumn,
  proposeQuoteComparisonSelectionState,
  proposeQuoteComparisonSheetStructureEdits,
  proposeQuoteComparisonSort,
} from '../tools/quote-comparison-agent-tools.js'
import {
  analyzeWorkbookAnomalies,
  applyWorkbookPatch,
  computeBasicStats,
  createWorkbookPatch,
  detectMissingQuotes,
  detectPriceOutliers,
  findLowestValidQuote,
  getWorkbookOverview,
  queryTable,
  readRange,
  recommendVendor,
  rollbackWorkbookPatch,
  workbookFromQuoteComparisonSnapshot,
  type WorkbookPatch,
  type WorkbookModel,
} from '../tools/workbook-agent.js'

const AgentFinalOutput = z.object({
  status: z.enum(['completed', 'needs_clarification', 'blocked', 'tool_error']),
  reply: z.string(),
  plan: z.array(z.string()).nullable().optional(),
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
  workbook?: WorkbookModel
}

type ToolCallDetails = { toolCall?: { callId: string } }

export class OpenAIAgentsProductRuntime implements ProductAgentRuntime {
  private readonly runner: Runner
  private readonly agent: Agent<unknown, typeof AgentFinalOutput>
  private readonly operationRuntime = new SpreadsheetOperationRuntime()

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
        'When sheet state matters, inspect it first with quoteComparison_inspectSnapshot before calling a proposal or answer tool.',
        'For broad, ambiguous, multi-step, recommendation, cleanup, leveling, or best-choice requests, inspect the sheet and call quoteComparison_analyzeWork before choosing whether to answer, ask for clarification, or propose edits.',
        'Use quoteComparison_proposeDeletions for delete row, delete column, and delete selected cell contents requests.',
        'Use bulk, derived-column, structure, and selection-state tools when those operations match the request instead of emitting many tiny unrelated edits.',
        'Use quoteComparison_proposeConvertedQuantityColumn for requests to add a Qty/quantity column converted into hundreds or thousands of linear feet, hLF, kLF, or similar visible quantity unit conversions. Use divisor 100 for hundreds and 1000 for thousands.',
        'Use quoteComparison_proposeLowestTotalPriceColumn for requests that ask for the lowest total price data to be added, filled, copied, or placed into the sheet.',
        'Use quoteComparison_proposeDerivedColumns for requests to add calculated columns such as normalized price, unit price per 1k, recommendation, or summary columns.',
        'Use quoteComparison_proposeHighlights with lowest-price-per-row for cheapest-valid quote highlighting and missing-lead-times for missing lead time review.',
        'Use quoteComparison_proposeSort for Excel-like row sorting requests. It maps text sort to Sort A to Z / Sort Z to A and numeric sort to Sort Smallest to Largest / Sort Largest to Smallest.',
        'Use workbook tools for uploaded or spreadsheet-shaped Quote Comparison work that needs workbook overview, range reads, query-like filtering, missing quote detection, partial-vs-total quote reasoning, recommendations, or JSON patch preview metadata.',
        'When the user wants to add, import, merge, or place an attached Excel vendor response into the current comparison, call quoteComparison_mergeAttachedVendorWorkbook. The user may phrase this vaguely, such as "add in this vendor"; use the attached workbook and current sheet context.',
        'If there is exactly one Excel attachment in Quote Comparison context and the user says to bring, add, import, merge, fill, place, or use "this" quote/vendor/bid/response/spreadsheet/file in the comparison, call quoteComparison_mergeAttachedVendorWorkbook instead of asking what they mean.',
        'Do not ask which vendor/quote/spreadsheet to use when there is exactly one Excel attachment. Let quoteComparison_mergeAttachedVendorWorkbook inspect the workbook and either prepare a proposal or return a precise clarification/blocker if identity or row matching is unsafe.',
        'For vendor-response workbook merges, do not infer vendor identity from a noisy filename when the workbook itself provides a vendor/supplier/company name. Pass vendorName only when the user explicitly names the vendor.',
        'If Request Context includes quoteComparison.pendingProposal or pendingPreviewPatch, it is an unapplied yellow preview, not committed sheet state. Treat follow-up prompts like "fix it", "move it", "instead", or "that proposal" as requests to revise and replace that pending proposal while using current sheet state and any still-attached files as source context.',
        'When revising a pending Quote Comparison proposal, return a fresh complete proposal that represents the desired final preview. Do not return only a delta unless the user explicitly asks for an additional separate change.',
        'Use workbook_analyzeAnomalies for broad prompts like "what is weird", "find issues", outliers, unit mismatches, missing quotes, or suspicious totals.',
        'Use workbook_computeBasicStats and workbook_detectPriceOutliers for numeric/statistical spreadsheet questions.',
        'The workbook tools are deterministic and maintain audit/verification metadata. Do not invent workbook mutations outside those tools.',
        'For missing lead time requests that also ask for notes, combine quoteComparison_proposeHighlights with quoteComparison_proposeCellEdits for the note cells.',
        'For broad read-only prompts such as "Compare the quotes", answer analytically with quoteComparison_answerSheetQuestion and do not create a proposal.',
        'For ambiguous edit prompts such as "Make this cleaner" or "Pick the best quote", inspect the sheet if relevant, then return needs_clarification with one concise question.',
        'Never return completed for a Quote Comparison sheet edit unless you have called at least one quoteComparison proposal tool.',
        'When ambiguity affects material correctness, return needs_clarification with one concise question.',
        'When a request is outside the v1 product boundary, return blocked with a clear reason.',
        'Return the structured output schema exactly.',
      ].join('\n'),
      outputType: AgentFinalOutput,
      tools: quoteComparisonTools(this.operationRuntime),
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
      plan: output.plan ?? undefined,
      toolCalls: runContext.toolCalls,
      toolResults: runContext.toolResults,
    }
  }
}

function quoteComparisonTools(operationRuntime: SpreadsheetOperationRuntime) {
  const cellValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()])
  const workbookOperationSchema = z.union([
    z.object({ op: z.literal('add_column'), sheet: z.string(), after: z.string().optional(), before: z.string().optional(), name: z.string(), values: z.array(cellValueSchema).optional() }),
    z.object({ op: z.literal('delete_column'), sheet: z.string(), column: z.string() }),
    z.object({ op: z.literal('rename_column'), sheet: z.string(), column: z.string(), name: z.string() }),
    z.object({ op: z.literal('set_cell'), sheet: z.string(), row: z.number(), column: z.string(), value: cellValueSchema }),
    z.object({ op: z.literal('set_range_values'), sheet: z.string(), column: z.string(), startRow: z.number(), values: z.array(cellValueSchema) }),
    z.object({ op: z.literal('set_range_formula'), sheet: z.string(), column: z.string(), startRow: z.number(), formulas: z.array(z.string()) }),
    z.object({ op: z.literal('highlight_cells'), sheet: z.string(), cells: z.array(z.object({ row: z.number(), column: z.string() })), color: z.string(), note: z.string().optional() }),
    z.object({ op: z.literal('format_cells'), sheet: z.string(), column: z.string(), format: z.enum(['currency', 'number', 'text']) }),
    z.object({ op: z.literal('create_summary_sheet'), sheet: z.string(), name: z.string(), rows: z.array(z.array(cellValueSchema)) }),
  ])
  const workbookPatchSchema = z.object({
    patch_id: z.string(),
    summary: z.string(),
    risk_level: z.enum(['safe', 'medium', 'destructive']),
    requires_approval: z.boolean(),
    operations: z.array(workbookOperationSchema),
    preview: z.object({
      changed_cells: z.number(),
      sample_before_after: z.array(z.object({
        sheet: z.string(),
        row: z.number().optional(),
        column: z.string().optional(),
        before: z.union([cellValueSchema, z.record(z.string(), cellValueSchema)]).optional(),
        after: z.union([cellValueSchema, z.record(z.string(), cellValueSchema)]).optional(),
      })),
      warnings: z.array(z.string()),
    }),
    verification: z.object({
      ok: z.boolean(),
      checks: z.array(z.object({ id: z.string(), ok: z.boolean(), message: z.string() })),
    }),
  })
  return [
    tool({
      name: 'workbook_getOverview',
      description: 'Inspect the current workbook/sheet context and return sheet counts, dimensions, and detected tables. Read-only deterministic workbook tool.',
      parameters: z.object({}),
      execute(_input, context, details) {
        const runContext = rialtoContext(context)
        return recordTool(runContext, details, 'workbook.getOverview', {}, getWorkbookOverview(workbookToolContext(runContext?.context)))
      },
    }),
    tool({
      name: 'workbook_readRange',
      description: 'Read an A1 range from the current workbook context, e.g. A1:D10. Read-only deterministic workbook tool.',
      parameters: z.object({ sheet: z.string(), range: z.string() }),
      execute(input, context, details) {
        const runContext = rialtoContext(context)
        return recordTool(runContext, details, 'workbook.readRange', input, {
          action: 'workbook-range-read',
          values: readRange(workbookToolContext(runContext?.context), input.sheet, input.range),
        })
      },
    }),
    tool({
      name: 'workbook_queryTable',
      description: 'Run a deterministic table query over the current workbook context. Supports select, simple where clauses, orderBy, and limit. Use instead of free-form code.',
      parameters: z.object({
        sheet: z.string(),
        select: z.array(z.string()).optional(),
        where: z.array(z.object({
          column: z.string(),
          op: z.enum(['=', '!=', 'contains', 'not_blank', 'blank']),
          value: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
        })).optional(),
        orderBy: z.object({ column: z.string(), direction: z.enum(['asc', 'desc']) }).optional(),
        limit: z.number().optional(),
      }),
      execute(input, context, details) {
        const runContext = rialtoContext(context)
        return recordTool(runContext, details, 'workbook.queryTable', input, {
          action: 'workbook-query-result',
          ...queryTable(workbookToolContext(runContext?.context), input),
        })
      },
    }),
    tool({
      name: 'workbook_findLowestValidQuote',
      description: 'Find the lowest valid quote per requested RFQ line item, with options to exclude package/total quote rows and require lead times. Read-only deterministic quote tool.',
      parameters: z.object({
        sheet: z.string(),
        items: z.array(z.string()).optional(),
        excludeTotalQuotes: z.boolean().optional(),
        requireLeadTime: z.boolean().optional(),
        excludeExclusions: z.boolean().optional(),
      }),
      execute(input, context, details) {
        const runContext = rialtoContext(context)
        return recordTool(runContext, details, 'workbook.findLowestValidQuote', input, {
          action: 'quote-analysis',
          results: findLowestValidQuote(workbookToolContext(runContext?.context), input),
        })
      },
    }),
    tool({
      name: 'workbook_detectMissingQuotes',
      description: 'Detect blank, TBD, N/A, or no-bid vendor quote values by line item. Read-only deterministic quote tool.',
      parameters: z.object({ sheet: z.string() }),
      execute(input, context, details) {
        const runContext = rialtoContext(context)
        return recordTool(runContext, details, 'workbook.detectMissingQuotes', input, {
          action: 'missing-quotes',
          missingQuotes: detectMissingQuotes(workbookToolContext(runContext?.context), input.sheet),
        })
      },
    }),
    tool({
      name: 'workbook_computeBasicStats',
      description: 'Compute deterministic count, sum, min, max, mean, and median for a numeric/currency workbook column. Read-only.',
      parameters: z.object({ sheet: z.string(), column: z.string() }),
      execute(input, context, details) {
        const runContext = rialtoContext(context)
        return recordTool(runContext, details, 'workbook.computeBasicStats', input, {
          action: 'workbook-basic-stats',
          stats: computeBasicStats(workbookToolContext(runContext?.context), input),
        })
      },
    }),
    tool({
      name: 'workbook_detectPriceOutliers',
      description: 'Detect vendor price cells materially above the row median. Read-only deterministic quote-analysis tool.',
      parameters: z.object({ sheet: z.string(), percentAboveMedian: z.number().optional() }),
      execute(input, context, details) {
        const runContext = rialtoContext(context)
        return recordTool(runContext, details, 'workbook.detectPriceOutliers', input, {
          action: 'price-outliers',
          outliers: detectPriceOutliers(workbookToolContext(runContext?.context), input),
        })
      },
    }),
    tool({
      name: 'workbook_analyzeAnomalies',
      description: 'Return a deterministic anomaly report for RFQ spreadsheets: missing quotes, price outliers, unit mismatches, total/package rows, and ambiguous vendor columns. Read-only.',
      parameters: z.object({
        sheet: z.string(),
        expectedUnits: z.array(z.string()).optional(),
        outlierPercentAboveMedian: z.number().optional(),
      }),
      execute(input, context, details) {
        const runContext = rialtoContext(context)
        return recordTool(runContext, details, 'workbook.analyzeAnomalies', input, {
          action: 'workbook-anomaly-report',
          report: analyzeWorkbookAnomalies(workbookToolContext(runContext?.context), input),
        })
      },
    }),
    tool({
      name: 'workbook_recommendVendor',
      description: 'Recommend a vendor per line item by lowest valid quote, optionally ignoring vendors with missing lead times and excluding package/total quote rows. Read-only deterministic quote tool.',
      parameters: z.object({
        sheet: z.string(),
        ignoreMissingLeadTimes: z.boolean().optional(),
        excludeTotalQuotes: z.boolean().optional(),
      }),
      execute(input, context, details) {
        const runContext = rialtoContext(context)
        return recordTool(runContext, details, 'workbook.recommendVendor', input, {
          action: 'vendor-recommendations',
          recommendations: recommendVendor(workbookToolContext(runContext?.context), input),
        })
      },
    }),
    tool({
      name: 'workbook_createPatchPreview',
      description: 'Create a deterministic JSON workbook patch preview with risk, approval, sample before/after, verification, and audit metadata. This does not apply changes.',
      parameters: z.object({
        summary: z.string(),
        operations: z.array(workbookOperationSchema),
      }),
      execute(input, context, details) {
        const runContext = rialtoContext(context)
        return recordTool(runContext, details, 'workbook.createPatchPreview', input, {
          action: 'workbook-patch-preview',
          patch: createWorkbookPatch(workbookToolContext(runContext?.context), input),
        })
      },
    }),
    tool({
      name: 'workbook_applyPatch',
      description: 'Apply an approved deterministic workbook JSON patch to the current in-turn workbook session, then return verification and audit metadata. Do not call unless the patch is approved or does not require approval.',
      parameters: z.object({
        patch: workbookPatchSchema,
        approved: z.boolean(),
      }),
      execute(input, context, details) {
        const runContext = rialtoContext(context)
        const result = applyWorkbookPatch(workbookToolContext(runContext?.context), input.patch as WorkbookPatch, { approved: input.approved })
        return recordTool(runContext, details, 'workbook.applyPatch', { patch_id: input.patch.patch_id, approved: input.approved }, {
          action: 'workbook-patch-applied',
          verification: result.verification,
          auditLog: result.workbook.auditLog,
          versions: result.workbook.versions.map((version) => ({ id: version.id, summary: version.summary, sourcePatchId: version.sourcePatchId })),
        })
      },
    }),
    tool({
      name: 'workbook_rollbackPatch',
      description: 'Rollback an applied workbook patch in the current in-turn workbook session by restoring the prior workbook version and appending rollback audit/version history.',
      parameters: z.object({ patch_id: z.string() }),
      execute(input, context, details) {
        const runContext = rialtoContext(context)
        const workbook = rollbackWorkbookPatch(workbookToolContext(runContext?.context), input.patch_id)
        return recordTool(runContext, details, 'workbook.rollbackPatch', input, {
          action: 'workbook-patch-rolled-back',
          auditLog: workbook.auditLog,
          versions: workbook.versions.map((version) => ({ id: version.id, summary: version.summary, sourcePatchId: version.sourcePatchId })),
        })
      },
    }),
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
      name: 'quoteComparison_mergeAttachedVendorWorkbook',
      description: [
        'Merge an attached Excel vendor-response workbook into the current Quote Comparison Sheet and return one previewable Comparison Patch Proposal fragment.',
        'Use when the user asks to add/import/merge/fill/place/bring/use an attached vendor, quote, bid, response, workbook, spreadsheet, file, or Excel file into the comparison.',
        'Also use this for deictic requests like "add in this vendor", "bring this quote into the comparison", or "add the attached spreadsheet as the new vendor bid" when exactly one Excel attachment is present.',
        'This tool performs typed planning, workbook inspection, vendor identity extraction, row matching, conflict detection, patch creation, and verification.',
        'Pass vendorName only when the user explicitly names the vendor in the prompt. For vague prompts like "add in this vendor", omit vendorName so workbook evidence can determine identity.',
      ].join(' '),
      parameters: z.object({
        attachmentId: z.string().optional(),
        workbookId: z.string().optional(),
        vendorName: z.string().optional(),
      }),
      async execute(input, context, details) {
        const runContext = rialtoContext(context)
        if (!runContext) {
          return {
            status: 'tool_error',
            reply: 'Runtime context was unavailable for the vendor workbook merge.',
            reason: 'Missing Rialto run context.',
          }
        }
        const result = await operationRuntime.runVendorWorkbookMerge(runContext.context, {
          attachmentId: input.attachmentId,
          workbookId: input.workbookId,
          explicitVendorName: input.vendorName,
        })
        return recordOperationRuntimeResult(runContext, details, 'quoteComparison.mergeAttachedVendorWorkbook', input, result)
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
      name: 'quoteComparison_analyzeWork',
      description: 'Read-only planning aid for Quote Comparison requests. Classifies whether the current prompt is simple or needs planning, summarizes sheet risk signals, and recommends next tool families before broad or ambiguous work.',
      parameters: z.object({ prompt: z.string() }),
      execute(input, context, details) {
        const runContext = rialtoContext(context)
        return recordTool(runContext, details, 'quoteComparison.analyzeWork', input, analyzeQuoteComparisonWork(quoteComparisonToolContext(runContext?.context), input))
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
      name: 'quoteComparison_proposeSort',
      description: 'Return a patch fragment for Excel-like row sorting by one visible column. Use text labels Sort A to Z / Sort Z to A and numeric labels Sort Smallest to Largest / Sort Largest to Smallest. Does not commit changes.',
      parameters: z.object({
        colKey: z.string(),
        direction: z.enum(['asc', 'desc']),
        valueKind: z.enum(['text', 'number', 'date', 'auto']).optional(),
        summary: z.string().optional(),
      }),
      execute(input, context, details) {
        return recordPatchFragmentTool(rialtoContext(context), details, 'quoteComparison.proposeSort', input, proposeQuoteComparisonSort(input))
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
      name: 'quoteComparison_proposeLowestTotalPriceColumn',
      description: 'Return a patch fragment that inserts a Lowest Total Price column and fills each visible row with the lowest visible vendor total. Use when the user asks to add lowest total price data into the sheet. Does not commit changes.',
      parameters: z.object({
        colKey: z.string().optional(),
        label: z.string().optional(),
        afterColKey: z.string().optional(),
        summary: z.string().optional(),
      }),
      execute(input, context, details) {
        return recordPatchFragmentTool(
          rialtoContext(context),
          details,
          'quoteComparison.proposeLowestTotalPriceColumn',
          input,
          proposeQuoteComparisonLowestTotalPriceColumn(quoteComparisonToolContext(rialtoContext(context)?.context), input),
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

function recordOperationRuntimeResult(
  context: RunContext<RialtoRunContext>,
  details: ToolCallDetails | undefined,
  toolId: string,
  input: unknown,
  result: ProductAgentRuntimeResult & { handled?: boolean },
) {
  const callId = details?.toolCall?.callId ?? `call-${context.context.toolCalls.length}`
  context.context.toolCalls.push({ id: callId, toolId, input })
  const status: ToolResult['status'] = result.status === 'tool_error'
    ? 'error'
    : result.status === 'needs_clarification' || result.status === 'blocked'
      ? 'needs-user-action'
      : 'ok'
  context.context.toolResults.push({
    callId,
    toolId,
    status,
    summary: result.reply,
    data: {
      action: 'spreadsheet-operation-result',
      status: result.status,
      reply: result.reply,
      reason: 'reason' in result ? result.reason : undefined,
      clarification: 'clarification' in result ? result.clarification : undefined,
      operationPlan: result.operationPlan,
      observations: result.observations,
      verification: result.verification,
    },
  })
  for (const nestedCall of result.toolCalls ?? []) context.context.toolCalls.push(nestedCall)
  for (const nestedResult of result.toolResults ?? []) context.context.toolResults.push(nestedResult)
  context.context.onProgress?.({
    type: 'tool_result',
    toolId,
    status,
    message: result.reply,
  })
  return {
    status: result.status,
    reply: result.reply,
    reason: 'reason' in result ? result.reason : undefined,
    clarification: 'clarification' in result ? result.clarification : undefined,
    operationPlan: result.operationPlan,
    observations: result.observations,
    verification: result.verification,
    patchPrepared: Boolean((result.toolResults ?? []).some((toolResult) => (
      toolResult.data
      && typeof toolResult.data === 'object'
      && (toolResult.data as { action?: unknown }).action === 'comparison-patch-fragment'
    ))),
  }
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
  context?.context.onProgress?.({
    type: 'tool_result',
    toolId,
    status: 'ok',
    message: `Runtime tool completed: ${toolSummary(toolId)} (${toolId})`,
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

function workbookToolContext(context: RialtoRunContext | undefined): WorkbookModel {
  if (context?.workbook) return context.workbook
  const snapshot = context?.requestContext?.quoteComparison?.snapshot
  if (snapshot) {
    const workbook = workbookFromQuoteComparisonSnapshot({
      id: context?.requestId ?? 'quote-comparison-workbook',
      snapshot,
      now: '2026-05-12T00:00:00.000Z',
    })
    if (context) context.workbook = workbook
    return workbook
  }
  const workbook = workbookFromQuoteComparisonSnapshot({
    id: context?.requestId ?? 'empty-workbook',
    snapshot: { columns: [], rows: [] },
    now: '2026-05-12T00:00:00.000Z',
  })
  if (context) context.workbook = workbook
  return workbook
}
