'use client'

import { useState } from 'react'
import { RiskBadge } from '@/components/shared/RiskBadge'
import { SupplierOriginBadge } from '@/components/shared/SupplierOriginBadge'
import { formatCurrency } from '@/lib/utils'
import type { Bid } from '@/lib/types/bid'

interface Props {
  bid: Bid
  onConfirm: (bidId: string) => void
  onCancel: () => void
}

export function AwardModal({ bid, onConfirm, onCancel }: Props) {
  const [loading, setLoading] = useState(false)
  const hasRisk = bid.supplier.risk_level === 'medium' || bid.supplier.risk_level === 'high'

  function handleConfirm() {
    setLoading(true)
    setTimeout(() => onConfirm(bid.id), 600)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />

      {/* Modal */}
      <div className="relative mx-4 w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="border-b border-gray-200 px-6 py-4">
          <h2 className="text-base font-semibold text-gray-900">Confirm Award</h2>
          <p className="mt-0.5 text-sm text-gray-500">
            You're awarding this RFQ to the following supplier.
          </p>
        </div>

        <div className="px-6 py-4 space-y-3">
          {/* Supplier */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900">{bid.supplier.name}</p>
              <p className="text-xs text-gray-500">{bid.supplier.hq_city}</p>
            </div>
            <SupplierOriginBadge
              country={bid.supplier.hq_country}
              isDomestic={bid.supplier.is_domestic}
            />
          </div>

          {/* Key numbers */}
          <div className="grid grid-cols-3 gap-3 rounded-lg bg-gray-50 p-3">
            <div className="text-center">
              <p className="text-xs text-gray-500">Total Price</p>
              <p className="mt-0.5 text-sm font-bold text-gray-900">
                {formatCurrency(bid.total_price)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500">Lead Time</p>
              <p className="mt-0.5 text-sm font-bold text-gray-900">{bid.lead_time_days} days</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500">Risk</p>
              <div className="mt-0.5 flex justify-center">
                <RiskBadge level={bid.supplier.risk_level} />
              </div>
            </div>
          </div>

          {/* Risk warning */}
          {hasRisk && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5">
              <p className="text-xs font-medium text-amber-800">
                ⚠ Supply chain risk notice
              </p>
              {bid.supplier.risk_notes && (
                <p className="mt-1 text-xs text-amber-700">{bid.supplier.risk_notes}</p>
              )}
              <p className="mt-1 text-xs text-amber-600">
                Confirm you've reviewed the risk details before proceeding.
              </p>
            </div>
          )}

          {/* Delivery terms */}
          {bid.delivery_terms && (
            <p className="text-xs text-gray-500">
              <span className="font-medium">Delivery terms:</span> {bid.delivery_terms}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button
            onClick={onCancel}
            disabled={loading}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="flex items-center gap-2 rounded-md bg-green-600 px-5 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
          >
            {loading ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Awarding…
              </>
            ) : (
              'Confirm Award'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
