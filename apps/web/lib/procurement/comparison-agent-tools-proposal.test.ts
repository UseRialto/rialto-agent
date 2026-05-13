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

  it('routes cells for newly inserted proposal columns to the displayed manual column key', () => {
    const patch = comparisonViewPatchFromProposal({
      kind: 'comparison-patch-proposal',
      summary: 'Prepared Harbor Steel merge.',
      operations: [
        { kind: 'insert-column', colKey: 'vendor-harbor-steel:total', label: 'Harbor Steel Total', afterColKey: '__qty_unit' },
        { kind: 'set-cell', rowKey: 'line-x', colKey: 'vendor-harbor-steel:total', value: 1500 },
      ],
    })

    expect(patch).toMatchObject({
      addManualColumns: [{ key: 'vendor-harbor-steel:total', label: 'Total Price', insertAfterColKey: '__qty_unit', groupLabel: 'Harbor Steel', vendorMetric: 'total' }],
      setCells: [{ rowKey: 'line-x', colKey: 'manual:vendor-harbor-steel:total', value: '1500' }],
    })
  })

  it('routes chained insert-column anchors through displayed manual column keys', () => {
    const patch = comparisonViewPatchFromProposal({
      kind: 'comparison-patch-proposal',
      summary: 'Prepared Harbor Steel merge.',
      operations: [
        { kind: 'insert-column', colKey: 'vendor-harbor-steel:unit_price', label: 'Harbor Steel Unit Price', afterColKey: 'vendor-lnw:alternate' },
        { kind: 'insert-column', colKey: 'vendor-harbor-steel:total', label: 'Harbor Steel Total', afterColKey: 'vendor-harbor-steel:unit_price' },
        { kind: 'insert-column', colKey: 'vendor-harbor-steel:lead', label: 'Harbor Steel Lead Time', afterColKey: 'vendor-harbor-steel:total' },
      ],
    })

    expect(patch.addManualColumns).toEqual([
      { key: 'vendor-harbor-steel:unit_price', label: 'Unit Price', insertAfterColKey: 'vendor-lnw:alternate', groupLabel: 'Harbor Steel', vendorMetric: 'unit_price' },
      { key: 'vendor-harbor-steel:total', label: 'Total Price', insertAfterColKey: 'manual:vendor-harbor-steel:unit_price', groupLabel: 'Harbor Steel', vendorMetric: 'total' },
      { key: 'vendor-harbor-steel:lead', label: 'Lead Time', insertAfterColKey: 'manual:vendor-harbor-steel:total', groupLabel: 'Harbor Steel', vendorMetric: 'lead' },
    ])
  })
})
