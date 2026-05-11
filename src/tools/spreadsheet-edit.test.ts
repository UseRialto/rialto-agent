import { describe, expect, it } from 'vitest'
import { spreadsheetPatchSchema } from './spreadsheet-edit.js'

describe('spreadsheetPatchSchema', () => {
  it('accepts workbook edit primitives that mirror the quote comparison UI', () => {
    const parsed = spreadsheetPatchSchema.parse({
      comparisonSheetId: 'sheet-1',
      summary: 'Prepare visible workbook edits.',
      operations: [
        { kind: 'set-cell', rowId: 'row-1', columnId: 'col-1', value: 'updated' },
        { kind: 'delete-column', columnId: 'col-old' },
        { kind: 'delete-row', rowId: 'row-old' },
        { kind: 'hide-row', rowId: 'row-2' },
        { kind: 'show-row', rowId: 'row-2' },
        { kind: 'insert-row', rowId: 'row-new', afterRowId: 'row-1', initialValues: { 'col-1': 'new item' } },
        { kind: 'show-column', columnId: 'col-hidden' },
        { kind: 'insert-column', columnId: 'col-new', label: 'New Column', afterColumnId: 'col-1' },
        { kind: 'rename-column', columnId: 'col-new', label: 'Lead Time Notes' },
        { kind: 'sort-rows', columnId: 'col-1', direction: 'asc' },
        { kind: 'filter-rows', columnId: 'col-1', predicate: 'non-empty' },
        { kind: 'bulk-adjust-number-column', columnId: 'Unit Price', amount: 69, dependentColumnId: 'Total Price', dependentFormula: 'multiply-by-quantity' },
        { kind: 'rename-sheet', title: '9 - MCRD P-314 - 1.0 - Base Bid' },
      ],
    })

    expect(parsed.operations.map((operation) => operation.kind)).toEqual([
      'set-cell',
      'delete-column',
      'delete-row',
      'hide-row',
      'show-row',
      'insert-row',
      'show-column',
      'insert-column',
      'rename-column',
      'sort-rows',
      'filter-rows',
      'bulk-adjust-number-column',
      'rename-sheet',
    ])
  })
})
