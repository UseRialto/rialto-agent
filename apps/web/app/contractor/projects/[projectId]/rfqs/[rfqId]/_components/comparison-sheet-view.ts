'use client'

import { useCallback, useEffect, useState } from 'react'

export type ChartMetric = 'price' | 'lead'

export interface ComparisonHighlight {
  id: string
  // Either a literal cell reference or a semantic rule the client evaluates.
  selector:
    | { kind: 'cell'; rowKey: string; colKey: string }
    | { kind: 'rule'; rule: 'fastest-lead-per-row' | 'lowest-price-per-row' | 'highest-coverage-overall' }
  color: string
  note?: string
}

export interface DerivedColumn {
  key: string
  label: string
  // Tiny DSL: 'min(vendor.lead_time)', 'min(vendor.unit_price)', 'max(vendor.unit_price)',
  // 'spread(vendor.unit_price)', 'avg(vendor.unit_price)'.
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
  // If set, the chart shows data for a single line item only (else "all items").
  lineItemId?: string | null
}

export interface ComparisonSheetView {
  hiddenColumnKeys: string[]
  hiddenLineItemIds: string[]
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

export const DEFAULT_VIEW: ComparisonSheetView = {
  hiddenColumnKeys: [],
  hiddenLineItemIds: [],
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

function storageKey(userKey: string, rfqId: string) {
  return `rialto:comparison-view:${userKey}:${rfqId}`
}

export function useComparisonSheetView(userKey: string, rfqId: string) {
  const [view, setView] = useState<ComparisonSheetView>(DEFAULT_VIEW)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(storageKey(userKey, rfqId))
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<ComparisonSheetView>
        setView({ ...DEFAULT_VIEW, ...parsed })
      }
    } catch {
      // ignore corrupt cache
    }
    setHydrated(true)
  }, [userKey, rfqId])

  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return
    try {
      window.localStorage.setItem(storageKey(userKey, rfqId), JSON.stringify(view))
    } catch {
      // localStorage may be full or disabled — silent fail is fine
    }
  }, [view, userKey, rfqId, hydrated])

  const merge = useCallback((patch: Partial<ComparisonSheetView>) => {
    setView((prev) => ({ ...prev, ...patch }))
  }, [])

  const hideColumns = useCallback((keys: string[]) => {
    setView((prev) => ({ ...prev, hiddenColumnKeys: Array.from(new Set([...prev.hiddenColumnKeys, ...keys])) }))
  }, [])

  const showColumns = useCallback((keys: string[]) => {
    setView((prev) => ({ ...prev, hiddenColumnKeys: prev.hiddenColumnKeys.filter((k) => !keys.includes(k)) }))
  }, [])

  const hideLineItems = useCallback((ids: string[]) => {
    setView((prev) => ({ ...prev, hiddenLineItemIds: Array.from(new Set([...prev.hiddenLineItemIds, ...ids])) }))
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
    hydrated,
    merge,
    hideColumns,
    showColumns,
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
    reset,
  }
}

// AI patch shape returned by /api/bid-comparison/ai-propose
export interface ComparisonViewPatch {
  summary: string
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
    next = { ...next, hiddenColumnKeys: Array.from(new Set([...next.hiddenColumnKeys, ...patch.deleteColumnKeys])) }
  }
  if (patch.hideColumnKeys?.length) {
    next = { ...next, hiddenColumnKeys: Array.from(new Set([...next.hiddenColumnKeys, ...patch.hideColumnKeys])) }
  }
  if (patch.showColumnKeys?.length) {
    next = { ...next, hiddenColumnKeys: next.hiddenColumnKeys.filter((k) => !patch.showColumnKeys!.includes(k)) }
  }
  if (patch.deleteLineItemIds?.length) {
    next = { ...next, hiddenLineItemIds: Array.from(new Set([...next.hiddenLineItemIds, ...patch.deleteLineItemIds])) }
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
