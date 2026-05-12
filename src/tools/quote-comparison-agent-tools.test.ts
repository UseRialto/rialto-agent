import { describe, expect, it } from 'vitest'
import {
  answerQuoteComparisonQuestion,
  inspectQuoteComparisonSnapshot,
  proposeQuoteComparisonBulkNumericEdit,
  proposeQuoteComparisonConvertedQuantityColumn,
  proposeQuoteComparisonDeletions,
  proposeQuoteComparisonDerivedColumns,
  proposeQuoteComparisonHighlights,
  proposeQuoteComparisonSelectionState,
  proposeQuoteComparisonSheetStructureEdits,
} from './quote-comparison-agent-tools.js'

const snapshot = {
  columns: [
    { key: '__qty_unit', label: 'Qty' },
    { key: 'acme-unit', label: 'Acme Unit Price', metric: 'unit_price' },
    { key: 'acme-total', label: 'Acme Total', metric: 'total' },
    { key: 'acme-lead', label: 'Acme Lead Time', metric: 'lead' },
    { key: 'notes', label: 'Notes' },
  ],
  rows: [
    {
      id: 'steel-frame',
      description: 'Steel frame',
      values: {
        __qty_unit: '2 EA',
        'acme-unit': '$100',
        'acme-total': '$200',
        'acme-lead': '',
        notes: '',
      },
    },
    {
      id: 'door-hardware',
      description: 'Door hardware',
      values: {
        __qty_unit: '3 EA',
        'acme-unit': '$50',
        'acme-total': '$150',
        'acme-lead': '5d',
        notes: 'Confirm finish',
      },
    },
  ],
  vendors: [{ id: 'acme', name: 'Acme Supply' }],
}

describe('Quote Comparison agent tools', () => {
  it('inspects the estimator-visible sheet snapshot and answers read-only total questions', () => {
    expect(inspectQuoteComparisonSnapshot({ snapshot })).toMatchObject({
      action: 'snapshot-inspected',
      columns: ['Qty', 'Acme Unit Price', 'Acme Total', 'Acme Lead Time', 'Notes'],
      rowCount: 2,
      vendors: ['Acme Supply'],
    })

    expect(answerQuoteComparisonQuestion({ snapshot }, 'what is the lowest total?')).toMatchObject({
      action: 'sheet-answer',
      answer: '$50 is the lowest visible total I found, at Door hardware / Acme Unit Price.',
      references: [{ rowKey: 'door-hardware', colKey: 'acme-unit' }],
    })
  })

  it('proposes missing lead time highlights from the visible sheet state', () => {
    expect(proposeQuoteComparisonHighlights({ snapshot }, { rule: 'missing-lead-times' })).toMatchObject({
      summary: 'Highlighted 1 missing lead time cell.',
      operations: [{
        kind: 'add-highlight',
        id: 'hl-missing-lead-steel-frame-acme-lead',
        selector: { kind: 'cell', rowKey: 'steel-frame', colKey: 'acme-lead' },
        color: 'red',
      }],
      warnings: ['1 missing lead time cell found.'],
    })
  })

  it('proposes bulk numeric edits with dependent total recalculation', () => {
    expect(proposeQuoteComparisonBulkNumericEdit({ snapshot }, {
      colKey: 'acme-unit',
      amount: 10,
      dependentColKey: 'acme-total',
      dependentFormula: 'multiply-by-quantity',
    })).toMatchObject({
      operations: [
        { kind: 'set-cell', rowKey: 'steel-frame', colKey: 'acme-unit', value: '$110' },
        { kind: 'set-cell', rowKey: 'steel-frame', colKey: 'acme-total', value: '$220' },
        { kind: 'set-cell', rowKey: 'door-hardware', colKey: 'acme-unit', value: '$60' },
        { kind: 'set-cell', rowKey: 'door-hardware', colKey: 'acme-total', value: '$180' },
      ],
    })
  })

  it('proposes a converted quantity column filled from visible quantity values', () => {
    const quantitySnapshot = {
      columns: [
        { key: '__item', label: 'Item' },
        { key: '__qty_unit', label: 'Qty' },
      ],
      rows: [
        { id: 'line-1', description: 'Stud', values: { __qty_unit: '2,420 lf' } },
        { id: 'line-2', description: 'Track', values: { __qty_unit: '458 lf' } },
      ],
    }

    expect(proposeQuoteComparisonConvertedQuantityColumn({ snapshot: quantitySnapshot }, {})).toMatchObject({
      summary: 'Added Qty (kLF) and converted 2 quantity values.',
      operations: [
        { kind: 'insert-column', colKey: 'manual-qty-klf', label: 'Qty (kLF)', afterColKey: '__qty_unit' },
        { kind: 'set-cell', rowKey: 'line-1', colKey: 'manual-qty-klf', value: '2.42' },
        { kind: 'set-cell', rowKey: 'line-2', colKey: 'manual-qty-klf', value: '0.458' },
      ],
    })
  })

  it('proposes a hundreds linear ft quantity column next to Qty when requested', () => {
    const quantitySnapshot = {
      columns: [
        { key: '__item', label: 'Item' },
        { key: '__qty_unit', label: 'Qty' },
      ],
      rows: [
        { id: 'line-1', description: 'Stud', values: { __qty_unit: '2,420 lf' } },
        { id: 'line-2', description: 'Track', values: { __qty_unit: '458 LF' } },
        { id: 'line-3', description: 'Blank', values: { __qty_unit: '' } },
        { id: 'line-4', description: 'Text', values: { __qty_unit: 'TBD' } },
      ],
    }

    expect(proposeQuoteComparisonConvertedQuantityColumn({ snapshot: quantitySnapshot }, {
      colKey: 'manual-qty-hundreds-lf',
      label: 'Qty in hundreds linear ft',
      divisor: 100,
    })).toMatchObject({
      summary: 'Added Qty in hundreds linear ft and converted 2 quantity values.',
      operations: [
        { kind: 'insert-column', colKey: 'manual-qty-hundreds-lf', label: 'Qty in hundreds linear ft', afterColKey: '__qty_unit' },
        { kind: 'set-cell', rowKey: 'line-1', colKey: 'manual-qty-hundreds-lf', value: '24.2' },
        { kind: 'set-cell', rowKey: 'line-2', colKey: 'manual-qty-hundreds-lf', value: '4.58' },
      ],
    })
  })

  it('proposes deterministic row, column, and cell deletions as one patch fragment', () => {
    expect(proposeQuoteComparisonDeletions({
      columns: [{ colKey: 'notes' }],
      rows: [{ rowKey: 'door-hardware' }],
      cells: [{ rowKey: 'steel-frame', colKey: 'acme-lead' }],
    })).toMatchObject({
      summary: 'Prepared 3 delete operation edits.',
      operations: [
        { kind: 'delete-column', colKey: 'notes' },
        { kind: 'delete-row', rowKey: 'door-hardware' },
        { kind: 'set-cell', rowKey: 'steel-frame', colKey: 'acme-lead', value: '' },
      ],
    })
  })

  it('proposes structure, derived-column, and selection-state fragments', () => {
    expect(proposeQuoteComparisonSheetStructureEdits({
      operations: [
        { kind: 'sort-rows', colKey: 'acme-total', direction: 'desc' },
        { kind: 'filter-blank-rows', colKey: 'notes' },
      ],
    })).toMatchObject({
      operations: [
        { kind: 'sort-rows', colKey: 'acme-total', direction: 'desc' },
        { kind: 'filter-blank-rows', colKey: 'notes' },
      ],
    })

    expect(proposeQuoteComparisonDerivedColumns({
      columns: [{ colKey: 'delta-total', label: 'Delta vs Low', formula: 'total - min(total)', afterColKey: 'acme-total' }],
    })).toMatchObject({
      operations: [{ kind: 'add-derived-column', colKey: 'delta-total', label: 'Delta vs Low' }],
    })

    expect(proposeQuoteComparisonSelectionState({
      selections: [{ rowKey: 'steel-frame', state: 'selected-vendor', vendorId: 'acme', reason: 'Lowest complete quote.' }],
    })).toMatchObject({
      operations: [{ kind: 'set-selection-state', rowKey: 'steel-frame', vendorId: 'acme' }],
      warnings: ['Selection state changes are proposal-only in this slice and do not notify vendors or create purchasing follow-ups.'],
    })
  })
})
