'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { advanceOrderStageAction } from '@/lib/actions/vendor'
import { formatCurrency } from '@/lib/utils'
import type { VendorOrder } from '@/lib/types/vendor'

interface Props {
  order: VendorOrder
}

export function StageActions({ order }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function advance(data: Record<string, string | string[] | undefined> = {}) {
    setLoading(true)
    setError(null)
    const result = await advanceOrderStageAction(order.id, data)
    setLoading(false)
    if (!result.success) {
      setError(result.error ?? 'Something went wrong')
    } else {
      router.refresh()
    }
  }

  if (order.current_stage === 'confirmed') {
    return <ConfirmedStage order={order} loading={loading} error={error} onAdvance={advance} />
  }
  if (order.current_stage === 'packaged') {
    return <PackagedStage order={order} loading={loading} error={error} onAdvance={advance} />
  }
  if (order.current_stage === 'shipped') {
    return <ShippedStage order={order} loading={loading} error={error} onAdvance={advance} />
  }
  if (order.current_stage === 'out_for_delivery') {
    return <OutForDeliveryStage order={order} loading={loading} error={error} onAdvance={advance} />
  }
  if (order.current_stage === 'delivered') {
    return <DeliveredStage order={order} />
  }
  return null
}

// --- Stage: Confirmed ---
function ConfirmedStage({
  order,
  loading,
  error,
  onAdvance,
}: {
  order: VendorOrder
  loading: boolean
  error: string | null
  onAdvance: () => void
}) {
  return (
    <div className="space-y-4">
      <div
        className="rounded-xl p-5 shadow-sm"
        style={{ background: '#ffffff', border: '1px solid #e2d9cf' }}
      >
        <h3 className="mb-3 text-sm font-semibold" style={{ color: '#4a6358' }}>Order Details</h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs font-medium" style={{ color: '#8a9e96' }}>PO Number</p>
            <p
              className="mt-0.5 text-sm font-semibold"
              style={{ fontFamily: 'var(--font-dm-mono, monospace)', color: '#2d6a4f' }}
            >
              {order.po_number}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium" style={{ color: '#8a9e96' }}>Agreed Value</p>
            <p className="mt-0.5 text-sm font-bold" style={{ color: '#1e3a2f' }}>{formatCurrency(order.agreed_price)}</p>
          </div>
          <div>
            <p className="text-xs font-medium" style={{ color: '#8a9e96' }}>Delivery Date</p>
            <p className="mt-0.5 text-sm" style={{ color: '#4a6358' }}>{order.delivery_date}</p>
          </div>
          <div>
            <p className="text-xs font-medium" style={{ color: '#8a9e96' }}>Delivery Location</p>
            <p className="mt-0.5 text-sm truncate" style={{ color: '#4a6358' }}>{order.delivery_location}</p>
          </div>
        </div>

        {/* Line items */}
        <div className="mt-4 pt-4" style={{ borderTop: '1px solid #ede8e2' }}>
          <p
            className="mb-2 text-xs font-semibold uppercase tracking-wide"
            style={{ color: '#4a6358' }}
          >
            Agreed Line Items
          </p>
          <table className="w-full text-xs">
            <thead style={{ borderBottom: '1px solid #ede8e2' }}>
              <tr className="text-left" style={{ color: '#8a9e96' }}>
                <th className="pb-1.5 pr-4 font-medium">Item</th>
                <th className="pb-1.5 pr-4 font-medium whitespace-nowrap">Qty</th>
                <th className="pb-1.5 pr-4 font-medium whitespace-nowrap">Unit Price</th>
                <th className="pb-1.5 font-medium whitespace-nowrap">Total</th>
              </tr>
            </thead>
            <tbody>
              {order.line_item_responses.map((r) => {
                const li = order.line_items_snapshot.find((l) => l.id === r.line_item_id)
                return (
                  <tr key={r.line_item_id} style={{ borderBottom: '1px solid #ede8e2' }}>
                    <td className="py-2 pr-4 font-medium max-w-[200px] truncate" style={{ color: '#1e3a2f' }}>
                      {li?.description ?? r.line_item_id}
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap" style={{ color: '#4a6358' }}>
                      {li ? `${li.quantity.toLocaleString()} ${li.unit}` : '-'}
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap" style={{ color: '#4a6358' }}>{formatCurrency(r.unit_price)}</td>
                    <td className="py-2 font-semibold whitespace-nowrap" style={{ color: '#1e3a2f' }}>{formatCurrency(r.total_price)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {error && <p className="text-sm" style={{ color: '#c0392b' }}>{error}</p>}
      <div className="flex justify-end">
        <ActionButton loading={loading} onClick={onAdvance}>
          Mark Items as Packaged →
        </ActionButton>
      </div>
    </div>
  )
}

// --- Stage: Packaged (with photo upload) ---
function PackagedStage({
  order,
  loading,
  error,
  onAdvance,
}: {
  order: VendorOrder
  loading: boolean
  error: string | null
  onAdvance: (data: { photos?: string[] }) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [photos, setPhotos] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setUploading(true)
    setUploadError(null)
    const newUrls: string[] = []
    for (const file of files) {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('orderId', order.id)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      if (res.ok) {
        const { url } = await res.json()
        newUrls.push(url)
      } else {
        setUploadError('One or more uploads failed.')
      }
    }
    setPhotos((prev) => [...prev, ...newUrls])
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="space-y-4">
      <div
        className="rounded-xl p-5 shadow-sm"
        style={{ background: '#ffffff', border: '1px solid #e2d9cf' }}
      >
        <h3 className="mb-1 text-sm font-semibold" style={{ color: '#4a6358' }}>Packaging Photos</h3>
        <p className="mb-4 text-xs" style={{ color: '#8a9e96' }}>
          Upload photos of the packaged goods before shipment. These will be visible to the contractor.
        </p>

        {/* Upload area */}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex w-full items-center justify-center gap-2 rounded-xl py-6 text-sm transition-colors disabled:opacity-50"
          style={{ border: '2px dashed #e2d9cf', color: '#8a9e96' }}
          onMouseEnter={(e) => {
            const btn = e.currentTarget as HTMLButtonElement
            if (!uploading) {
              btn.style.borderColor = '#fa6b04'
              btn.style.color = '#4a6358'
            }
          }}
          onMouseLeave={(e) => {
            const btn = e.currentTarget as HTMLButtonElement
            btn.style.borderColor = '#e2d9cf'
            btn.style.color = '#8a9e96'
          }}
        >
          {uploading ? (
            <>
              <span
                className="h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"
                style={{ borderColor: '#8a9e96' }}
              />
              Uploading…
            </>
          ) : (
            <>
              <span className="text-lg">📷</span>
              Click to upload photos (JPG, PNG, WEBP)
            </>
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />

        {uploadError && <p className="mt-2 text-xs" style={{ color: '#c0392b' }}>{uploadError}</p>}

        {/* Photo thumbnails */}
        {photos.length > 0 && (
          <div className="mt-4 grid grid-cols-4 gap-2">
            {photos.map((url) => (
              <div
                key={url}
                className="relative aspect-square overflow-hidden rounded-md"
                style={{ border: '1px solid #e2d9cf' }}
              >
                <Image src={url} alt="Packaging photo" fill className="object-cover" />
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-sm" style={{ color: '#c0392b' }}>{error}</p>}
      <div className="flex items-center justify-between">
        <p className="text-xs" style={{ color: '#8a9e96' }}>
          {photos.length > 0 ? `${photos.length} photo${photos.length > 1 ? 's' : ''} uploaded` : 'Photos optional but recommended'}
        </p>
        <ActionButton loading={loading} onClick={() => onAdvance({ photos })}>
          Mark as Ready to Ship →
        </ActionButton>
      </div>
    </div>
  )
}

// --- Stage: Shipped (shipping info form) ---
function ShippedStage({
  order: _order,
  loading,
  error,
  onAdvance,
}: {
  order: VendorOrder
  loading: boolean
  error: string | null
  onAdvance: (data: { carrier?: string; tracking_number?: string; ship_date?: string }) => void
}) {
  const [carrier, setCarrier] = useState('')
  const [tracking, setTracking] = useState('')
  const [shipDate, setShipDate] = useState(new Date().toISOString().slice(0, 10))

  return (
    <div
      className="rounded-xl p-5 shadow-sm space-y-4"
      style={{ background: '#ffffff', border: '1px solid #e2d9cf' }}
    >
      <div>
        <h3 className="mb-3 text-sm font-semibold" style={{ color: '#4a6358' }}>Shipping Information</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: '#4a6358' }}>Carrier</label>
            <input
              type="text"
              placeholder="e.g. FedEx Freight, XPO"
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              className="w-full rounded-md px-3 py-2 text-sm focus:border-[#fa6b04] focus:outline-none"
              style={{ background: '#ffffff', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: '#4a6358' }}>Tracking Number</label>
            <input
              type="text"
              placeholder="e.g. 1Z999AA10123456784"
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
              className="w-full rounded-md px-3 py-2 text-sm focus:border-[#fa6b04] focus:outline-none"
              style={{ background: '#ffffff', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: '#4a6358' }}>Ship Date</label>
            <input
              type="date"
              value={shipDate}
              onChange={(e) => setShipDate(e.target.value)}
              className="w-full rounded-md px-3 py-2 text-sm focus:border-[#fa6b04] focus:outline-none"
              style={{ background: '#ffffff', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
            />
          </div>
        </div>
      </div>

      {error && <p className="text-sm" style={{ color: '#c0392b' }}>{error}</p>}
      <div className="flex justify-end">
        <ActionButton
          loading={loading}
          disabled={!carrier && !tracking}
          onClick={() => onAdvance({ carrier: carrier || undefined, tracking_number: tracking || undefined, ship_date: shipDate })}
        >
          Confirm Shipment →
        </ActionButton>
      </div>
    </div>
  )
}

// --- Stage: Out for Delivery ---
function OutForDeliveryStage({
  order: _order,
  loading,
  error,
  onAdvance,
}: {
  order: VendorOrder
  loading: boolean
  error: string | null
  onAdvance: () => void
}) {
  // Show last stage data (shipping info)
  const shippedStage = _order.stage_history.find((h) => h.stage === 'shipped')

  return (
    <div
      className="rounded-xl p-5 shadow-sm space-y-4"
      style={{ background: '#ffffff', border: '1px solid #e2d9cf' }}
    >
      {shippedStage && (
        <div
          className="rounded-md px-4 py-3 text-xs"
          style={{ background: '#ede8e2', border: '1px solid #e2d9cf', color: '#4a6358' }}
        >
          <span className="font-medium" style={{ color: '#4a6358' }}>Carrier: </span>{shippedStage.carrier ?? '-'}
          {shippedStage.tracking_number && (
            <> · <span className="font-medium" style={{ color: '#4a6358' }}>Tracking: </span>
            <span style={{ fontFamily: 'var(--font-dm-mono, monospace)' }}>{shippedStage.tracking_number}</span></>
          )}
        </div>
      )}
      <p className="text-sm" style={{ color: '#4a6358' }}>
        Confirm that the shipment is out for delivery and will arrive at the project site soon.
      </p>
      {error && <p className="text-sm" style={{ color: '#c0392b' }}>{error}</p>}
      <div className="flex justify-end">
        <ActionButton loading={loading} onClick={onAdvance}>
          Mark Out for Delivery →
        </ActionButton>
      </div>
    </div>
  )
}

// --- Stage: Delivered ---
function DeliveredStage({ order }: { order: VendorOrder }) {
  const deliveredStage = order.stage_history.find((h) => h.stage === 'delivered')

  return (
    <div
      className="rounded-xl p-6 text-center"
      style={{ background: '#e8f4ee', border: '1px solid #a8d5ba' }}
    >
      <p className="text-3xl">✓</p>
      <p className="mt-2 text-base font-semibold" style={{ color: '#2d6a4f' }}>Delivery Confirmed</p>
      <p className="mt-1 text-sm" style={{ color: '#2d6a4f' }}>
        Order fulfilled on {deliveredStage?.completed_at
          ? new Date(deliveredStage.completed_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
          : 'N/A'}
        . Awaiting payment from {order.contractor_name}.
      </p>
      <p className="mt-3 text-xs" style={{ color: '#2d6a4f' }}>
        PO {order.po_number} · {formatCurrency(order.agreed_price)}
      </p>
    </div>
  )
}

// --- Shared button ---
function ActionButton({
  children,
  loading,
  disabled,
  onClick,
}: {
  children: React.ReactNode
  loading: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading || disabled}
      className="flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
      style={{ background: '#1e3a2f' }}
      onMouseEnter={(e) => {
        if (!loading && !disabled) (e.currentTarget as HTMLButtonElement).style.background = '#4a6358'
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = '#1e3a2f'
      }}
    >
      {loading ? (
        <>
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
          Saving…
        </>
      ) : (
        children
      )}
    </button>
  )
}
