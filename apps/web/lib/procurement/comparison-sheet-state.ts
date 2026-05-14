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
  groupLabel?: string
  vendorMetric?: 'unit_price' | 'total' | 'lead' | 'alternate' | 'response_attr'
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
  actorName?: string
  historyMode?: 'autosave' | 'snapshot'
  restoreKind?: 'undo' | 'redo' | 'history'
  proposal?: unknown
}

export interface WorkbookVersionSummary {
  id: number
  versionNumber: number
  parentVersionId?: number
  source: WorkbookVersionSource
  summary: string
  actorUserId?: string
  actorName?: string
  restoredVersionId?: number
  restoreKind?: 'undo' | 'redo' | 'history'
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
    actorName?: string
    proposalJson?: string
    createdAt: string
  }
}

export interface BuiltWorkbookVersionSave {
  view: ComparisonSheetView
  versions: BuiltWorkbookVersion['version'][]
}

export interface ComparisonSheetCellOverrideInput {
  rowKey: string
  colKey: string
  value: string
}

export interface LocalWorkbookEditHistory {
  current: ComparisonSheetView
  undoStack: ComparisonSheetView[]
  redoStack: ComparisonSheetView[]
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

export function applyComparisonSheetCellOverrides(
  view: ComparisonSheetView,
  cells: ComparisonSheetCellOverrideInput[],
): ComparisonSheetView {
  const normalized = normalizeComparisonSheetView(view)
  const cellOverrides = { ...(normalized.cellOverrides ?? {}) }
  for (const cell of cells) {
    cellOverrides[`${cell.rowKey}|${cell.colKey}`] = cell.value
  }
  return normalizeComparisonSheetView({ ...normalized, cellOverrides })
}

export function applyLocalWorkbookEdit(
  history: LocalWorkbookEditHistory,
  nextView: ComparisonSheetView,
  limit = 50,
): LocalWorkbookEditHistory {
  const current = normalizeComparisonSheetView(history.current)
  const next = normalizeComparisonSheetView(nextView)
  if (JSON.stringify(current) === JSON.stringify(next)) return { ...history, current }
  return {
    current: next,
    undoStack: [...history.undoStack.slice(-(limit - 1)), current],
    redoStack: [],
  }
}

export function undoLocalWorkbookEdit(history: LocalWorkbookEditHistory): LocalWorkbookEditHistory {
  const previous = history.undoStack.at(-1)
  if (!previous) return history
  return {
    current: previous,
    undoStack: history.undoStack.slice(0, -1),
    redoStack: [...history.redoStack.slice(-49), normalizeComparisonSheetView(history.current)],
  }
}

export function redoLocalWorkbookEdit(history: LocalWorkbookEditHistory): LocalWorkbookEditHistory {
  const next = history.redoStack.at(-1)
  if (!next) return history
  return {
    current: next,
    undoStack: [...history.undoStack.slice(-49), normalizeComparisonSheetView(history.current)],
    redoStack: history.redoStack.slice(0, -1),
  }
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
  if (input.metadata?.historyMode === 'autosave') return null
  return {
    view: next,
    version: {
      versionNumber: input.latestVersionNumber + 1,
      parentVersionId: input.currentVersionId ?? undefined,
      source: input.metadata?.source ?? 'estimator-edit',
      summary: input.metadata?.summary?.trim() || defaultVersionSummary(input.metadata?.source),
      actorUserId: input.metadata?.actorUserId,
      actorName: input.metadata?.actorName?.trim() || undefined,
      proposalJson: input.metadata?.proposal == null ? undefined : JSON.stringify(input.metadata.proposal),
      createdAt: input.createdAt,
    },
  }
}

export function buildComparisonSheetVersionSave(input: {
  previousView: ComparisonSheetView
  nextView: ComparisonSheetView
  latestVersionNumber: number
  currentVersionId?: number | null
  createdAt: string
  metadata?: WorkbookVersionMetadata
}): BuiltWorkbookVersionSave | null {
  const built = buildComparisonSheetVersion(input)
  if (!built) return null
  if (input.latestVersionNumber > 0) return { view: built.view, versions: [built.version] }

  return {
    view: built.view,
    versions: [
      {
        versionNumber: 1,
        source: 'system',
        summary: 'Started workbook history.',
        actorUserId: input.metadata?.actorUserId,
        createdAt: input.createdAt,
      },
      {
        ...built.version,
        versionNumber: 2,
      },
    ],
  }
}

export function getWorkbookUndoRedoTargets(input: {
  versions: WorkbookVersionSummary[]
  currentVersionId?: number
}): { undoVersionId?: number; redoVersionId?: number } {
  const versions = input.versions
  if (versions.length === 0) return {}

  const current = versions.find((version) => version.id === input.currentVersionId) ?? versions[0]
  if (current.source === 'restore' && current.restoredVersionId) {
    if (current.restoreKind === 'redo') {
      return {
        undoVersionId: current.parentVersionId,
        redoVersionId: undefined,
      }
    }
    const restoredIndex = versions.findIndex((version) => version.id === current.restoredVersionId)
    return {
      undoVersionId: restoredIndex >= 0 ? versions[restoredIndex + 1]?.id : undefined,
      redoVersionId: current.parentVersionId,
    }
  }

  const currentIndex = versions.findIndex((version) => version.id === current.id)
  if (currentIndex === -1) return {}
  return {
    undoVersionId: versions[currentIndex + 1]?.id,
    redoVersionId: versions[currentIndex - 1]?.id,
  }
}

export function labelWorkbookVersionActors(
  versions: WorkbookVersionSummary[],
  currentUser: { userId: string; name: string },
): WorkbookVersionSummary[] {
  return versions.map((version) => {
    if (version.source === 'agent-proposal') return { ...version, actorName: 'Rialto AI' }
    if (version.actorUserId === currentUser.userId) return { ...version, actorName: currentUser.name }
    return version
  })
}

export function mergeWorkbookVersionSummaries(
  current: WorkbookVersionSummary[],
  incoming: WorkbookVersionSummary[],
  limit = 25,
): WorkbookVersionSummary[] {
  const byId = new Map<number, WorkbookVersionSummary>()
  for (const version of current) byId.set(version.id, version)
  for (const version of incoming) byId.set(version.id, version)
  return Array.from(byId.values())
    .sort((a, b) => b.versionNumber - a.versionNumber)
    .slice(0, limit)
}

function defaultVersionSummary(source: WorkbookVersionSource | undefined) {
  if (source === 'agent-proposal') return 'Applied agent proposal.'
  if (source === 'import') return 'Updated from imported workbook.'
  if (source === 'vendor-merge') return 'Merged vendor response into comparison.'
  if (source === 'restore') return 'Restored workbook version.'
  if (source === 'system') return 'Updated comparison sheet.'
  return 'Saved estimator workbook edit.'
}
