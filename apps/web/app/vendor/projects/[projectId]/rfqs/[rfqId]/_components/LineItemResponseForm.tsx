'use client'

import type { RFQLineItem, BidLineItemResponse, LineItemAvailability } from '@/lib/types/vendor'

interface Props {
  lineItem: RFQLineItem
  value: Partial<BidLineItemResponse>
  onChange: (updated: Partial<BidLineItemResponse>) => void
}

const AVAILABILITY_OPTIONS: { value: LineItemAvailability; label: string }[] = [
  { value: 'in_stock', label: 'In Stock' },
  { value: 'can_source', label: 'Can Source' },
  { value: 'unavailable', label: 'Unavailable' },
]

export function LineItemResponseForm({ lineItem, value, onChange }: Props) {
  const unitPrice = value.unit_price ?? 0
  const totalPrice = unitPrice * lineItem.quantity

  function update(partial: Partial<BidLineItemResponse>) {
    onChange({ ...value, ...partial })
  }

  const isUnavailable = value.availability === 'unavailable'

  function availStyle(opt: typeof AVAILABILITY_OPTIONS[number]): React.CSSProperties {
    if (value.availability === opt.value) {
      if (opt.value === 'in_stock') return { background: '#2d6a4f', border: '1px solid #2d6a4f', color: '#ffffff' }
      if (opt.value === 'can_source') return { background: '#a85c2a', border: '1px solid #a85c2a', color: '#ffffff' }
      return { background: '#c0392b', border: '1px solid #c0392b', color: '#ffffff' }
    }
    return { background: '#ffffff', border: '1px solid #e2d9cf', color: '#4a6358' }
  }

  return (
    <div
      className="rounded-xl p-4"
      style={{ background: '#ede8e2', border: '1px solid #e2d9cf' }}
    >
      {/* Line item header */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold" style={{ color: '#1e3a2f' }}>{lineItem.description}</p>
          <div className="mt-0.5 flex items-center gap-2 flex-wrap">
            {lineItem.sku && (
              <span
                className="text-xs"
                style={{ fontFamily: 'var(--font-dm-mono, monospace)', color: '#4a6358' }}
              >
                SKU: {lineItem.sku}
              </span>
            )}
            <span className="text-xs" style={{ color: '#4a6358' }}>
              Qty: <span className="font-medium">{lineItem.quantity.toLocaleString()} {lineItem.unit}</span>
            </span>
            {lineItem.standard && (
              <span
                className="rounded px-1.5 py-0.5 text-xs font-medium"
                style={{ background: '#fff3eb', color: '#fa6b04' }}
              >
                {lineItem.standard}
              </span>
            )}
            {(lineItem.attributes ?? []).filter((attribute) => attribute.value).map((attribute) => (
              <span
                key={attribute.key}
                className="rounded px-1.5 py-0.5 text-xs font-medium"
                style={{ background: '#ffffff', border: '1px solid #e2d9cf', color: '#4a6358' }}
              >
                {attribute.label}: {attribute.value}
              </span>
            ))}
          </div>
          {lineItem.notes && (
            <p className="mt-1 text-xs italic" style={{ color: '#8a9e96' }}>{lineItem.notes}</p>
          )}
        </div>
      </div>

      {/* Availability selector */}
      <div className="mb-4">
        <label className="mb-1 block text-xs font-medium" style={{ color: '#4a6358' }}>Availability</label>
        <div className="flex gap-2">
          {AVAILABILITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => update({ availability: opt.value })}
              className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
              style={availStyle(opt)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Response fields - hidden when unavailable */}
      {!isUnavailable && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {/* Units Available */}
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: '#4a6358' }}>
              Units Available
            </label>
            <input
              type="number"
              min={0}
              placeholder="-"
              value={value.units_available ?? ''}
              onChange={(e) => update({ units_available: parseInt(e.target.value) || undefined })}
              className="w-full rounded-md px-2.5 py-1.5 text-sm focus:border-[#fa6b04] focus:outline-none"
              style={{ background: '#ffffff', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
            />
          </div>

          {/* Unit Price */}
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: '#4a6358' }}>
              Unit Price (USD)
            </label>
            <div className="relative">
              <span
                className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-xs"
                style={{ color: '#8a9e96' }}
              >
                $
              </span>
              <input
                type="number"
                min={0}
                step="0.01"
                placeholder="0.00"
                value={unitPrice || ''}
                onChange={(e) => update({ unit_price: parseFloat(e.target.value) || 0 })}
                className="w-full rounded-md pl-5 pr-2 py-1.5 text-sm focus:border-[#fa6b04] focus:outline-none"
                style={{ background: '#ffffff', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
              />
            </div>
          </div>

          {/* Total Price - read only */}
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: '#4a6358' }}>
              Total Price
            </label>
            <div
              className="rounded-md px-2.5 py-1.5 text-sm"
              style={{ background: '#ffffff', border: '1px solid #e2d9cf', color: '#4a6358' }}
            >
              ${totalPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>

          {/* Lead Time */}
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: '#4a6358' }}>
              Lead Time (days)
            </label>
            <input
              type="number"
              min={1}
              placeholder="-"
              value={value.lead_time_days || ''}
              onChange={(e) => update({ lead_time_days: parseInt(e.target.value) || 0 })}
              className="w-full rounded-md px-2.5 py-1.5 text-sm focus:border-[#fa6b04] focus:outline-none"
              style={{ background: '#ffffff', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
            />
          </div>

          {/* Delivery Terms */}
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: '#4a6358' }}>
              Delivery Terms
            </label>
            <input
              type="text"
              placeholder="e.g. FOB Destination"
              value={value.delivery_terms || ''}
              onChange={(e) => update({ delivery_terms: e.target.value })}
              className="w-full rounded-md px-2.5 py-1.5 text-sm focus:border-[#fa6b04] focus:outline-none"
              style={{ background: '#ffffff', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
            />
          </div>
        </div>
      )}

      {/* Notes */}
      {!isUnavailable && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: '#4a6358' }}>
              Quoted Product Details
            </label>
            <textarea
              rows={2}
              placeholder="Manufacturer, model, dimensions, finish, grade, standards..."
              value={value.quoted_product_details || ''}
              onChange={(e) => update({ quoted_product_details: e.target.value })}
              className="w-full rounded-md px-2.5 py-1.5 text-sm focus:border-[#fa6b04] focus:outline-none resize-none"
              style={{ background: '#ffffff', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: '#4a6358' }}>
              Notes <span className="font-normal" style={{ color: '#8a9e96' }}>(optional)</span>
            </label>
            <textarea
              rows={2}
              placeholder="Any conditions, substitutions, or additional details..."
              value={value.notes || ''}
              onChange={(e) => update({ notes: e.target.value })}
              className="w-full rounded-md px-2.5 py-1.5 text-sm focus:border-[#fa6b04] focus:outline-none resize-none"
              style={{ background: '#ffffff', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
            />
          </div>
        </div>
      )}

      {isUnavailable && (
        <p className="text-xs italic" style={{ color: '#8a9e96' }}>
          Marked as unavailable - no pricing required. You can optionally add a note.
        </p>
      )}
    </div>
  )
}
