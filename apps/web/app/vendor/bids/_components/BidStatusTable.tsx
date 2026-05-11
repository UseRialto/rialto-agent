'use client'

import { useState } from 'react'
import { formatCurrency, formatRelativeTime } from '@/lib/utils'
import type { SubmittedBid, SubmittedBidStatus } from '@/lib/types/vendor'

interface Props {
  bids: SubmittedBid[]
}

type FilterTab = 'all' | SubmittedBidStatus

const STATUS_STYLES: Record<SubmittedBidStatus, React.CSSProperties> = {
  pending: { background: '#ede8e2', color: '#4a6358' },
  under_review: { background: '#fff3eb', color: '#fa6b04' },
  shortlisted: { background: '#e8f4ee', color: '#2d6a4f' },
  rejected: { background: '#fdeaea', color: '#c0392b' },
}

const STATUS_LABELS: Record<SubmittedBidStatus, string> = {
  pending: 'Pending',
  under_review: 'Under Review',
  shortlisted: '✓ Shortlisted',
  rejected: 'Rejected',
}

const TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'under_review', label: 'Under Review' },
  { key: 'shortlisted', label: 'Shortlisted' },
  { key: 'rejected', label: 'Rejected' },
]

export function BidStatusTable({ bids }: Props) {
  const [activeTab, setActiveTab] = useState<FilterTab>('all')

  const filtered = activeTab === 'all' ? bids : bids.filter((b) => b.status === activeTab)

  return (
    <div>
      {/* Filter tabs */}
      <div
        className="mb-4 flex gap-1 rounded-lg p-1 w-fit"
        style={{ background: '#ede8e2', border: '1px solid #e2d9cf' }}
      >
        {TABS.map((tab) => {
          const count = tab.key === 'all' ? bids.length : bids.filter((b) => b.status === tab.key).length
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
              style={
                isActive
                  ? { background: '#ffffff', color: '#1e3a2f', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }
                  : { color: '#4a6358' }
              }
            >
              {tab.label}
              {count > 0 && (
                <span
                  className="ml-1.5 rounded-full px-1.5 py-0.5 text-xs"
                  style={isActive ? { background: '#ede8e2', color: '#4a6358' } : { color: '#8a9e96' }}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {filtered.length === 0 ? (
        <div
          className="rounded-xl p-10 text-center"
          style={{ background: '#ffffff', border: '1px dashed #e2d9cf' }}
        >
          <p className="text-sm" style={{ color: '#8a9e96' }}>No quotes in this category.</p>
        </div>
      ) : (
        <div
          className="overflow-hidden rounded-xl shadow-sm"
          style={{ background: '#ffffff', border: '1px solid #e2d9cf' }}
        >
          <table className="w-full text-left">
            <thead style={{ borderBottom: '1px solid #e2d9cf', background: '#ede8e2' }}>
              <tr>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#4a6358' }}>Project / RFQ</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#4a6358' }}>Contractor</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#4a6358' }}>Submitted</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#4a6358' }}>Total Value</th>
                <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#4a6358' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((bid) => (
                <tr
                  key={bid.id}
                  style={{
                    borderBottom: '1px solid #ede8e2',
                    background: bid.status === 'shortlisted' ? '#e8f4ee' : '#ffffff',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#ede8e2')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = bid.status === 'shortlisted' ? '#e8f4ee' : '#ffffff')}
                >
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium" style={{ color: '#1e3a2f' }}>{bid.rfq_title}</p>
                    <p className="text-xs" style={{ color: '#8a9e96' }}>{bid.project_name}</p>
                  </td>
                  <td className="px-4 py-3 text-sm" style={{ color: '#4a6358' }}>{bid.contractor_name}</td>
                  <td className="px-4 py-3 text-xs" style={{ color: '#4a6358' }}>
                    {formatRelativeTime(bid.submitted_at)}
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold" style={{ color: '#1e3a2f' }}>
                    {formatCurrency(bid.total_price)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-0.5">
                      <span
                        className="w-fit rounded px-2 py-0.5 text-xs font-medium"
                        style={STATUS_STYLES[bid.status]}
                      >
                        {STATUS_LABELS[bid.status]}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
