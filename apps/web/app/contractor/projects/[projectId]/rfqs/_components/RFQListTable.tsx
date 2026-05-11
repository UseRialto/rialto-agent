'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { ArrowRight, FilePlus2, Trash2 } from 'lucide-react'
import { bulkDeleteRFQsAction } from '@/lib/actions/contractor'
import type { ContractorRFQ } from '@/lib/types/contractor'
import { contractorRFQStatusLabel, contractorRFQStatusStyle } from '@/lib/contractor-display'
import { formatDate } from '@/lib/utils'

interface Props {
  rfqs: ContractorRFQ[]
  projectId: string
}

export function RFQListTable({ rfqs, projectId }: Props) {
  const router = useRouter()
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()
  const selectableRfqs = rfqs
  const allSelected = selectableRfqs.length > 0 && selectableRfqs.every((rfq) => selectedIds.includes(rfq.id))

  function toggleSelected(rfqId: string) {
    setSelectedIds((current) => current.includes(rfqId) ? current.filter((id) => id !== rfqId) : [...current, rfqId])
  }

  function toggleAll() {
    setSelectedIds(allSelected ? [] : selectableRfqs.map((rfq) => rfq.id))
  }

  function deleteSelected() {
    if (selectedIds.length === 0) return
    const confirmed = window.confirm(`Delete ${selectedIds.length} selected RFQ${selectedIds.length === 1 ? '' : 's'}? This cannot be undone.`)
    if (!confirmed) return
    setError('')
    startTransition(async () => {
      const result = await bulkDeleteRFQsAction(projectId, selectedIds)
      if (!result.success) {
        setError(result.error ?? 'Failed to delete selected RFQs.')
        return
      }
      if (result.error) setError(result.error)
      setSelectedIds([])
      router.refresh()
    })
  }

  if (rfqs.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed p-10 text-center" style={{ borderColor: '#e2d9cf', background: 'rgba(255,255,255,0.8)' }}>
        <p className="text-sm font-semibold" style={{ color: '#4a6358' }}>No requests found.</p>
        <div className="mt-3 flex items-center justify-center gap-3">
          <Link
            href={`/contractor/projects/${projectId}/rfqs/new`}
            className="inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
            style={{ color: '#2d6a4f' }}
          >
            <FilePlus2 className="h-4 w-4" />
            Create an RFQ
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl" style={{ background: '#ffffff', border: '1px solid #e2d9cf', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between" style={{ borderBottom: '1px solid #e2d9cf' }}>
        <div className="text-xs font-medium" style={{ color: '#8a9e96' }}>
          {selectedIds.length > 0 ? `${selectedIds.length} selected` : 'Select RFQs to delete them in bulk.'}
        </div>
        <button
          type="button"
          onClick={deleteSelected}
          disabled={selectedIds.length === 0 || isPending}
          className="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
          style={{ background: '#ffffff', border: '1px solid #f5c6c6', color: '#c0392b' }}
        >
          <Trash2 className="h-3.5 w-3.5" />
          {isPending ? 'Deleting...' : 'Delete selected'}
        </button>
      </div>
      {error && (
        <div className="px-4 py-2 text-xs font-medium" style={{ background: '#fdeaea', borderBottom: '1px solid #f5c6c6', color: '#c0392b' }}>{error}</div>
      )}
      <table className="w-full text-sm">
        <thead className="text-[10px] font-semibold uppercase tracking-wider" style={{ background: '#ede8e2', color: '#8a9e96' }}>
          <tr>
            <th className="w-10 px-4 py-3 text-left">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                aria-label="Select all deletable RFQs"
                className="h-4 w-4 rounded"
                style={{ accentColor: '#1e3a2f' }}
              />
            </th>
            <th className="px-4 py-3 text-left">RFQ Title</th>
            <th className="px-4 py-3 text-left">Status</th>
            <th className="px-4 py-3 text-left">Category</th>
            <th className="px-4 py-3 text-right">Items</th>
            <th className="px-4 py-3 text-right">Vendors Invited</th>
            <th className="px-4 py-3 text-left">Created</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody style={{ borderTop: '1px solid #e2d9cf' }}>
          {rfqs.map((rfq) => (
            <tr key={rfq.id} className="transition-colors" style={{ borderBottom: '1px solid #e2d9cf' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#ede8e2')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '')}
            >
              <td className="px-4 py-4">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(rfq.id)}
                  onChange={() => toggleSelected(rfq.id)}
                  disabled={false}
                  aria-label={`Select ${rfq.title}`}
                  className="h-4 w-4 rounded disabled:opacity-30"
                  style={{ accentColor: '#1e3a2f' }}
                />
              </td>
              <td className="px-4 py-4 font-semibold" style={{ color: '#1e3a2f' }}>
                <Link
                  href={rfq.status === 'draft'
                    ? (rfq.request_type === 'rfq'
                        ? `/contractor/projects/${projectId}/rfqs/new?rfqId=${rfq.id}&step=review`
                        : `/contractor/projects/${projectId}/rfqs/${rfq.id}`)
                    : `/contractor/projects/${projectId}/rfqs/${rfq.id}`}
                  className="hover:underline"
                  style={{ color: '#1e3a2f' }}
                >
                  {rfq.title}
                </Link>
              </td>
              <td className="px-4 py-4">
                <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${contractorRFQStatusStyle(rfq.status)}`}>
                  {contractorRFQStatusLabel(rfq.status)}
                </span>
              </td>
              <td className="px-4 py-4 text-xs font-medium" style={{ color: '#8a9e96' }}>{rfq.category ?? <span style={{ color: '#e2d9cf' }}>-</span>}</td>
              <td className="px-4 py-4 text-right font-medium" style={{ color: '#4a6358' }}>{rfq.line_items.length}</td>
              <td className="px-4 py-4 text-right font-medium" style={{ color: '#4a6358' }}>
                {rfq.invited_vendor_ids.length + rfq.invited_vendor_emails.length}
              </td>
              <td className="px-4 py-4" style={{ color: '#8a9e96' }}>{formatDate(rfq.created_at)}</td>
              <td className="px-4 py-4 text-right">
                <div className="flex items-center justify-end gap-3">
                  {rfq.status === 'draft' && rfq.request_type === 'rfq' && (
                    <Link
                      href={`/contractor/projects/${projectId}/rfqs/new?rfqId=${rfq.id}`}
                      className="text-xs font-semibold hover:underline"
                      style={{ color: '#a85c2a' }}
                    >
                      Edit Draft
                    </Link>
                  )}
                  {rfq.status === 'draft' && rfq.request_type === 'rfq' ? (
                    <Link
                      href={`/contractor/projects/${projectId}/rfqs/new?rfqId=${rfq.id}&step=review`}
                      className="inline-flex items-center gap-1 text-xs font-semibold hover:underline"
                      style={{ color: '#2d6a4f' }}
                    >
                      Continue
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  ) : (
                    <Link
                      href={`/contractor/projects/${projectId}/rfqs/${rfq.id}`}
                      className="inline-flex items-center gap-1 text-xs font-semibold hover:underline"
                      style={{ color: '#2d6a4f' }}
                    >
                      View
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
