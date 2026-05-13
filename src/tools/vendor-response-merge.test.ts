import { describe, expect, it } from 'vitest'
import { ingestWorkbookFromSheets } from './workbook-agent.js'
import {
  createVendorMergePatch,
  extractVendorResponseFromWorkbook,
  matchVendorRowsToComparisonItems,
} from './vendor-response-merge.js'

const snapshot = {
  columns: [
    { key: 'item', label: 'Item', kind: 'rfq-core' },
    { key: 'description', label: 'Description', kind: 'rfq-core' },
    { key: 'qty', label: 'Qty', kind: 'rfq-core' },
    { key: 'unit', label: 'Unit', kind: 'rfq-core' },
    { key: 'vendor-acme:total', label: 'Acme Total', kind: 'vendor', vendorName: 'Acme', metric: 'total' },
  ],
  rows: [
    { id: 'line-x', description: 'Drywall 5/8 Type X', values: { item: 'X', description: 'Drywall 5/8 Type X', qty: '12500', unit: 'LF' } },
    { id: 'line-y', description: 'Metal studs 20ga', values: { item: 'Y', description: 'Metal studs 20ga', qty: '8000', unit: 'LF' } },
    { id: 'line-z', description: 'J track 20ga', values: { item: 'Z', description: 'J track 20ga', qty: '4500', unit: 'LF' } },
  ],
  vendors: [{ id: 'acme', name: 'Acme' }],
}

function buildCoWorkbook() {
  return ingestWorkbookFromSheets({
    id: 'wb-buildco',
    sheets: [{
      name: 'BuildCo Quote',
      rows: [
        ['Item', 'Description', 'Qty', 'Unit', 'Unit Price', 'Total', 'Lead Time', 'Exclusions', 'Alternate'],
        ['X', 'Drywall 5/8 Type X', '12500', 'LF', '$0.12', '$1,500', '4 weeks', 'excludes delivery', ''],
        ['Y', 'Metal studs 20ga', '8000', 'LF', '$0.11', '$880', '2 weeks', '', ''],
        ['Z', 'J track 20ga', '4500', 'LF', '$0.10', '$450', '18 days', '', ''],
        ['PKG', 'Project lump sum quote', '1', 'LS', '', '$9,100', '2 weeks', '', ''],
        ['EXTRA', 'Shaftwall liner panels', '200', 'EA', '$20', '$4,000', '3 weeks', '', 'alternate scope'],
      ],
    }],
    now: '2026-05-12T12:00:00.000Z',
  })
}

describe('vendor response merge tools', () => {
  it('extracts vendor response tables after workbook preamble rows', () => {
    const workbook = ingestWorkbookFromSheets({
      id: 'wb-harbor-steel',
      sheets: [{
        name: 'Harbor Steel Quote',
        rows: [
          ['Vendor', 'Harbor Steel Supply'],
          ['Project', 'MCRD P-314'],
          [],
          ['Line #', 'Product Code', 'Material Description', 'Requested Qty', 'U/M', 'Each', 'Ext Amount', 'Availability', 'Clarifications'],
          ['A001', '250CH-33', '2.5 in 22ga CH Stud 10 ft', '2420', 'LF', '1.09', '2642.16', '3-4 weeks', ''],
          ['A002', '250JR-33', '2.5 in 20ga J Track 12 ft', '458', 'LF', '1.11', '507.19', '18 business days', 'alternate manufacturer acceptable'],
          ['A006', 'GWB-58X', '5/8" Type X Gypsum Board 4x12', '620', 'Sheet', '17.31', '10730.22', '18 business days', 'excludes stocking fees'],
        ],
      }],
    })

    const response = extractVendorResponseFromWorkbook({ workbook })

    expect(response).toMatchObject({
      vendorName: 'Harbor Steel Supply',
      lineItems: [
        { sourceRow: 5, itemCode: '250CH-33', description: '2.5 in 22ga CH Stud 10 ft', qty: 2420, unit: 'LF', unitPrice: 1.09, totalPrice: 2642.16, leadTime: '3-4 weeks' },
        { sourceRow: 6, itemCode: '250JR-33', description: '2.5 in 20ga J Track 12 ft', totalPrice: 507.19, exclusions: 'alternate manufacturer acceptable' },
        { sourceRow: 7, itemCode: 'GWB-58X', description: '5/8" Type X Gypsum Board 4x12', exclusions: 'excludes stocking fees' },
      ],
    })
  })

  it('extracts structured vendor response rows and excludes total package rows', () => {
    const response = extractVendorResponseFromWorkbook({
      workbook: buildCoWorkbook(),
      vendorNameHint: 'BuildCo',
    })

    expect(response).toMatchObject({
      sourceWorkbookId: 'wb-buildco',
      vendorName: 'BuildCo',
      confidence: 0.95,
      lineItems: [
        { sourceRow: 2, itemCode: 'X', description: 'Drywall 5/8 Type X', qty: 12500, unit: 'LF', unitPrice: 0.12, totalPrice: 1500, leadTime: '4 weeks', exclusions: 'excludes delivery' },
        { sourceRow: 3, itemCode: 'Y', totalPrice: 880 },
        { sourceRow: 4, itemCode: 'Z', totalPrice: 450 },
        { sourceRow: 6, itemCode: 'EXTRA', alternate: 'alternate scope' },
      ],
      totals: [{ sourceRow: 5, label: 'Project lump sum quote', value: 9100 }],
    })
    expect(response.lineItems[0].provenance).toMatchObject({
      cells: expect.arrayContaining(['BuildCo Quote!A2', 'BuildCo Quote!F2']),
      rawValues: { Total: '$1,500' },
    })
    expect(response.warnings).toContain('1 total/package row excluded from line-item matching.')
  })

  it('matches rows by item code, description, quantity/unit, and reports unmatched rows', () => {
    const response = extractVendorResponseFromWorkbook({ workbook: buildCoWorkbook(), vendorNameHint: 'BuildCo' })
    const report = matchVendorRowsToComparisonItems({ snapshot, response })

    expect(report.matches.map((match) => [match.sourceRow, match.targetRowId, match.matchBasis])).toEqual([
      [2, 'line-x', ['item_code', 'description_exact', 'quantity_unit']],
      [3, 'line-y', ['item_code', 'description_exact', 'quantity_unit']],
      [4, 'line-z', ['item_code', 'description_exact', 'quantity_unit']],
    ])
    expect(report.unmatchedSourceRows).toMatchObject([{ sourceRow: 6, description: 'Shaftwall liner panels' }])
    expect(report.unquotedTargetRows).toEqual([])
  })

  it('creates one visible proposal, adds vendor columns, flags unmatched rows, and verifies total-row exclusion', () => {
    const response = extractVendorResponseFromWorkbook({ workbook: buildCoWorkbook(), vendorNameHint: 'BuildCo' })
    const report = matchVendorRowsToComparisonItems({ snapshot, response })
    const patch = createVendorMergePatch({ snapshot, response, report })

    expect(patch.fragment.operations).toEqual(expect.arrayContaining([
      { kind: 'insert-column', colKey: 'vendor-buildco:unit_price', label: 'BuildCo Unit Price', afterColKey: 'vendor-acme:total' },
      { kind: 'insert-column', colKey: 'vendor-buildco:total', label: 'BuildCo Total', afterColKey: 'vendor-buildco:unit_price' },
      { kind: 'insert-column', colKey: 'vendor-buildco:lead', label: 'BuildCo Lead Time', afterColKey: 'vendor-buildco:total' },
      { kind: 'insert-column', colKey: 'vendor-buildco:alternate', label: 'BuildCo Alternate / Notes', afterColKey: 'vendor-buildco:lead' },
      { kind: 'set-cell', rowKey: 'line-x', colKey: 'vendor-buildco:total', value: 1500, note: expect.stringContaining('row 2') },
      { kind: 'add-highlight', id: 'hl-unmatched-wb-buildco-6', selector: { kind: 'rule', rule: 'highest-coverage-overall' }, color: 'yellow', note: expect.stringContaining('Shaftwall liner panels') },
    ]))
    expect(patch.fragment.provenanceNotes).toEqual(expect.arrayContaining([
      { rowKey: 'line-x', colKey: 'vendor-buildco:total', sourceId: 'wb-buildco', note: expect.stringContaining('BuildCo Quote row 2') },
    ]))
    expect(patch.verification).toMatchObject({
      ok: true,
      checks: expect.arrayContaining([
        { id: 'total-package-rows-excluded', ok: true, message: 'Total/package rows are excluded from line-item matches.' },
      ]),
    })
  })
})
