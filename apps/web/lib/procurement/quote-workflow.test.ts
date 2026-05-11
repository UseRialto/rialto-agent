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

  it('keeps unresolved quantity mismatches out of lowest complete comparable quote', () => {
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
        id: 'quantity-mismatch',
        vendor_name: 'Mismatch Supply',
        line_item_responses: [
          { line_item_id: 'line-1', sku: '', description: 'Ready-mix concrete', quantity: 10, quoted_quantity: 8, unit: 'CY', unit_price: 90, total_price: 720, lead_time_days: 5, availability: 'in_stock' },
          { line_item_id: 'line-2', sku: '', description: 'Rebar', quantity: 5, unit: 'TON', unit_price: 180, total_price: 900, lead_time_days: 5, availability: 'in_stock' },
        ],
      }),
    ])

    const comparison = evaluateQuoteComparison(quoteComparisonInputFromWorkbook(workbook))
    const mismatch = comparison.vendors.find((vendor) => vendor.vendorName === 'Mismatch Supply')

    expect(comparison.lowestCompleteComparableQuote?.vendorName).toBe('Complete Supply')
    expect(mismatch?.completeComparable).toBe(false)
    expect(mismatch?.total).toBe(1620)
    expect(mismatch?.caveats.some((caveat) => caveat.includes('quoted quantity is lower'))).toBe(true)
    expect(comparison.lowerPartialTotals.map((vendor) => vendor.vendorName)).toContain('Mismatch Supply')
  })

  it('requires estimator review before vendor alternates are complete-comparable', () => {
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
        id: 'alternate',
        vendor_name: 'Alternate Supply',
        line_item_responses: [
          { line_item_id: 'line-1', sku: '', description: 'Ready-mix concrete alternate', quantity: 10, unit: 'CY', unit_price: 70, total_price: 700, lead_time_days: 5, availability: 'in_stock', is_alternate: true },
          { line_item_id: 'line-2', sku: '', description: 'Rebar', quantity: 5, unit: 'TON', unit_price: 180, total_price: 900, lead_time_days: 5, availability: 'in_stock' },
        ],
      }),
    ])

    const comparison = evaluateQuoteComparison(quoteComparisonInputFromWorkbook(workbook))
    const alternate = comparison.vendors.find((vendor) => vendor.vendorName === 'Alternate Supply')

    expect(comparison.lowestCompleteComparableQuote?.vendorName).toBe('Complete Supply')
    expect(alternate?.completeComparable).toBe(false)
    expect(alternate?.caveats.some((caveat) => caveat.includes('vendor alternate'))).toBe(true)
  })
})
