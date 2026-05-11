import type { ContractorBid, ContractorRFQ } from '../types/contractor'

export interface VendorQuoteResponseLine {
  lineItemId: string
  unitPrice?: number
  totalPrice?: number
  quotedQuantity?: number
  quotedUnit?: string
  leadTimeDays?: number
  availability?: 'in_stock' | 'can_source' | 'unavailable'
  noBid?: 'explicit' | 'missing' | 'cannot-supply'
  alternate?: boolean
  notes?: string
  provenance?: string
  reviewIssues: string[]
}

export interface VendorQuoteResponse {
  vendorId: string
  vendorName: string
  vendorEmail?: string
  source: 'platform' | 'magic_form' | 'email' | 'external_workbook'
  submittedAt?: string
  lines: VendorQuoteResponseLine[]
  reviewIssues: string[]
}

export function vendorQuoteResponseFromBid(quoteRequest: ContractorRFQ, bid: ContractorBid): VendorQuoteResponse {
  const requestedById = new Map(quoteRequest.line_items.map((line) => [line.id, line]))
  const vendorId = bid.vendor_id ?? bid.vendor_email ?? bid.id
  const lines = bid.line_item_responses.map((line) => {
    const requested = requestedById.get(line.line_item_id)
    const reviewIssues: string[] = []
    const quotedQuantity = line.quoted_quantity ?? line.quantity
    const quotedUnit = line.unit

    if (!requested) reviewIssues.push('line_not_requested')
    if (line.availability === 'unavailable') reviewIssues.push('no_bid')
    if (requested && quotedQuantity !== requested.quantity) reviewIssues.push('quantity_mismatch')
    if (requested && quotedUnit !== requested.unit) reviewIssues.push('unit_mismatch')
    if (line.is_alternate) reviewIssues.push('vendor_alternate')

    return {
      lineItemId: line.line_item_id,
      unitPrice: line.availability === 'unavailable' ? undefined : line.unit_price,
      totalPrice: line.availability === 'unavailable' ? undefined : line.total_price,
      quotedQuantity,
      quotedUnit,
      leadTimeDays: line.lead_time_days,
      availability: line.availability,
      noBid: line.availability === 'unavailable' ? 'cannot-supply' as const : undefined,
      alternate: line.is_alternate,
      notes: [line.notes, line.substitution_notes].filter(Boolean).join(' ') || undefined,
      provenance: `${bid.source}:${bid.id}:${line.line_item_id}`,
      reviewIssues,
    }
  })

  const responseIssues = lines.flatMap((line) => line.reviewIssues)
  return {
    vendorId,
    vendorName: bid.vendor_name,
    vendorEmail: bid.vendor_email,
    source: bid.source,
    submittedAt: bid.submitted_at,
    lines,
    reviewIssues: Array.from(new Set(responseIssues)),
  }
}
