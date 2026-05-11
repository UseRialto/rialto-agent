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
})
