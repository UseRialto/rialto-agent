import type { ContractorBidLineItemResponse, ContractorRFQ } from '../../types/contractor'
import { buildVendorQuoteDraft } from './vendor-quote-draft'
import type { ExternalQuoteImportSourceKind } from '../../procurement/external-quote-import'

export interface EmailQuoteAttachmentText {
  filename: string
  sourceKind: string
  text: string
}

export interface EmailQuoteIntakeInput {
  rfq: ContractorRFQ
  vendorName: string
  emailBody: string
  attachments: EmailQuoteAttachmentText[]
}

export interface EmailQuoteIntakeResult {
  lineItemResponses: ContractorBidLineItemResponse[]
  warnings: Array<{ message: string }>
  sourceKind: string
  confidence: number
  needsReview: boolean
}

function sourceKindForAttachment(sourceKind: string): ExternalQuoteImportSourceKind {
  return sourceKind === 'pdf' ? 'pdf' : 'spreadsheet'
}

function dedupeByLineItem(responses: ContractorBidLineItemResponse[]) {
  const byLineItem = new Map<string, ContractorBidLineItemResponse>()
  for (const response of responses) {
    if (!byLineItem.has(response.line_item_id)) byLineItem.set(response.line_item_id, response)
  }
  return [...byLineItem.values()]
}

function confidenceFor(input: EmailQuoteIntakeInput, responses: ContractorBidLineItemResponse[], warnings: Array<{ message: string }>) {
  if (responses.length === 0) return 0
  const coverage = responses.length / Math.max(input.rfq.line_items.length, 1)
  const hasUnmatched = warnings.some((warning) => /could not match/i.test(warning.message))
  return Math.max(0.45, Math.min(0.9, 0.55 + coverage * 0.3 - (hasUnmatched ? 0.18 : 0)))
}

export function extractEmailQuoteIntake(input: EmailQuoteIntakeInput): EmailQuoteIntakeResult {
  const warnings: Array<{ message: string }> = []
  const attachmentResponses = input.attachments.flatMap((attachment) => {
    if (!attachment.text.trim()) return []
    const draft = buildVendorQuoteDraft({
      rfq: input.rfq,
      vendorName: input.vendorName,
      filename: attachment.filename,
      sourceKind: sourceKindForAttachment(attachment.sourceKind),
      text: attachment.text,
    })
    warnings.push(...draft.warnings)
    return draft.lineItemResponses
  })
  const attachmentLineItemResponses = dedupeByLineItem(attachmentResponses)
  if (attachmentLineItemResponses.length > 0) {
    const confidence = confidenceFor(input, attachmentLineItemResponses, warnings)
    return {
      lineItemResponses: attachmentLineItemResponses,
      warnings,
      sourceKind: input.attachments[0]?.sourceKind || 'attachment',
      confidence,
      needsReview: confidence < 0.6 || warnings.some((warning) => /could not match/i.test(warning.message)),
    }
  }

  const bodyDraft = buildVendorQuoteDraft({
    rfq: input.rfq,
    vendorName: input.vendorName,
    filename: 'inline-email-reply.txt',
    sourceKind: 'spreadsheet',
    text: input.emailBody,
  })
  const lineItemResponses = dedupeByLineItem(bodyDraft.lineItemResponses)
  warnings.push(...bodyDraft.warnings)
  const confidence = confidenceFor(input, lineItemResponses, warnings)
  return {
    lineItemResponses,
    warnings,
    sourceKind: 'email',
    confidence,
    needsReview: confidence < 0.6 || warnings.some((warning) => /could not match/i.test(warning.message)),
  }
}
