import type { ContractorBid, ContractorRFQ } from '../types/contractor'
import { vendorQuoteResponseFromBid, type VendorQuoteResponse } from './vendor-response-intake'

export const VENDOR_RESPONSE_WORKBOOK_SCHEMA_VERSION = 1

export interface VendorResponseWorkbookLine {
  lineItemId: string
  sku?: string
  description: string
  requestedQuantity: number
  requestedUnit: string
  specs?: string
  notes?: string
}

export interface VendorResponseWorkbookVendor {
  vendorId: string
  vendorName: string
  vendorEmail?: string
  source: VendorQuoteResponse['source']
  submittedAt?: string
}

export interface VendorResponseWorkbookCell {
  lineItemId: string
  vendorId: string
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

export interface VendorResponseWorkbook {
  schemaVersion: typeof VENDOR_RESPONSE_WORKBOOK_SCHEMA_VERSION
  quoteRequest: {
    id: string
    projectId: string
    title: string
    expiresAt?: string
  }
  lines: VendorResponseWorkbookLine[]
  vendors: VendorResponseWorkbookVendor[]
  cells: VendorResponseWorkbookCell[]
  reviewIssues: string[]
}

export function buildVendorResponseWorkbook(
  quoteRequest: ContractorRFQ,
  responses: VendorQuoteResponse[] = [],
): VendorResponseWorkbook {
  return {
    schemaVersion: VENDOR_RESPONSE_WORKBOOK_SCHEMA_VERSION,
    quoteRequest: {
      id: quoteRequest.id,
      projectId: quoteRequest.project_id,
      title: quoteRequest.title,
      expiresAt: quoteRequest.bid_deadline,
    },
    lines: quoteRequest.line_items.map((line) => ({
      lineItemId: line.id,
      sku: line.sku || undefined,
      description: line.description,
      requestedQuantity: line.quantity,
      requestedUnit: line.unit,
      specs: line.specs,
      notes: line.notes,
    })),
    vendors: responses.map((response) => ({
      vendorId: response.vendorId,
      vendorName: response.vendorName,
      vendorEmail: response.vendorEmail,
      source: response.source,
      submittedAt: response.submittedAt,
    })),
    cells: responses.flatMap((response) =>
      response.lines.map((line) => ({
        lineItemId: line.lineItemId,
        vendorId: response.vendorId,
        unitPrice: line.unitPrice,
        totalPrice: line.totalPrice,
        quotedQuantity: line.quotedQuantity,
        quotedUnit: line.quotedUnit,
        leadTimeDays: line.leadTimeDays,
        availability: line.availability,
        noBid: line.noBid,
        alternate: line.alternate,
        notes: line.notes,
        provenance: line.provenance,
        reviewIssues: line.reviewIssues,
      })),
    ),
    reviewIssues: responses.flatMap((response) => response.reviewIssues),
  }
}

export function buildVendorResponseWorkbookFromBids(
  quoteRequest: ContractorRFQ,
  bids: ContractorBid[],
): VendorResponseWorkbook {
  return buildVendorResponseWorkbook(quoteRequest, bids.map((bid) => vendorQuoteResponseFromBid(quoteRequest, bid)))
}
