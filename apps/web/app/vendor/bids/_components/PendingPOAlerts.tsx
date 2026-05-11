'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { acceptPOAction, denyPOAction } from '@/lib/actions/vendor'
import type { ContractorRFQ } from '@/lib/types/contractor'

interface PendingPO {
  rfq: ContractorRFQ
  bidId: string
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`
  return `$${n.toLocaleString()}`
}

function POAlert({ po }: { po: PendingPO }) {
  const router = useRouter()
  const [accepting, setAccepting] = useState(false)
  const [denying, setDenying] = useState(false)
  const [error, setError] = useState('')
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  // Find quote total from the rfq.pending_award (we don't have the quote total here directly,
  // but we can show the RFQ context)

  async function handleAccept() {
    setAccepting(true)
    setError('')
    try {
      const result = await acceptPOAction(po.rfq.id, po.bidId)
      if (!result.success) {
        setError(result.error ?? 'Failed to accept PO.')
        setAccepting(false)
        return
      }
      setDismissed(true)
      router.refresh()
    } catch {
      setError('Failed to accept PO. Please try again.')
      setAccepting(false)
    }
  }

  async function handleDeny() {
    setDenying(true)
    setError('')
    try {
      const result = await denyPOAction(po.rfq.id, po.bidId)
      if (!result.success) {
        setError(result.error ?? 'Failed to decline PO.')
        setDenying(false)
        return
      }
      setDismissed(true)
      router.refresh()
    } catch {
      setError('Failed to decline PO. Please try again.')
      setDenying(false)
    }
  }

  return (
    <div
      className="rounded-xl p-4"
      style={{ background: '#fdf0e8', border: '1px solid #e8c4a0' }}
    >
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
          style={{ background: '#a85c2a' }}
        >
          !
        </span>
        <div className="flex-1">
          <p className="text-sm font-semibold" style={{ color: '#a85c2a' }}>Purchase Order Offer</p>
          <p className="mt-0.5 text-sm" style={{ color: '#a85c2a' }}>
            <span className="font-medium">{po.rfq.title}</span>
          </p>
          <p className="mt-0.5 text-xs" style={{ color: '#a85c2a' }}>
            Offered on {new Date(po.rfq.pending_award!.offered_at).toLocaleDateString()}
            {po.rfq.bid_deadline && ` · Quote deadline: ${po.rfq.bid_deadline}`}
          </p>

          {error && (
            <div
              className="mt-2 rounded px-3 py-1.5"
              style={{ background: '#fdeaea', border: '1px solid #f5c6c6' }}
            >
              <p className="text-xs" style={{ color: '#c0392b' }}>{error}</p>
            </div>
          )}

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={handleAccept}
              disabled={accepting || denying}
              className="rounded-md px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50 transition-colors"
              style={{ background: '#2d6a4f' }}
              onMouseEnter={(e) => { if (!accepting && !denying) (e.currentTarget as HTMLButtonElement).style.background = '#1e3a2f' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#2d6a4f' }}
            >
              {accepting ? 'Accepting…' : 'Accept PO'}
            </button>
            <button
              type="button"
              onClick={handleDeny}
              disabled={accepting || denying}
              className="rounded-md px-4 py-1.5 text-xs font-medium disabled:opacity-50 transition-colors"
              style={{ background: '#ffffff', border: '1px solid #e8c4a0', color: '#a85c2a' }}
              onMouseEnter={(e) => { if (!accepting && !denying) (e.currentTarget as HTMLButtonElement).style.background = '#fdf0e8' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = '#ffffff' }}
            >
              {denying ? 'Declining…' : 'Decline'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function PendingPOAlerts({ pendingPOs }: { pendingPOs: PendingPO[] }) {
  return (
    <div className="mb-5 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#a85c2a' }}>
        {pendingPOs.length} Pending PO Offer{pendingPOs.length !== 1 ? 's' : ''}
      </p>
      {pendingPOs.map((po) => (
        <POAlert key={po.rfq.id} po={po} />
      ))}
    </div>
  )
}
