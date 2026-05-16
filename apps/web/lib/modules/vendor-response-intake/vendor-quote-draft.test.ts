import { describe, expect, it } from 'vitest'
import { buildVendorQuoteDraft } from './vendor-quote-draft'
import type { ContractorRFQ } from '../../types/contractor'

const rfq: ContractorRFQ = {
  id: 'rfq-1',
  project_id: 'project-1',
  title: 'Ceiling grid package',
  status: 'active',
  line_items: [
    {
      id: 'line-cross-tee',
      sku: 'CT-4-15/16-FW',
      description: '4 ft 15/16 in Fire-rated Cross Tee',
      quantity: 500,
      unit: 'ea',
    },
    {
      id: 'line-main-runner',
      sku: 'MR-12-HD',
      description: '12 ft Heavy-duty Main Runner',
      quantity: 80,
      unit: 'ea',
    },
  ],
  invited_vendor_ids: [],
  invited_vendor_emails: [],
  visibility: 'invited_only',
  created_at: '2026-05-14T12:00:00.000Z',
}

describe('vendor quote draft', () => {
  it('maps an uploaded vendor quote file back onto editable line responses', () => {
    const result = buildVendorQuoteDraft({
      rfq,
      vendorName: 'Ceiling Supply',
      filename: 'ceiling-supply.csv',
      sourceKind: 'spreadsheet',
      text: [
        'Supplier,Item,SKU,Description,Qty,Unit,Unit Price,Total Price,Lead Time,Notes',
        'Ceiling Supply,1,CT-4-15/16-FW,USG Donn DX/DXL 4 ft 15/16 in fire-rated cross tee,500,ea,1.25,625,5 days,Exact requested product',
      ].join('\n'),
      now: '2026-05-14T12:00:00.000Z',
    })

    expect(result.lineItemResponses).toHaveLength(1)
    expect(result.lineItemResponses[0]).toMatchObject({
      line_item_id: 'line-cross-tee',
      sku: 'CT-4-15/16-FW',
      quantity: 500,
      quoted_quantity: 500,
      unit: 'ea',
      unit_price: 1.25,
      total_price: 625,
      lead_time_days: 5,
      quoted_product_details: 'USG Donn DX/DXL 4 ft 15/16 in fire-rated cross tee',
    })
    expect(result.lineItemResponses[0].response_attributes).toContainEqual(expect.objectContaining({
      key: 'vendor_quote_source',
      value: 'ceiling-supply.csv',
    }))
    expect(result.warnings).toContainEqual(expect.objectContaining({
      message: expect.stringContaining('Read 1 quote line'),
    }))
  })

  it('maps inline email-style quote text onto editable line responses', () => {
    const result = buildVendorQuoteDraft({
      rfq,
      vendorName: 'Ceiling Supply',
      filename: 'inline-email-reply.txt',
      sourceKind: 'spreadsheet',
      text: [
        'Here is our quote:',
        'USG Donn DXL 4 ft cross tee 15/16 fire-rated, qty 500 ea, unit price $1.82, lead time 5 days',
        'USG Donn DXL 12 ft heavy-duty main runner, qty 80 ea, unit price $6.10, lead time 5 days',
      ].join('\n'),
      now: '2026-05-14T12:00:00.000Z',
    })

    expect(result.lineItemResponses).toHaveLength(2)
    expect(result.lineItemResponses[0]).toMatchObject({
      line_item_id: 'line-cross-tee',
      quoted_quantity: 500,
      unit: 'ea',
      unit_price: 1.82,
      total_price: 910,
      lead_time_days: 5,
    })
    expect(result.lineItemResponses[0].quoted_product_details).toContain('cross tee')
    expect(result.warnings).toContainEqual(expect.objectContaining({
      message: expect.stringContaining('inline email-style text'),
    }))
  })

  it('does not copy the requested SKU when the vendor quote omits a SKU', () => {
    const result = buildVendorQuoteDraft({
      rfq,
      vendorName: 'Ceiling Supply',
      filename: 'no-sku.csv',
      sourceKind: 'spreadsheet',
      text: [
        'Supplier,Item,SKU,Description,Qty,Unit,Unit Price,Total Price,Lead Time,Notes',
        'Ceiling Supply,1,,4 ft 15/16 in Fire-rated Cross Tee,500,ea,1.25,625,5 days,No SKU provided',
      ].join('\n'),
      now: '2026-05-14T12:00:00.000Z',
    })

    expect(result.lineItemResponses).toHaveLength(1)
    expect(result.lineItemResponses[0]).toMatchObject({
      line_item_id: 'line-cross-tee',
      sku: '',
    })
  })
})
