import { describe, expect, it } from 'vitest'
import { spreadsheetPatchSchema } from './spreadsheet-edit.js'

describe('spreadsheetPatchSchema', () => {
  it('accepts workbook edit primitives that mirror the quote comparison UI', () => {
    const parsed = spreadsheetPatchSchema.parse({
      comparisonSheetId: 'sheet-1',
      summary: 'Prepare visible workbook edits.',
      operations: [
        { kind: 'set-cell', rowId: 'row-1', columnId: 'col-1', value: 'updated' },
        { kind: 'insert-row', rowId: 'row-new', afterRowId: 'row-1', initialValues: { 'col-1': 'new item' } },
        { kind: 'insert-column', columnId: 'col-new', label: 'New Column', afterColumnId: 'col-1' },
        { kind: 'rename-column', columnId: 'col-new', label: 'Lead Time Notes' },
        { kind: 'sort-rows', columnId: 'col-1', direction: 'asc' },
        { kind: 'filter-rows', columnId: 'col-1', predicate: 'non-empty' },
        { kind: 'rename-sheet', title: '9 - MCRD P-314 - 1.0 - Base Bid' },
      ],
    })

    expect(parsed.operations.map((operation) => operation.kind)).toEqual([
      'set-cell',
      'insert-row',
      'insert-column',
      'rename-column',
      'sort-rows',
      'filter-rows',
      'rename-sheet',
    ])
  })
})
