import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import {
  applyPatch,
  compareVendorsByLineItem,
  createCheapestValidHighlightPatch,
  createConvertedQuantityPatch,
  ingestWorkbook,
  previewPatch,
  readRange,
  rollbackPatch,
  type WorkbookPatch,
} from './excel-workbook-agent.js'

describe('Excel workbook agent backend tools', () => {
  it('ingests RFQ workbooks, extracts schema, reads ranges, and audits deterministic tool calls', async () => {
    const context = await ingestWorkbook({ filename: 'rfq.xlsx', buffer: await rfqWorkbookBuffer() })

    expect(context.sheets).toHaveLength(1)
    expect(context.sheets[0]).toMatchObject({
      name: 'Vendor Quotes',
      headerRow: 1,
      rowCount: 8,
      columnCount: 10,
    })
    expect(context.sheets[0].columns.map((column) => [column.label, column.role, column.vendorName])).toContainEqual(['Acme Price', 'vendor-price', 'Acme'])
    expect(context.sheets[0].columns.map((column) => [column.label, column.role, column.vendorName])).toContainEqual(['BuildCo Lead Time', 'vendor-lead-time', 'BuildCo'])

    expect(readRange(context, 'Vendor Quotes', 'A1:C3')).toMatchObject({
      values: [
        ['Item', 'Qty', 'Unit'],
        ['Drywall 5/8 Type X', '12,500 LF', 'LF'],
        ['Metal studs 20ga', '8,000 linear ft', 'LF'],
      ],
    })
    expect(context.auditLog.map((entry) => entry.action)).toEqual(['ingest_workbook', 'read_range'])
  })

  it('compares vendors by line item without treating total package rows as itemized quotes', async () => {
    const context = await ingestWorkbook({ filename: 'rfq.xlsx', buffer: await rfqWorkbookBuffer() })
    const result = compareVendorsByLineItem(context, 'Vendor Quotes')

    expect(result.vendorPriceColumns.map((column) => column.vendorName)).toEqual(['Acme', 'L n W', 'BuildCo'])
    expect(result.rows.map((row) => [row.item, row.lowestVendor, row.lowestValue])).toEqual([
      ['Drywall 5/8 Type X', 'L n W', 1150],
      ['Metal studs 20ga', 'L n W', 940],
      ['J track 20ga', 'BuildCo', 500],
      ['Fasteners', 'BuildCo', 280],
      ['Insulation rolls', 'BuildCo', 2100],
      ['No quote line', undefined, undefined],
    ])
    expect(result.rows.find((row) => row.item === 'Project lump sum quote')).toBeUndefined()
    expect(result.partialVendors).toContainEqual({ vendorName: 'BuildCo', missingCount: 2, missingItems: ['Metal studs 20ga', 'No quote line'] })
  })

  it('previews, applies, verifies, audits, and rolls back a converted quantity column patch', async () => {
    const context = await ingestWorkbook({ filename: 'rfq.xlsx', buffer: await rfqWorkbookBuffer() })
    const originalVersionId = context.history[0].versionId
    const patch = createConvertedQuantityPatch(context, {
      sheet: 'Vendor Quotes',
      sourceColumnLabel: 'Qty',
      newColumnName: 'Qty (k LF)',
      divisor: 1000,
    })

    expect(patch).toMatchObject({
      summary: 'Add Qty (k LF) converted from Qty.',
      risk_level: 'safe',
      requires_approval: false,
      preview: {
        changed_cells: 8,
        warnings: [],
      },
    })
    expect(patch.preview.sample_before_after.slice(0, 2)).toEqual([
      { sheet: 'Vendor Quotes', cell: 'C2', before: null, after: 12.5 },
      { sheet: 'Vendor Quotes', cell: 'C3', before: null, after: 8 },
    ])

    const result = await applyPatch(context, patch)
    expect(result.verification).toMatchObject({
      ok: true,
      rowCountStable: true,
      noUnintendedOverwrites: true,
      checkedOperations: 8,
    })
    expect(context.workbook.getWorksheet('Vendor Quotes')?.getCell('C2').value).toBe(12.5)
    expect(context.workbook.getWorksheet('Vendor Quotes')?.getCell('B2').value).toBe('12,500 LF')
    expect(context.auditLog.map((entry) => entry.action)).toContain('apply_patch')

    await rollbackPatch(context, originalVersionId)
    expect(context.workbook.getWorksheet('Vendor Quotes')?.getCell('D1').value).toBe('Acme Price')
    expect(context.workbook.getWorksheet('Vendor Quotes')?.getCell('B2').value).toBe('12,500 LF')
  })

  it('creates a safe cheapest valid quote highlight patch and verifies highlighted cells', async () => {
    const context = await ingestWorkbook({ filename: 'rfq.xlsx', buffer: await rfqWorkbookBuffer() })
    const patch = createCheapestValidHighlightPatch(context, 'Vendor Quotes')

    expect(patch).toMatchObject({
      summary: 'Highlight 5 cheapest valid vendor price cells.',
      operations: [{ op: 'highlight_cells', sheet: 'Vendor Quotes', color: 'green' }],
      preview: { changed_cells: 5, warnings: [] },
    })
    expect(patch.operations[0]).toMatchObject({
      cells: ['F2', 'F3', 'H4', 'H5', 'H6'],
    })

    await applyPatch(context, patch)
    const fill = context.workbook.getWorksheet('Vendor Quotes')?.getCell('F2').fill
    expect(fill).toMatchObject({ type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF92D050' } })
  })

  it('requires approval when a patch would overwrite existing values or create a summary sheet', async () => {
    const context = await ingestWorkbook({ filename: 'rfq.xlsx', buffer: await rfqWorkbookBuffer() })
    const patch: WorkbookPatch = {
      patch_id: 'patch-risky',
      summary: 'Overwrite original quantity and create summary.',
      risk_level: 'safe',
      requires_approval: false,
      operations: [
        { op: 'set_cell', sheet: 'Vendor Quotes', row: 2, column: 'Qty', value: 12.5 },
        { op: 'create_summary_sheet', sheet: 'Quote Summary', rows: [['Vendor', 'Missing Quotes'], ['BuildCo', 2]] },
      ],
      preview: { changed_cells: 0, sample_before_after: [], warnings: [] },
    }

    expect(previewPatch(context, patch)).toMatchObject({
      risk_level: 'medium',
      requires_approval: true,
      preview: {
        changed_cells: 5,
        sample_before_after: [{ sheet: 'Vendor Quotes', cell: 'B2', before: '12,500 LF', after: 12.5 }],
        warnings: ['Would overwrite Vendor Quotes!B2.'],
      },
    })
  })
})

async function rfqWorkbookBuffer() {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Vendor Quotes')
  sheet.addRow([
    'Item',
    'Qty',
    'Unit',
    'Acme Price',
    'Acme Lead Time',
    'L n W Price',
    'L n W Lead Time',
    'BuildCo Price',
    'BuildCo Lead Time',
    'Notes',
  ])
  sheet.addRow(['Drywall 5/8 Type X', '12,500 LF', 'LF', '$1,200', '2 weeks', '1,150', '14 days', '$1,500', '4 weeks', ''])
  sheet.addRow(['Metal studs 20ga', '8,000 linear ft', 'LF', '$960', '3 weeks', '$940', '2-3 weeks', 'TBD', '', ''])
  sheet.addRow(['J track 20ga', '4,500 ft', 'LF', '$550', '21 days', '$575', '5 weeks', '$500', '18 days', ''])
  sheet.addRow(['Fasteners', '600 EA', 'EA', '$300', '10 days', '', 'N/A', '$280', '8 days', 'unit mismatch'])
  sheet.addRow(['Insulation rolls', '40 rolls', 'rolls', '$2,400', '3-4 weeks', '$2,200', '2 weeks', '$2,100', 'TBD', ''])
  sheet.addRow(['Project lump sum quote', '1', 'LS', '$9,500', '2 weeks', '$8,900', '2 weeks', '$9,100', '2 weeks', 'total bid row'])
  sheet.addRow(['No quote line', '900 LF', 'LF', '', '', 'N/A', '', 'TBD', '', ''])
  return Buffer.from(await workbook.xlsx.writeBuffer())
}
