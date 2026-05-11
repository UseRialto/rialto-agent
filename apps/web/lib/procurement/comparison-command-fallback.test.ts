import { describe, expect, it } from 'vitest'
import { proposeComparisonCommandFallback } from './comparison-command-fallback'

describe('proposeComparisonCommandFallback', () => {
  it('adds a thousand-linear-feet quantity column to the right of Qty', () => {
    const patch = proposeComparisonCommandFallback('Add a column to right of Qty, same, but in thousand linear feet', {
      columns: [
        { key: '__item', label: 'Item', kind: 'rfq-core' },
        { key: '__desc', label: 'Description', kind: 'rfq-core' },
        { key: '__qty_unit', label: 'Qty', kind: 'rfq-core' },
      ],
    })

    expect(patch).toEqual({
      summary: 'Added Qty (kLF) to the right of Qty.',
      addDerivedColumns: [{
        key: 'qty-unit-qty-klf',
        label: 'Qty (kLF)',
        formula: 'divide(column.__qty_unit,1000)',
        insertAfterColKey: '__qty_unit',
      }],
    })
  })

  it('inserts editable rows and columns for workbook structure commands', () => {
    expect(proposeComparisonCommandFallback('insert a column right of Description', {
      columns: [
        { key: '__desc', label: 'Description', kind: 'rfq-core' },
      ],
    })).toEqual({
      summary: 'Inserted an editable column to the right of Description.',
      addManualColumns: [{
        key: 'desc-new-column',
        label: 'New Column',
        insertAfterColKey: '__desc',
      }],
    })

    const rowPatch = proposeComparisonCommandFallback('insert a row', { columns: [] })
    expect(rowPatch?.summary).toBe('Inserted a blank editable row.')
    expect(rowPatch?.addManualLineItems?.[0]).toMatchObject({
      sku: '',
      description: '',
      quantity: 0,
      unit: '',
    })
  })

  it('previews cell edits and restoring specific hidden sheet structure', () => {
    const schema = {
      columns: [
        { key: '__desc', label: 'Description', kind: 'rfq-core' as const },
        { key: 'manual-notes', label: 'Notes', kind: 'manual' as const },
      ],
      lineItems: [
        { id: 'line-doors', description: 'Door hardware set' },
        { id: 'line-frame', description: 'Steel frame' },
      ],
    }

    expect(proposeComparisonCommandFallback('clear the Notes cell for Door hardware', schema)).toMatchObject({
      setCells: [{ rowKey: 'line-doors', colKey: 'manual-notes', value: '' }],
    })

    expect(proposeComparisonCommandFallback('set Notes for Steel frame to Coordinate with GC', schema)).toMatchObject({
      setCells: [{ rowKey: 'line-frame', colKey: 'manual-notes', value: 'Coordinate with GC' }],
    })

    expect(proposeComparisonCommandFallback('restore Description column', schema)).toMatchObject({
      showColumnKeys: ['__desc'],
    })

    expect(proposeComparisonCommandFallback('unhide Door hardware row', schema)).toMatchObject({
      showLineItemIds: ['line-doors'],
    })
  })

  it('tolerates common spreadsheet command typos from the comparison assistant', () => {
    expect(proposeComparisonCommandFallback('deelte description clumn', {
      columns: [
        { key: '__desc', label: 'Description', kind: 'rfq-core' },
      ],
    })).toMatchObject({
      deleteColumnKeys: ['__desc'],
    })
  })

  it('previews bulk unit price adjustments with dependent total updates', () => {
    expect(proposeComparisonCommandFallback('add 69 to all entries in unit price and then update total price accordingly', {
      columns: [
        { key: '__qty_unit', label: 'Qty', kind: 'rfq-core' },
        { key: 'vendor:lnw:unit_price', label: 'Unit Price', kind: 'vendor' },
        { key: 'vendor:lnw:total', label: 'Total Price', kind: 'vendor' },
      ],
      lineItems: [{
        id: 'line-doors',
        description: 'Door hardware set',
        values: {
          __qty_unit: '2,420 lf',
          'vendor:lnw:unit_price': '$1,100',
          'vendor:lnw:total': '$2,662,000',
        },
      }],
    })).toMatchObject({
      setCells: [
        { rowKey: 'line-doors', colKey: 'vendor:lnw:unit_price', value: '$1,169' },
        { rowKey: 'line-doors', colKey: 'vendor:lnw:total', value: '$2,828,980' },
      ],
    })
  })
})
