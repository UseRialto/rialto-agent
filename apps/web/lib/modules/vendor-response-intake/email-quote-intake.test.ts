import { describe, expect, it } from 'vitest'
import { extractEmailQuoteIntake } from './email-quote-intake'
import type { ContractorRFQ } from '../../types/contractor'

const rfq: ContractorRFQ = {
  id: 'rfq-1',
  project_id: 'project-1',
  title: 'Ceiling grid',
  status: 'active',
  line_items: [
    { id: 'line-cross-tee', sku: 'CT-4-15/16-FW', description: '4 ft 15/16 in Fire-rated Cross Tee', quantity: 500, unit: 'ea' },
    { id: 'line-main-runner', sku: 'MR-12-HD', description: '12 ft Heavy-duty Main Runner', quantity: 80, unit: 'ea' },
  ],
  invited_vendor_ids: [],
  invited_vendor_emails: [],
  visibility: 'invited_only',
  created_at: '2026-05-14T12:00:00.000Z',
}

describe('email quote intake', () => {
  it('turns a GPT-normalized inline vendor email reply into line item responses for comparison', async () => {
    const result = await extractEmailQuoteIntake({
      rfq,
      vendorName: 'Ceiling Supply',
      emailBody: 'Prices below.',
      attachments: [],
      runInlineEmailModel: async () => ({
        containsQuote: true,
        normalizedText: [
          'Supplier,Item,SKU,Description,Qty,Unit,Unit Price,Total Price,Lead Time,Notes',
          'Ceiling Supply,1,CT-4-15/16-FW,USG Donn DXL 4 ft 15/16 in fire-rated cross tee,500,ea,1.82,910,5 days,',
          'Ceiling Supply,2,MR-12-HD,USG Donn DXL 12 ft heavy-duty main runner,80,ea,6.10,488,5 days,',
        ].join('\n'),
        verificationSummary: 'All normalized values came from the email body.',
        warnings: [],
      }),
    })

    expect(result.lineItemResponses).toHaveLength(2)
    expect(result.lineItemResponses[0]).toMatchObject({
      line_item_id: 'line-cross-tee',
      unit_price: 1.82,
      total_price: 910,
      lead_time_days: 5,
    })
    expect(result.sourceKind).toBe('email')
    expect(result.needsReview).toBe(false)
  })

  it('does not add comparison rows when GPT decides an inline reply has no quote data', async () => {
    const result = await extractEmailQuoteIntake({
      rfq,
      vendorName: 'Ceiling Supply',
      emailBody: 'Thanks for reaching out. We will review this tomorrow.',
      attachments: [],
      runInlineEmailModel: async () => ({
        containsQuote: false,
        normalizedText: '',
        verificationSummary: 'The message was conversational and contained no quote values.',
        warnings: [],
      }),
    })

    expect(result.lineItemResponses).toHaveLength(0)
    expect(result.sourceKind).toBe('email')
    expect(result.needsReview).toBe(false)
  })

  it('prefers a readable quote attachment over inline email prose', async () => {
    const result = await extractEmailQuoteIntake({
      rfq,
      vendorName: 'Ceiling Supply',
      emailBody: 'See attached, thanks.',
      attachments: [{
        filename: 'ceiling-supply.csv',
        sourceKind: 'csv',
        text: [
          'Supplier,Item,SKU,Description,Qty,Unit,Unit Price,Total Price,Lead Time,Notes',
          'Ceiling Supply,1,CT-4-15/16-FW,USG Donn DXL 4 ft 15/16 in fire-rated cross tee,500,ea,1.25,625,5 days,Exact product',
        ].join('\n'),
      }],
    })

    expect(result.lineItemResponses).toHaveLength(1)
    expect(result.lineItemResponses[0]).toMatchObject({
      line_item_id: 'line-cross-tee',
      unit_price: 1.25,
      total_price: 625,
    })
    expect(result.sourceKind).toBe('csv')
  })
})
