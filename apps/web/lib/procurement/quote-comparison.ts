import type { ContractorBid, ContractorRFQ } from '../types/contractor'
import { buildVendorResponseWorkbookFromBids } from './quote-request'
import type { VendorResponseWorkbook } from './quote-request'

export interface QuoteComparisonLine {
  id: string
  description: string
  requestedQuantity: number
  requestedUnit: string
}

export interface QuoteComparisonVendorLine {
  lineItemId: string
  vendorId: string
  unitPrice?: number
  totalPrice?: number
  quotedQuantity?: number
  quotedUnit?: string
  noBid?: 'explicit' | 'missing' | 'cannot-supply'
  alternate?: boolean
  reviewIssues: string[]
}

export interface QuoteComparisonVendor {
  vendorId: string
  vendorName: string
  lines: QuoteComparisonVendorLine[]
}

export interface QuoteComparisonInput {
  quoteRequestId?: string
  lines: QuoteComparisonLine[]
  vendors: QuoteComparisonVendor[]
}

export interface VendorQuoteEvaluation {
  vendorId: string
  vendorName: string
  completeComparable: boolean
  partial: boolean
  total: number
  missingLineItemIds: string[]
  reviewIssueLineItemIds: string[]
}

export interface QuoteComparisonEvaluation {
  vendors: VendorQuoteEvaluation[]
  lowestCompleteComparableQuote?: VendorQuoteEvaluation
  lowerPartialTotals: VendorQuoteEvaluation[]
}

export interface LiveQuoteComparisonSummary {
  evaluation: QuoteComparisonEvaluation
  sortedBids: ContractorBid[]
  fullQuoteCount: number
  lowestCompleteBid?: ContractorBid
  fastestBid?: ContractorBid
}

export function quoteComparisonInputFromWorkbook(workbook: VendorResponseWorkbook): QuoteComparisonInput {
  return {
    quoteRequestId: workbook.quoteRequest.id,
    lines: workbook.lines.map((line) => ({
      id: line.lineItemId,
      description: line.description,
      requestedQuantity: line.requestedQuantity,
      requestedUnit: line.requestedUnit,
    })),
    vendors: workbook.vendors.map((vendor) => ({
      vendorId: vendor.vendorId,
      vendorName: vendor.vendorName,
      lines: workbook.cells
        .filter((cell) => cell.vendorId === vendor.vendorId)
        .map((cell) => ({
          lineItemId: cell.lineItemId,
          vendorId: cell.vendorId,
          unitPrice: cell.unitPrice,
          totalPrice: cell.totalPrice,
          quotedQuantity: cell.quotedQuantity,
          quotedUnit: cell.quotedUnit,
          noBid: cell.noBid,
          alternate: cell.alternate,
          reviewIssues: cell.reviewIssues,
        })),
    })),
  }
}

function evaluateVendor(vendor: QuoteComparisonVendor, lines: QuoteComparisonLine[]): VendorQuoteEvaluation {
  let total = 0
  const missingLineItemIds: string[] = []
  const reviewIssueLineItemIds: string[] = []

  for (const requested of lines) {
    const quoted = vendor.lines.find((line) => line.lineItemId === requested.id)
    if (!quoted || quoted.noBid) {
      missingLineItemIds.push(requested.id)
      continue
    }
    if (quoted.reviewIssues.length > 0) {
      reviewIssueLineItemIds.push(requested.id)
      continue
    }
    if (typeof quoted.totalPrice === 'number' && Number.isFinite(quoted.totalPrice)) {
      total += quoted.totalPrice
      continue
    }
    if (typeof quoted.unitPrice === 'number' && Number.isFinite(quoted.unitPrice)) {
      total += quoted.unitPrice * (quoted.quotedQuantity ?? requested.requestedQuantity)
      continue
    }
    missingLineItemIds.push(requested.id)
  }

  const partial = missingLineItemIds.length > 0 || reviewIssueLineItemIds.length > 0
  return {
    vendorId: vendor.vendorId,
    vendorName: vendor.vendorName,
    completeComparable: !partial,
    partial,
    total,
    missingLineItemIds,
    reviewIssueLineItemIds,
  }
}

export function evaluateQuoteComparison(input: QuoteComparisonInput): QuoteComparisonEvaluation {
  const vendors = input.vendors.map((vendor) => evaluateVendor(vendor, input.lines))
  const complete = vendors.filter((vendor) => vendor.completeComparable).sort((a, b) => a.total - b.total)
  const lowestCompleteComparableQuote = complete[0]

  return {
    vendors,
    lowestCompleteComparableQuote,
    lowerPartialTotals: lowestCompleteComparableQuote
      ? vendors.filter((vendor) => vendor.partial && vendor.total < lowestCompleteComparableQuote.total)
      : [],
  }
}

export function buildLiveQuoteComparisonSummary(
  quoteRequest: ContractorRFQ,
  bids: ContractorBid[],
): LiveQuoteComparisonSummary {
  const workbook = buildVendorResponseWorkbookFromBids(quoteRequest, bids)
  const evaluation = evaluateQuoteComparison(quoteComparisonInputFromWorkbook(workbook))
  const evaluationByVendor = new Map(evaluation.vendors.map((vendor) => [vendor.vendorId, vendor]))

  function bidEvaluation(bid: ContractorBid) {
    return evaluationByVendor.get(bid.vendor_id ?? bid.vendor_email ?? bid.id)
  }

  const sortedBids = bids.slice().sort((a, b) => {
    const aEval = bidEvaluation(a)
    const bEval = bidEvaluation(b)
    const aComplete = Boolean(aEval?.completeComparable)
    const bComplete = Boolean(bEval?.completeComparable)
    if (aComplete !== bComplete) return aComplete ? -1 : 1
    return (aEval?.total ?? a.total_price) - (bEval?.total ?? b.total_price)
  })

  const lowestCompleteBid = evaluation.lowestCompleteComparableQuote
    ? bids.find((bid) => (bid.vendor_id ?? bid.vendor_email ?? bid.id) === evaluation.lowestCompleteComparableQuote?.vendorId)
    : undefined

  const fastestBid = bids.length === 0
    ? undefined
    : bids.reduce((best, bid) => (bid.lead_time_days < best.lead_time_days ? bid : best))

  return {
    evaluation,
    sortedBids,
    fullQuoteCount: evaluation.vendors.filter((vendor) => vendor.completeComparable).length,
    lowestCompleteBid,
    fastestBid,
  }
}
