import { describe, expect, it } from 'vitest'
import { createExternalQuoteImport } from './external-quote-import'

const lAndWSampleText = `
Quote ID : 0001 - The Raymond Group
Supplier : L n W Supply - San Diego Expected Delivery Date : 08 / 01 / 2026 - 02 / 28 / 2027
Requester : Project : Supplier Notes : Stocking Notes :
Michael Null 9 - MCRD P - 314 Company :
Michael . Null @ raymondgroup . com Bid : 1.0 - Base Bid Job Site : San Diego , CA
No . Item Description Item Notes Size Quantity Price Per Total
901 - Metal
1 250CH - 33 250CH - 33 2 1 / 2 " X 22ga . C - H Stud 10 ' 0 " 2,420.00 LF 1100.000 1,000.00 LF $ 2,662.00
2 250JR - 33 250JR - 33 2 1 / 2 " X 20ga . J Track 12 ' 0 " 458.00 LF 1000.000 1,000.00 LF $ 458.00
250JS - 33 2 1 / 2 " X 20ga . Jamb
3 250JS - 33 10 ' 0 " 1,094.00 LF 1250.000 1,000.00 LF $ 1,367.50
Strut
362S125 - 30 3 5 / 8 " X 20ga . ( 30 Mil )
10 362S125 - 30 10 ' 0 " - 606.00 LF 545.000 1,000.00 LF - $ 330.27
1 1 / 4 " Flange Stud
902 - Gypsum Board
73 ACSEAL Acoustic Sealant USG 29oz . Acoustical Sealant 1 ' 0 " 889.30 Tube 8.000 Tube / 20.00 LF $ 7,114.40
`

describe('External Quote Import', () => {
  it('creates a Quote Request and imported vendor response from single-vendor quote text', () => {
    const result = createExternalQuoteImport({
      projectId: 'project-1',
      projectName: 'MCRD P-314',
      filename: '0001 - 9 - MCRD P-314 - 1.0 - Base Bid.pdf',
      sourceKind: 'pdf',
      text: lAndWSampleText,
      now: '2026-05-11T12:00:00.000Z',
    })

    expect(result.rfq.title).toBe('9 - MCRD P - 314 - 1.0 - Base Bid')
    expect(result.rfq.status).toBe('active')
    expect(result.rfq.line_items).toHaveLength(5)
    expect(result.bid.vendor_name).toBe('L n W Supply - San Diego')
    expect(result.bid.source).toBe('external_workbook')
    expect(result.bid.total_price).toBeCloseTo(11271.63)
    expect(result.bid.line_item_responses[0]).toMatchObject({
      sku: '250CH-33',
      quantity: 2420,
      unit: 'lf',
      unit_price: 1100,
      total_price: 2662,
    })
    expect(result.bid.line_item_responses[3]).toMatchObject({
      sku: '362S125-30',
      quantity: -606,
      total_price: -330.27,
    })
    expect(result.warnings).toContainEqual(expect.objectContaining({
      message: expect.stringContaining('single vendor'),
    }))
  })
})
