'use client'

import { Fragment, useEffect, useState } from 'react'
import type { ContractorBid } from '@/lib/types/contractor'

type SortKey =
  | 'vendor'
  | 'designer_name'
  | 'total_price'
  | 'lead_time_days'
  | 'coverage'
  | 'spec_compliance'
  | 'payment_terms'
  | 'deposit_terms'
  | 'credit_terms'
  | 'shipping_terms'
  | 'source'
  | 'decision'

type SortDirection = 'asc' | 'desc'

interface Props {
  bids: ContractorBid[]
  onVendorSelect?: (bid: ContractorBid) => void
}

interface SortState {
  key: SortKey
  direction: SortDirection
}

const SUMMARY_COLUMNS: Array<{ key: SortKey; label: string; align?: 'left' | 'right'; defaultVisible: boolean }> = [
  { key: 'vendor', label: 'Vendor', defaultVisible: true },
  { key: 'designer_name', label: 'Designer', defaultVisible: true },
  { key: 'total_price', label: 'Total Price', align: 'right', defaultVisible: true },
  { key: 'lead_time_days', label: 'Lead Time', align: 'right', defaultVisible: true },
  { key: 'coverage', label: 'Coverage', defaultVisible: true },
  { key: 'spec_compliance', label: 'Spec Compliance', defaultVisible: true },
  { key: 'payment_terms', label: 'Payment Terms', defaultVisible: true },
  { key: 'deposit_terms', label: 'Deposit', defaultVisible: false },
  { key: 'credit_terms', label: 'Credit', defaultVisible: false },
  { key: 'shipping_terms', label: 'Shipping', defaultVisible: false },
  { key: 'source', label: 'Quote Type', defaultVisible: false },
  { key: 'decision', label: 'Decision', defaultVisible: false },
]

const DEFAULT_COLUMN_ORDER = SUMMARY_COLUMNS.map((column) => column.key)
const DEFAULT_VISIBLE_COLUMNS = Object.fromEntries(
  SUMMARY_COLUMNS.map((column) => [column.key, column.defaultVisible]),
) as Record<SortKey, boolean>
const SUMMARY_COLUMN_STORAGE_KEY = 'rialto.bidComparison.summaryColumns.v2'

const DECISION_RANK: Record<string, number> = {
  preferred: 0,
  alternate: 1,
  hold: 2,
  do_not_use: 3,
}

function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString()}`
}

function getCoverageRatio(bid: ContractorBid): number {
  return bid.fulfillment_summary?.coverage_ratio ?? 1
}

function hasFullCoverage(bid: ContractorBid): boolean {
  return !bid.fulfillment_summary?.partial && getCoverageRatio(bid) >= 1 && getUnavailableCount(bid) === 0
}

function getUnavailableCount(bid: ContractorBid): number {
  return bid.line_item_responses.filter((item) => item.availability === 'unavailable').length
}

function getCoverageLabel(bid: ContractorBid): string {
  const ratio = getCoverageRatio(bid)
  const unavailableCount = getUnavailableCount(bid)

  if (ratio >= 1 && unavailableCount === 0) return '100% covered'
  if (unavailableCount > 0) {
    return `${Math.round(ratio * 100)}% · ${unavailableCount} unavailable`
  }
  return `${Math.round(ratio * 100)}% covered`
}

function getSourceLabel(bid: ContractorBid): string {
  if (bid.source === 'email') return 'Email'
  if (bid.source === 'magic_form') return 'Magic Form'
  if (bid.is_invited) return 'Invited'
  return 'Marketplace'
}

function getDecisionLabel(bid: ContractorBid): string {
  if (!bid.buyer_decision_status) return '-'
  return bid.buyer_decision_status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function getSpecComplianceLabel(bid: ContractorBid): string {
  const status = bid.spec_compliance_report?.summary_status
  if (!status) return 'Pending'
  if (status === 'no_specs_available') return 'No specs'
  if (status === 'no_spec_found') return 'No spec found'
  if (status === 'not_quoted') return 'Not quoted'
  if (status === 'needs_review') return 'Needs review'
  if (status === 'violation') return 'Violation'
  if (status === 'failed') return 'Failed'
  return 'Compliant'
}

function getSpecComplianceRank(bid: ContractorBid): number {
  const status = bid.spec_compliance_report?.summary_status
  if (status === 'violation') return 0
  if (status === 'needs_review') return 1
  if (!status || status === 'failed') return 2
  if (status === 'no_spec_found') return 3
  if (status === 'not_quoted') return 4
  if (status === 'no_specs_available') return 5
  return 6
}

function SpecComplianceCell({ bid }: { bid: ContractorBid }) {
  const status = bid.spec_compliance_report?.summary_status
  const style =
    status === 'violation'
      ? { background: '#fdeaea', color: '#c0392b', border: '#f5c6c6' }
      : status === 'needs_review' || !status || status === 'failed'
        ? { background: '#fdf0e8', color: '#a85c2a', border: '#e8c4a0' }
        : status === 'compliant'
          ? { background: '#e8f4ee', color: '#2d6a4f', border: '#a8d5ba' }
          : { background: '#ede8e2', color: '#4a6358', border: '#e2d9cf' }

  return (
    <td className="px-4 py-3">
      <span className="inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold" style={style}>
        {getSpecComplianceLabel(bid)}
      </span>
      {bid.spec_compliance_report?.high_severity_count ? (
        <p className="mt-1 text-[11px] font-medium" style={{ color: '#c0392b' }}>
          {bid.spec_compliance_report.high_severity_count} high severity
        </p>
      ) : null}
    </td>
  )
}

function getSortValue(bid: ContractorBid, key: SortKey): number | string {
  switch (key) {
    case 'vendor':
      return bid.vendor_name.toLowerCase()
    case 'total_price':
      return hasFullCoverage(bid) ? bid.total_price : Number.MAX_SAFE_INTEGER
    case 'designer_name':
      return (bid.designer_name ?? '').toLowerCase()
    case 'lead_time_days':
      return bid.lead_time_days
    case 'coverage':
      return getCoverageRatio(bid)
    case 'spec_compliance':
      return getSpecComplianceRank(bid)
    case 'payment_terms':
      return (bid.terms?.payment_terms ?? '').toLowerCase()
    case 'deposit_terms':
      return (bid.terms?.deposit_terms ?? '').toLowerCase()
    case 'credit_terms':
      return (bid.terms?.credit_terms ?? '').toLowerCase()
    case 'shipping_terms':
      return (bid.terms?.shipping_terms ?? '').toLowerCase()
    case 'source':
      return getSourceLabel(bid).toLowerCase()
    case 'decision':
      return bid.buyer_decision_status ? DECISION_RANK[bid.buyer_decision_status] ?? 99 : 99
  }
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

function SortHeader({
  label,
  sortKey,
  activeSort,
  onToggle,
  onDragStart,
  onDragOver,
  onDragEnd,
  isDragging,
  className = '',
}: {
  label: string
  sortKey: SortKey
  activeSort: SortState
  onToggle: (sortKey: SortKey) => void
  onDragStart: (sortKey: SortKey) => void
  onDragOver: (sortKey: SortKey) => void
  onDragEnd: () => void
  isDragging: boolean
  className?: string
}) {
  const isActive = activeSort.key === sortKey
  const icon = !isActive ? '↕' : activeSort.direction === 'asc' ? '↑' : '↓'

  return (
    <th
      className={`${className} cursor-grab select-none transition-all duration-200 ease-out ${isDragging ? 'opacity-50' : ''}`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move'
        onDragStart(sortKey)
      }}
      onDragOver={(event) => {
        event.preventDefault()
        onDragOver(sortKey)
      }}
      onDragEnd={onDragEnd}
      title="Drag to reorder. Click to sort."
    >
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        className="inline-flex items-center gap-1 transition-colors"
        style={{ color: isActive ? '#1e3a2f' : '#8a9e96' }}
      >
        <span>{label}</span>
        <span aria-hidden="true">{icon}</span>
      </button>
    </th>
  )
}

export function BidVendorSummaryTable({ bids, onVendorSelect }: Props) {
  const [sort, setSort] = useState<SortState>({ key: 'total_price', direction: 'asc' })
  const [columnOrder, setColumnOrder] = useState<SortKey[]>(DEFAULT_COLUMN_ORDER)
  const [visibleColumns, setVisibleColumns] = useState<Record<SortKey, boolean>>(DEFAULT_VISIBLE_COLUMNS)
  const [loadedColumns, setLoadedColumns] = useState(false)
  const [draggingColumn, setDraggingColumn] = useState<SortKey | null>(null)

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(SUMMARY_COLUMN_STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as { order?: SortKey[]; visible?: Partial<Record<SortKey, boolean>> }
        const validOrder = parsed.order?.filter((key): key is SortKey => DEFAULT_COLUMN_ORDER.includes(key)) ?? []
        const missing = DEFAULT_COLUMN_ORDER.filter((key) => !validOrder.includes(key))
        setColumnOrder([...validOrder, ...missing])
        setVisibleColumns({ ...DEFAULT_VISIBLE_COLUMNS, ...parsed.visible })
      }
    } catch {
      setColumnOrder(DEFAULT_COLUMN_ORDER)
      setVisibleColumns(DEFAULT_VISIBLE_COLUMNS)
    } finally {
      setLoadedColumns(true)
    }
  }, [])

  useEffect(() => {
    if (!loadedColumns) return
    window.localStorage.setItem(SUMMARY_COLUMN_STORAGE_KEY, JSON.stringify({ order: columnOrder, visible: visibleColumns }))
  }, [columnOrder, loadedColumns, visibleColumns])

  const sortedBids = bids
    .map((bid, index) => ({ bid, index }))
    .sort((a, b) => {
      const left = getSortValue(a.bid, sort.key)
      const right = getSortValue(b.bid, sort.key)

      if (left < right) return sort.direction === 'asc' ? -1 : 1
      if (left > right) return sort.direction === 'asc' ? 1 : -1
      return a.index - b.index
    })
    .map(({ bid }) => bid)

  function toggleSort(sortKey: SortKey) {
    setSort((prev) =>
      prev.key === sortKey
        ? { key: sortKey, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key: sortKey, direction: sortKey === 'coverage' ? 'desc' : 'asc' },
    )
  }

  function slideColumnBefore(targetKey: SortKey) {
    if (!draggingColumn || draggingColumn === targetKey) return
    animateTableChange(() => {
      setColumnOrder((current) => {
        const fromIndex = current.indexOf(draggingColumn)
        const toIndex = current.indexOf(targetKey)
        if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return current
        const next = [...current]
        const [moved] = next.splice(fromIndex, 1)
        next.splice(toIndex, 0, moved)
        return next
      })
    })
  }

  function renderCell(bid: ContractorBid, column: SortKey) {
    switch (column) {
      case 'vendor':
        return (
          <td className="px-4 py-3">
            <div className="flex flex-col gap-1">
              {onVendorSelect ? (
                <button
                  type="button"
                  onClick={() => onVendorSelect(bid)}
                  className="text-left font-semibold underline-offset-2 hover:underline"
                  style={{ color: '#1e3a2f' }}
                >
                  {bid.vendor_name}
                </button>
              ) : (
                <span className="font-semibold" style={{ color: '#1e3a2f' }}>{bid.vendor_name}</span>
              )}
              <div className="flex flex-wrap gap-1.5">
                {bid.is_on_platform && (
                  <span className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: '#e8f4ee', color: '#2d6a4f' }}>
                    Live
                  </span>
                )}
                {bid.fulfillment_summary?.partial && (
                  <span className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: '#fdf0e8', color: '#a85c2a' }}>
                    Partial
                  </span>
                )}
              </div>
            </div>
          </td>
        )
      case 'total_price':
        return (
          <td className="px-4 py-3 text-right">
            <p className="font-semibold" style={{ color: '#1e3a2f' }}>{formatCurrency(bid.total_price)}</p>
            {!hasFullCoverage(bid) && (
              <p className="text-[11px] font-medium" style={{ color: '#a85c2a' }}>Partial, not lowest-eligible</p>
            )}
          </td>
        )
      case 'designer_name':
        return <td className="px-4 py-3" style={{ color: '#4a6358' }}>{bid.designer_name ?? '-'}</td>
      case 'lead_time_days':
        return <td className="px-4 py-3 text-right" style={{ color: '#4a6358' }}>{bid.lead_time_days} days</td>
      case 'coverage':
        return <td className="px-4 py-3" style={{ color: '#4a6358' }}>{getCoverageLabel(bid)}</td>
      case 'spec_compliance':
        return <SpecComplianceCell bid={bid} />
      case 'payment_terms':
        return <td className="px-4 py-3" style={{ color: '#4a6358' }}>{bid.terms?.payment_terms ?? '-'}</td>
      case 'deposit_terms':
        return <td className="px-4 py-3" style={{ color: '#4a6358' }}>{bid.terms?.deposit_terms ?? '-'}</td>
      case 'credit_terms':
        return <td className="px-4 py-3" style={{ color: '#4a6358' }}>{bid.terms?.credit_terms ?? '-'}</td>
      case 'shipping_terms':
        return <td className="px-4 py-3" style={{ color: '#4a6358' }}>{bid.terms?.shipping_terms ?? '-'}</td>
      case 'source':
        return <td className="px-4 py-3" style={{ color: '#4a6358' }}>{getSourceLabel(bid)}</td>
      case 'decision':
        return (
          <td className="px-4 py-3">
            {bid.buyer_decision_status ? (
              <span className="rounded-full px-2.5 py-1 text-xs font-semibold text-white" style={{ background: '#1e3a2f' }}>
                {getDecisionLabel(bid)}
              </span>
            ) : (
              <span style={{ color: '#e2d9cf' }}>-</span>
            )}
          </td>
        )
    }
  }

  const activeColumns = columnOrder.filter((key) => visibleColumns[key])
  const renderedColumns = activeColumns.length > 0 ? activeColumns : (['vendor'] as SortKey[])

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: '#ffffff', border: '1px solid #e2d9cf', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <div className="px-5 py-3" style={{ borderBottom: '1px solid #e2d9cf' }}>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold" style={{ color: '#1e3a2f' }}>Vendor Summary</h3>
            <p className="text-xs" style={{ color: '#8a9e96' }}>Click a column to sort. Drag a column header to move it.</p>
          </div>
          <p className="text-xs" style={{ color: '#8a9e96' }}>
            Sorting by <span className="font-medium" style={{ color: '#4a6358' }}>{sort.key.replace(/_/g, ' ')}</span>
          </p>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl px-3 py-2" style={{ background: '#ede8e2', border: '1px solid #e2d9cf' }}>
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#8a9e96' }}>Show</span>
          {SUMMARY_COLUMNS.filter((column) => column.key !== 'vendor').map((column) => (
            <label key={column.key} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium" style={{ background: '#ffffff', color: '#4a6358', border: '1px solid #e2d9cf' }}>
              <input
                type="checkbox"
                checked={visibleColumns[column.key]}
                onChange={(event) => setVisibleColumns((current) => ({ ...current, [column.key]: event.target.checked }))}
                className="h-3.5 w-3.5 rounded"
                style={{ accentColor: '#1e3a2f' }}
              />
              {column.label}
            </label>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[920px] w-full text-sm">
          <thead className="text-[10px] font-semibold uppercase tracking-wider" style={{ background: '#ede8e2', color: '#8a9e96' }}>
            <tr>
              {renderedColumns.map((key) => {
                const column = SUMMARY_COLUMNS.find((entry) => entry.key === key)
                if (!column) return null
                return (
                  <SortHeader
                    key={key}
                    label={column.label}
                    sortKey={key}
                    activeSort={sort}
                    onToggle={toggleSort}
                    onDragStart={setDraggingColumn}
                    onDragOver={slideColumnBefore}
                    onDragEnd={() => setDraggingColumn(null)}
                    isDragging={draggingColumn === key}
                    className={`px-4 py-2.5 ${column.align === 'right' ? 'text-right' : 'text-left'}`}
                  />
                )
              })}
            </tr>
          </thead>
          <tbody style={{ borderTop: '1px solid #e2d9cf' }}>
            {sortedBids.map((bid) => (
              <tr key={bid.id} className="transition-colors duration-150" style={{ borderBottom: '1px solid #e2d9cf' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#ede8e2')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '')}
              >
                {renderedColumns.map((key) => <Fragment key={key}>{renderCell(bid, key)}</Fragment>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
