'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  applyComparisonSheetCellOverrides,
  applyLocalWorkbookEdit,
  DEFAULT_COMPARISON_SHEET_VIEW,
  getWorkbookUndoRedoTargets,
  mergeWorkbookVersionSummaries,
  normalizeComparisonSheetView,
  redoLocalWorkbookEdit,
  undoLocalWorkbookEdit,
  type ChartConfig,
  type ChartMetric,
  type ComparisonSheetCellOverrideInput,
  type ComparisonHighlight,
  type ComparisonSheetView,
  type DerivedColumn,
  type ManualColumn,
  type ManualLineItem,
  type WorkbookVersionSummary,
} from '@/lib/procurement/comparison-sheet-state'
import type { WorkbookVersionMetadata } from '@/lib/procurement/comparison-sheet-state'

export type { ChartConfig, ChartMetric, ComparisonHighlight, ComparisonSheetView, DerivedColumn, ManualColumn, ManualLineItem, WorkbookVersionSummary }

export const DEFAULT_VIEW = DEFAULT_COMPARISON_SHEET_VIEW

function storageKey(userKey: string, rfqId: string) {
  return `rialto:comparison-view:${userKey}:${rfqId}`
}

function viewsEqual(a: ComparisonSheetView, b: ComparisonSheetView) {
  return JSON.stringify(normalizeComparisonSheetView(a)) === JSON.stringify(normalizeComparisonSheetView(b))
}

export function useComparisonSheetView(userKey: string, rfqId: string, options: { persistToServer?: boolean } = {}) {
  const persistToServer = options.persistToServer ?? true
  const [view, setView] = useState<ComparisonSheetView>(DEFAULT_VIEW)
  const [versions, setVersions] = useState<WorkbookVersionSummary[]>([])
  const [currentVersionId, setCurrentVersionId] = useState<number | undefined>(undefined)
  const [hydrated, setHydrated] = useState(false)
  const [canUndoLocal, setCanUndoLocal] = useState(false)
  const [canRedoLocal, setCanRedoLocal] = useState(false)
  const pendingVersionMetadataRef = useRef<WorkbookVersionMetadata | null>(null)
  const undoStackRef = useRef<ComparisonSheetView[]>([])
  const redoStackRef = useRef<ComparisonSheetView[]>([])
  const viewRef = useRef<ComparisonSheetView>(DEFAULT_VIEW)
  const saveView = useCallback(async (viewToSave: ComparisonSheetView, metadata: WorkbookVersionMetadata) => {
    try {
      window.localStorage.setItem(storageKey(userKey, rfqId), JSON.stringify(viewToSave))
    } catch {
      // localStorage may be full or disabled; server persistence is still attempted.
    }
    if (!persistToServer) return
    const response = await fetch(`/api/rfqs/${encodeURIComponent(rfqId)}/comparison-sheet-view`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ view: viewToSave, metadata }),
    })
    if (!response.ok) return
    const body = await response.json() as { createdVersion?: WorkbookVersionSummary; createdVersions?: WorkbookVersionSummary[]; currentVersionId?: number }
    if (typeof body.currentVersionId === 'number') setCurrentVersionId(body.currentVersionId)
    const createdVersions = body.createdVersions?.length ? body.createdVersions : body.createdVersion ? [body.createdVersion] : []
    if (createdVersions.length) {
      setVersions((prev) => mergeWorkbookVersionSummaries(prev, createdVersions))
    }
  }, [persistToServer, rfqId, userKey])

  const pushLocalEdit = useCallback((previous: ComparisonSheetView, next: ComparisonSheetView) => {
    const history = applyLocalWorkbookEdit({
      current: previous,
      undoStack: undoStackRef.current,
      redoStack: redoStackRef.current,
    }, next)
    undoStackRef.current = history.undoStack
    redoStackRef.current = history.redoStack
    setCanUndoLocal(history.undoStack.length > 0)
    setCanRedoLocal(history.redoStack.length > 0)
  }, [])

  const updateView = useCallback((updater: (previous: ComparisonSheetView) => ComparisonSheetView) => {
    setView((previous) => {
      const next = normalizeComparisonSheetView(updater(previous))
      pushLocalEdit(previous, next)
      return next
    })
  }, [pushLocalEdit])

  useEffect(() => {
    viewRef.current = view
  }, [view])

  useEffect(() => {
    let cancelled = false
    async function hydrate() {
      let localView = DEFAULT_VIEW
      if (typeof window !== 'undefined') {
        try {
          const raw = window.localStorage.getItem(storageKey(userKey, rfqId))
          if (raw) localView = normalizeComparisonSheetView(JSON.parse(raw))
        } catch {
          // ignore corrupt cache
        }
      }

      if (!persistToServer) {
        if (!cancelled) setView(localView)
        if (!cancelled) setHydrated(true)
        return
      }

      try {
        const response = await fetch(`/api/rfqs/${encodeURIComponent(rfqId)}/comparison-sheet-view`, { cache: 'no-store' })
        if (response.ok) {
          const body = await response.json() as { view?: unknown; persisted?: boolean; versions?: WorkbookVersionSummary[]; currentVersionId?: number }
          if (!cancelled) setView(body.persisted ? normalizeComparisonSheetView(body.view) : localView)
          if (!cancelled && Array.isArray(body.versions)) setVersions(body.versions)
          if (!cancelled && typeof body.currentVersionId === 'number') setCurrentVersionId(body.currentVersionId)
        } else if (!cancelled) {
          setView(localView)
        }
      } catch {
        if (!cancelled) setView(localView)
      } finally {
        if (!cancelled) setHydrated(true)
      }
    }
    hydrate()
    return () => {
      cancelled = true
    }
  }, [persistToServer, userKey, rfqId])

  useEffect(() => {
    if (!hydrated) return
    try {
      window.localStorage.setItem(storageKey(userKey, rfqId), JSON.stringify(view))
    } catch {
      // localStorage may be full or disabled; server persistence is still attempted.
    }

    const timeout = window.setTimeout(() => {
      saveView(view, pendingVersionMetadataRef.current ?? { source: 'estimator-edit', historyMode: 'autosave' }).catch(() => {
        // The local cache keeps the current browser usable if the save fails.
      }).finally(() => {
        pendingVersionMetadataRef.current = null
      })
    }, 300)
    return () => window.clearTimeout(timeout)
  }, [view, userKey, rfqId, hydrated, saveView])

  const markNextSave = useCallback((metadata: WorkbookVersionMetadata) => {
    pendingVersionMetadataRef.current = metadata
  }, [])

  const replaceView = useCallback((nextView: ComparisonSheetView, metadata: WorkbookVersionMetadata) => {
    const normalized = normalizeComparisonSheetView(nextView)
    pendingVersionMetadataRef.current = null
    pushLocalEdit(viewRef.current, normalized)
    setView(normalized)
    void saveView(normalized, metadata)
  }, [pushLocalEdit, saveView])

  const restoreVersion = useCallback(async (versionId: number, restoreKind: 'undo' | 'redo' | 'history' = 'history') => {
    if (!persistToServer) return
    const response = await fetch(`/api/rfqs/${encodeURIComponent(rfqId)}/comparison-sheet-view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restoreVersionId: versionId, restoreKind }),
    })
    if (!response.ok) throw new Error('Could not restore workbook version.')
    const body = await response.json() as { view?: unknown; createdVersion?: WorkbookVersionSummary; createdVersions?: WorkbookVersionSummary[]; currentVersionId?: number }
    const restoredView = normalizeComparisonSheetView(body.view)
    pushLocalEdit(viewRef.current, restoredView)
    setView(restoredView)
    if (typeof body.currentVersionId === 'number') setCurrentVersionId(body.currentVersionId)
    const createdVersions = body.createdVersions?.length ? body.createdVersions : body.createdVersion ? [body.createdVersion] : []
    if (createdVersions.length) {
      setVersions((prev) => mergeWorkbookVersionSummaries(prev, createdVersions))
    }
  }, [persistToServer, pushLocalEdit, rfqId])

  const { undoVersionId, redoVersionId } = getWorkbookUndoRedoTargets({ versions, currentVersionId })

  const undo = useCallback(async () => {
    const history = undoLocalWorkbookEdit({
      current: viewRef.current,
      undoStack: undoStackRef.current,
      redoStack: redoStackRef.current,
    })
    if (!viewsEqual(history.current, viewRef.current)) {
      undoStackRef.current = history.undoStack
      redoStackRef.current = history.redoStack
      setCanUndoLocal(history.undoStack.length > 0)
      setCanRedoLocal(history.redoStack.length > 0)
      setView(history.current)
      await saveView(history.current, { source: 'estimator-edit', historyMode: 'autosave' })
      return
    }
    if (undoVersionId == null) return
    await restoreVersion(undoVersionId, 'undo')
  }, [restoreVersion, saveView, undoVersionId])

  const redo = useCallback(async () => {
    const history = redoLocalWorkbookEdit({
      current: viewRef.current,
      undoStack: undoStackRef.current,
      redoStack: redoStackRef.current,
    })
    if (!viewsEqual(history.current, viewRef.current)) {
      undoStackRef.current = history.undoStack
      redoStackRef.current = history.redoStack
      setCanUndoLocal(history.undoStack.length > 0)
      setCanRedoLocal(history.redoStack.length > 0)
      setView(history.current)
      await saveView(history.current, { source: 'estimator-edit', historyMode: 'autosave' })
      return
    }
    if (redoVersionId == null) return
    await restoreVersion(redoVersionId, 'redo')
  }, [redoVersionId, restoreVersion, saveView])

  const merge = useCallback((patch: Partial<ComparisonSheetView>) => {
    updateView((prev) => ({ ...prev, ...patch }))
  }, [updateView])

  const hideColumns = useCallback((keys: string[]) => {
    pendingVersionMetadataRef.current = {
      source: 'estimator-edit',
      historyMode: 'snapshot',
      summary: `Hid ${keys.length} column${keys.length === 1 ? '' : 's'}.`,
    }
    updateView((prev) => ({ ...prev, hiddenColumnKeys: Array.from(new Set([...prev.hiddenColumnKeys, ...keys])) }))
  }, [updateView])

  const deleteColumns = useCallback((keys: string[]) => {
    pendingVersionMetadataRef.current = {
      source: 'estimator-edit',
      historyMode: 'snapshot',
      summary: `Deleted ${keys.length} column${keys.length === 1 ? '' : 's'}.`,
    }
    updateView((prev) => ({
      ...prev,
      deletedColumnKeys: Array.from(new Set([...(prev.deletedColumnKeys ?? []), ...keys])),
      hiddenColumnKeys: prev.hiddenColumnKeys.filter((key) => !keys.includes(key)),
    }))
  }, [updateView])

  const showColumns = useCallback((keys: string[]) => {
    pendingVersionMetadataRef.current = {
      source: 'estimator-edit',
      historyMode: 'snapshot',
      summary: `Showed ${keys.length} hidden column${keys.length === 1 ? '' : 's'}.`,
    }
    updateView((prev) => ({ ...prev, hiddenColumnKeys: prev.hiddenColumnKeys.filter((k) => !keys.includes(k)) }))
  }, [updateView])

  const hideLineItems = useCallback((ids: string[]) => {
    pendingVersionMetadataRef.current = {
      source: 'estimator-edit',
      historyMode: 'snapshot',
      summary: `Hid ${ids.length} row${ids.length === 1 ? '' : 's'}.`,
    }
    updateView((prev) => ({ ...prev, hiddenLineItemIds: Array.from(new Set([...prev.hiddenLineItemIds, ...ids])) }))
  }, [updateView])

  const deleteLineItems = useCallback((ids: string[]) => {
    pendingVersionMetadataRef.current = {
      source: 'estimator-edit',
      historyMode: 'snapshot',
      summary: `Deleted ${ids.length} row${ids.length === 1 ? '' : 's'}.`,
    }
    updateView((prev) => ({
      ...prev,
      deletedLineItemIds: Array.from(new Set([...(prev.deletedLineItemIds ?? []), ...ids])),
      hiddenLineItemIds: prev.hiddenLineItemIds.filter((id) => !ids.includes(id)),
    }))
  }, [updateView])

  const showLineItems = useCallback((ids: string[]) => {
    pendingVersionMetadataRef.current = {
      source: 'estimator-edit',
      historyMode: 'snapshot',
      summary: `Showed ${ids.length} hidden row${ids.length === 1 ? '' : 's'}.`,
    }
    updateView((prev) => ({ ...prev, hiddenLineItemIds: prev.hiddenLineItemIds.filter((id) => !ids.includes(id)) }))
  }, [updateView])

  const addHighlights = useCallback((items: ComparisonHighlight[]) => {
    pendingVersionMetadataRef.current = {
      source: 'estimator-edit',
      historyMode: 'snapshot',
      summary: `Added ${items.length} highlight${items.length === 1 ? '' : 's'}.`,
    }
    updateView((prev) => ({ ...prev, highlights: [...prev.highlights, ...items] }))
  }, [updateView])

  const removeHighlights = useCallback((ids: string[]) => {
    pendingVersionMetadataRef.current = {
      source: 'estimator-edit',
      historyMode: 'snapshot',
      summary: `Removed ${ids.length} highlight${ids.length === 1 ? '' : 's'}.`,
    }
    updateView((prev) => ({ ...prev, highlights: prev.highlights.filter((h) => !ids.includes(h.id)) }))
  }, [updateView])

  const acknowledgeReviewHighlights = useCallback((ids: string[]) => {
    if (ids.length === 0) return
    pendingVersionMetadataRef.current = {
      source: 'estimator-edit',
      historyMode: 'snapshot',
      summary: `Acknowledged ${ids.length} review highlight${ids.length === 1 ? '' : 's'}.`,
    }
    updateView((prev) => ({
      ...prev,
      acknowledgedReviewHighlightIds: Array.from(new Set([...(prev.acknowledgedReviewHighlightIds ?? []), ...ids])),
      highlights: prev.highlights.filter((h) => !ids.includes(h.id)),
    }))
  }, [updateView])

  const clearHighlights = useCallback(() => {
    pendingVersionMetadataRef.current = {
      source: 'estimator-edit',
      historyMode: 'snapshot',
      summary: 'Cleared review highlights.',
    }
    updateView((prev) => ({ ...prev, highlights: [] }))
  }, [updateView])

  const addDerivedColumns = useCallback((cols: DerivedColumn[]) => {
    pendingVersionMetadataRef.current = {
      source: 'estimator-edit',
      historyMode: 'snapshot',
      summary: `Added ${cols.length} derived column${cols.length === 1 ? '' : 's'}.`,
    }
    updateView((prev) => ({ ...prev, derivedColumns: [...prev.derivedColumns, ...cols] }))
  }, [updateView])

  const removeDerivedColumns = useCallback((keys: string[]) => {
    pendingVersionMetadataRef.current = {
      source: 'estimator-edit',
      historyMode: 'snapshot',
      summary: `Removed ${keys.length} derived column${keys.length === 1 ? '' : 's'}.`,
    }
    updateView((prev) => ({ ...prev, derivedColumns: prev.derivedColumns.filter((c) => !keys.includes(c.key)) }))
  }, [updateView])

  const setChart = useCallback((slot: 'left' | 'right', metric: ChartMetric, title?: string) => {
    pendingVersionMetadataRef.current = {
      source: 'estimator-edit',
      historyMode: 'snapshot',
      summary: `Changed ${slot} chart to ${metric}.`,
    }
    updateView((prev) => ({
      ...prev,
      charts: prev.charts.map((c) =>
        c.slot === slot ? { ...c, metric, title: title ?? c.title } : c,
      ),
    }))
  }, [updateView])

  const setColumnWidth = useCallback((colKey: string, width: number) => {
    updateView((prev) => ({ ...prev, columnWidths: { ...(prev.columnWidths ?? {}), [colKey]: width } }))
  }, [updateView])

  const addManualColumns = useCallback((cols: ManualColumn[]) => {
    pendingVersionMetadataRef.current = {
      source: 'estimator-edit',
      historyMode: 'snapshot',
      summary: `Added ${cols.length} manual column${cols.length === 1 ? '' : 's'}.`,
    }
    updateView((prev) => ({ ...prev, manualColumns: [...(prev.manualColumns ?? []), ...cols] }))
  }, [updateView])

  const addManualLineItems = useCallback((rows: ManualLineItem[]) => {
    pendingVersionMetadataRef.current = {
      source: 'estimator-edit',
      historyMode: 'snapshot',
      summary: `Added ${rows.length} manual row${rows.length === 1 ? '' : 's'}.`,
    }
    updateView((prev) => ({ ...prev, manualLineItems: [...(prev.manualLineItems ?? []), ...rows] }))
  }, [updateView])

  const setCellOverride = useCallback((rowKey: string, colKey: string, value: string) => {
    updateView((prev) => applyComparisonSheetCellOverrides(prev, [{ rowKey, colKey, value }]))
  }, [updateView])

  const setCellOverrides = useCallback((cells: ComparisonSheetCellOverrideInput[]) => {
    updateView((prev) => applyComparisonSheetCellOverrides(prev, cells))
  }, [updateView])

  const setColumnLabel = useCallback((colKey: string, label: string) => {
    updateView((prev) => {
      const next = { ...(prev.columnLabelOverrides ?? {}) }
      if (label.trim() === '') delete next[colKey]
      else next[colKey] = label.trim()
      return { ...prev, columnLabelOverrides: next }
    })
  }, [updateView])

  const setLineItemOrder = useCallback((ids: string[]) => {
    pendingVersionMetadataRef.current = {
      source: 'estimator-edit',
      historyMode: 'snapshot',
      summary: 'Reordered rows.',
    }
    updateView((prev) => ({ ...prev, lineItemOrder: ids }))
  }, [updateView])

  const reset = useCallback(() => updateView(() => DEFAULT_VIEW), [updateView])

  return {
    view,
    versions,
    currentVersionId,
    undoVersionId,
    redoVersionId,
    canUndo: canUndoLocal || undoVersionId != null,
    canRedo: canRedoLocal || redoVersionId != null,
    hydrated,
    merge,
    replaceView,
    deleteColumns,
    hideColumns,
    showColumns,
    deleteLineItems,
    hideLineItems,
    showLineItems,
    addHighlights,
    removeHighlights,
    acknowledgeReviewHighlights,
    clearHighlights,
    addDerivedColumns,
    removeDerivedColumns,
    setChart,
    setColumnWidth,
    addManualColumns,
    addManualLineItems,
    setCellOverride,
    setCellOverrides,
    setColumnLabel,
    setLineItemOrder,
    markNextSave,
    restoreVersion,
    undo,
    redo,
    reset,
  }
}

// AI patch shape returned by /api/bid-comparison/ai-propose
export interface ComparisonViewPatch {
  summary: string
  agentProposal?: unknown
  deleteColumnKeys?: string[]
  hideColumnKeys?: string[]
  showColumnKeys?: string[]
  deleteLineItemIds?: string[]
  hideLineItemIds?: string[]
  showLineItemIds?: string[]
  addHighlights?: ComparisonHighlight[]
  removeHighlightIds?: string[]
  clearHighlights?: boolean
  addDerivedColumns?: DerivedColumn[]
  removeDerivedColumnKeys?: string[]
  addManualColumns?: ManualColumn[]
  addManualLineItems?: ManualLineItem[]
  setCells?: Array<{ rowKey: string; colKey: string; value: string }>
  setColumnLabels?: Array<{ colKey: string; label: string }>
  setLineItemOrder?: string[]
  sortRowsByColumn?: { colKey: string; direction: 'asc' | 'desc' }
  filterBlankRowsByColumnKey?: string
  setCharts?: ChartConfig[]
}

export function applyPatch(view: ComparisonSheetView, patch: ComparisonViewPatch): ComparisonSheetView {
  let next = { ...view }
  if (patch.deleteColumnKeys?.length) {
    next = {
      ...next,
      deletedColumnKeys: Array.from(new Set([...(next.deletedColumnKeys ?? []), ...patch.deleteColumnKeys])),
      hiddenColumnKeys: next.hiddenColumnKeys.filter((key) => !patch.deleteColumnKeys!.includes(key)),
    }
  }
  if (patch.hideColumnKeys?.length) {
    next = { ...next, hiddenColumnKeys: Array.from(new Set([...next.hiddenColumnKeys, ...patch.hideColumnKeys])) }
  }
  if (patch.showColumnKeys?.length) {
    next = { ...next, hiddenColumnKeys: next.hiddenColumnKeys.filter((k) => !patch.showColumnKeys!.includes(k)) }
  }
  if (patch.deleteLineItemIds?.length) {
    next = {
      ...next,
      deletedLineItemIds: Array.from(new Set([...(next.deletedLineItemIds ?? []), ...patch.deleteLineItemIds])),
      hiddenLineItemIds: next.hiddenLineItemIds.filter((id) => !patch.deleteLineItemIds!.includes(id)),
    }
  }
  if (patch.hideLineItemIds?.length) {
    next = { ...next, hiddenLineItemIds: Array.from(new Set([...next.hiddenLineItemIds, ...patch.hideLineItemIds])) }
  }
  if (patch.showLineItemIds?.length) {
    next = { ...next, hiddenLineItemIds: next.hiddenLineItemIds.filter((id) => !patch.showLineItemIds!.includes(id)) }
  }
  if (patch.clearHighlights) next = { ...next, highlights: [] }
  if (patch.removeHighlightIds?.length) {
    next = { ...next, highlights: next.highlights.filter((h) => !patch.removeHighlightIds!.includes(h.id)) }
  }
  if (patch.addHighlights?.length) {
    next = { ...next, highlights: [...next.highlights, ...patch.addHighlights] }
  }
  if (patch.removeDerivedColumnKeys?.length) {
    next = { ...next, derivedColumns: next.derivedColumns.filter((c) => !patch.removeDerivedColumnKeys!.includes(c.key)) }
  }
  if (patch.addDerivedColumns?.length) {
    next = { ...next, derivedColumns: [...next.derivedColumns, ...patch.addDerivedColumns] }
  }
  if (patch.addManualColumns?.length) {
    next = { ...next, manualColumns: [...(next.manualColumns ?? []), ...patch.addManualColumns] }
  }
  if (patch.addManualLineItems?.length) {
    next = { ...next, manualLineItems: [...(next.manualLineItems ?? []), ...patch.addManualLineItems] }
  }
  if (patch.setCells?.length) {
    const cellOverrides = { ...(next.cellOverrides ?? {}) }
    for (const cell of patch.setCells) {
      const key = `${cell.rowKey}|${cell.colKey}`
      cellOverrides[key] = cell.value
    }
    next = { ...next, cellOverrides }
  }
  if (patch.setColumnLabels?.length) {
    const columnLabelOverrides = { ...(next.columnLabelOverrides ?? {}) }
    for (const col of patch.setColumnLabels) {
      if (col.label.trim() === '') delete columnLabelOverrides[col.colKey]
      else columnLabelOverrides[col.colKey] = col.label.trim()
    }
    next = { ...next, columnLabelOverrides }
  }
  if (patch.setLineItemOrder?.length) {
    next = { ...next, lineItemOrder: patch.setLineItemOrder }
  }
  if (patch.setCharts?.length) {
    next = {
      ...next,
      charts: next.charts.map((c) => patch.setCharts!.find((p) => p.slot === c.slot) ?? c),
    }
  }
  return next
}
