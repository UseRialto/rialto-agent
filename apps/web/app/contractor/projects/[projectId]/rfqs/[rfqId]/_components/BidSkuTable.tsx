'use client'

import { Fragment, useEffect, useState } from 'react'
import { Settings, X } from 'lucide-react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import type { ContractorBid, ContractorRFQ } from '@/lib/types/contractor'

function fmt(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  return `$${n.toLocaleString()}`
}

const AVAIL_LABELS: Record<ContractorBid['line_item_responses'][number]['availability'], string> = {
  in_stock: 'In inventory',
  can_source: 'Needs sourcing',
  unavailable: 'Unavailable',
}

type SkuTableOptionKey = 'itemSku' | 'requestedQty' | 'itemSpecs' | 'sourceQuantity' | 'coverageBar' | 'substitutionNotes'
type SkuTableOrientation = 'vendorsRows' | 'itemsRows'
type SkuMetric = 'total' | 'unit' | 'lead'
type SortDirection = 'asc' | 'desc'
type MatrixSort = {
  axisId: string
  metric: SkuMetric
  direction: SortDirection
} | null

const DEFAULT_SKU_TABLE_OPTIONS: Record<SkuTableOptionKey, boolean> = {
  itemSku: false,
  requestedQty: false,
  itemSpecs: false,
  sourceQuantity: false,
  coverageBar: false,
  substitutionNotes: false,
}

const DEFAULT_SKU_TABLE_SETTINGS = {
  options: DEFAULT_SKU_TABLE_OPTIONS,
  orientation: 'vendorsRows' as SkuTableOrientation,
  vendorOrder: [] as string[],
  itemOrder: [] as string[],
  rowHeaderWidth: 320,
}

const SKU_TABLE_OPTION_STORAGE_KEY = 'rialto.bidComparison.skuTableOptions.v3'
const SKU_TABLE_OPTIONS: Array<{ key: SkuTableOptionKey; label: string; description: string }> = [
  { key: 'itemSku', label: 'Item SKU', description: 'Show the SKU under each item name.' },
  { key: 'requestedQty', label: 'Requested Quantity', description: 'Show requested quantity and unit in the item column.' },
  { key: 'itemSpecs', label: 'Item Specifications', description: 'Show RFQ specs in the item column.' },
  { key: 'sourceQuantity', label: 'Fulfillment Quantity', description: 'Show available or quoted quantity against requested quantity.' },
  { key: 'coverageBar', label: 'Coverage Bar', description: 'Show the visual progress bar for item coverage.' },
  { key: 'substitutionNotes', label: 'Substitution Notes', description: 'Show vendor substitution notes when available.' },
]

function sourcedQuantity(resp: ContractorBid['line_item_responses'][number] | undefined, requested: number) {
  if (!resp || resp.availability === 'unavailable') return 0
  return resp.units_available ?? resp.quoted_quantity ?? requested
}

function sourceLabel(bid: ContractorBid) {
  if (bid.source === 'magic_form') return 'Magic Form'
  if (bid.source === 'email') return 'Email'
  if (bid.is_invited) return 'Invited'
  return 'Marketplace'
}

function orderByIds<T>(items: T[], savedOrder: string[], getId: (item: T) => string) {
  const byId = new Map(items.map((item) => [getId(item), item]))
  const ordered = savedOrder
    .map((id) => byId.get(id))
    .filter((item): item is T => Boolean(item))
  const savedIds = new Set(savedOrder)
  return [...ordered, ...items.filter((item) => !savedIds.has(getId(item)))]
}

function reorderIds(ids: string[], draggedId: string, targetId: string) {
  if (draggedId === targetId) return ids
  const next = ids.filter((id) => id !== draggedId)
  const targetIndex = next.indexOf(targetId)
  if (targetIndex === -1) return ids
  next.splice(targetIndex, 0, draggedId)
  return next
}

function animateTableChange(update: () => void) {
  const documentWithTransition = document as Document & {
    startViewTransition?: (update: () => void) => { finished?: Promise<unknown> }
  }

  if (typeof documentWithTransition.startViewTransition === 'function') {
    documentWithTransition.startViewTransition(update).finished?.catch(() => undefined)
    return
  }

  update()
}

export function BidSkuTable({
  rfq,
  bids,
  onVendorSelect,
}: {
  rfq: ContractorRFQ
  bids: ContractorBid[]
  onVendorSelect?: (bid: ContractorBid) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [customizing, setCustomizing] = useState(false)
  const [settings, setSettings] = useState(DEFAULT_SKU_TABLE_SETTINGS)
  const [loadedOptions, setLoadedOptions] = useState(false)
  const [draggedVendorId, setDraggedVendorId] = useState<string | null>(null)
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null)
  const [matrixSort, setMatrixSort] = useState<MatrixSort>(null)
  const options = settings.options
  const orderedBids = orderByIds(bids, settings.vendorOrder, (bid) => bid.id)
  const orderedItems = orderByIds(rfq.line_items, settings.itemOrder, (item) => item.id)
  const columnCount = settings.orientation === 'vendorsRows' ? orderedItems.length : orderedBids.length
  const rowHeaderWidth = Math.min(Math.max(settings.rowHeaderWidth, 240), 560)
  const rowHeaderStyle = { width: rowHeaderWidth, minWidth: rowHeaderWidth, maxWidth: rowHeaderWidth }

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SKU_TABLE_OPTION_STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<typeof DEFAULT_SKU_TABLE_SETTINGS>
        setSettings({
          ...DEFAULT_SKU_TABLE_SETTINGS,
          ...parsed,
          options: { ...DEFAULT_SKU_TABLE_OPTIONS, ...(parsed.options ?? {}) },
          orientation: parsed.orientation === 'itemsRows' ? 'itemsRows' : 'vendorsRows',
          vendorOrder: Array.isArray(parsed.vendorOrder) ? parsed.vendorOrder : [],
          itemOrder: Array.isArray(parsed.itemOrder) ? parsed.itemOrder : [],
          rowHeaderWidth: typeof parsed.rowHeaderWidth === 'number' ? Math.min(Math.max(parsed.rowHeaderWidth, 240), 560) : 320,
        })
      }
    } catch {
      setSettings(DEFAULT_SKU_TABLE_SETTINGS)
    } finally {
      setLoadedOptions(true)
    }
  }, [])

  useEffect(() => {
    if (!loadedOptions) return
    window.localStorage.setItem(SKU_TABLE_OPTION_STORAGE_KEY, JSON.stringify(settings))
  }, [loadedOptions, settings])

  function updateOption(key: SkuTableOptionKey, value: boolean) {
    setSettings((current) => ({
      ...current,
      options: { ...current.options, [key]: value },
    }))
  }

  function setOrientation(orientation: SkuTableOrientation) {
    setSettings((current) => ({ ...current, orientation }))
  }

  function slideVendor(targetId: string) {
    if (!draggedVendorId) return
    const ids = orderedBids.map((bid) => bid.id)
    const nextOrder = reorderIds(ids, draggedVendorId, targetId)
    if (nextOrder === ids) return
    animateTableChange(() => {
      setSettings((current) => ({ ...current, vendorOrder: nextOrder }))
    })
  }

  function slideItem(targetId: string) {
    if (!draggedItemId) return
    const ids = orderedItems.map((item) => item.id)
    const nextOrder = reorderIds(ids, draggedItemId, targetId)
    if (nextOrder === ids) return
    animateTableChange(() => {
      setSettings((current) => ({ ...current, itemOrder: nextOrder }))
    })
  }

  function startRowHeaderResize(event: ReactMouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startWidth = rowHeaderWidth

    function handleMouseMove(moveEvent: MouseEvent) {
      const nextWidth = Math.min(Math.max(startWidth + moveEvent.clientX - startX, 240), 560)
      setSettings((current) => ({ ...current, rowHeaderWidth: nextWidth }))
    }

    function handleMouseUp() {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  function itemPrices(item: ContractorRFQ['line_items'][number]) {
    return orderedBids
      .map((bid) => {
        const resp = bid.line_item_responses.find((r) => r.line_item_id === item.id)
        const available = sourcedQuantity(resp, item.quantity)
        return resp && available >= item.quantity ? resp.total_price : null
      })
      .filter((price): price is number => price !== null)
  }

  function metricValue(bid: ContractorBid, item: ContractorRFQ['line_items'][number], metric: SkuMetric) {
    const resp = bid.line_item_responses.find((r) => r.line_item_id === item.id)
    if (!resp) return null

    switch (metric) {
      case 'total':
        return resp.total_price
      case 'unit':
        return resp.unit_price
      case 'lead':
        return resp.lead_time_days
    }
  }

  function compareNullableNumbers(left: number | null, right: number | null, direction: SortDirection) {
    if (left == null && right == null) return 0
    if (left == null) return 1
    if (right == null) return -1
    if (left === right) return 0
    return direction === 'asc' ? left - right : right - left
  }

  function sortRowsByMetric(axisId: string, metric: SkuMetric) {
    setMatrixSort((current) => {
      if (current?.axisId === axisId && current.metric === metric) {
        return { axisId, metric, direction: current.direction === 'asc' ? 'desc' : 'asc' }
      }
      return { axisId, metric, direction: 'asc' }
    })
  }

  function metricSortButton(axisId: string, metric: SkuMetric, label: string) {
    const active = matrixSort?.axisId === axisId && matrixSort.metric === metric
    const icon = active ? (matrixSort.direction === 'asc' ? '↑' : '↓') : ''

    return (
      <button
        type="button"
        onClick={() => sortRowsByMetric(axisId, metric)}
        className="inline-flex items-center justify-end gap-1 transition-colors"
        style={{ color: active ? '#1e3a2f' : '#8a9e96' }}
        title={`Sort rows by ${label.toLowerCase()}`}
      >
        <span>{label}</span>
        {icon && <span aria-hidden="true">{icon}</span>}
      </button>
    )
  }

  const displayedBids = matrixSort && settings.orientation === 'vendorsRows'
    ? [...orderedBids].sort((left, right) => {
      const item = orderedItems.find((entry) => entry.id === matrixSort.axisId)
      if (!item) return 0
      return compareNullableNumbers(metricValue(left, item, matrixSort.metric), metricValue(right, item, matrixSort.metric), matrixSort.direction)
    })
    : orderedBids

  const displayedItems = matrixSort && settings.orientation === 'itemsRows'
    ? [...orderedItems].sort((left, right) => {
      const bid = orderedBids.find((entry) => entry.id === matrixSort.axisId)
      if (!bid) return 0
      return compareNullableNumbers(metricValue(bid, left, matrixSort.metric), metricValue(bid, right, matrixSort.metric), matrixSort.direction)
    })
    : orderedItems

  function renderItemTitle(item: ContractorRFQ['line_items'][number], draggable: boolean) {
    const allAtRisk = orderedBids.length > 0 && orderedBids.every((bid) => {
      const resp = bid.line_item_responses.find((r) => r.line_item_id === item.id)
      return sourcedQuantity(resp, item.quantity) < item.quantity
    })

    return (
      <div
        draggable={draggable}
        onDragStart={() => draggable && setDraggedItemId(item.id)}
        onDragOver={(event) => {
          if (!draggable) return
          event.preventDefault()
          slideItem(item.id)
        }}
        onDrop={() => setDraggedItemId(null)}
        onDragEnd={() => setDraggedItemId(null)}
        className={draggable ? 'cursor-grab transition-all duration-200 ease-out active:cursor-grabbing' : undefined}
        title={draggable ? 'Drag to reorder' : undefined}
      >
        <p className="line-clamp-2 text-sm font-semibold normal-case tracking-normal" style={{ color: '#1e3a2f' }}>{item.description || item.sku || 'Unnamed item'}</p>
        <div className="mt-1 space-y-0.5 text-[11px] font-medium normal-case tracking-normal" style={{ color: '#8a9e96' }}>
          {options.itemSku && <p className="font-mono">{item.sku || 'No SKU'}</p>}
          {options.requestedQty && <p>{item.quantity.toLocaleString()} {item.unit}</p>}
          {allAtRisk && <p className="font-semibold" style={{ color: '#a85c2a' }}>Supply risk</p>}
        </div>
        {options.itemSpecs && item.specs && <p className="mt-1 line-clamp-2 text-[11px] leading-4 normal-case tracking-normal" style={{ color: '#8a9e96' }}>{item.specs}</p>}
      </div>
    )
  }

  function renderVendorTitle(bid: ContractorBid, draggable: boolean) {
    return (
      <div
        draggable={draggable}
        onDragStart={() => draggable && setDraggedVendorId(bid.id)}
        onDragOver={(event) => {
          if (!draggable) return
          event.preventDefault()
          slideVendor(bid.id)
        }}
        onDrop={() => setDraggedVendorId(null)}
        onDragEnd={() => setDraggedVendorId(null)}
        className={draggable ? 'cursor-grab transition-all duration-200 ease-out active:cursor-grabbing' : undefined}
        title={draggable ? 'Drag to reorder' : undefined}
      >
        {onVendorSelect ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onVendorSelect(bid)
            }}
            onMouseDown={(event) => event.stopPropagation()}
            className="block truncate text-left text-sm font-semibold underline-offset-2 hover:underline"
            style={{ color: '#1e3a2f' }}
          >
            {bid.vendor_name}
          </button>
        ) : (
          <p className="truncate text-sm font-semibold" style={{ color: '#1e3a2f' }}>{bid.vendor_name}</p>
        )}
        <p className="mt-1 text-xs font-semibold" style={{ color: '#4a6358' }}>{fmt(bid.total_price)} total · {bid.lead_time_days}d</p>
        <p className="mt-1 text-[11px] font-medium" style={{ color: '#8a9e96' }}>{sourceLabel(bid)}</p>
        {bid.fulfillment_summary?.partial && (
          <p className="mt-1 text-[11px] font-semibold" style={{ color: '#a85c2a' }}>
            Covers {bid.fulfillment_summary.quoted_quantity.toLocaleString()} / {bid.fulfillment_summary.requested_quantity.toLocaleString()}
          </p>
        )}
      </div>
    )
  }

  function renderMetricCells(bid: ContractorBid, item: ContractorRFQ['line_items'][number]) {
    const resp = bid.line_item_responses.find((r) => r.line_item_id === item.id)

    if (!resp) {
      return (
        <td key={`${bid.id}-${item.id}`} colSpan={3} className="px-4 py-4 align-top" style={{ borderBottom: '1px solid #e2d9cf', borderLeft: '1px solid #e2d9cf', background: '#ede8e2' }}>
          <div className="flex min-h-16 items-center justify-center rounded-xl text-xs font-medium" style={{ border: '2px dashed #e2d9cf', color: '#8a9e96' }}>
            No quote
          </div>
        </td>
      )
    }

    const prices = itemPrices(item)
    const lowestItemPrice = prices.length > 0 ? Math.min(...prices) : null
    const sourcedQty = sourcedQuantity(resp, item.quantity)
    const coversRequested = sourcedQty >= item.quantity
    const coverageRatio = Math.min((sourcedQty / Math.max(item.quantity, 1)) * 100, 100)
    const shortQty = Math.max(item.quantity - sourcedQty, 0)
    const isLowestForItem = coversRequested && lowestItemPrice !== null && resp.total_price === lowestItemPrice

    return (
      <Fragment key={`${bid.id}-${item.id}`}>
        <td className="px-3 py-3 text-right align-top" style={{ borderBottom: '1px solid #e2d9cf', borderLeft: '1px solid #e2d9cf', background: '#ffffff' }}>
          <p style={{ fontWeight: isLowestForItem ? 700 : 600, color: isLowestForItem ? '#1e3a2f' : '#4a6358' }}>{fmt(resp.total_price)}</p>
          <p className="mt-1 text-[11px] font-medium" style={{ color: '#8a9e96' }}>{AVAIL_LABELS[resp.availability]}</p>
          {options.sourceQuantity && (
            <p className="mt-2 text-[11px] font-semibold" style={{ color: '#8a9e96' }}>
              {sourcedQty.toLocaleString()} / {item.quantity.toLocaleString()}
            </p>
          )}
          {!coversRequested && (
            <p className="mt-1 text-[11px] font-semibold" style={{ color: '#a85c2a' }}>
              Short {shortQty.toLocaleString()} {item.unit}
            </p>
          )}
          {options.coverageBar && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: '#e2d9cf' }}>
              <div className="h-full rounded-full" style={{ width: `${coverageRatio}%`, background: '#1e3a2f' }} />
            </div>
          )}
        </td>
        <td className="px-3 py-3 text-right align-top" style={{ borderBottom: '1px solid #e2d9cf', borderLeft: '1px solid #e2d9cf', background: '#ffffff' }}>
          <p className="font-semibold" style={{ color: '#4a6358' }}>{fmt(resp.unit_price)}</p>
          <p className="mt-1 text-[11px]" style={{ color: '#8a9e96' }}>/{item.unit}</p>
          {options.substitutionNotes && resp.substitution_notes && (
            <p className="mt-2 line-clamp-2 text-[11px]" style={{ color: '#8a9e96' }}>{resp.substitution_notes}</p>
          )}
        </td>
        <td className="px-3 py-3 text-right align-top" style={{ borderBottom: '1px solid #e2d9cf', borderLeft: '1px solid #e2d9cf', background: '#ffffff' }}>
          <p className="font-semibold" style={{ color: '#4a6358' }}>{resp.lead_time_days}d</p>
        </td>
      </Fragment>
    )
  }

  return (
    <section
      className={expanded ? 'fixed inset-0 z-50 flex flex-col rounded-none border-0 shadow-2xl' : 'mb-6 mt-6 rounded-2xl overflow-hidden'}
      style={expanded
        ? { background: '#ffffff' }
        : { background: '#ffffff', border: '1px solid #e2d9cf', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
    >
      <div className="px-5 py-4" style={{ borderBottom: '1px solid #e2d9cf' }}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold" style={{ color: '#1e3a2f' }}>Item-by-Item Comparison</h3>
            <p className="mt-1 max-w-3xl text-xs" style={{ color: '#8a9e96' }}>
              {settings.orientation === 'vendorsRows'
                ? 'Vendors are listed as rows. Drag vendor rows or item headers to reorder.'
                : 'Items are listed as rows. Drag item rows or vendor headers to reorder.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full px-3 py-1 text-xs font-medium" style={{ background: '#ede8e2', color: '#8a9e96' }}>
              {rfq.line_items.length} item{rfq.line_items.length === 1 ? '' : 's'} · {bids.length} vendor{bids.length === 1 ? '' : 's'}
            </span>
            <button
              type="button"
              aria-expanded={customizing}
              onClick={() => setCustomizing((current) => !current)}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
              style={{ background: '#ffffff', border: '1px solid #e2d9cf', color: '#4a6358' }}
            >
              <Settings className="h-3.5 w-3.5" aria-hidden="true" />
              Customize table
            </button>
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded((current) => !current)}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
              style={{ background: '#ffffff', border: '1px solid #e2d9cf', color: '#4a6358' }}
            >
              {expanded ? 'Exit full screen' : 'Full screen'}
            </button>
          </div>
        </div>
        {customizing && (
          <div className="mt-4 rounded-xl p-3" style={{ background: '#ede8e2', border: '1px solid #e2d9cf' }}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#8a9e96' }}>SKU Table Detail Options</p>
              <button
                type="button"
                onClick={() => setCustomizing(false)}
                className="rounded-lg p-1 transition-colors"
                style={{ color: '#8a9e96' }}
                aria-label="Close SKU table customization"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="mb-3 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setOrientation('vendorsRows')}
                className="rounded-lg px-3 py-2 text-left text-xs font-semibold transition-colors"
                style={settings.orientation === 'vendorsRows'
                  ? { background: '#ffffff', border: '1px solid #1e3a2f', color: '#1e3a2f' }
                  : { background: '#ffffff', border: '1px solid #e2d9cf', color: '#4a6358' }}
              >
                Vendors as rows
              </button>
              <button
                type="button"
                onClick={() => setOrientation('itemsRows')}
                className="rounded-lg px-3 py-2 text-left text-xs font-semibold transition-colors"
                style={settings.orientation === 'itemsRows'
                  ? { background: '#ffffff', border: '1px solid #1e3a2f', color: '#1e3a2f' }
                  : { background: '#ffffff', border: '1px solid #e2d9cf', color: '#4a6358' }}
              >
                Items as rows
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {SKU_TABLE_OPTIONS.map((option) => (
                <label key={option.key} className="flex cursor-pointer gap-2 rounded-xl p-3" style={{ background: '#ffffff', border: '1px solid #e2d9cf' }}>
                  <input
                    type="checkbox"
                    checked={options[option.key]}
                    onChange={(event) => updateOption(option.key, event.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded"
                    style={{ accentColor: '#1e3a2f' }}
                  />
                  <span>
                    <span className="block text-xs font-semibold" style={{ color: '#1e3a2f' }}>{option.label}</span>
                    <span className="mt-0.5 block text-[11px] leading-4" style={{ color: '#8a9e96' }}>{option.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className={expanded ? 'relative flex-1 overflow-auto' : 'overflow-x-auto'}>
        <table
          className="w-full table-fixed border-separate border-spacing-0 text-sm"
          style={{ minWidth: `${Math.max(1120, rowHeaderWidth + columnCount * 330)}px` }}
        >
          <colgroup>
            <col style={{ width: rowHeaderWidth }} />
            {Array.from({ length: columnCount * 3 }).map((_, index) => (
              <col key={`metric-col-${index}`} style={{ width: 110 }} />
            ))}
          </colgroup>
          <thead>
            <tr className="text-xs font-semibold uppercase tracking-wide" style={{ background: '#ede8e2', color: '#8a9e96' }}>
              <th
                rowSpan={2}
                className="sticky left-0 top-0 z-30 px-5 py-3 text-left shadow-[8px_0_14px_-16px_rgba(15,23,42,0.5)] transition-[width] duration-150 ease-out"
                style={{ ...rowHeaderStyle, background: '#ede8e2', borderBottom: '1px solid #e2d9cf' }}
              >
                {settings.orientation === 'vendorsRows' ? 'Vendor' : 'Item'}
                <button
                  type="button"
                  aria-label="Resize first column"
                  onMouseDown={startRowHeaderResize}
                  className="absolute right-0 top-0 h-full w-3 cursor-col-resize hover:bg-black/5"
                  style={{ borderRight: '1px solid #c8bdb2' }}
                />
              </th>
              {settings.orientation === 'vendorsRows'
                ? orderedItems.map((item) => (
                  <th key={item.id} colSpan={3} className="sticky top-0 z-20 px-4 py-3 text-left align-top transition-all duration-200 ease-out" style={{ background: '#ede8e2', borderBottom: '1px solid #e2d9cf', borderLeft: '1px solid #e2d9cf' }}>
                    {renderItemTitle(item, true)}
                  </th>
                ))
                : orderedBids.map((bid) => (
                  <th key={bid.id} colSpan={3} className="sticky top-0 z-20 px-4 py-3 text-left align-top transition-all duration-200 ease-out" style={{ background: '#ede8e2', borderBottom: '1px solid #e2d9cf', borderLeft: '1px solid #e2d9cf' }}>
                    {renderVendorTitle(bid, true)}
                  </th>
                ))}
            </tr>
            <tr className="text-[11px] font-semibold uppercase tracking-wide" style={{ background: '#ede8e2', color: '#8a9e96' }}>
              {(settings.orientation === 'vendorsRows' ? orderedItems : orderedBids).map((entry) => (
                <Fragment key={`${entry.id}-subheads`}>
                  <th className="px-3 py-2 text-right" style={{ background: '#ede8e2', borderBottom: '1px solid #e2d9cf', borderLeft: '1px solid #e2d9cf' }}>
                    {metricSortButton(entry.id, 'total', 'Total')}
                  </th>
                  <th className="px-3 py-2 text-right" style={{ background: '#ede8e2', borderBottom: '1px solid #e2d9cf', borderLeft: '1px solid #e2d9cf' }}>
                    {metricSortButton(entry.id, 'unit', 'Unit')}
                  </th>
                  <th className="px-3 py-2 text-right" style={{ background: '#ede8e2', borderBottom: '1px solid #e2d9cf', borderLeft: '1px solid #e2d9cf' }}>
                    {metricSortButton(entry.id, 'lead', 'Lead')}
                  </th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {settings.orientation === 'vendorsRows'
              ? displayedBids.map((bid) => (
                <tr key={bid.id} className="group">
                  <th
                    className="sticky left-0 z-10 px-5 py-4 text-left align-top shadow-[8px_0_14px_-16px_rgba(15,23,42,0.5)] transition-[width,background-color] duration-150 ease-out"
                    style={{ ...rowHeaderStyle, background: '#ffffff', borderBottom: '1px solid #e2d9cf' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#ede8e2')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = '#ffffff')}
                  >
                    {renderVendorTitle(bid, true)}
                  </th>
                  {orderedItems.map((item) => renderMetricCells(bid, item))}
                </tr>
              ))
              : displayedItems.map((item) => (
                <tr key={item.id} className="group">
                  <th
                    className="sticky left-0 z-10 px-5 py-4 text-left align-top shadow-[8px_0_14px_-16px_rgba(15,23,42,0.5)] transition-[width,background-color] duration-150 ease-out"
                    style={{ ...rowHeaderStyle, background: '#ffffff', borderBottom: '1px solid #e2d9cf' }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#ede8e2')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = '#ffffff')}
                  >
                    {renderItemTitle(item, true)}
                  </th>
                  {orderedBids.map((bid) => renderMetricCells(bid, item))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
