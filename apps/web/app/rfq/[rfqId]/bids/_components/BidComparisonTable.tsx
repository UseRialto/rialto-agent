'use client'

import { useState, useCallback } from 'react'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
  type Row,
} from '@tanstack/react-table'
import { RiskBadge } from '@/components/shared/RiskBadge'
import { ReliabilityScore } from '@/components/shared/ReliabilityScore'
import { SupplierOriginBadge } from '@/components/shared/SupplierOriginBadge'
import { CertList } from '@/components/shared/CertBadge'
import { formatCurrency, formatRelativeTime, cn } from '@/lib/utils'
import type { Bid } from '@/lib/types/bid'
import { AwardModal } from './AwardModal'

const col = createColumnHelper<Bid>()

interface Props {
  bids: Bid[]
  rfqId: string
}

export function BidComparisonTable({ bids, rfqId }: Props) {
  const [sorting, setSorting] = useState<SortingState>([
    // AI recommended first, then reliability desc
    { id: 'is_ai_recommended', desc: true },
  ])
  const [awardBid, setAwardBid] = useState<Bid | null>(null)
  const [awarded, setAwarded] = useState<string | null>(null)

  const handleAward = useCallback((bid: Bid) => setAwardBid(bid), [])
  const handleConfirmAward = useCallback((bidId: string) => {
    setAwarded(bidId)
    setAwardBid(null)
  }, [])

  const columns = [
    col.accessor('supplier.name', {
      header: 'Supplier',
      cell: ({ row }) => (
        <div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-medium text-gray-900">{row.original.supplier.name}</span>
            {row.original.is_ai_recommended && (
              <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs font-semibold text-blue-700">
                ✦ Recommended
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <SupplierOriginBadge
              country={row.original.supplier.hq_country}
              isDomestic={row.original.supplier.is_domestic}
            />
            <span className="text-xs text-gray-400">
              {row.original.supplier.hq_city}
            </span>
          </div>
        </div>
      ),
    }),
    col.accessor('total_price', {
      header: 'Total Price',
      cell: ({ getValue }) => (
        <span className="text-sm font-semibold text-gray-900">
          {formatCurrency(getValue())}
        </span>
      ),
    }),
    col.accessor('unit_price', {
      header: 'Unit Price',
      cell: ({ getValue, row }) => (
        <span className="text-sm text-gray-700">
          {formatCurrency(getValue())}/{row.original.supplier.origin_region.split(' ')[0]}
        </span>
      ),
    }),
    col.accessor('lead_time_days', {
      header: 'Lead Time',
      cell: ({ getValue }) => (
        <span className="text-sm text-gray-700">{getValue()} days</span>
      ),
    }),
    col.accessor('supplier.origin_region', {
      header: 'Origin',
      cell: ({ getValue }) => (
        <span className="text-xs text-gray-600">{getValue()}</span>
      ),
    }),
    col.accessor('supplier.reliability_score', {
      header: 'Reliability',
      cell: ({ getValue }) => <ReliabilityScore score={getValue()} />,
    }),
    col.accessor('supplier.risk_level', {
      header: 'Risk',
      cell: ({ getValue, row }) => (
        <div>
          <RiskBadge level={getValue()} />
          {row.original.supplier.risk_notes && (
            <p className="mt-1 text-xs text-gray-500 max-w-[160px] line-clamp-2">
              {row.original.supplier.risk_notes}
            </p>
          )}
        </div>
      ),
    }),
    col.accessor('certifications', {
      header: 'Certifications',
      enableSorting: false,
      cell: ({ getValue }) => <CertList certs={getValue()} max={2} />,
    }),
    col.accessor('is_ai_recommended', {
      header: '',
      id: 'is_ai_recommended',
      enableSorting: true,
      cell: ({ row }) => {
        const bidId = row.original.id
        const isAwarded = awarded === bidId

        return (
          <button
            onClick={() => !isAwarded && handleAward(row.original)}
            disabled={!!awarded}
            className={cn(
              'rounded px-3 py-1.5 text-xs font-medium transition-colors',
              isAwarded
                ? 'bg-green-600 text-white cursor-default'
                : awarded
                  ? 'border border-gray-200 bg-gray-50 text-gray-300 cursor-not-allowed'
                  : 'bg-gray-900 text-white hover:bg-gray-700',
            )}
          >
            {isAwarded ? '✓ Awarded' : 'Award'}
          </button>
        )
      },
    }),
  ]

  const table = useReactTable({
    data: bids,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  function rowClass(row: Row<Bid>): string {
    return cn(
      'border-b border-gray-100 hover:bg-gray-50',
      row.original.is_ai_recommended && 'border-l-4 border-l-blue-500 bg-blue-50/30',
      awarded === row.original.id && 'bg-green-50',
    )
  }

  return (
    <>
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-gray-200 bg-gray-50">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((header) => (
                    <th
                      key={header.id}
                      onClick={header.column.getToggleSortingHandler()}
                      className={cn(
                        'px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500',
                        header.column.getCanSort() && 'cursor-pointer select-none hover:text-gray-700',
                      )}
                    >
                      <div className="flex items-center gap-1">
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() === 'asc' && ' ↑'}
                        {header.column.getIsSorted() === 'desc' && ' ↓'}
                      </div>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} className={rowClass(row)}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3 align-top">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Table footer */}
        <div className="border-t border-gray-100 bg-gray-50 px-4 py-2.5">
          <p className="text-xs text-gray-400">
            ✦ Recommended = AI-selected best value quote balancing price, lead time, reliability, and risk ·
            Click column headers to sort
          </p>
        </div>
      </div>

      {awardBid && (
        <AwardModal
          bid={awardBid}
          onConfirm={handleConfirmAward}
          onCancel={() => setAwardBid(null)}
        />
      )}
    </>
  )
}
