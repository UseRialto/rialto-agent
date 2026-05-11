import { describe, expect, it } from 'vitest'
import type { ContractorBid, ContractorRFQ } from '../types/contractor'
import { buildVendorResponseWorkbookFromBids } from './quote-request'
import { evaluateQuoteComparison, quoteComparisonInputFromWorkbook } from './quote-comparison'

const quoteRequest: ContractorRFQ = {
  id: 'rfq-1',
  project_id: 'project-1',
  title: 'Concrete package',
  status: 'active',
  line_items: [
    { id: 'line-1', sku: '', description: 'Ready-mix concrete', quantity: 10, unit: 'CY' },
    { id: 'line-2', sku: '', description: 'Rebar', quantity: 5, unit: 'TON' },
  ],
  invited_vendor_ids: [],
  invited_vendor_emails: [],
  visibility: 'invited_only',
  created_at: '2026-05-11T00:00:00.000Z',
}

function bid(input: Partial<ContractorBid>): ContractorBid {
  return {
    id: input.id ?? 'bid-1',
    rfq_id: 'rfq-1',
    vendor_name: input.vendor_name ?? 'Vendor',
    vendor_email: input.vendor_email,
    is_invited: true,
    is_on_platform: false,
    submitted_at: '2026-05-11T00:00:00.000Z',
    total_price: input.total_price ?? 0,
    currency: 'USD',
    lead_time_days: 7,
    line_item_responses: input.line_item_responses ?? [],
    status: 'pending',
    source: input.source ?? 'magic_form',
  }
}

describe('Vendor Response Workbook handoff', () => {
  it('lets Quote Request produce the workbook that Quote Comparison consumes', () => {
    const workbook = buildVendorResponseWorkbookFromBids(quoteRequest, [
      bid({
        id: 'complete',
        vendor_name: 'Complete Supply',
        line_item_responses: [
          { line_item_id: 'line-1', sku: '', description: 'Ready-mix concrete', quantity: 10, unit: 'CY', unit_price: 100, total_price: 1000, lead_time_days: 5, availability: 'in_stock' },
          { line_item_id: 'line-2', sku: '', description: 'Rebar', quantity: 5, unit: 'TON', unit_price: 200, total_price: 1000, lead_time_days: 5, availability: 'in_stock' },
        ],
      }),
      bid({
        id: 'partial',
        vendor_name: 'Partial Supply',
        line_item_responses: [
          { line_item_id: 'line-1', sku: '', description: 'Ready-mix concrete', quantity: 10, unit: 'CY', unit_price: 80, total_price: 800, lead_time_days: 5, availability: 'in_stock' },
          { line_item_id: 'line-2', sku: '', description: 'Rebar', quantity: 5, unit: 'TON', unit_price: 0, total_price: 0, lead_time_days: 5, availability: 'unavailable' },
        ],
      }),
    ])

    const comparison = evaluateQuoteComparison(quoteComparisonInputFromWorkbook(workbook))

    expect(workbook.lines).toHaveLength(2)
    expect(comparison.lowestCompleteComparableQuote?.vendorName).toBe('Complete Supply')
    expect(comparison.lowerPartialTotals.map((vendor) => vendor.vendorName)).toContain('Partial Supply')
  })
})
