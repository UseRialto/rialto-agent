import { z } from 'zod'
import type { ToolDefinition } from '../domain/types.js'

export const spreadsheetPatchSchema = z.object({
  comparisonSheetId: z.string(),
  summary: z.string(),
  operations: z.array(z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('set-cell'),
      rowId: z.string(),
      columnId: z.string(),
      value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
      provenanceNote: z.string().optional(),
    }),
    z.object({
      kind: z.literal('highlight-range'),
      range: z.string(),
      color: z.enum(['red', 'orange', 'blue', 'green', 'yellow']),
      note: z.string(),
    }),
    z.object({
      kind: z.literal('hide-column'),
      columnId: z.string(),
    }),
    z.object({
      kind: z.literal('delete-column'),
      columnId: z.string(),
    }),
    z.object({
      kind: z.literal('show-column'),
      columnId: z.string(),
    }),
    z.object({
      kind: z.literal('insert-column'),
      columnId: z.string(),
      label: z.string(),
      afterColumnId: z.string().optional(),
      beforeColumnId: z.string().optional(),
    }),
    z.object({
      kind: z.literal('hide-row'),
      rowId: z.string(),
    }),
    z.object({
      kind: z.literal('delete-row'),
      rowId: z.string(),
    }),
    z.object({
      kind: z.literal('show-row'),
      rowId: z.string(),
    }),
    z.object({
      kind: z.literal('insert-row'),
      rowId: z.string(),
      afterRowId: z.string().optional(),
      beforeRowId: z.string().optional(),
      initialValues: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
    }),
    z.object({
      kind: z.literal('rename-sheet'),
      title: z.string(),
    }),
    z.object({
      kind: z.literal('rename-column'),
      columnId: z.string(),
      label: z.string(),
    }),
    z.object({
      kind: z.literal('sort-rows'),
      columnId: z.string(),
      direction: z.enum(['asc', 'desc']),
    }),
    z.object({
      kind: z.literal('filter-rows'),
      columnId: z.string(),
      predicate: z.enum(['non-empty', 'empty']),
    }),
    z.object({
      kind: z.literal('add-derived-column'),
      columnId: z.string(),
      label: z.string(),
      formula: z.string(),
      afterColumnId: z.string().optional(),
      beforeColumnId: z.string().optional(),
    }),
    z.object({
      kind: z.literal('bulk-adjust-number-column'),
      columnId: z.string(),
      amount: z.number(),
      dependentColumnId: z.string().optional(),
      dependentFormula: z.enum(['multiply-by-quantity']).optional(),
    }),
  ])).default([]),
})

export type SpreadsheetPatchInput = z.infer<typeof spreadsheetPatchSchema>

export interface SpreadsheetPatchOutput {
  action: 'preview-spreadsheet-patch'
  patch: SpreadsheetPatchInput
  applyPolicy: 'preview-before-apply'
}

export const spreadsheetEditTool: ToolDefinition<SpreadsheetPatchInput, SpreadsheetPatchOutput> = {
  id: 'sheet.preview_comparison_patch',
  productModule: 'quote-comparison',
  surface: 'spreadsheet-edit',
  description: 'Preview visible quote-comparison spreadsheet changes before applying them. Supports set/clear cell, highlight range, delete/hide/show row, delete/hide/show column, insert row/column, rename sheet/column, sort rows, filter rows, bulk numeric column adjustment with dependent total recomputation, and add derived columns.',
  visibleToUser: true,
  mutatesPersistentData: false,
  requiresUserApproval: true,
  inputSchema: spreadsheetPatchSchema,
  async execute(input) {
    const patch = spreadsheetPatchSchema.parse(input)
    return { action: 'preview-spreadsheet-patch', patch, applyPolicy: 'preview-before-apply' }
  },
}
