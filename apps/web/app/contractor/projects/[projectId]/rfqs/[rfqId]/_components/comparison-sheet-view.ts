'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  DEFAULT_COMPARISON_SHEET_VIEW,
  normalizeComparisonSheetView,
  type ChartConfig,
  type ChartMetric,
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

export function useComparisonSheetView(userKey: string, rfqId: string) {
  const [view, setView] = useState<ComparisonSheetView>(DEFAULT_VIEW)
  const [versions, setVersions] = useState<WorkbookVersionSummary[]>([])
  const [hydrated, setHydrated] = useState(false)
  const pendingVersionMetadataRef = useRef<WorkbookVersionMetadata | null>(null)
  const saveView = useCallback(async (viewToSave: ComparisonSheetView, metadata: WorkbookVersionMetadata) => {
    try {
      window.localStorage.setItem(storageKey(userKey, rfqId), JSON.stringify(viewToSave))
    } catch {
      // localStorage may be full or disabled; server persistence is still attempted.
    }
    const response = await fetch(`/api/rfqs/${encodeURIComponent(rfqId)}/comparison-sheet-view`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ view: viewToSave, metadata }),
    })
    if (!response.ok) return
    const body = await response.json() as { createdVersion?: WorkbookVersionSummary }
    if (body.createdVersion) {
      setVersions((prev) => [body.createdVersion!, ...prev.filter((version) => version.id !== body.createdVersion!.id)].slice(0, 25))
    }
  }, [rfqId, userKey])

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

      try {
        const response = await fetch(`/api/rfqs/${encodeURIComponent(rfqId)}/comparison-sheet-view`, { cache: 'no-store' })
        if (response.ok) {
          const body = await response.json() as { view?: unknown; persisted?: boolean; versions?: WorkbookVersionSummary[] }
          if (!cancelled) setView(body.persisted ? normalizeComparisonSheetView(body.view) : localView)
          if (!cancelled && Array.isArray(body.versions)) setVersions(body.versions)
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
  }, [userKey, rfqId])

  useEffect(() => {
    if (!hydrated) return
    try {
      window.localStorage.setItem(storageKey(userKey, rfqId), JSON.stringify(view))
    } catch {
      // localStorage may be full or disabled; server persistence is still attempted.
    }

    const timeout = window.setTimeout(() => {
      saveView(view, pendingVersionMetadataRef.current ?? { source: 'estimator-edit' }).catch(() => {
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
    setView(normalized)
    void saveView(normalized, metadata)
  }, [saveView])

  const restoreVersion = useCallback(async (versionId: number) => {
    const response = await fetch(`/api/rfqs/${encodeURIComponent(rfqId)}/comparison-sheet-view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restoreVersionId: versionId }),
    })
    if (!response.ok) throw new Error('Could not restore workbook version.')
    const body = await response.json() as { view?: unknown; createdVersion?: WorkbookVersionSummary }
    setView(normalizeComparisonSheetView(body.view))
    if (body.createdVersion) {
      setVersions((prev) => [body.createdVersion!, ...prev.filter((version) => version.id !== body.createdVersion!.id)].slice(0, 25))
    }
  }, [rfqId])

  const merge = useCallback((patch: Partial<ComparisonSheetView>) => {
    setView((prev) => ({ ...prev, ...patch }))
  }, [])

  const hideColumns = useCallback((keys: string[]) => {
    setView((prev) => ({ ...prev, hiddenColumnKeys: Array.from(new Set([...prev.hiddenColumnKeys, ...keys])) }))
  }, [])

  const deleteColumns = useCallback((keys: string[]) => {
    setView((prev) => ({
      ...prev,
      deletedColumnKeys: Array.from(new Set([...(prev.deletedColumnKeys ?? []), ...keys])),
      hiddenColumnKeys: prev.hiddenColumnKeys.filter((key) => !keys.includes(key)),
    }))
  }, [])

  const showColumns = useCallback((keys: string[]) => {
    setView((prev) => ({ ...prev, hiddenColumnKeys: prev.hiddenColumnKeys.filter((k) => !keys.includes(k)) }))
  }, [])

  const hideLineItems = useCallback((ids: string[]) => {
    setView((prev) => ({ ...prev, hiddenLineItemIds: Array.from(new Set([...prev.hiddenLineItemIds, ...ids])) }))
  }, [])

  const deleteLineItems = useCallback((ids: string[]) => {
    setView((prev) => ({
      ...prev,
      deletedLineItemIds: Array.from(new Set([...(prev.deletedLineItemIds ?? []), ...ids])),
      hiddenLineItemIds: prev.hiddenLineItemIds.filter((id) => !ids.includes(id)),
    }))
  }, [])

  const showLineItems = useCallback((ids: string[]) => {
    setView((prev) => ({ ...prev, hiddenLineItemIds: prev.hiddenLineItemIds.filter((id) => !ids.includes(id)) }))
  }, [])

  const addHighlights = useCallback((items: ComparisonHighlight[]) => {
    setView((prev) => ({ ...prev, highlights: [...prev.highlights, ...items] }))
  }, [])

  const removeHighlights = useCallback((ids: string[]) => {
    setView((prev) => ({ ...prev, highlights: prev.highlights.filter((h) => !ids.includes(h.id)) }))
  }, [])

  const clearHighlights = useCallback(() => {
    setView((prev) => ({ ...prev, highlights: [] }))
  }, [])

  const addDerivedColumns = useCallback((cols: DerivedColumn[]) => {
    setView((prev) => ({ ...prev, derivedColumns: [...prev.derivedColumns, ...cols] }))
  }, [])

  const removeDerivedColumns = useCallback((keys: string[]) => {
    setView((prev) => ({ ...prev, derivedColumns: prev.derivedColumns.filter((c) => !keys.includes(c.key)) }))
  }, [])

  const setChart = useCallback((slot: 'left' | 'right', metric: ChartMetric, title?: string) => {
    setView((prev) => ({
      ...prev,
      charts: prev.charts.map((c) =>
        c.slot === slot ? { ...c, metric, title: title ?? c.title } : c,
      ),
    }))
  }, [])

  const setColumnWidth = useCallback((colKey: string, width: number) => {
    setView((prev) => ({ ...prev, columnWidths: { ...(prev.columnWidths ?? {}), [colKey]: width } }))
  }, [])

  const addManualColumns = useCallback((cols: ManualColumn[]) => {
    setView((prev) => ({ ...prev, manualColumns: [...(prev.manualColumns ?? []), ...cols] }))
  }, [])

  const addManualLineItems = useCallback((rows: ManualLineItem[]) => {
    setView((prev) => ({ ...prev, manualLineItems: [...(prev.manualLineItems ?? []), ...rows] }))
  }, [])

  const setCellOverride = useCallback((rowKey: string, colKey: string, value: string) => {
    setView((prev) => {
      const key = `${rowKey}|${colKey}`
      const next = { ...(prev.cellOverrides ?? {}) }
      next[key] = value
      return { ...prev, cellOverrides: next }
    })
  }, [])

  const setColumnLabel = useCallback((colKey: string, label: string) => {
    setView((prev) => {
      const next = { ...(prev.columnLabelOverrides ?? {}) }
      if (label.trim() === '') delete next[colKey]
      else next[colKey] = label.trim()
      return { ...prev, columnLabelOverrides: next }
    })
  }, [])

  const setLineItemOrder = useCallback((ids: string[]) => {
    setView((prev) => ({ ...prev, lineItemOrder: ids }))
  }, [])

  const reset = useCallback(() => setView(DEFAULT_VIEW), [])

  return {
    view,
    versions,
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
    clearHighlights,
    addDerivedColumns,
    removeDerivedColumns,
    setChart,
    setColumnWidth,
    addManualColumns,
    addManualLineItems,
    setCellOverride,
    setColumnLabel,
    setLineItemOrder,
    markNextSave,
    restoreVersion,
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
