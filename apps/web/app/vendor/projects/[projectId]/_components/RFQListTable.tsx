'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatDate } from '@/lib/utils'
import { RFQStatusBadge } from './RFQStatusBadge'
import type { VendorResponseStatus } from '@/lib/types/vendor'

export interface RFQTableRow {
  id: string
  title: string
  category: string
  request_type?: 'rfq' | 'rfp'
  line_items: Array<unknown>
  delivery_date: string
  vendor_response_status: VendorResponseStatus
  // Optional: shown as an "Invited" badge next to the title
  is_invited?: boolean
  anonymous_public_listing?: boolean
  public_summary?: string
}

interface Props {
  rfqs: RFQTableRow[]
  projectId: string
  draftCount: number
  // Hide checkboxes and bulk-select flow (for projects where bulk-respond isn't available)
  disableBulkSelect?: boolean
}

export function RFQListTable({ rfqs, projectId, draftCount, disableBulkSelect }: Props) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (selected.size === rfqs.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(rfqs.map((r) => r.id)))
    }
  }

  function openSelected() {
    const ids = Array.from(selected).join(',')
    router.push(`/vendor/projects/${projectId}/rfqs/respond?ids=${ids}`)
  }

  const respondedCount = rfqs.filter(
    (r) => r.vendor_response_status === 'draft' || r.vendor_response_status === 'submitted',
  ).length

  function respondHref(rfqId: string): string {
    return `/vendor/rfqs/${rfqId}`
  }

  return (
    <div>
      {/* Progress */}
      <div
        className="mb-4 rounded-xl p-4 shadow-sm"
        style={{ background: '#ffffff', border: '1px solid #e2d9cf' }}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm" style={{ color: '#4a6358' }}>
              You&apos;ve responded to{' '}
              <span className="font-semibold" style={{ color: '#1e3a2f' }}>{respondedCount}</span> of{' '}
              <span className="font-semibold" style={{ color: '#1e3a2f' }}>{rfqs.length}</span> relevant RFQs
            </p>
          </div>
          <span className="text-xs" style={{ color: '#8a9e96' }}>{rfqs.length} relevant out of project total</span>
        </div>
        <div className="mt-2 h-1.5 w-full rounded-full" style={{ background: '#ede8e2' }}>
          <div
            className="h-1.5 rounded-full transition-all"
            style={{
              width: rfqs.length ? `${(respondedCount / rfqs.length) * 100}%` : '0%',
              background: '#2d6a4f',
            }}
          />
        </div>
      </div>

      {/* Bulk select action bar */}
      {!disableBulkSelect && selected.size > 0 && (
        <div
          className="mb-3 flex items-center gap-3 rounded-xl px-4 py-2.5"
          style={{ background: '#fff3eb', border: '1px solid #fdc89a' }}
        >
          <span className="text-sm font-medium" style={{ color: '#fa6b04' }}>
            {selected.size} RFQ{selected.size > 1 ? 's' : ''} selected
          </span>
          <button
            onClick={openSelected}
            className="ml-auto rounded-md px-3 py-1.5 text-xs font-semibold text-white"
            style={{ background: '#fa6b04' }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = '#a85c2a')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = '#fa6b04')}
          >
            Open Selected ({selected.size}) →
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-xs"
            style={{ color: '#fa6b04' }}
          >
            Clear
          </button>
        </div>
      )}

      {/* Table */}
      <div
        className="overflow-hidden rounded-xl shadow-sm"
        style={{ background: '#ffffff', border: '1px solid #e2d9cf' }}
      >
        <table className="w-full text-left">
          <thead style={{ borderBottom: '1px solid #e2d9cf', background: '#ede8e2' }}>
            <tr>
              {!disableBulkSelect && (
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selected.size === rfqs.length && rfqs.length > 0}
                    onChange={toggleAll}
                    className="rounded"
                    style={{ borderColor: '#e2d9cf' }}
                  />
                </th>
              )}
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#4a6358' }}>
                RFQ
              </th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#4a6358' }}>
                SKUs
              </th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#4a6358' }}>
                Delivery Date
              </th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#4a6358' }}>
                Status
              </th>
              <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#4a6358' }} />
            </tr>
          </thead>
          <tbody>
            {rfqs.map((rfq) => {
              const isSelected = !disableBulkSelect && selected.has(rfq.id)
              return (
                <tr
                  key={rfq.id}
                  style={{
                    borderBottom: '1px solid #ede8e2',
                    opacity: rfq.vendor_response_status === 'submitted' ? 0.6 : 1,
                    borderLeft: rfq.is_invited ? '4px solid #fa6b04' : undefined,
                    background: isSelected ? '#fff3eb' : '#ffffff',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#ede8e2')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = isSelected ? '#fff3eb' : '#ffffff')}
                >
                  {!disableBulkSelect && (
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(rfq.id)}
                        onChange={() => toggleSelect(rfq.id)}
                        disabled={rfq.vendor_response_status === 'submitted'}
                        className="rounded"
                        style={{ borderColor: '#e2d9cf' }}
                      />
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium" style={{ color: '#1e3a2f' }}>{rfq.title}</p>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      {rfq.request_type && (
                        <span
                          className="rounded-full px-2 py-0.5 text-xs font-semibold text-white"
                          style={{ background: '#1e3a2f' }}
                        >
                          {rfq.request_type.toUpperCase()}
                        </span>
                      )}
                      {rfq.is_invited && (
                        <span
                          className="rounded-full px-2 py-0.5 text-xs font-semibold"
                          style={{ background: '#fdf0e8', color: '#a85c2a' }}
                        >
                          Invited
                        </span>
                      )}
                      {rfq.anonymous_public_listing && (
                        <span
                          className="rounded-full px-2 py-0.5 text-xs font-semibold"
                          style={{ background: '#fdf0e8', color: '#a85c2a' }}
                        >
                          Anonymous
                        </span>
                      )}
                      {rfq.category && (
                        <span
                          className="inline-block rounded px-1.5 py-0.5 text-xs capitalize"
                          style={{ background: '#ede8e2', color: '#4a6358' }}
                        >
                          {rfq.category}
                        </span>
                      )}
                    </div>
                    {rfq.public_summary && (
                      <p className="mt-1 text-xs" style={{ color: '#8a9e96' }}>{rfq.public_summary}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm" style={{ color: '#4a6358' }}>
                    {rfq.line_items.length} SKU{rfq.line_items.length !== 1 ? 's' : ''}
                  </td>
                  <td className="px-4 py-3 text-sm" style={{ color: '#4a6358' }}>
                    {rfq.delivery_date ? formatDate(rfq.delivery_date) : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <RFQStatusBadge status={rfq.vendor_response_status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    {rfq.vendor_response_status !== 'submitted' && (
                      <Link
                        href={respondHref(rfq.id)}
                        className="text-xs font-medium"
                        style={{ color: '#fa6b04' }}
                      >
                        {rfq.vendor_response_status === 'draft' ? 'Continue →' : 'Respond →'}
                      </Link>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Review & Submit footer - only for fixture project flow */}
      {!disableBulkSelect && draftCount > 0 && (
        <div
          className="mt-4 flex items-center justify-between rounded-xl px-5 py-3.5"
          style={{ background: '#e8f4ee', border: '1px solid #a8d5ba' }}
        >
          <div>
            <p className="text-sm font-semibold" style={{ color: '#2d6a4f' }}>
              {draftCount} quote{draftCount > 1 ? 's' : ''} ready to submit
            </p>
            <p className="text-xs" style={{ color: '#2d6a4f' }}>Review your responses before sending to the contractor.</p>
          </div>
          <Link
            href={`/vendor/projects/${projectId}/review`}
            className="rounded-md px-4 py-2 text-sm font-semibold text-white"
            style={{ background: '#2d6a4f' }}
          >
            Review & Submit Quotes ({draftCount}) →
          </Link>
        </div>
      )}
    </div>
  )
}
