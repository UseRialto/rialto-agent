import { describe, expect, it } from 'vitest'
import { comparisonViewPatchFromProposal } from './comparison-agent-tools'

describe('comparisonViewPatchFromProposal', () => {
  it('adapts one aggregated agent proposal into a single comparison sheet overlay patch', () => {
    const patch = comparisonViewPatchFromProposal({
      kind: 'comparison-patch-proposal',
      summary: 'Prepared the comparison updates.',
      operations: [
        { kind: 'set-cell', rowKey: 'steel', colKey: 'notes', value: 'Clarify anchor bolts' },
        { kind: 'insert-column', colKey: 'lowest-total-price', label: 'Lowest Total Price', afterColKey: '__qty_unit' },
        { kind: 'set-cell', rowKey: 'steel', colKey: 'manual:lowest-total-price', value: '$1,575' },
        {
          kind: 'add-highlight',
          id: 'hl-steel-lead',
          selector: { kind: 'cell', rowKey: 'steel', colKey: 'acme-lead' },
          color: 'red',
          note: 'Missing lead time.',
        },
        { kind: 'add-derived-column', colKey: 'delta-total', label: 'Delta vs low', formula: 'total - min(total)', afterColKey: 'acme-total' },
        { kind: 'sort-rows', colKey: 'acme-total', direction: 'asc' },
        { kind: 'filter-blank-rows', colKey: 'notes' },
        { kind: 'set-selection-state', rowKey: 'steel', state: 'selected-vendor', vendorId: 'acme' },
      ],
    })

    expect(patch).toMatchObject({
      summary: 'Prepared the comparison updates.',
      setCells: [
        { rowKey: 'steel', colKey: 'notes', value: 'Clarify anchor bolts' },
        { rowKey: 'steel', colKey: 'manual:lowest-total-price', value: '$1,575' },
      ],
      addManualColumns: [{ key: 'lowest-total-price', label: 'Lowest Total Price', insertAfterColKey: '__qty_unit' }],
      addHighlights: [{
        id: 'hl-steel-lead',
        selector: { kind: 'cell', rowKey: 'steel', colKey: 'acme-lead' },
        color: '#fecaca',
        note: 'Missing lead time.',
      }],
      addDerivedColumns: [{ key: 'delta-total', label: 'Delta vs low', formula: 'total - min(total)', insertAfterColKey: 'acme-total' }],
      sortRowsByColumn: { colKey: 'acme-total', direction: 'asc' },
      filterBlankRowsByColumnKey: 'notes',
    })
  })
})
