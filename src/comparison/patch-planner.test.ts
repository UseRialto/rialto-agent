import { describe, expect, it } from 'vitest'
import { fallbackComparisonPatch } from './patch-planner.js'

const sheetSchema = {
  columns: [
    { key: '__item', label: 'Item', kind: 'rfq-core' as const },
    { key: '__desc', label: 'Description', kind: 'rfq-core' as const },
    { key: '__qty_unit', label: 'Qty', kind: 'rfq-core' as const },
    { key: 'vendor-acme-total', label: 'Acme Total', kind: 'vendor' as const, vendorName: 'Acme', metric: 'total' as const },
    { key: 'manual-notes', label: 'Notes', kind: 'manual' as const, isEmpty: true },
  ],
  lineItems: [
    { id: 'line-doors', description: 'Door hardware set' },
    { id: 'line-frame', description: 'Steel frame' },
  ],
}

describe('fallbackComparisonPatch', () => {
  it('previews explicit row and column deletion using the same hidden state as the sheet UI', () => {
    expect(fallbackComparisonPatch({ message: 'Delete Description column', sheetSchema })).toMatchObject({
      deleteColumnKeys: ['__desc'],
    })

    expect(fallbackComparisonPatch({ message: 'delete the Door hardware row', sheetSchema })).toMatchObject({
      deleteLineItemIds: ['line-doors'],
    })
  })

  it('tolerates common spreadsheet command typos before previewing visible edits', () => {
    expect(fallbackComparisonPatch({ message: 'deelte description clumn', sheetSchema })).toMatchObject({
      deleteColumnKeys: ['__desc'],
    })
  })

  it('previews the quote comparison context-menu workbook actions', () => {
    expect(fallbackComparisonPatch({ message: 'insert column left of Acme Total', sheetSchema })).toMatchObject({
      addManualColumns: [{ label: 'New Column', insertAfterColKey: '__qty_unit' }],
    })

    expect(fallbackComparisonPatch({ message: 'insert row below Steel frame', sheetSchema })).toMatchObject({
      addManualLineItems: [{ insertAfterLineItemId: 'line-frame' }],
    })

    expect(fallbackComparisonPatch({ message: 'rename Notes column to Scope Notes', sheetSchema })).toMatchObject({
      setColumnLabels: [{ colKey: 'manual-notes', label: 'Scope Notes' }],
    })

    expect(fallbackComparisonPatch({ message: 'sort Acme Total descending', sheetSchema })).toMatchObject({
      sortRowsByColumn: { colKey: 'vendor-acme-total', direction: 'desc' },
    })

    expect(fallbackComparisonPatch({ message: 'filter blanks in Notes', sheetSchema })).toMatchObject({
      filterBlankRowsByColumnKey: 'manual-notes',
    })
  })

  it('previews cell edits and restores hidden sheet structure from natural language', () => {
    expect(fallbackComparisonPatch({ message: 'clear the Notes cell for Door hardware', sheetSchema })).toMatchObject({
      setCells: [{ rowKey: 'line-doors', colKey: 'manual-notes', value: '' }],
    })

    expect(fallbackComparisonPatch({ message: 'set Notes for Steel frame to Coordinate with GC', sheetSchema })).toMatchObject({
      setCells: [{ rowKey: 'line-frame', colKey: 'manual-notes', value: 'Coordinate with GC' }],
    })

    expect(fallbackComparisonPatch({ message: 'restore Description column', sheetSchema })).toMatchObject({
      showColumnKeys: ['__desc'],
    })

    expect(fallbackComparisonPatch({ message: 'unhide Door hardware row', sheetSchema })).toMatchObject({
      showLineItemIds: ['line-doors'],
    })
  })

  it('previews derived quote-comparison columns that the sheet assistant supports', () => {
    expect(fallbackComparisonPatch({
      message: 'Add a column to right of Qty, same, but in thousand linear feet',
      sheetSchema,
    })).toMatchObject({
      addDerivedColumns: [{
        label: 'Qty (kLF)',
        formula: 'divide(column.__qty_unit,1000)',
        insertAfterColKey: '__qty_unit',
      }],
    })
  })
})
