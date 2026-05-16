import { describe, expect, it } from 'vitest'
import { deriveBidRiskFlags } from './procurement-helpers'
import type { ContractorBid, ContractorRFQ } from './types/contractor'

const rfq: ContractorRFQ = {
  id: 'rfq-1',
  project_id: 'project-1',
  title: 'Ceiling grid',
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

function bid(quotedProductDetails: string, sku = ''): ContractorBid {
  return {
    id: 'bid-1',
    rfq_id: rfq.id,
    vendor_name: 'Ceiling Supply',
    is_invited: true,
    is_on_platform: false,
    submitted_at: '2026-05-14T12:00:00.000Z',
    total_price: 625,
    currency: 'USD',
    lead_time_days: 5,
    line_item_responses: [{
      line_item_id: 'line-cross-tee',
      sku,
      description: rfq.line_items[0].description,
      quantity: 500,
      quoted_quantity: 500,
      unit: 'ea',
      unit_price: 1.25,
      total_price: 625,
      lead_time_days: 5,
      availability: 'can_source',
      is_alternate: false,
      quoted_product_details: quotedProductDetails,
    }],
    status: 'pending',
    source: 'magic_form',
  }
}

describe('procurement helpers', () => {
  it('adds a high severity risk flag for vague product identity on specific requested items', () => {
    expect(deriveBidRiskFlags(rfq, bid('cross tee 4 ft'))).toContainEqual(expect.objectContaining({
      code: 'needs_product_detail',
      severity: 'high',
    }))
  })

  it('does not add the product detail risk when the vendor identifies the exact product', () => {
    expect(deriveBidRiskFlags(rfq, bid('', 'CT-4-15/16-FW')).map((flag) => flag.code)).not.toContain('needs_product_detail')
  })
})
