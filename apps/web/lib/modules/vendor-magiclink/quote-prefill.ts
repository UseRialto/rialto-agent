import type { ContractorBidLineItemResponse, ContractorRFQ } from '../../types/contractor'
import { ingestExternalQuoteFile, type ExternalQuoteFileIngestionResult, type ExternalQuoteUploadFile } from '../../procurement/external-quote-file-ingestion'
import { buildVendorQuoteDraft, type VendorQuoteDraftUnmatchedRow } from '../vendor-response-intake/vendor-quote-draft'

export interface VendorMagicLinkQuotePrefillInput {
  rfq: ContractorRFQ
  vendorName?: string
  source:
    | { kind: 'file'; file: ExternalQuoteUploadFile }
    | { kind: 'inline_text'; filename?: string; text: string }
  ingestFile?: typeof ingestExternalQuoteFile
}

export interface VendorMagicLinkQuotePrefillResult {
  lineItemResponses: ContractorBidLineItemResponse[]
  warnings: Array<{ message: string }>
  unmatchedRows: VendorQuoteDraftUnmatchedRow[]
}

export async function buildVendorMagicLinkQuotePrefill(input: VendorMagicLinkQuotePrefillInput): Promise<VendorMagicLinkQuotePrefillResult> {
  const ingested: ExternalQuoteFileIngestionResult = input.source.kind === 'file'
    ? await (input.ingestFile ?? ingestExternalQuoteFile)({ file: input.source.file })
    : {
        filename: input.source.filename || 'inline-email-reply.txt',
        sourceKind: 'spreadsheet',
        text: input.source.text,
        warnings: [{ message: 'Read quote values from pasted email reply text.' }],
        diagnostics: { mode: 'normal' },
      }

  const draft = buildVendorQuoteDraft({
    rfq: input.rfq,
    vendorName: input.vendorName,
    filename: ingested.filename,
    sourceKind: ingested.sourceKind,
    text: ingested.text,
  })

  return {
    lineItemResponses: draft.lineItemResponses,
    warnings: [...ingested.warnings, ...draft.warnings],
    unmatchedRows: draft.unmatchedRows,
  }
}
