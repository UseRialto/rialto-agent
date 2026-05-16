import { describe, expect, it } from 'vitest'
import { buildVendorMagicLinkQuotePrefill } from './quote-prefill'
import type { ContractorRFQ } from '../../types/contractor'

const rfq: ContractorRFQ = {
  id: 'rfq-1',
  project_id: 'project-1',
  title: 'Ceiling grid',
  status: 'active',
  line_items: [
    { id: 'line-cross-tee', sku: 'CT-4-15/16-FW', description: '4 ft 15/16 in Fire-rated Cross Tee', quantity: 500, unit: 'ea' },
  ],
  invited_vendor_ids: [],
  invited_vendor_emails: [],
  visibility: 'invited_only',
  created_at: '2026-05-14T12:00:00.000Z',
}

describe('vendor magic link quote prefill', () => {
  it('prefills editable responses from an uploaded quote file through the intake module', async () => {
    const result = await buildVendorMagicLinkQuotePrefill({
      rfq,
      vendorName: 'Ceiling Supply',
      source: {
        kind: 'file',
        file: {
          name: 'quote.csv',
          type: 'text/csv',
          buffer: Buffer.from('not used by fake ingestion'),
        },
      },
      ingestFile: async () => ({
        filename: 'quote.csv',
        sourceKind: 'spreadsheet',
        text: [
          'Supplier,Item,SKU,Description,Qty,Unit,Unit Price,Total Price,Lead Time,Notes',
          'Ceiling Supply,1,CT-4-15/16-FW,USG Donn DXL 4 ft 15/16 in fire-rated cross tee,500,ea,1.25,625,5 days,Exact product',
        ].join('\n'),
        warnings: [],
        diagnostics: { mode: 'normal' },
      }),
    })

    expect(result.lineItemResponses).toHaveLength(1)
    expect(result.lineItemResponses[0]).toMatchObject({
      line_item_id: 'line-cross-tee',
      unit_price: 1.25,
      total_price: 625,
    })
  })

  it('prefills editable responses from pasted inline quote text', async () => {
    const result = await buildVendorMagicLinkQuotePrefill({
      rfq,
      vendorName: 'Ceiling Supply',
      source: {
        kind: 'inline_text',
        text: 'USG Donn DXL 4 ft cross tee 15/16 fire-rated, qty 500 ea, unit price $1.82, lead time 5 days',
      },
    })

    expect(result.lineItemResponses).toHaveLength(1)
    expect(result.lineItemResponses[0]).toMatchObject({
      line_item_id: 'line-cross-tee',
      unit_price: 1.82,
      total_price: 910,
    })
    expect(result.warnings).toContainEqual(expect.objectContaining({
      message: expect.stringContaining('pasted email reply text'),
    }))
  })

  it('returns structured unmatched rows so vendors can assign quote lines to requested items', async () => {
    const result = await buildVendorMagicLinkQuotePrefill({
      rfq,
      vendorName: 'Ceiling Supply',
      source: {
        kind: 'file',
        file: {
          name: 'ceiling-mixed.csv',
          type: 'text/csv',
          buffer: Buffer.from('not used by fake ingestion'),
        },
      },
      ingestFile: async () => ({
        filename: 'ceiling-mixed.csv',
        sourceKind: 'spreadsheet',
        text: [
          'Supplier,Item,SKU,Description,Qty,Unit,Unit Price,Total Price,Lead Time,Notes',
          'Ceiling Supply,1,CT-4-15/16-FW,USG Donn DXL 4 ft 15/16 in fire-rated cross tee,500,ea,1.25,625,5 days,Exact product',
          'Ceiling Supply,2,EDGE-ANGLE-12,12 ft perimeter wall angle,80,ea,3.10,248,7 days,Not on request',
        ].join('\n'),
        warnings: [],
        diagnostics: { mode: 'normal' },
      }),
    })

    expect(result.lineItemResponses).toHaveLength(1)
    expect(result.unmatchedRows).toEqual([
      expect.objectContaining({
        filename: 'ceiling-mixed.csv',
        sku: 'EDGE-ANGLE-12',
        description: '12 ft perimeter wall angle',
        quantity: 80,
        unit: 'ea',
        unitPrice: 3.1,
        totalPrice: 248,
      }),
    ])
    expect(result.warnings).toContainEqual(expect.objectContaining({
      message: expect.stringContaining('Could not match "12 ft perimeter wall angle"'),
    }))
  })

  it('stress-tests varied RFQ quote files with matched and unmatched vendor attachment rows', async () => {
    const rfqs: ContractorRFQ[] = [
      makeRfq('doors', [
        ['door-1', 'HM-3070-LH', '3 ft x 7 ft hollow metal left hand door', 12, 'ea'],
        ['frame-1', 'FRAME-3070-16GA', '16 gauge welded hollow metal frame', 12, 'ea'],
        ['hinge-1', 'BB-HINGE-45', '4.5 in ball bearing hinge set', 36, 'set'],
      ]),
      makeRfq('electrical', [
        ['emt-1', 'EMT-075', '3/4 in EMT conduit', 1200, 'ft'],
        ['box-1', 'BOX-4SQ-DEEP', '4 in square deep junction box', 140, 'ea'],
        ['wire-1', 'THHN-12-BLK', '12 AWG black THHN copper wire', 5000, 'ft'],
      ]),
      makeRfq('concrete', [
        ['rebar-1', 'REBAR-5-G60', '#5 grade 60 rebar', 3000, 'ft'],
        ['mesh-1', 'WWM-66-1010', '6x6 W10/W10 welded wire mesh sheets', 90, 'sheet'],
        ['vapor-1', 'VAPOR-15MIL', '15 mil underslab vapor barrier', 18000, 'sf'],
      ]),
      makeRfq('drywall', [
        ['board-1', 'GWB-58-FC', '5/8 in fire code gypsum board', 620, 'sheet'],
        ['stud-1', 'STUD-362S162-18', '3-5/8 in 18 gauge metal stud', 880, 'ea'],
        ['track-1', 'TRACK-362T125-18', '3-5/8 in 18 gauge metal track', 210, 'ea'],
      ]),
    ]
    const vendorAttachments: Array<{
      vendorName: string
      quoteRows: Array<[string, string, number, string, number, number]>
    }> = [
      {
        vendorName: 'Metro Door Supply',
        quoteRows: [
          ['HM-3070-LH', '3 ft x 7 ft hollow metal left hand door', 12, 'ea', 188.5, 2262],
          ['FRAME-3070-16GA', '16 gauge welded hollow metal frame', 12, 'ea', 93.25, 1119],
          ['CLOSER-ALUM', 'Aluminum surface closer package', 12, 'ea', 54.1, 649.2],
        ],
      },
      {
        vendorName: 'Brightline Electrical',
        quoteRows: [
          ['EMT-075', '3/4 in EMT conduit', 1200, 'ft', 0.72, 864],
          ['THHN-12-BLK', '12 AWG black THHN copper wire', 5000, 'ft', 0.19, 950],
          ['THHN-12-RED', '12 AWG red THHN copper wire extra spool', 5000, 'ft', 0.2, 1000],
        ],
      },
      {
        vendorName: 'Pacific Concrete Materials',
        quoteRows: [
          ['REBAR-5-G60', '#5 grade 60 rebar', 3000, 'ft', 1.08, 3240],
          ['WWM-66-1010', '6x6 W10/W10 welded wire mesh sheets', 90, 'sheet', 74.5, 6705],
          ['CURING-COMP', 'White pigmented curing compound', 42, 'gal', 18.75, 787.5],
        ],
      },
      {
        vendorName: 'Interior Systems Supply',
        quoteRows: [
          ['GWB-58-FC', '5/8 in fire code gypsum board', 620, 'sheet', 15.4, 9548],
          ['STUD-362S162-18', '3-5/8 in 18 gauge metal stud', 880, 'ea', 7.85, 6908],
          ['CORNER-BEAD-10', '10 ft vinyl corner bead', 180, 'ea', 2.25, 405],
        ],
      },
    ]

    for (let index = 0; index < rfqs.length; index += 1) {
      const attachment = vendorAttachments[index]
      const result = await buildVendorMagicLinkQuotePrefill({
        rfq: rfqs[index],
        vendorName: attachment.vendorName,
        source: {
          kind: 'file',
          file: {
            name: `${attachment.vendorName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`,
            type: 'text/csv',
            buffer: Buffer.from('not used by fake ingestion'),
          },
        },
        ingestFile: async () => ({
          filename: `${attachment.vendorName}.csv`,
          sourceKind: 'spreadsheet',
          text: vendorQuoteCsv(attachment.vendorName, attachment.quoteRows),
          warnings: [],
          diagnostics: { mode: 'normal' },
        }),
      })

      expect(result.lineItemResponses).toHaveLength(2)
      expect(result.unmatchedRows).toHaveLength(1)
      expect(result.lineItemResponses.every((line) => !line.is_alternate)).toBe(true)
      expect(result.warnings.map((warning) => warning.message).join('\n')).toContain('Could not match')
    }
  })
})

function makeRfq(id: string, rows: Array<[string, string, string, number, string]>): ContractorRFQ {
  return {
    id: `rfq-${id}`,
    project_id: `project-${id}`,
    title: `${id} package`,
    status: 'active',
    line_items: rows.map(([lineId, sku, description, quantity, unit]) => ({
      id: lineId,
      sku,
      description,
      quantity,
      unit,
    })),
    invited_vendor_ids: [],
    invited_vendor_emails: [],
    visibility: 'invited_only',
    created_at: '2026-05-14T12:00:00.000Z',
  }
}

function vendorQuoteCsv(
  vendorName: string,
  rows: Array<[string, string, number, string, number, number]>,
) {
  return [
    'Supplier,Item,SKU,Description,Qty,Unit,Unit Price,Total Price,Lead Time,Notes',
    ...rows.map(([sku, description, quantity, unit, unitPrice, totalPrice], index) => (
      [
        vendorName,
        index + 1,
        sku,
        description,
        quantity,
        unit,
        unitPrice,
        totalPrice,
        `${5 + index} days`,
        'Generated vendor attachment',
      ].join(',')
    )),
  ].join('\n')
}
