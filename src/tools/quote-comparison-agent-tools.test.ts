import { describe, expect, it } from 'vitest'
import {
  analyzeQuoteComparisonWork,
  answerQuoteComparisonQuestion,
  inspectQuoteComparisonSnapshot,
  proposeQuoteComparisonBulkNumericEdit,
  proposeQuoteComparisonConvertedQuantityColumn,
  proposeQuoteComparisonDeletions,
  proposeQuoteComparisonDerivedColumns,
  proposeQuoteComparisonHighlights,
  proposeQuoteComparisonLowestTotalPriceColumn,
  proposeQuoteComparisonSelectionState,
  proposeQuoteComparisonSheetStructureEdits,
  proposeQuoteComparisonSort,
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

  it('classifies broad ambiguous comparison work as needing planning before edits', () => {
    expect(analyzeQuoteComparisonWork({ snapshot }, { prompt: 'Level this bid and tell me who we should use.' })).toMatchObject({
      action: 'quote-comparison-work-analysis',
      complexity: 'needs-planning',
      ambiguity: 'material-choice',
      suggestedNextStep: 'Ask one concise clarification before proposing material sheet edits.',
      recommendedToolFamilies: [
        'quoteComparison.answerSheetQuestion',
        'quoteComparison.proposeDerivedColumns',
        'quoteComparison.proposeHighlights',
        'quoteComparison.proposeCellEdits',
      ],
      sheetSignals: {
        rowCount: 2,
        columnCount: 5,
        vendorColumnCount: 3,
        unresolvedCellCount: 1,
      },
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

  it('proposes a lowest total price column filled from visible vendor totals', () => {
    const comparisonSnapshot = {
      columns: [
        { key: '__item', label: 'Item' },
        { key: '__qty_unit', label: 'Qty' },
        { key: 'lnw-total', label: 'L n W Total Price', metric: 'total', vendorName: 'L n W Supply' },
        { key: 'acme-total', label: 'Acme Total Price', metric: 'total', vendorName: 'Acme Drywall' },
        { key: 'build-total', label: 'BuildCo Total Price', metric: 'total', vendorName: 'BuildCo' },
      ],
      rows: [
        {
          id: 'fasteners',
          description: '1 1/4 drywall screws',
          values: { 'lnw-total': '$1,575', 'acme-total': '$1,685', 'build-total': '' },
        },
        {
          id: 'lockset',
          description: 'Classroom lockset',
          values: { 'lnw-total': '$8,143', 'acme-total': '$8,713', 'build-total': '$7,817' },
        },
      ],
    }

    expect(proposeQuoteComparisonLowestTotalPriceColumn({ snapshot: comparisonSnapshot }, {})).toMatchObject({
      summary: 'Added Lowest Total Price and filled 2 row values.',
      operations: [
        { kind: 'insert-column', colKey: 'lowest-total-price', label: 'Lowest Total Price', afterColKey: '__qty_unit' },
        { kind: 'set-cell', rowKey: 'fasteners', colKey: 'lowest-total-price', value: '$1,575' },
        { kind: 'set-cell', rowKey: 'lockset', colKey: 'lowest-total-price', value: '$7,817' },
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
    expect(proposeQuoteComparisonSort({
      colKey: 'acme-total',
      direction: 'desc',
      valueKind: 'number',
    })).toMatchObject({
      summary: 'Sort Largest to Smallest by acme-total.',
      operations: [{ kind: 'sort-rows', colKey: 'acme-total', direction: 'desc' }],
    })

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
