import { describe, expect, it } from 'vitest'
import { vendorQuoteResponseFromBid } from './vendor-response-intake'
import type { ContractorBid, ContractorRFQ } from '../types/contractor'

const quoteRequest: ContractorRFQ = {
  id: 'rfq-1',
  project_id: 'project-1',
  title: 'Ceiling grid package',
  status: 'active',
  line_items: [{
    id: 'line-cross-tee',
    sku: 'CT-4-15/16-FW',
    description: '4 ft 15/16 in Fire-rated Cross Tee',
    quantity: 500,
    unit: 'ea',
    specs: 'ASTM C635 heavy-duty fire-rated exposed tee grid, 15/16 in face.',
  }],
  invited_vendor_ids: [],
  invited_vendor_emails: [],
  visibility: 'invited_only',
  created_at: '2026-05-14T12:00:00.000Z',
}

function bidWithLine(partial: Partial<ContractorBid['line_item_responses'][number]>): ContractorBid {
  return {
    id: 'bid-1',
    rfq_id: quoteRequest.id,
    vendor_name: 'Ceiling Supply',
    is_invited: true,
    is_on_platform: false,
    submitted_at: '2026-05-14T12:00:00.000Z',
    total_price: 625,
    currency: 'USD',
    lead_time_days: 5,
    line_item_responses: [{
      line_item_id: 'line-cross-tee',
      sku: '',
      description: 'Cross tee 4 ft',
      quantity: 500,
      quoted_quantity: 500,
      unit: 'ea',
      unit_price: 1.25,
      total_price: 625,
      lead_time_days: 5,
      availability: 'can_source',
      is_alternate: false,
      ...partial,
    }],
    status: 'pending',
    source: 'magic_form',
  }
}

describe('vendor response intake', () => {
  it('marks priced responses for review when a specific requested product has vague quoted details', () => {
    const response = vendorQuoteResponseFromBid(quoteRequest, bidWithLine({
      quoted_product_details: 'cross tee 4 ft',
    }))

    expect(response.lines[0].reviewIssues).toContain('needs_more_product_detail')
    expect(response.reviewIssues).toContain('needs_more_product_detail')
  })

  it('does not mark product detail review when the vendor identifies the specific quoted product', () => {
    const response = vendorQuoteResponseFromBid(quoteRequest, bidWithLine({
      sku: 'CT-4-15/16-FW',
      quoted_product_details: 'USG Donn DX/DXL 4 ft 15/16 in fire-rated cross tee, ASTM C635 heavy duty',
    }))

    expect(response.lines[0].reviewIssues).not.toContain('needs_more_product_detail')
  })
})
