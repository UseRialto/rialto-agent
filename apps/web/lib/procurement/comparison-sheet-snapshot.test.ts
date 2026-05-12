import { describe, expect, it } from 'vitest'
import { buildComparisonSheetSnapshot } from './comparison-sheet-snapshot'

describe('buildComparisonSheetSnapshot', () => {
  it('hydrates the estimator-visible Comparison Sheet Snapshot from columns, rows, and view state', () => {
    const snapshot = buildComparisonSheetSnapshot({
      sheetId: 'sheet-1',
      quoteRequestId: 'rfq-1',
      columns: [
        { key: '__item', label: 'Item', kind: 'rfq-core' },
        { key: 'vendor:acme:lead', label: 'Lead Time', kind: 'vendor', vendorId: 'acme', vendorName: 'Acme', metric: 'lead' },
        { key: 'vendor:acme:total', label: 'Total Price', kind: 'vendor', vendorId: 'acme', vendorName: 'Acme', metric: 'total' },
      ],
      rows: [
        { id: 'line-1', description: 'Door hardware', values: { '__item': 'D-1', 'vendor:acme:lead': '', 'vendor:acme:total': '$120' } },
      ],
      vendors: [{ id: 'acme', name: 'Acme' }],
      view: {
        hiddenColumnKeys: ['vendor:acme:total'],
        deletedColumnKeys: [],
        hiddenLineItemIds: [],
        deletedLineItemIds: [],
        highlights: [{ id: 'hl-1', selector: { kind: 'cell' as const, rowKey: 'line-1', colKey: 'vendor:acme:lead' }, color: '#fecaca' }],
        manualColumns: [],
        manualLineItems: [],
        derivedColumns: [],
        cellOverrides: { 'line-1|vendor:acme:lead': '14d' },
        columnLabelOverrides: { 'vendor:acme:lead': 'Lead' },
        charts: [],
      },
    })

    expect(snapshot).toMatchObject({
      sheetId: 'sheet-1',
      quoteRequestId: 'rfq-1',
      columns: [
        { key: '__item', label: 'Item', hidden: false },
        { key: 'vendor:acme:lead', label: 'Lead', hidden: false },
        { key: 'vendor:acme:total', label: 'Total Price', hidden: true },
      ],
      rows: [{
        id: 'line-1',
        description: 'Door hardware',
        hidden: false,
        values: {
          'vendor:acme:lead': '14d',
          'vendor:acme:total': '$120',
        },
      }],
      highlights: [{ id: 'hl-1' }],
      vendors: [{ id: 'acme', name: 'Acme' }],
    })
  })

  it('omits deleted columns from the visible snapshot instead of marking them hidden', () => {
    const snapshot = buildComparisonSheetSnapshot({
      sheetId: 'sheet-1',
      quoteRequestId: 'rfq-1',
      columns: [
        { key: '__item', label: 'Item' },
        { key: '__desc', label: 'Description' },
      ],
      rows: [{ id: 'line-1', description: 'Door hardware', values: { __item: 'D-1', __desc: 'Door hardware' } }],
      vendors: [],
      view: {
        hiddenColumnKeys: [],
        deletedColumnKeys: ['__desc'],
        hiddenLineItemIds: [],
        deletedLineItemIds: [],
        highlights: [],
        manualColumns: [],
        manualLineItems: [],
        derivedColumns: [],
        cellOverrides: {},
        columnLabelOverrides: {},
        charts: [],
      },
    })

    expect(snapshot.columns.map((column) => column.key)).toEqual(['__item'])
    expect(snapshot.deletedState.columnKeys).toEqual(['__desc'])
  })
})
