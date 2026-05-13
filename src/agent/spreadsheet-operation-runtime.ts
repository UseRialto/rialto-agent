import type {
  AgentToolCall,
  ComparisonPatchFragment,
  SpreadsheetObservation,
  SpreadsheetOperationPlan,
  SpreadsheetVerificationReport,
  ToolResult,
} from '../domain/types.js'
import type { ProductAgentRuntimeRequest, ProductAgentRuntimeResult } from './core.js'
import { getUploadedWorkbook } from './workbook-attachments.js'
import {
  createVendorMergePatch,
  extractVendorResponseFromWorkbook,
  matchVendorRowsToComparisonItems,
  type ExtractedVendorResponse,
  type VendorMergeDecisionReport,
} from '../tools/vendor-response-merge.js'

export type SpreadsheetOperationRuntimeResult = ProductAgentRuntimeResult & { handled: boolean }

export class SpreadsheetOperationRuntime {
  async runOperation(request: ProductAgentRuntimeRequest): Promise<SpreadsheetOperationRuntimeResult> {
    const latestMessage = request.messages.at(-1)?.content ?? ''
    const attachment = request.requestContext?.quoteComparison?.attachments?.find((candidate) => candidate.sourceKind === 'excel' && candidate.workbookId)
    if (!isFileMergeRequest(latestMessage, Boolean(attachment?.workbookId)) || !attachment?.workbookId) {
      return { handled: false, status: 'blocked', reply: 'No spreadsheet operation matched this request.', reason: 'Operation runtime did not handle this turn.' }
    }

    return this.runVendorWorkbookMerge(request, {
      workbookId: attachment.workbookId,
      explicitVendorName: vendorNameHintFromRequest(latestMessage),
    })
  }

  async runVendorWorkbookMerge(request: ProductAgentRuntimeRequest, input: {
    attachmentId?: string
    workbookId?: string
    explicitVendorName?: string
  } = {}): Promise<SpreadsheetOperationRuntimeResult> {
    const latestMessage = request.messages.at(-1)?.content ?? ''
    const attachment = request.requestContext?.quoteComparison?.attachments?.find((candidate) => (
      candidate.sourceKind === 'excel'
      && candidate.workbookId
      && (!input.workbookId || candidate.workbookId === input.workbookId)
      && (!input.attachmentId || candidate.id === input.attachmentId)
    )) ?? request.requestContext?.quoteComparison?.attachments?.find((candidate) => candidate.sourceKind === 'excel' && candidate.workbookId)

    if (!attachment?.workbookId) {
      return {
        handled: true,
        status: 'needs_clarification',
        reply: 'I need an attached Excel workbook before I can merge a vendor response into the comparison.',
        clarification: {
          question: 'Which Excel workbook should I merge into the current comparison?',
        },
      }
    }

    const uploaded = getUploadedWorkbook(attachment.workbookId)
    if (!uploaded) {
      return {
        handled: true,
        status: 'blocked',
        reply: 'I could not load the attached workbook. Please upload it again and retry the merge.',
        reason: `Unknown uploaded workbook id ${attachment.workbookId}.`,
      }
    }

    const explicitVendorNameHint = explicitVendorNameFromTool(input.explicitVendorName) ?? vendorNameHintFromRequest(latestMessage)
    const vendorNameHint = explicitVendorNameHint ?? vendorNameHintFromFilename(attachment.filename)
    const plan = buildVendorMergePlan({
      userRequest: latestMessage,
      targetWorkbookId: String(request.requestContext?.quoteComparison?.snapshot && 'current-comparison'),
      workbookId: attachment.workbookId,
      vendorNameHint,
    })
    const validation = validateSpreadsheetOperationPlan(plan)
    if (!validation.ok) {
      return {
        handled: true,
        status: 'blocked',
        reply: 'I blocked the spreadsheet operation because its plan was unsafe.',
        reason: validation.errors.join(' '),
        operationPlan: plan,
        verification: { ok: false, checks: validation.errors.map((message, index) => ({ id: `plan-${index + 1}`, ok: false, message })), warnings: validation.errors },
      }
    }

    const toolCalls: AgentToolCall[] = []
    const toolResults: ToolResult[] = []
    const observations: SpreadsheetObservation[] = []
    const addObservation = (stepId: string, toolName: string, data: unknown, summary: string, warnings: string[] = [], requiresUserAction = false) => {
      const status = warnings.length ? 'warning' : 'ok'
      const toolStatus = requiresUserAction ? 'needs-user-action' : 'ok'
      const observation: SpreadsheetObservation = { stepId, toolName, status, summary, data, warnings }
      observations.push(observation)
      const callId = `op-${observations.length}`
      toolCalls.push({ id: callId, toolId: toolName, input: plan.steps.find((step) => step.id === stepId)?.toolInput ?? {} })
      toolResults.push({ callId, toolId: toolName, status: toolStatus, summary, data })
      request.onProgress?.({ type: 'tool_result', toolId: toolName, status: toolStatus, message: summary })
    }

    addObservation('inspect-current', 'load_current_comparison_workbook', request.requestContext?.quoteComparison?.snapshot, 'Inspected the current Comparison Sheet snapshot.')
    addObservation('inspect-attachment', 'load_uploaded_workbook', uploaded.summary, `Loaded attached workbook ${attachment.filename}.`)

    const response = extractVendorResponseFromWorkbook({
      workbook: uploaded.workbook,
      filename: attachment.filename,
      vendorNameHint: explicitVendorNameHint,
    })
    addObservation('extract-response', 'extract_vendor_response_from_workbook', response, vendorExtractionSummary(response), response.warnings)

    if (!response.vendorName || response.confidence < 0.7) {
      return {
        handled: true,
        status: 'needs_clarification',
        reply: 'I need the vendor name before I can safely merge this workbook.',
        clarification: {
          question: 'Which vendor should I use for the attached workbook response?',
          choices: attachment.filename ? [{ id: 'filename', label: vendorNameHintFromFilename(attachment.filename) ?? attachment.filename }] : undefined,
        },
        operationPlan: { ...plan, mode: 'needs_clarification', clarification: { question: 'Which vendor should I use for the attached workbook response?', blockingReason: 'Vendor identity confidence is below the safe merge threshold.' } },
        observations,
        toolCalls,
        toolResults,
      }
    }

    const report = matchVendorRowsToComparisonItems({
      snapshot: snapshotObject(request),
      response,
    })
    addObservation('map-rows', 'match_vendor_rows_to_comparison_items', report, rowMatchSummary(report), report.warnings, report.ambiguousMatches.length > 0)

    if (response.lineItems.length > 0 && report.matches.length === 0) {
      const reason = `0 uploaded rows matched the current comparison; ${report.unmatchedSourceRows.length} uploaded row${report.unmatchedSourceRows.length === 1 ? '' : 's'} unmatched.`
      return {
        handled: true,
        status: 'blocked',
        reply: 'I could not safely merge this workbook because none of the uploaded quote rows matched the current comparison lines. Please check that the base comparison matches this test scenario, or tell me which uploaded rows map to which line items.',
        reason,
        operationPlan: { ...plan, mode: 'blocked', clarification: { question: 'Which uploaded rows should map to the current comparison line items?', blockingReason: reason } },
        observations,
        verification: {
          ok: false,
          checks: [{ id: 'matched-source-rows', ok: false, message: reason }],
          warnings: report.warnings,
        },
        toolCalls,
        toolResults,
      }
    }

    const patch = createVendorMergePatch({
      snapshot: snapshotObject(request),
      response,
      report,
    })
    addObservation('detect-conflicts', 'detect_conflicting_existing_values', patch.report.conflicts, conflictSummary(patch.report), patch.report.conflicts.length ? [`${patch.report.conflicts.length} overwrite conflict${patch.report.conflicts.length === 1 ? '' : 's'} detected.`] : [], patch.report.conflicts.length > 0)
    addObservation('create-patch', 'create_vendor_merge_patch', patch.fragment, patch.fragment.summary, patch.fragment.warnings ?? [])
    addObservation('verify-patch', 'verify_vendor_merge_patch', patch.verification, verificationSummary(patch.verification), patch.verification.warnings, !patch.verification.ok)

    toolResults.push({
      callId: `op-${observations.length + 1}`,
      toolId: 'quoteComparison.createVendorMergePatch',
      status: 'ok',
      summary: patch.fragment.summary,
      data: { action: 'comparison-patch-fragment', fragment: patch.fragment },
    })

    return {
      handled: true,
      status: 'completed',
      reply: patch.fragment.summary,
      plan: plan.steps.map((step) => step.expectedObservation),
      operationPlan: plan,
      observations,
      verification: patch.verification,
      toolCalls,
      toolResults,
    }
  }
}

function explicitVendorNameFromTool(value: string | undefined) {
  if (!value) return undefined
  const cleaned = cleanVendorHint(value)
  return cleaned && !isGenericVendorReference(cleaned) ? cleaned : undefined
}

export function buildVendorMergePlan(input: {
  userRequest: string
  targetWorkbookId: string
  workbookId: string
  vendorNameHint?: string
}): SpreadsheetOperationPlan {
  return {
    planId: `plan-${crypto.randomUUID()}`,
    userIntent: input.userRequest,
    mode: 'propose_patch',
    riskLevel: 'medium',
    requiresApproval: true,
    assumptions: [
      'The current estimator-visible Comparison Sheet is the merge target.',
      'Uploaded workbook rows must be matched before any visible sheet edits are proposed.',
      ...(input.vendorNameHint ? [`Vendor name hint: ${input.vendorNameHint}.`] : []),
    ],
    steps: [
      step('inspect-current', 'inspect_workbook', 'load_current_comparison_workbook', {}, 'Inspect the current Comparison Sheet snapshot.'),
      step('inspect-attachment', 'inspect_attachment', 'load_uploaded_workbook', { workbookId: input.workbookId }, 'Inspect the attached vendor workbook.'),
      step('extract-response', 'extract_vendor_response', 'extract_vendor_response_from_workbook', { workbookId: input.workbookId, vendorNameHint: input.vendorNameHint }, 'Extract vendor identity, line items, totals, lead times, exclusions, and notes.'),
      step('map-rows', 'map_rows', 'match_vendor_rows_to_comparison_items', {}, 'Map uploaded vendor rows to current RFQ line items with confidence and reasons.'),
      step('detect-conflicts', 'detect_conflicts', 'detect_conflicting_existing_values', {}, 'Detect existing target values that would be overwritten.'),
      step('create-patch', 'create_patch', 'create_vendor_merge_patch', {}, 'Create one previewable Comparison Patch Proposal.'),
      step('verify-patch', 'verify_patch', 'verify_vendor_merge_patch', {}, 'Verify schema, overwrite warnings, unmatched reporting, and total-row exclusion.'),
    ],
    expectedPatch: {
      summary: 'Merge attached vendor response into the current comparison.',
      targetWorkbookId: input.targetWorkbookId,
    },
  }
}

export function validateSpreadsheetOperationPlan(plan: SpreadsheetOperationPlan): { ok: boolean; errors: string[] } {
  const knownTools = new Set([
    'load_current_comparison_workbook',
    'load_uploaded_workbook',
    'extract_vendor_response_from_workbook',
    'match_vendor_rows_to_comparison_items',
    'detect_conflicting_existing_values',
    'create_vendor_merge_patch',
    'verify_vendor_merge_patch',
    'apply_approved_patch',
  ])
  const errors: string[] = []
  const toolNames = plan.steps.map((step) => step.toolName)
  const editIndex = plan.steps.findIndex((step) => step.kind === 'create_patch' || step.kind === 'apply_patch')
  const inspectIndex = plan.steps.findIndex((step) => step.kind === 'inspect_workbook' || step.kind === 'inspect_attachment')
  if (plan.steps.some((step) => !knownTools.has(step.toolName))) errors.push('Plan calls an unknown spreadsheet operation tool.')
  if (editIndex >= 0 && (inspectIndex < 0 || inspectIndex > editIndex)) errors.push('Plan edits before inspecting workbook context.')
  if (plan.riskLevel === 'destructive' && !plan.requiresApproval) errors.push('Destructive spreadsheet operations require approval.')
  if (toolNames.includes('create_vendor_merge_patch')) {
    for (const required of ['extract_vendor_response_from_workbook', 'match_vendor_rows_to_comparison_items', 'detect_conflicting_existing_values', 'verify_vendor_merge_patch']) {
      if (!toolNames.includes(required)) errors.push(`Vendor merge plan is missing ${required}.`)
    }
  }
  if (toolNames.includes('apply_approved_patch') && !plan.requiresApproval && plan.riskLevel !== 'safe') errors.push('Unsafe apply step is missing approval gate.')
  return { ok: errors.length === 0, errors }
}

function step(
  id: string,
  kind: SpreadsheetOperationPlan['steps'][number]['kind'],
  toolName: string,
  toolInput: unknown,
  expectedObservation: string,
): SpreadsheetOperationPlan['steps'][number] {
  return {
    id,
    kind,
    dependsOn: id === 'inspect-current' ? [] : ['inspect-current'],
    toolName,
    toolInput,
    expectedObservation,
    onFailure: kind === 'verify_patch' || kind === 'detect_conflicts' ? 'block' : 'revise_plan',
  }
}

function isFileMergeRequest(message: string, hasWorkbookAttachment = false) {
  if (!/\b(merge|import|add|combine)\b/i.test(message)) return false
  if (/\b(workbook|excel|xlsx|attachment|attached|vendor response|response|spreadsheet|sheet|comparison)\b/i.test(message)) return true
  return hasWorkbookAttachment && /\b(vendor|quote|bid|supplier|this)\b/i.test(message)
}

function vendorNameHintFromRequest(message: string) {
  const possessive = [...message.matchAll(/\b([A-Z][A-Za-z0-9&.' -]{1,60}?)(?:'s|’s)\s+(?:response|quote|bid|workbook)\b/g)].at(-1)?.[1]
  if (possessive) return cleanVendorHint(possessive)
  const addVendor = message.match(/\badd\s+([A-Za-z0-9&.' -]{2,50}?)(?:\s+(?:in|into|to|on)\s+(?:the\s+)?(?:spreadsheet|sheet|comparison|workbook)|$)/i)
  if (addVendor?.[1]) {
    const addVendorName: string = addVendor[1]
    const cleaned = cleanVendorHint(addVendorName)
    if (cleaned && !isGenericVendorReference(cleaned)) return titleCase(cleaned)
  }
  const patterns = [
    /\b(?:from|for)\s+([A-Z][A-Za-z0-9&.' -]{1,40}?)(?:\s+(?:response|quote|bid|workbook))?\b/,
    /\bthis is\s+([A-Z][A-Za-z0-9&.' -]{1,40}?)(?:\s+(?:response|quote|bid|workbook))?\b/,
  ]
  for (const pattern of patterns) {
    const match = message.match(pattern)
    if (match?.[1]) return cleanVendorHint(match[1])
  }
  return undefined
}

function cleanVendorHint(value: string): string {
  return (value.split(/\bis\s+/i).at(-1) ?? value).replace(/\b(attached|workbook)\b/gi, '').replace(/\s+/g, ' ').trim()
}

function isGenericVendorReference(value: string) {
  const normalized = value.trim()
  return /^(?:this\s+)?vendor$/i.test(normalized)
    || /^(?:in|into|to|on)\s+(?:this\s+)?vendor$/i.test(normalized)
    || /\b(this|attached|spreadsheet|workbook|excel|file|attachment|new vendor bid|vendor bid|vendor response|quote response)\b/i.test(normalized)
}

function titleCase(value: string) {
  return value.replace(/\w\S*/g, (word) => word[0]?.toUpperCase() + word.slice(1).toLowerCase())
}

function vendorNameHintFromFilename(filename: string) {
  return filename.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\b(response|quote|bid|rfq|vendor)\b/gi, '').replace(/\s+/g, ' ').trim() || undefined
}

function snapshotObject(request: ProductAgentRuntimeRequest) {
  return (request.requestContext?.quoteComparison?.snapshot ?? {}) as { columns?: []; rows?: [] }
}

function vendorExtractionSummary(response: ExtractedVendorResponse) {
  return `Extracted ${response.lineItems.length} line item${response.lineItems.length === 1 ? '' : 's'}${response.vendorName ? ` for ${response.vendorName}` : ''}.`
}

function rowMatchSummary(report: VendorMergeDecisionReport) {
  return `Matched ${report.matches.length} uploaded row${report.matches.length === 1 ? '' : 's'}; ${report.unmatchedSourceRows.length} unmatched; ${report.ambiguousMatches.length} ambiguous.`
}

function conflictSummary(report: VendorMergeDecisionReport) {
  return report.conflicts.length
    ? `Detected ${report.conflicts.length} existing value conflict${report.conflicts.length === 1 ? '' : 's'}.`
    : 'No existing value conflicts detected.'
}

function verificationSummary(verification: SpreadsheetVerificationReport) {
  return verification.ok ? 'Vendor merge patch passed verification.' : 'Vendor merge patch failed verification.'
}
