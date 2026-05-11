import { describe, expect, it } from 'vitest'
import { comparisonViewPatchFromAgentToolPatch } from './comparison-agent-tools'

const schema = {
  columns: [
    { key: '__desc', label: 'Description' },
    { key: '__qty_unit', label: 'Qty' },
    { key: 'vendor:lnw:unit_price', label: 'Unit Price' },
    { key: 'vendor:lnw:total', label: 'Total Price' },
    { key: 'manual-notes', label: 'Notes' },
  ],
  lineItems: [
    {
      id: 'line-doors',
      description: 'Door hardware set',
      values: {
        __qty_unit: '2,420 lf',
        'vendor:lnw:unit_price': '$1,100',
        'vendor:lnw:total': '$2,662,000',
      },
    },
  ],
}

describe('comparisonViewPatchFromAgentToolPatch', () => {
  it('maps backend-callable Quote Comparison delete tools to visible sheet patches', () => {
    expect(comparisonViewPatchFromAgentToolPatch({
      summary: 'Delete Description column.',
      operations: [{ kind: 'delete-column', columnId: 'Description' }],
    }, schema)).toMatchObject({
      deleteColumnKeys: ['__desc'],
    })
  })

  it('maps row and cell operations by sheet schema labels', () => {
    expect(comparisonViewPatchFromAgentToolPatch({
      summary: 'Edit comparison sheet.',
      operations: [
        { kind: 'delete-row', rowId: 'Door hardware' },
        { kind: 'set-cell', rowId: 'Door hardware', columnId: 'Notes', value: 'Coordinate with GC' },
      ],
    }, schema)).toMatchObject({
      deleteLineItemIds: ['line-doors'],
      setCells: [{ rowKey: 'line-doors', colKey: 'manual-notes', value: 'Coordinate with GC' }],
    })
  })

  it('expands bulk numeric adjustments into unit-price and dependent total cell edits', () => {
    expect(comparisonViewPatchFromAgentToolPatch({
      summary: 'Add 69 to Unit Price and update Total Price.',
      operations: [{
        kind: 'bulk-adjust-number-column',
        columnId: 'Unit Price',
        amount: 69,
        dependentColumnId: 'Total Price',
        dependentFormula: 'multiply-by-quantity',
      }],
    }, schema)).toMatchObject({
      setCells: [
        { rowKey: 'line-doors', colKey: 'vendor:lnw:unit_price', value: '$1,169' },
        { rowKey: 'line-doors', colKey: 'vendor:lnw:total', value: '$2,828,980' },
      ],
    })
  })
})
