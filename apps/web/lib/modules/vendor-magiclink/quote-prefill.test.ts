import { describe, expect, it } from 'vitest'
import { buildVendorMagicLinkQuotePrefill } from './quote-prefill'
import type { ContractorRFQ } from '../../types/contractor'
import * as XLSX from 'xlsx'
import { PDFDocument, StandardFonts } from 'pdf-lib'

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

  it('audits 100 fake magic link RFQs against 10 vendor attachment patterns each', async () => {
    const rfqs = Array.from({ length: 100 }, (_, index) => makeAuditRfq(index))
    let checkedAttachments = 0
    let checkedFilledRows = 0
    let checkedExtraRows = 0
    let checkedNearReviewRows = 0

    for (const [rfqIndex, auditRfq] of rfqs.entries()) {
      for (let variant = 0; variant < 10; variant += 1) {
        const attachment = makeAuditAttachment(auditRfq, rfqIndex, variant)
        const result = await buildVendorMagicLinkQuotePrefill({
          rfq: auditRfq.rfq,
          vendorName: attachment.vendorName,
          source: {
            kind: 'file',
            file: {
              name: attachment.filename,
              type: 'text/csv',
              buffer: Buffer.from('not used by fake ingestion'),
            },
          },
          ingestFile: async () => ({
            filename: attachment.filename,
            sourceKind: 'spreadsheet',
            text: auditVendorQuoteCsv(attachment.vendorName, attachment.rows),
            warnings: [],
            diagnostics: { mode: 'normal' },
          }),
        })

        checkedAttachments += 1
        const expectedRows = attachment.rows.filter((row) => row.kind === 'match')
        const expectedByLineItemId = new Map(expectedRows.map((row) => [row.expectedLineItemId, row]))
        const actualByLineItemId = new Map(result.lineItemResponses.map((line) => [line.line_item_id, line]))

        expect([...actualByLineItemId.keys()].sort()).toEqual([...expectedByLineItemId.keys()].sort())
        expect(result.lineItemResponses.every((line) => !line.is_alternate)).toBe(true)

        for (const [lineItemId, sourceRow] of expectedByLineItemId) {
          const actual = actualByLineItemId.get(lineItemId)
          expect(actual).toBeDefined()
          expect(actual).toMatchObject({
            line_item_id: lineItemId,
            sku: sourceRow.sku,
            description: sourceRow.description,
            quantity: auditRfq.rfq.line_items.find((item) => item.id === lineItemId)?.quantity,
            quoted_quantity: sourceRow.quantity,
            unit: sourceRow.unit,
            unit_price: sourceRow.unitPrice,
            total_price: sourceRow.totalPrice,
            lead_time_days: sourceRow.leadTimeDays,
            is_alternate: false,
          })
          expect(actual?.response_attributes).toContainEqual(expect.objectContaining({
            key: 'vendor_quote_source',
            value: attachment.filename,
          }))
          checkedFilledRows += 1
        }

        for (const sourceRow of attachment.rows.filter((row) => row.kind !== 'match')) {
          expect(result.lineItemResponses.some((line) => line.description === sourceRow.description)).toBe(false)
          const unmatched = result.unmatchedRows.find((row) => row.description === sourceRow.description)
          expect(unmatched).toBeDefined()
          if (sourceRow.kind === 'near') {
            expect(actualByLineItemId.has(sourceRow.nearLineItemId)).toBe(false)
            expect(unmatched?.matchReviewReason).toContain('Possible match')
            expect(unmatched?.matchReviewReason).toContain('Review before applying')
            checkedNearReviewRows += 1
          } else {
            checkedExtraRows += 1
          }
        }
      }
    }

    expect(checkedAttachments).toBe(1_000)
    expect(checkedFilledRows).toBe(2_600)
    expect(checkedNearReviewRows).toBe(300)
    expect(checkedExtraRows).toBeGreaterThanOrEqual(1_000)
  })

  it('audits 100 fake magic link RFQs against 10 real uploaded attachment files across CSV, TSV, TXT, XLSX, and PDF', async () => {
    const rfqs = Array.from({ length: 100 }, (_, index) => makeAuditRfq(index))
    const formatCounts = new Map<string, number>()
    let checkedAttachments = 0
    let checkedFilledRows = 0
    let checkedExtraRows = 0
    let checkedNearReviewRows = 0

    for (const [rfqIndex, auditRfq] of rfqs.entries()) {
      for (let variant = 0; variant < 10; variant += 1) {
        const attachment = makeAuditAttachment(auditRfq, rfqIndex, variant)
        const uploadedFile = await renderAuditAttachmentFile(attachment, rfqIndex, variant)
        formatCounts.set(uploadedFile.format, (formatCounts.get(uploadedFile.format) ?? 0) + 1)

        const result = await buildVendorMagicLinkQuotePrefill({
          rfq: auditRfq.rfq,
          vendorName: attachment.vendorName,
          source: {
            kind: 'file',
            file: {
              name: uploadedFile.name,
              type: uploadedFile.type,
              buffer: uploadedFile.buffer,
            },
          },
        })

        checkedAttachments += 1
        const expectedRows = attachment.rows.filter((row) => row.kind === 'match')
        const expectedByLineItemId = new Map(expectedRows.map((row) => [row.expectedLineItemId, row]))
        const actualByLineItemId = new Map(result.lineItemResponses.map((line) => [line.line_item_id, line]))

        expect([...actualByLineItemId.keys()].sort()).toEqual([...expectedByLineItemId.keys()].sort())
        expect(result.lineItemResponses.every((line) => !line.is_alternate)).toBe(true)

        for (const [lineItemId, sourceRow] of expectedByLineItemId) {
          const actual = actualByLineItemId.get(lineItemId)
          expect(actual).toBeDefined()
          expect(actual).toMatchObject({
            line_item_id: lineItemId,
            sku: sourceRow.sku,
            description: sourceRow.description,
            quantity: auditRfq.rfq.line_items.find((item) => item.id === lineItemId)?.quantity,
            quoted_quantity: sourceRow.quantity,
            unit: sourceRow.unit,
            unit_price: sourceRow.unitPrice,
            total_price: sourceRow.totalPrice,
            lead_time_days: sourceRow.leadTimeDays,
            is_alternate: false,
          })
          expect(actual?.response_attributes).toContainEqual(expect.objectContaining({
            key: 'vendor_quote_source',
            value: uploadedFile.name,
          }))
          checkedFilledRows += 1
        }

        for (const sourceRow of attachment.rows.filter((row) => row.kind !== 'match')) {
          expect(result.lineItemResponses.some((line) => line.description === sourceRow.description)).toBe(false)
          const unmatched = result.unmatchedRows.find((row) => row.description === sourceRow.description)
          expect(unmatched).toBeDefined()
          if (sourceRow.kind === 'near') {
            expect(actualByLineItemId.has(sourceRow.nearLineItemId)).toBe(false)
            expect(unmatched?.matchReviewReason).toContain('Possible match')
            expect(unmatched?.matchReviewReason).toContain('Review before applying')
            checkedNearReviewRows += 1
          } else {
            checkedExtraRows += 1
          }
        }
      }
    }

    expect(checkedAttachments).toBe(1_000)
    expect(checkedFilledRows).toBe(2_600)
    expect(checkedNearReviewRows).toBe(300)
    expect(checkedExtraRows).toBeGreaterThanOrEqual(1_000)
    expect([...formatCounts.entries()].sort()).toEqual([
      ['csv', 200],
      ['pdf', 200],
      ['tsv', 200],
      ['txt', 200],
      ['xlsx', 200],
    ])
  }, 120_000)
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

interface AuditMaterial {
  id: string
  sku: string
  description: string
  quantity: number
  unit: string
}

interface AuditRfq {
  rfq: ContractorRFQ
  materials: AuditMaterial[]
}

interface AuditQuoteRow {
  kind: 'match' | 'extra' | 'near'
  sku: string
  description: string
  quantity: number
  unit: string
  unitPrice: number
  totalPrice: number
  leadTimeDays: number
  expectedLineItemId: string
  nearLineItemId: string
}

interface AuditAttachment {
  vendorName: string
  filename: string
  rows: AuditQuoteRow[]
}

const AUDIT_MATERIALS: AuditMaterial[] = [
  { id: 'cross-tee-4', sku: 'CT-4-15/16-FW', description: '4 ft 15/16 in fire-rated cross tee', quantity: 500, unit: 'ea' },
  { id: 'main-runner-12', sku: 'MR-12-HD', description: '12 ft heavy-duty main runner', quantity: 80, unit: 'ea' },
  { id: 'cross-tee-2', sku: 'CT-2-15/16', description: '2 ft 15/16 in cross tee', quantity: 320, unit: 'ea' },
  { id: 'wall-angle-10', sku: 'WA-10-7/8', description: '10 ft 7/8 in wall angle', quantity: 120, unit: 'ea' },
  { id: 'gypsum-58', sku: 'GWB-58-FC', description: '5/8 in fire code gypsum board', quantity: 620, unit: 'sheet' },
  { id: 'stud-18', sku: 'STUD-362S162-18', description: '3-5/8 in 18 gauge metal stud', quantity: 880, unit: 'ea' },
  { id: 'track-20', sku: 'TRACK-362T125-20', description: '3-5/8 in 20 gauge metal track', quantity: 210, unit: 'ea' },
  { id: 'emt-075', sku: 'EMT-075', description: '3/4 in EMT conduit', quantity: 1200, unit: 'ft' },
  { id: 'box-4sq', sku: 'BOX-4SQ-DEEP', description: '4 in square deep junction box', quantity: 140, unit: 'ea' },
  { id: 'wire-12', sku: 'THHN-12-BLK', description: '12 AWG black THHN copper wire', quantity: 5000, unit: 'ft' },
  { id: 'rebar-5', sku: 'REBAR-5-G60', description: '#5 grade 60 rebar', quantity: 3000, unit: 'ft' },
  { id: 'wire-mesh', sku: 'WWM-66-1010', description: '6x6 W10/W10 welded wire mesh sheet', quantity: 90, unit: 'sheet' },
  { id: 'vapor-15', sku: 'VAPOR-15MIL', description: '15 mil underslab vapor barrier', quantity: 18000, unit: 'sf' },
  { id: 'door-3070', sku: 'HM-3070-LH', description: '3 ft x 7 ft hollow metal left hand door', quantity: 12, unit: 'ea' },
  { id: 'frame-16', sku: 'FRAME-3070-16GA', description: '16 gauge welded hollow metal frame', quantity: 12, unit: 'ea' },
  { id: 'hinge-45', sku: 'BB-HINGE-45', description: '4.5 in ball bearing hinge set', quantity: 36, unit: 'set' },
  { id: 'insul-2', sku: 'INSUL-XPS-2', description: '2 in rigid insulation board', quantity: 240, unit: 'sheet' },
  { id: 'mineral-15', sku: 'MW-1-1/2', description: '1-1/2 in mineral wool board', quantity: 160, unit: 'sheet' },
  { id: 'pvc-6', sku: 'PVC-S40-6', description: '6 in PVC schedule 40 pipe', quantity: 440, unit: 'ft' },
  { id: 'copper-2', sku: 'CU-L-2', description: '2 in copper type L pipe', quantity: 260, unit: 'ft' },
  { id: 'primer-5', sku: 'PRIMER-ACR-5GAL', description: '5 gal acrylic primer', quantity: 48, unit: 'pail' },
  { id: 'felt-30', sku: 'FELT-30LB', description: '30 lb roofing felt roll', quantity: 75, unit: 'roll' },
  { id: 'tile-2424', sku: 'ACT-24X24', description: '24 in x 24 in lay-in ceiling tile', quantity: 900, unit: 'ea' },
  { id: 'cmu-8', sku: 'CMU-8', description: '8 in concrete masonry unit', quantity: 2500, unit: 'ea' },
  { id: 'plywood-12', sku: 'PLY-1/2-CDX', description: '1/2 in plywood sheathing', quantity: 180, unit: 'sheet' },
]

const AUDIT_EXTRA_DESCRIPTIONS = [
  '10 ft vinyl corner bead',
  'aluminum surface closer package',
  'white pigmented curing compound',
  'stainless steel sink faucet trim',
  'temporary safety fence panel',
]

function makeAuditRfq(index: number): AuditRfq {
  const start = (index * 3) % AUDIT_MATERIALS.length
  const materials = Array.from({ length: 5 }, (_, offset) => AUDIT_MATERIALS[(start + offset) % AUDIT_MATERIALS.length])
  const rfq = makeRfq(`audit-${index}`, materials.map((material, offset) => [
    `audit-${index}-line-${offset}`,
    material.sku,
    material.description,
    material.quantity + (index % 4) * 3,
    material.unit,
  ]))
  return { rfq, materials }
}

function makeAuditAttachment(auditRfq: AuditRfq, rfqIndex: number, variant: number): AuditAttachment {
  const vendorName = `Audit Vendor ${rfqIndex}-${variant}`
  const rows: AuditQuoteRow[] = []
  const addMatch = (itemIndex: number, rowIndex: number, options: { sku?: string, description?: string } = {}) => {
    const item = auditRfq.rfq.line_items[itemIndex]
    rows.push(makeAuditRow({
      kind: 'match',
      rfqIndex,
      variant,
      rowIndex,
      sku: options.sku ?? item.sku,
      description: options.description ?? item.description,
      quantity: item.quantity,
      unit: item.unit,
      expectedLineItemId: item.id,
    }))
  }
  const addNear = (itemIndex: number, rowIndex: number) => {
    const item = auditRfq.rfq.line_items[itemIndex]
    rows.push(makeAuditRow({
      kind: 'near',
      rfqIndex,
      variant,
      rowIndex,
      sku: '',
      description: removeOneRequestedDetail(item.description),
      quantity: item.quantity,
      unit: item.unit,
      nearLineItemId: item.id,
    }))
  }
  const addExtra = (rowIndex: number) => {
    rows.push(makeAuditRow({
      kind: 'extra',
      rfqIndex,
      variant,
      rowIndex,
      sku: `EXTRA-${rfqIndex}-${variant}-${rowIndex}`,
      description: AUDIT_EXTRA_DESCRIPTIONS[(rfqIndex + variant + rowIndex) % AUDIT_EXTRA_DESCRIPTIONS.length],
      quantity: 10 + ((rfqIndex + rowIndex) % 20),
      unit: 'ea',
    }))
  }

  if (variant === 0) {
    addMatch(0, 0)
    addMatch(1, 1)
    addMatch(2, 2)
    addExtra(3)
  } else if (variant === 1) {
    addMatch(0, 0, { sku: '' })
    addMatch(1, 1, { sku: '' })
    addMatch(3, 2, { sku: '' })
    addExtra(3)
  } else if (variant === 2) {
    addMatch(2, 0, { description: `Vendor stocked ${auditRfq.rfq.line_items[2].description}` })
    addMatch(3, 1, { description: `Vendor stocked ${auditRfq.rfq.line_items[3].description}` })
    addMatch(4, 2, { description: `Vendor stocked ${auditRfq.rfq.line_items[4].description}` })
    addExtra(3)
  } else if (variant === 3) {
    addMatch(0, 0)
    addNear(1, 1)
    addMatch(4, 2)
    addExtra(3)
  } else if (variant === 4) {
    addExtra(0)
    addExtra(1)
    addExtra(2)
    addExtra(3)
    addExtra(4)
  } else if (variant === 5) {
    addMatch(0, 0)
    addMatch(1, 1)
    addMatch(2, 2)
    addMatch(3, 3)
    addMatch(4, 4)
    addExtra(5)
  } else if (variant === 6) {
    addMatch(0, 0)
    addMatch(1, 1)
    addMatch(2, 2)
    addMatch(3, 3)
    addExtra(4)
  } else if (variant === 7) {
    addMatch(1, 0, { sku: '' })
    addNear(2, 1)
    addMatch(3, 2, { sku: '' })
    addExtra(3)
  } else if (variant === 8) {
    addMatch(0, 0)
    addMatch(2, 1, { sku: '' })
    addMatch(4, 2)
    addExtra(3)
    addExtra(4)
  } else {
    addNear(0, 0)
    addMatch(4, 1)
    addExtra(2)
  }

  return {
    vendorName,
    filename: `audit-rfq-${rfqIndex}-attachment-${variant}.csv`,
    rows,
  }
}

function makeAuditRow(params: {
  kind: AuditQuoteRow['kind']
  rfqIndex: number
  variant: number
  rowIndex: number
  sku: string
  description: string
  quantity: number
  unit: string
  expectedLineItemId?: string
  nearLineItemId?: string
}): AuditQuoteRow {
  const unitPrice = Number((0.75 + (((params.rfqIndex + 1) * (params.variant + 2) * (params.rowIndex + 3)) % 197) / 10).toFixed(2))
  return {
    kind: params.kind,
    sku: params.sku,
    description: params.description,
    quantity: params.quantity,
    unit: params.unit,
    unitPrice,
    totalPrice: Number((params.quantity * unitPrice).toFixed(2)),
    leadTimeDays: 3 + ((params.rfqIndex + params.variant + params.rowIndex) % 21),
    expectedLineItemId: params.expectedLineItemId ?? '',
    nearLineItemId: params.nearLineItemId ?? '',
  }
}

function removeOneRequestedDetail(description: string) {
  const patterns = [
    /\b\d+(?:\.\d+)?(?:-\d+\/\d+)?\s*(?:ft|in|gal|lb)\b/i,
    /\b\d+\/\d+\s*(?:ft|in)\b/i,
    /#\s*\d+\b/i,
    /\bgrade\s*\d+\b/i,
    /\b\d+\s*(?:ga|gauge|awg|mil)\b/i,
    /\b\d+\s*x\s*\d+\b/i,
    /\bw\d+\b/i,
  ]
  for (const pattern of patterns) {
    if (pattern.test(description)) {
      return description.replace(new RegExp(pattern.source, 'gi'), '').replace(/\s+/g, ' ').trim()
    }
  }
  return description.replace(/\b[a-z0-9-]+\b/i, '').replace(/\s+/g, ' ').trim()
}

function auditVendorQuoteCsv(vendorName: string, rows: AuditQuoteRow[]) {
  return [
    'Supplier,Item,SKU,Description,Qty,Unit,Unit Price,Total Price,Lead Time,Notes',
    ...rows.map((row, index) => [
      vendorName,
      index + 1,
      row.sku,
      row.description,
      row.quantity,
      row.unit,
      row.unitPrice,
      row.totalPrice,
      `${row.leadTimeDays} days`,
      `${row.kind} generated attachment row`,
    ].map(csvCell).join(',')),
  ].join('\n')
}

function csvCell(value: string | number) {
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function auditVendorQuoteRows(vendorName: string, rows: AuditQuoteRow[]) {
  return [
    ['Supplier', 'Item', 'SKU', 'Description', 'Qty', 'Unit', 'Unit Price', 'Total Price', 'Lead Time', 'Notes'],
    ...rows.map((row, index) => [
      vendorName,
      index + 1,
      row.sku,
      row.description,
      row.quantity,
      row.unit,
      row.unitPrice,
      row.totalPrice,
      `${row.leadTimeDays} days`,
      `${row.kind} generated attachment row`,
    ]),
  ]
}

async function renderAuditAttachmentFile(
  attachment: AuditAttachment,
  rfqIndex: number,
  variant: number,
): Promise<{ format: string, name: string, type: string, buffer: Buffer }> {
  const formats = ['csv', 'tsv', 'xlsx', 'pdf', 'txt'] as const
  const format = formats[(rfqIndex + variant) % formats.length]
  const baseName = `audit-rfq-${rfqIndex}-attachment-${variant}`
  const rows = auditVendorQuoteRows(attachment.vendorName, attachment.rows)

  if (format === 'xlsx') {
    const worksheet = XLSX.utils.aoa_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Vendor Quote')
    return {
      format,
      name: `${baseName}.xlsx`,
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer,
    }
  }

  if (format === 'pdf') {
    const text = rows.map((row) => row.map(csvCell).join(',')).join('\n')
    return {
      format,
      name: `${baseName}.pdf`,
      type: 'application/pdf',
      buffer: await auditQuotePdfBuffer(text),
    }
  }

  if (format === 'tsv') {
    return {
      format,
      name: `${baseName}.tsv`,
      type: 'text/tab-separated-values',
      buffer: Buffer.from(rows.map((row) => row.join('\t')).join('\n'), 'utf8'),
    }
  }

  if (format === 'txt') {
    return {
      format,
      name: `${baseName}.txt`,
      type: 'text/plain',
      buffer: Buffer.from(rows.map((row) => row.map(csvCell).join(',')).join('\n'), 'utf8'),
    }
  }

  return {
    format,
    name: `${baseName}.csv`,
    type: 'text/csv',
    buffer: Buffer.from(rows.map((row) => row.map(csvCell).join(',')).join('\n'), 'utf8'),
  }
}

async function auditQuotePdfBuffer(text: string) {
  const pdf = await PDFDocument.create()
  const page = pdf.addPage([1_200, 720])
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  let y = 680
  for (const line of text.split('\n')) {
    page.drawText(line, { x: 32, y, size: 9, font })
    y -= 14
  }
  return Buffer.from(await pdf.save())
}
