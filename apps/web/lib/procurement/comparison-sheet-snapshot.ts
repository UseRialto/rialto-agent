import type { ComparisonHighlight, ComparisonSheetView } from './comparison-sheet-state'

export interface ComparisonSnapshotColumn {
  key: string
  label: string
  kind?: string
  vendorId?: string
  vendorName?: string
  metric?: string
  hidden: boolean
  isEmpty?: boolean
}

export interface ComparisonSnapshotRow {
  id: string
  description: string
  hidden: boolean
  values: Record<string, string>
}

export interface ComparisonSheetSnapshot {
  sheetId: string
  quoteRequestId: string
  columns: ComparisonSnapshotColumn[]
  rows: ComparisonSnapshotRow[]
  vendors: Array<{ id: string; name: string }>
  highlights: ComparisonHighlight[]
  hiddenState: {
    columnKeys: string[]
    rowIds: string[]
  }
  deletedState: {
    columnKeys: string[]
    rowIds: string[]
  }
}

export interface BuildComparisonSheetSnapshotInput {
  sheetId: string
  quoteRequestId: string
  columns: Array<{
    key: string
    label: string
    kind?: string
    vendorId?: string
    vendorName?: string
    metric?: string
    isEmpty?: boolean
  }>
  rows: Array<{
    id: string
    description: string
    values: Record<string, string>
  }>
  vendors: Array<{ id: string; name: string }>
  view: Pick<
    ComparisonSheetView,
    'hiddenColumnKeys'
    | 'deletedColumnKeys'
    | 'hiddenLineItemIds'
    | 'deletedLineItemIds'
    | 'highlights'
    | 'cellOverrides'
    | 'columnLabelOverrides'
    | 'manualColumns'
    | 'manualLineItems'
    | 'derivedColumns'
    | 'charts'
  >
}

export function buildComparisonSheetSnapshot(input: BuildComparisonSheetSnapshotInput): ComparisonSheetSnapshot {
  return {
    sheetId: input.sheetId,
    quoteRequestId: input.quoteRequestId,
    columns: input.columns
      .filter((column) => !(input.view.deletedColumnKeys ?? []).includes(column.key))
      .map((column) => ({
        ...column,
        label: input.view.columnLabelOverrides[column.key] ?? column.label,
        hidden: input.view.hiddenColumnKeys.includes(column.key),
      })),
    rows: input.rows
      .filter((row) => !(input.view.deletedLineItemIds ?? []).includes(row.id))
      .map((row) => ({
        id: row.id,
        description: row.description,
        hidden: input.view.hiddenLineItemIds.includes(row.id),
        values: valuesWithOverrides(row.id, row.values, input.view.cellOverrides),
      })),
    vendors: input.vendors,
    highlights: input.view.highlights,
    hiddenState: {
      columnKeys: input.view.hiddenColumnKeys,
      rowIds: input.view.hiddenLineItemIds,
    },
    deletedState: {
      columnKeys: input.view.deletedColumnKeys ?? [],
      rowIds: input.view.deletedLineItemIds ?? [],
    },
  }
}

function valuesWithOverrides(rowId: string, values: Record<string, string>, overrides: Record<string, string>) {
  const next = { ...values }
  for (const [key, value] of Object.entries(overrides)) {
    const [overrideRowId, colKey] = key.split('|')
    if (overrideRowId === rowId && colKey) next[colKey] = value
  }
  return next
}
