'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { formatCurrency, formatRelativeTime } from '@/lib/utils'
import type { SubmittedBid, SubmittedBidStatus } from '@/lib/types/vendor'

interface Props {
  bids: SubmittedBid[]
}

type FilterTab = 'all' | SubmittedBidStatus

const TABS: { value: FilterTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'awarded', label: 'Awarded' },
  { value: 'rejected', label: 'Rejected' },
]

const STATUS_STYLES: Record<SubmittedBidStatus, React.CSSProperties> = {
  pending: { background: '#ede8e2', color: '#4a6358' },
  under_review: { background: '#fff3eb', color: '#fa6b04' },
  awarded: { background: '#e8f4ee', color: '#2d6a4f' },
  rejected: { background: '#fdeaea', color: '#c0392b' },
}

const STATUS_LABELS: Record<SubmittedBidStatus, string> = {
  pending: 'Pending',
  under_review: 'Under Review',
  awarded: 'Awarded',
  rejected: 'Rejected',
}

export function BidsByProject({ bids }: Props) {
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all')
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(
    () => new Set(['all']), // expand all project groups initially
  )

  const filtered = useMemo(
    () => (activeFilter === 'all' ? bids : bids.filter((b) => b.status === activeFilter)),
    [bids, activeFilter],
  )

  const grouped = useMemo(() => {
    const map = new Map<string, { projectName: string; bids: SubmittedBid[] }>()
    for (const bid of filtered) {
      if (!map.has(bid.project_id)) {
        map.set(bid.project_id, { projectName: bid.project_name, bids: [] })
      }
      map.get(bid.project_id)!.bids.push(bid)
    }
    return Array.from(map.entries()).map(([projectId, data]) => ({ projectId, ...data }))
  }, [filtered])

  function toggleProject(projectId: string) {
    setExpandedProjects((prev) => {
      const next = new Set(prev)
      if (next.has(projectId)) {
        next.delete(projectId)
      } else {
        next.add(projectId)
      }
      return next
    })
  }

  if (bids.length === 0) {
    return (
      <div
        className="rounded-xl p-10 text-center"
        style={{ background: '#ffffff', border: '1px dashed #e2d9cf' }}
      >
        <p className="text-sm font-medium" style={{ color: '#4a6358' }}>No quotes submitted yet.</p>
        <p className="mt-1 text-xs" style={{ color: '#8a9e96' }}>
          Browse active projects and respond to RFQs to submit your first quote.
        </p>
        <Link
          href="/vendor/projects"
          className="mt-4 inline-block text-sm font-medium"
          style={{ color: '#fa6b04' }}
        >
          Browse Projects →
        </Link>
      </div>
    )
  }

  return (
    <div>
      {/* Filter tabs */}
      <div className="mb-4 flex gap-1" style={{ borderBottom: '1px solid #e2d9cf' }}>
        {TABS.map((tab) => {
          const count = tab.value === 'all' ? bids.length : bids.filter((b) => b.status === tab.value).length
          const isActive = activeFilter === tab.value
          return (
            <button
              key={tab.value}
              onClick={() => setActiveFilter(tab.value)}
              className="px-3 py-2 text-sm font-medium -mb-px transition-colors"
              style={{
                borderBottom: isActive ? '2px solid #1e3a2f' : '2px solid transparent',
                color: isActive ? '#1e3a2f' : '#4a6358',
              }}
            >
              {tab.label}
              {count > 0 && (
                <span
                  className="ml-1.5 rounded-full px-1.5 py-0.5 text-xs"
                  style={{ background: '#ede8e2', color: '#4a6358' }}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {filtered.length === 0 ? (
        <p className="py-8 text-center text-sm" style={{ color: '#8a9e96' }}>No quotes in this category.</p>
      ) : (
        <div className="space-y-4">
          {grouped.map(({ projectId, projectName, bids: projectBids }) => {
            const isExpanded = expandedProjects.has(projectId)
            const projectTotal = projectBids.reduce((s, b) => s + b.total_price, 0)
            const awardedCount = projectBids.filter((b) => b.status === 'awarded').length

            return (
              <div
                key={projectId}
                className="overflow-hidden rounded-xl shadow-sm"
                style={{ background: '#ffffff', border: '1px solid #e2d9cf' }}
              >
                {/* Project header */}
                <button
                  type="button"
                  onClick={() => toggleProject(projectId)}
                  className="w-full px-4 py-3 text-left transition-colors"
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#ede8e2')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = '')}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`transition-transform text-sm ${isExpanded ? 'rotate-180' : ''}`}
                        style={{ color: '#8a9e96' }}
                      >
                        ▾
                      </span>
                      <h3 className="text-sm font-semibold truncate" style={{ color: '#1e3a2f' }}>{projectName}</h3>
                      <span
                        className="shrink-0 rounded-full px-2 py-0.5 text-xs"
                        style={{ background: '#ede8e2', color: '#4a6358' }}
                      >
                        {projectBids.length} bid{projectBids.length !== 1 ? 's' : ''}
                      </span>
                      {awardedCount > 0 && (
                        <span
                          className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
                          style={{ background: '#e8f4ee', color: '#2d6a4f' }}
                        >
                          {awardedCount} awarded
                        </span>
                      )}
                    </div>
                    <p className="shrink-0 text-sm font-semibold" style={{ color: '#4a6358' }}>{formatCurrency(projectTotal)}</p>
                  </div>
                </button>

                {/* Bid rows */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid #ede8e2' }}>
                    {projectBids.map((bid, idx) => (
                      <Link
                        key={bid.id}
                        href={`/vendor/bids/${bid.id}`}
                        className="flex items-center justify-between gap-4 px-4 py-3 transition-colors"
                        style={{
                          borderTop: idx > 0 ? '1px solid #ede8e2' : undefined,
                          background: bid.status === 'awarded' ? '#e8f4ee' : '#ffffff',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#ede8e2')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = bid.status === 'awarded' ? '#e8f4ee' : '#ffffff')}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate" style={{ color: '#1e3a2f' }}>{bid.rfq_title}</p>
                          <p className="text-xs mt-0.5" style={{ color: '#8a9e96' }}>
                            {bid.contractor_name} · {formatRelativeTime(bid.submitted_at)}
                          </p>
                          {bid.po_number && (
                            <p
                              className="text-xs mt-0.5"
                              style={{ fontFamily: 'var(--font-dm-mono, monospace)', color: '#2d6a4f' }}
                            >
                              {bid.po_number}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-4 shrink-0">
                          <p className="text-sm font-semibold" style={{ color: '#1e3a2f' }}>{formatCurrency(bid.total_price)}</p>
                          <span
                            className="rounded px-2 py-0.5 text-xs font-medium"
                            style={STATUS_STYLES[bid.status]}
                          >
                            {STATUS_LABELS[bid.status]}
                          </span>
                          <span style={{ color: '#e2d9cf' }}>›</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
