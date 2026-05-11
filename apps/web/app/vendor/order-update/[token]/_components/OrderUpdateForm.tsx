'use client'

import { useState } from 'react'
import type { ContractorOrderStage, ContractorRFQLineItem } from '@/lib/types/contractor'

const STAGES: { value: ContractorOrderStage; label: string }[] = [
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'packaged', label: 'Packaged' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'out_for_delivery', label: 'Out for Delivery' },
  { value: 'delivered', label: 'Delivered' },
]

const fieldClass = 'mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm outline-none transition focus:ring-2'
const fieldStyle = {
  borderColor: '#c8bdb2',
  color: '#1e3a2f',
  '--tw-ring-color': '#fdc89a',
} as React.CSSProperties

interface Props {
  token: string
  orderId: string
  currentStage: ContractorOrderStage
  reminderId: number
  lineItems: ContractorRFQLineItem[]
}

export function OrderUpdateForm({ token, currentStage, lineItems }: Props) {
  const currentIndex = STAGES.findIndex((s) => s.value === currentStage)
  const selectableStages = STAGES.slice(currentIndex)

  const [selectedStage, setSelectedStage] = useState<ContractorOrderStage>(currentStage)
  const [notes, setNotes] = useState('')
  const [carrier, setCarrier] = useState('')
  const [trackingNumber, setTrackingNumber] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const selectedIndex = STAGES.findIndex((s) => s.value === selectedStage)
  const showShippingFields = selectedIndex >= STAGES.findIndex((s) => s.value === 'shipped')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (selectedStage === currentStage) {
      setError('Please select a stage beyond the current one to record progress.')
      return
    }
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/order-update/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetStage: selectedStage,
          notes: notes.trim() || undefined,
          carrier: carrier.trim() || undefined,
          tracking_number: trackingNumber.trim() || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setError(json.error ?? 'Something went wrong. Please try again.')
      } else {
        setSubmitted(true)
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <div className="rounded-2xl border p-8 shadow-sm" style={{ borderColor: '#a8d5ba', background: '#e8f4ee' }}>
        <p className="text-sm font-semibold" style={{ color: '#2d6a4f' }}>Update received</p>
        <p className="mt-1 text-sm" style={{ color: '#4a6358' }}>
          Thank you — the contractor has been notified of your progress update.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Line items summary */}
      {lineItems.length > 0 && (
        <div className="rounded-2xl border bg-white p-5 shadow-sm" style={{ borderColor: '#e2d9cf' }}>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#8a9e96' }}>Order Items</p>
          <ul className="divide-y" style={{ borderColor: '#ede8e2' }}>
            {lineItems.map((item, i) => (
              <li key={item.id ?? i} className="flex items-center justify-between py-2 text-sm">
                <span className="font-medium" style={{ color: '#1e3a2f' }}>{item.sku || item.description}</span>
                <span style={{ color: '#4a6358' }}>
                  {item.quantity} {item.unit}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Stage selector */}
      <div className="rounded-2xl border bg-white p-5 shadow-sm" style={{ borderColor: '#e2d9cf' }}>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#8a9e96' }}>Current Status</p>
        <div className="flex flex-wrap gap-2">
          {selectableStages.map((stage) => (
            <button
              key={stage.value}
              type="button"
              onClick={() => setSelectedStage(stage.value)}
              className="rounded-full border px-4 py-1.5 text-sm font-medium transition-colors"
              style={selectedStage === stage.value
                ? { borderColor: '#1e3a2f', background: '#1e3a2f', color: '#ffffff' }
                : { borderColor: '#e2d9cf', background: '#ffffff', color: '#4a6358' }}
            >
              {stage.label}
            </button>
          ))}
        </div>
      </div>

      {/* Shipping details */}
      {showShippingFields && (
        <div className="rounded-2xl border bg-white p-5 shadow-sm" style={{ borderColor: '#e2d9cf' }}>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: '#8a9e96' }}>Shipping Details</p>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium" style={{ color: '#4a6358' }}>Carrier</label>
              <input
                type="text"
                value={carrier}
                onChange={(e) => setCarrier(e.target.value)}
                placeholder="e.g. FedEx, UPS, XPO"
                className={fieldClass}
                style={fieldStyle}
              />
            </div>
            <div>
              <label className="block text-sm font-medium" style={{ color: '#4a6358' }}>Tracking Number</label>
              <input
                type="text"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder="Tracking number"
                className={fieldClass}
                style={fieldStyle}
              />
            </div>
          </div>
        </div>
      )}

      {/* Notes */}
      <div className="rounded-2xl border bg-white p-5 shadow-sm" style={{ borderColor: '#e2d9cf' }}>
        <label className="block text-xs font-semibold uppercase tracking-wide" style={{ color: '#8a9e96' }}>
          Notes <span className="font-normal normal-case" style={{ color: '#8a9e96' }}>(optional)</span>
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Any additional info for the contractor…"
          className={fieldClass}
          style={fieldStyle}
        />
      </div>

      {error && (
        <p className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: '#f5c6c6', background: '#fdeaea', color: '#c0392b' }}>{error}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md px-6 py-3 text-sm font-semibold text-white transition-colors disabled:opacity-60"
        style={{ background: '#1e3a2f' }}
      >
        {loading ? 'Submitting…' : 'Submit Update'}
      </button>

      <p className="text-center text-xs" style={{ color: '#8a9e96' }}>
        This link was sent to the vendor on record. Updates are forwarded to the contractor immediately.
      </p>
    </form>
  )
}
