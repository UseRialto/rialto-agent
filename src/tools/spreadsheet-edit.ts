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
      kind: z.literal('add-derived-column'),
      columnId: z.string(),
      label: z.string(),
      formula: z.string(),
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
  surface: 'spreadsheet-edit',
  description: 'Preview visible spreadsheet changes before applying them to a comparison sheet.',
  visibleToUser: true,
  mutatesPersistentData: false,
  requiresUserApproval: true,
  inputSchema: spreadsheetPatchSchema,
  async execute(input) {
    const patch = spreadsheetPatchSchema.parse(input)
    return { action: 'preview-spreadsheet-patch', patch, applyPolicy: 'preview-before-apply' }
  },
}

