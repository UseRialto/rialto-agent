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
  model?: string
  runInlineEmailModel?: (input: InlineEmailQuoteModelInput) => Promise<InlineEmailQuoteModelOutput>
}

export interface EmailQuoteIntakeResult {
  lineItemResponses: ContractorBidLineItemResponse[]
  warnings: Array<{ message: string }>
  sourceKind: string
  confidence: number
  needsReview: boolean
}

export interface InlineEmailQuoteModelInput {
  model: string
  rfq: ContractorRFQ
  vendorName: string
  emailBody: string
}

export interface InlineEmailQuoteModelOutput {
  containsQuote: boolean
  normalizedText: string
  warnings?: string[]
  verificationSummary?: string
}

const MAX_EMAIL_BODY_CHARS = 60_000

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

function responseOutputText(json: unknown) {
  if (!json || typeof json !== 'object') return ''
  const direct = (json as { output_text?: unknown }).output_text
  if (typeof direct === 'string') return direct
  const output = (json as { output?: unknown }).output
  if (!Array.isArray(output)) return ''
  return output
    .flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const content = (item as { content?: unknown }).content
      if (!Array.isArray(content)) return []
      return content.flatMap((part) => {
        if (!part || typeof part !== 'object') return []
        const text = (part as { text?: unknown }).text
        return typeof text === 'string' ? [text] : []
      })
    })
    .join('')
}

function parseInlineEmailModelOutput(text: string): InlineEmailQuoteModelOutput {
  const parsed = JSON.parse(text) as Partial<InlineEmailQuoteModelOutput>
  return {
    containsQuote: Boolean(parsed.containsQuote),
    normalizedText: typeof parsed.normalizedText === 'string' ? parsed.normalizedText : '',
    verificationSummary: typeof parsed.verificationSummary === 'string' ? parsed.verificationSummary : undefined,
    warnings: Array.isArray(parsed.warnings)
      ? parsed.warnings.filter((warning): warning is string => typeof warning === 'string' && warning.trim().length > 0)
      : [],
  }
}

async function runInlineEmailQuoteAgent(input: InlineEmailQuoteModelInput): Promise<InlineEmailQuoteModelOutput> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('Inline email quote intake requires OPENAI_API_KEY.')
  }

  const requestedItems = input.rfq.line_items.map((item, index) => (
    `${index + 1}. ID: ${item.id}; SKU: ${item.sku || 'none'}; Description: ${item.description}; Qty: ${item.quantity}; Unit: ${item.unit}`
  )).join('\n')

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: input.model,
      store: false,
      instructions: [
        'You are Rialto Agent\'s inbound vendor email quote intake normalizer.',
        'Decide whether the vendor email body contains usable quote pricing, lead time, availability, quantity, or notes for requested RFQ materials.',
        'If the email is only conversational or says to see an attachment, return containsQuote false and an empty normalizedText.',
        'If it contains inline quote information, convert only facts present in the email into CSV text with headers: Supplier,Item,SKU,Description,Qty,Unit,Unit Price,Total Price,Lead Time,Notes.',
        'Use the requested RFQ items only as matching context. Do not invent prices, totals, quantities, units, lead times, SKUs, or availability.',
        'Preserve vendor wording about alternates, exclusions, or substitutions as notes only. Do not create explicit alternate flags.',
        'Before returning, verify every CSV value against the email body and report ambiguities as warnings instead of guessing.',
      ].join('\n'),
      input: [
        {
          role: 'user',
          content: [
            `Vendor: ${input.vendorName || 'Unknown vendor'}`,
            `RFQ: ${input.rfq.title}`,
            'Requested items:',
            requestedItems,
            'Inbound email body:',
            input.emailBody.slice(0, MAX_EMAIL_BODY_CHARS),
          ].join('\n\n'),
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'inline_vendor_email_quote_intake',
          strict: true,
          schema: {
            type: 'object',
            properties: {
              containsQuote: { type: 'boolean' },
              normalizedText: { type: 'string' },
              verificationSummary: { type: 'string' },
              warnings: {
                type: 'array',
                items: { type: 'string' },
              },
            },
            required: ['containsQuote', 'normalizedText', 'verificationSummary', 'warnings'],
            additionalProperties: false,
          },
        },
      },
    }),
  })

  const json = await response.json() as { error?: { message?: string } }
  if (!response.ok) {
    throw new Error(json.error?.message || 'Inline email quote intake request failed.')
  }
  const outputText = responseOutputText(json)
  if (!outputText) throw new Error('Inline email quote intake returned no text.')
  return parseInlineEmailModelOutput(outputText)
}

function localInlineEmailModelFallback(input: EmailQuoteIntakeInput): InlineEmailQuoteModelOutput {
  const likelyQuote = /(\$\s*\d|\bunit\s*price\b|\btotal\b|\bqty\b|\blead\s*time\b|\b\d+\s*(day|days|week|weeks)\b)/i.test(input.emailBody)
  return {
    containsQuote: likelyQuote,
    normalizedText: likelyQuote ? input.emailBody : '',
    verificationSummary: 'Local test/development stand-in passed likely quote text through to the deterministic importer.',
    warnings: [`Used local stand-in for ${input.model ?? process.env.OPENAI_INLINE_EMAIL_INTAKE_MODEL ?? 'gpt-5.5'} inline email quote intake.`],
  }
}

export async function extractEmailQuoteIntake(input: EmailQuoteIntakeInput): Promise<EmailQuoteIntakeResult> {
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

  const model = input.model ?? process.env.OPENAI_INLINE_EMAIL_INTAKE_MODEL ?? 'gpt-5.5'
  const emailModelOutput = input.runInlineEmailModel
    ? await input.runInlineEmailModel({
        model,
        rfq: input.rfq,
        vendorName: input.vendorName,
        emailBody: input.emailBody.slice(0, MAX_EMAIL_BODY_CHARS),
      })
    : !process.env.OPENAI_API_KEY && (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development')
    ? localInlineEmailModelFallback(input)
    : await runInlineEmailQuoteAgent({
        model,
        rfq: input.rfq,
        vendorName: input.vendorName,
        emailBody: input.emailBody.slice(0, MAX_EMAIL_BODY_CHARS),
      })

  warnings.push(...(emailModelOutput.warnings ?? []).map((message) => ({ message })))
  if (emailModelOutput.verificationSummary) {
    warnings.push({ message: `${model} verification: ${emailModelOutput.verificationSummary}` })
  }

  if (!emailModelOutput.containsQuote || !emailModelOutput.normalizedText.trim()) {
    return {
      lineItemResponses: [],
      warnings,
      sourceKind: 'email',
      confidence: 0,
      needsReview: false,
    }
  }

  const bodyDraft = buildVendorQuoteDraft({
    rfq: input.rfq,
    vendorName: input.vendorName,
    filename: 'inline-email-reply.txt',
    sourceKind: 'spreadsheet',
    text: emailModelOutput.normalizedText,
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
