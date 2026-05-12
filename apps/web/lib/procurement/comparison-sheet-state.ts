export type ChartMetric = 'price' | 'lead'

export interface ComparisonHighlight {
  id: string
  selector:
    | { kind: 'cell'; rowKey: string; colKey: string }
    | { kind: 'rule'; rule: 'fastest-lead-per-row' | 'lowest-price-per-row' | 'highest-coverage-overall' }
  color: string
  note?: string
}

export interface DerivedColumn {
  key: string
  label: string
  formula: string
  insertAfterColKey?: string
}

export interface ManualColumn {
  key: string
  label: string
  insertAfterColKey?: string
}

export interface ManualLineItem {
  id: string
  sku: string
  description: string
  quantity: number
  unit: string
  insertAfterLineItemId?: string
}

export interface ChartConfig {
  slot: 'left' | 'right'
  metric: ChartMetric
  title: string
  lineItemId?: string | null
}

export interface ComparisonSheetView {
  hiddenColumnKeys: string[]
  deletedColumnKeys: string[]
  hiddenLineItemIds: string[]
  deletedLineItemIds: string[]
  highlights: ComparisonHighlight[]
  derivedColumns: DerivedColumn[]
  manualColumns: ManualColumn[]
  manualLineItems: ManualLineItem[]
  cellOverrides: Record<string, string>
  columnLabelOverrides: Record<string, string>
  charts: ChartConfig[]
  columnOrder?: string[]
  lineItemOrder?: string[]
  columnWidths?: Record<string, number>
}

export type WorkbookVersionSource =
  | 'estimator-edit'
  | 'agent-proposal'
  | 'import'
  | 'vendor-merge'
  | 'restore'
  | 'system'

export interface WorkbookVersionMetadata {
  source?: WorkbookVersionSource
  summary?: string
  actorUserId?: string
  proposal?: unknown
}

export interface WorkbookVersionSummary {
  id: number
  versionNumber: number
  parentVersionId?: number
  source: WorkbookVersionSource
  summary: string
  actorUserId?: string
  createdAt: string
}

export interface BuiltWorkbookVersion {
  view: ComparisonSheetView
  version: {
    versionNumber: number
    parentVersionId?: number
    source: WorkbookVersionSource
    summary: string
    actorUserId?: string
    proposalJson?: string
    createdAt: string
  }
}

export const DEFAULT_COMPARISON_SHEET_VIEW: ComparisonSheetView = {
  hiddenColumnKeys: [],
  deletedColumnKeys: [],
  hiddenLineItemIds: [],
  deletedLineItemIds: [],
  highlights: [],
  derivedColumns: [],
  manualColumns: [],
  manualLineItems: [],
  cellOverrides: {},
  columnLabelOverrides: {},
  charts: [
    { slot: 'left', metric: 'price', title: 'Total Price' },
    { slot: 'right', metric: 'lead', title: 'Lead Time' },
  ],
}

export function normalizeComparisonSheetView(value: unknown): ComparisonSheetView {
  if (!value || typeof value !== 'object') return DEFAULT_COMPARISON_SHEET_VIEW
  const partial = value as Partial<ComparisonSheetView>
  return {
    ...DEFAULT_COMPARISON_SHEET_VIEW,
    ...partial,
    hiddenColumnKeys: Array.isArray(partial.hiddenColumnKeys) ? partial.hiddenColumnKeys.filter((item): item is string => typeof item === 'string') : [],
    deletedColumnKeys: Array.isArray(partial.deletedColumnKeys) ? partial.deletedColumnKeys.filter((item): item is string => typeof item === 'string') : [],
    hiddenLineItemIds: Array.isArray(partial.hiddenLineItemIds) ? partial.hiddenLineItemIds.filter((item): item is string => typeof item === 'string') : [],
    deletedLineItemIds: Array.isArray(partial.deletedLineItemIds) ? partial.deletedLineItemIds.filter((item): item is string => typeof item === 'string') : [],
    highlights: Array.isArray(partial.highlights) ? partial.highlights : [],
    derivedColumns: Array.isArray(partial.derivedColumns) ? partial.derivedColumns : [],
    manualColumns: Array.isArray(partial.manualColumns) ? partial.manualColumns : [],
    manualLineItems: Array.isArray(partial.manualLineItems) ? partial.manualLineItems : [],
    cellOverrides: partial.cellOverrides && typeof partial.cellOverrides === 'object' ? partial.cellOverrides : {},
    columnLabelOverrides: partial.columnLabelOverrides && typeof partial.columnLabelOverrides === 'object' ? partial.columnLabelOverrides : {},
    charts: Array.isArray(partial.charts) ? partial.charts : DEFAULT_COMPARISON_SHEET_VIEW.charts,
    columnOrder: Array.isArray(partial.columnOrder) ? partial.columnOrder.filter((item): item is string => typeof item === 'string') : undefined,
    lineItemOrder: Array.isArray(partial.lineItemOrder) ? partial.lineItemOrder.filter((item): item is string => typeof item === 'string') : undefined,
    columnWidths: partial.columnWidths && typeof partial.columnWidths === 'object' ? partial.columnWidths : undefined,
  }
}

export function buildComparisonSheetVersion(input: {
  previousView: ComparisonSheetView
  nextView: ComparisonSheetView
  latestVersionNumber: number
  currentVersionId?: number | null
  createdAt: string
  metadata?: WorkbookVersionMetadata
}): BuiltWorkbookVersion | null {
  const previous = normalizeComparisonSheetView(input.previousView)
  const next = normalizeComparisonSheetView(input.nextView)
  if (JSON.stringify(previous) === JSON.stringify(next)) return null
  return {
    view: next,
    version: {
      versionNumber: input.latestVersionNumber + 1,
      parentVersionId: input.currentVersionId ?? undefined,
      source: input.metadata?.source ?? 'estimator-edit',
      summary: input.metadata?.summary?.trim() || defaultVersionSummary(input.metadata?.source),
      actorUserId: input.metadata?.actorUserId,
      proposalJson: input.metadata?.proposal == null ? undefined : JSON.stringify(input.metadata.proposal),
      createdAt: input.createdAt,
    },
  }
}

function defaultVersionSummary(source: WorkbookVersionSource | undefined) {
  if (source === 'agent-proposal') return 'Applied agent proposal.'
  if (source === 'import') return 'Updated from imported workbook.'
  if (source === 'vendor-merge') return 'Merged vendor response into comparison.'
  if (source === 'restore') return 'Restored workbook version.'
  if (source === 'system') return 'Updated comparison sheet.'
  return 'Saved estimator workbook edit.'
}
