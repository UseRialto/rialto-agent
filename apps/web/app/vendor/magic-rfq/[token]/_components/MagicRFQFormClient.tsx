'use client'

import { useState } from 'react'
import { submitMagicRFQBidAction, submitMagicRFQMessageAction } from '@/lib/actions/vendor'
import type { ContractorBid, ContractorRFQ, ContractorRFQLineItem } from '@/lib/types/contractor'
import type { MagicRFQPreviewInput } from '@/lib/types/magic-rfq'
import type { BidTerms, ComplianceDeclaration, NegotiationMessage, ProcurementLineItemAttribute } from '@/lib/types/procurement'
import type { CustomLineItemFieldDefinition } from '@/lib/contractor-customization'

interface LineItemBid {
  line_item_id: string
  vendor_sku: string
  alternate_description: string
  is_alternate: boolean
  availability: 'in_stock' | 'unavailable'
  quoted_quantity: string
  units_available: string
  unit_price: string
  lead_time_days: string
  delivery_terms: string
  substitution_notes: string
  quoted_product_details: string
  response_attributes: Record<string, string>
}

const AVAILABILITY_OPTIONS = [
  { value: 'in_stock' as const, label: 'In Stock' },
  { value: 'unavailable' as const, label: 'Unavailable' },
]

const fieldClass = 'w-full rounded-md border bg-white px-3 py-2 text-sm outline-none transition focus:ring-2'
const compactFieldClass = 'w-full rounded-md border bg-white px-2.5 py-1.5 text-sm outline-none transition focus:ring-2'
const fieldStyle = { borderColor: '#c8bdb2', color: '#1e3a2f' }
const fieldFocusStyle = { '--tw-ring-color': '#fdc89a' } as React.CSSProperties

const PRODUCT_IDENTITY_KEYS = [
  'manufacturer',
  'brand',
  'model',
  'part',
  'sku',
  'product',
  'catalog',
]

function isProductSpecific(item: ContractorRFQLineItem) {
  if (item.sku.trim()) return true
  return (item.attributes ?? []).some((attribute) => {
    if (!attribute.value?.trim()) return false
    const identityText = `${attribute.key} ${attribute.label}`.toLowerCase()
    return PRODUCT_IDENTITY_KEYS.some((key) => identityText.includes(key))
  })
}

function responseAttributeMap(response?: ContractorBid['line_item_responses'][number]) {
  return Object.fromEntries((response?.response_attributes ?? []).map((attribute) => [attribute.key, attribute.value]))
}

function visibleVendorResponseFields(rfq: ContractorRFQ) {
  return (rfq.vendor_response_fields ?? [])
    .filter((field) => field.visible !== false)
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

function makeResponseAttributes(fields: CustomLineItemFieldDefinition[], values: Record<string, string>): ProcurementLineItemAttribute[] {
  return fields
    .map((field) => ({
      key: field.key,
      label: field.label,
      value: (values[field.key] ?? '').trim(),
      inputType: field.inputType,
      required: field.required,
      visible: field.visible,
      options: field.options,
      source: 'user' as const,
      order: field.order,
    }))
    .filter((attribute) => attribute.value)
}

function defaultBids(rfq: ContractorRFQ, existingBid: ContractorBid | null): LineItemBid[] {
  return rfq.line_items.map((item) => {
    const response = existingBid?.line_item_responses.find((entry) => entry.line_item_id === item.id)
    const responseIsAlternate = Boolean(response?.is_alternate && isProductSpecific(item))
    return {
      line_item_id: item.id,
      vendor_sku: responseIsAlternate ? response?.sku ?? '' : response?.sku && response.sku !== item.sku ? response.sku : '',
      alternate_description: responseIsAlternate ? response?.description ?? '' : '',
      is_alternate: responseIsAlternate,
      availability: response?.availability === 'unavailable' ? 'unavailable' : 'in_stock',
      quoted_quantity: response?.quoted_quantity?.toString() ?? item.quantity.toString(),
      units_available: response?.units_available?.toString() ?? '',
      unit_price: response?.unit_price?.toString() ?? '',
      lead_time_days: response?.lead_time_days?.toString() ?? item.suggested_lead_time_days?.toString() ?? '',
      delivery_terms: response?.delivery_terms ?? '',
      substitution_notes: response?.substitution_notes ?? '',
      quoted_product_details: response?.quoted_product_details ?? '',
      response_attributes: responseAttributeMap(response),
    }
  })
}

function LineItemCard({
  item,
  bid,
  onChange,
}: {
  item: ContractorRFQLineItem
  bid: LineItemBid
  onChange: (partial: Partial<LineItemBid>) => void
}) {
  const unitPrice = parseFloat(bid.unit_price) || 0
  const quotedQuantity = parseFloat(bid.quoted_quantity) || 0
  const unitsAvailable = parseFloat(bid.units_available) || 0
  const pricedQuantity = unitsAvailable > 0 ? unitsAvailable : quotedQuantity
  const totalPrice = unitPrice * pricedQuantity
  const isUnavailable = bid.availability === 'unavailable'

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm" style={{ borderColor: '#e2d9cf' }}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold" style={{ color: '#1e3a2f' }}>{item.description}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs" style={{ color: '#8a9e96' }}>
            {item.sku ? <span className="font-mono">Requested SKU: {item.sku}</span> : null}
            <span>Qty: <span className="font-medium" style={{ color: '#4a6358' }}>{item.quantity.toLocaleString()} {item.unit}</span></span>
            {item.specs ? <span className="rounded px-1.5 py-0.5 font-medium" style={{ background: '#ede8e2', color: '#4a6358' }}>{item.specs}</span> : null}
            {item.certifications?.map((cert) => (
              <span key={cert} className="rounded px-1.5 py-0.5 font-medium" style={{ background: '#e8f4ee', color: '#2d6a4f' }}>
                {cert}
              </span>
            ))}
            {(item.attributes ?? []).filter((attribute) => attribute.value).map((attribute) => (
              <span key={attribute.key} className="rounded px-1.5 py-0.5 font-medium" style={{ background: '#ffffff', border: '1px solid #e2d9cf', color: '#4a6358' }}>
                {attribute.label}: {attribute.value}
              </span>
            ))}
          </div>
          {item.notes ? <p className="mt-2 text-xs italic" style={{ color: '#8a9e96' }}>{item.notes}</p> : null}
        </div>
        {item.contractor_budget != null ? (
          <span className="rounded px-2 py-0.5 text-xs font-medium" style={{ background: '#fdf0e8', color: '#a85c2a' }}>
            Budget: ${item.contractor_budget.toLocaleString()}/{item.unit}
          </span>
        ) : null}
      </div>

      <div className="mb-4">
        <label className="mb-1 block text-xs font-medium" style={{ color: '#4a6358' }}>Availability</label>
        <div className="flex flex-wrap gap-2">
          {AVAILABILITY_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange({ availability: option.value })}
              className="rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
              style={bid.availability === option.value
                ? option.value === 'in_stock'
                  ? { borderColor: '#2d6a4f', background: '#2d6a4f', color: '#ffffff' }
                  : { borderColor: '#c0392b', background: '#c0392b', color: '#ffffff' }
                : { borderColor: '#e2d9cf', background: '#ffffff', color: '#4a6358' }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {!isUnavailable ? (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: '#4a6358' }}>Your SKU</label>
              <input
                type="text"
                value={bid.vendor_sku}
                onChange={(e) => onChange({ vendor_sku: e.target.value })}
                placeholder={item.sku ? `Ref: ${item.sku}` : 'Vendor SKU'}
                className={compactFieldClass}
                style={{ ...fieldStyle, ...fieldFocusStyle }}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: '#4a6358' }}>Quoted Qty</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={bid.quoted_quantity}
                onChange={(e) => onChange({ quoted_quantity: e.target.value })}
                className={compactFieldClass}
                style={{ ...fieldStyle, ...fieldFocusStyle }}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: '#4a6358' }}>Units Available</label>
              <input
                type="number"
                min={0}
                value={bid.units_available}
                onChange={(e) => onChange({ units_available: e.target.value })}
                className={compactFieldClass}
                style={{ ...fieldStyle, ...fieldFocusStyle }}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: '#4a6358' }}>Unit Price (USD)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={bid.unit_price}
                onChange={(e) => onChange({ unit_price: e.target.value })}
                className={compactFieldClass}
                style={{ ...fieldStyle, ...fieldFocusStyle }}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: '#4a6358' }}>Total Price</label>
              <div className="rounded-md border bg-white px-2.5 py-1.5 text-sm font-medium" style={{ borderColor: '#e2d9cf', color: '#1e3a2f' }}>
                ${totalPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <p className="mt-1 text-[11px]" style={{ color: '#8a9e96' }}>Unit price x available units</p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: '#4a6358' }}>Lead Time (days)</label>
              <input
                type="number"
                min={1}
                value={bid.lead_time_days}
                onChange={(e) => onChange({ lead_time_days: e.target.value })}
                className={compactFieldClass}
                style={{ ...fieldStyle, ...fieldFocusStyle }}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: '#4a6358' }}>Delivery Terms</label>
              <input
                type="text"
                value={bid.delivery_terms}
                onChange={(e) => onChange({ delivery_terms: e.target.value })}
                className={compactFieldClass}
                style={{ ...fieldStyle, ...fieldFocusStyle }}
              />
            </div>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: '#4a6358' }}>Substitution / Recommendation</label>
              <textarea
                rows={2}
                value={bid.substitution_notes}
                onChange={(e) => onChange({ substitution_notes: e.target.value })}
                className={compactFieldClass}
                style={{ ...fieldStyle, ...fieldFocusStyle }}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: '#4a6358' }}>Quoted Product Details</label>
              <textarea
                rows={2}
                value={bid.quoted_product_details}
                onChange={(e) => onChange({ quoted_product_details: e.target.value })}
                placeholder="Manufacturer, model, dimensions, finish, grade, standards..."
                className={compactFieldClass}
                style={{ ...fieldStyle, ...fieldFocusStyle }}
              />
            </div>
          </div>
        </>
      ) : (
        <p className="text-xs italic" style={{ color: '#8a9e96' }}>Marked unavailable. Pricing is not required for this line.</p>
      )}
    </div>
  )
}

function VendorResponseFieldInput({
  field,
  value,
  onChange,
}: {
  field: CustomLineItemFieldDefinition
  value: string
  onChange: (value: string) => void
}) {
  const inputClass = 'w-full rounded-md px-2 py-1.5 text-sm focus:outline-none'
  const inputStyle = { background: '#fbf8f5', border: '1px solid #e2d9cf', color: '#1e3a2f' }

  if (field.inputType === 'boolean') {
    return (
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
        style={inputStyle}
      >
        <option value="">-</option>
        <option value="Yes">Yes</option>
        <option value="No">No</option>
      </select>
    )
  }
  if (field.inputType === 'select' && field.options.length > 0) {
    return (
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={inputClass}
        style={inputStyle}
      >
        <option value="">-</option>
        {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    )
  }
  return (
    <input
      type={field.inputType === 'number' ? 'number' : field.inputType === 'date' ? 'date' : 'text'}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={inputClass}
      style={inputStyle}
    />
  )
}

function LineItemsWorkbook({
  rfq,
  bids,
  updateBid,
}: {
  rfq: ContractorRFQ
  bids: LineItemBid[]
  updateBid: (id: string, partial: Partial<LineItemBid>) => void
}) {
  const vendorResponseFields = visibleVendorResponseFields(rfq)
  const requestAttributeColumns = rfq.line_items
    .flatMap((item) => item.attributes ?? [])
    .filter((attribute, index, attributes) => (
      attribute.visible !== false && attributes.findIndex((entry) => entry.key === attribute.key) === index
    ))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const requestPinnedColumns = ['#', 'Item Description or SKU', 'Qty', 'Units']
  const responseColumns = ['Unit Price', 'Total Price', 'Lead Time', ...vendorResponseFields.map((field) => field.label)]
  const detailColumns = [
    ...requestAttributeColumns.map((attribute) => attribute.label),
    'Notes / Specs',
  ]
  const requestPinnedGridTemplateColumns = [
    '44px',
    '260px',
    '72px',
    '62px',
  ].join(' ')
  const requestDetailsGridTemplateColumns = [
    ...requestAttributeColumns.map(() => 'minmax(160px, 1fr)'),
    'minmax(260px, 1.35fr)',
  ].join(' ')
  const requestPinnedWidth = 44 + 260 + 72 + 62
  const requestDetailsWidth = requestAttributeColumns.length * 170 + 280
  const vendorColumnWidth = 116
  const vendorGridTemplateColumns = responseColumns.map(() => `${vendorColumnWidth}px`).join(' ')
  const vendorGridWidth = responseColumns.length * vendorColumnWidth
  const vendorPaneWidth = Math.min(vendorGridWidth, 620)

  function formatCurrencyInput(value: string) {
    if (!value) return ''
    const [whole, decimal] = value.split('.')
    const formattedWhole = whole ? Number(whole).toLocaleString('en-US') : ''
    return `$${formattedWhole}${decimal != null ? `.${decimal}` : ''}`
  }

  function parseCurrencyInput(value: string) {
    const cleaned = value.replace(/[^\d.]/g, '')
    const [whole, ...decimalParts] = cleaned.split('.')
    const decimal = decimalParts.join('').slice(0, 2)
    return decimalParts.length > 0 ? `${whole}.${decimal}` : whole
  }

  function updateResponseAttribute(bid: LineItemBid, key: string, value: string) {
    updateBid(bid.line_item_id, {
      response_attributes: {
        ...bid.response_attributes,
        [key]: value,
      },
    })
  }

  return (
    <div className="overflow-hidden rounded-2xl border bg-white shadow-sm" style={{ borderColor: '#e2d9cf' }}>
      <div className="flex flex-col gap-2 border-b px-5 py-4 sm:flex-row sm:items-end sm:justify-between" style={{ borderColor: '#e2d9cf' }}>
        <div>
          <p className="text-base font-bold" style={{ color: '#1e3a2f', fontFamily: 'var(--font-lora, Georgia, serif)' }}>Line Items</p>
          <p className="mt-1 text-xs" style={{ color: '#4a6358' }}>
            Review the requested materials and fill the vendor response columns.
          </p>
        </div>
      </div>
      <div className="overflow-x-auto bg-white">
        <div
          className="grid"
          style={{
            gridTemplateColumns: `minmax(${requestPinnedWidth}px, 1fr) ${vendorPaneWidth}px`,
            minWidth: `${requestPinnedWidth + vendorPaneWidth}px`,
          }}
        >
          <div
            className="grid min-w-0"
            style={{ gridTemplateColumns: `${requestPinnedWidth}px minmax(0, 1fr)`, borderRight: '1px solid #e2d9cf' }}
          >
            <div
              className="min-w-0"
              style={{ borderRight: '1px solid #e2d9cf' }}
            >
              <div
                className="grid items-center gap-0 border-b text-[11px] font-semibold uppercase tracking-wide"
                style={{ gridTemplateColumns: requestPinnedGridTemplateColumns, background: '#f5f0eb', borderColor: '#e2d9cf', color: '#4a6358' }}
              >
                {requestPinnedColumns.map((heading, index) => (
                  <div
                    key={`request-pinned-${heading}-${index}`}
                    className="truncate whitespace-nowrap border-r px-3 py-3"
                    style={{ borderColor: '#e2d9cf', background: '#ede8e2' }}
                  >
                    {heading}
                  </div>
                ))}
              </div>

              {rfq.line_items.map((item, index) => (
                <div
                  key={`${item.id}-request-pinned`}
                  className="grid min-h-16 items-stretch gap-0 border-b last:border-b-0"
                  style={{ gridTemplateColumns: requestPinnedGridTemplateColumns, borderColor: '#f0ebe6' }}
                >
                  <div className="flex items-center border-r px-3 py-2 text-xs font-semibold" style={{ borderColor: '#e2d9cf', color: '#1e3a2f' }}>
                    {index + 1}
                  </div>
                  <div className="border-r p-1.5" style={{ borderColor: '#f0ebe6' }}>
                    <div className="px-2 py-1.5 text-sm" style={{ color: '#1e3a2f' }}>
                      <p
                        className="text-xs"
                        style={{
                          display: '-webkit-box',
                          WebkitBoxOrient: 'vertical',
                          WebkitLineClamp: 3,
                          overflow: 'hidden',
                          wordBreak: 'break-word',
                        }}
                      >
                        {item.sku || item.description || '-'}
                      </p>
                    </div>
                  </div>
                  <div className="border-r p-1.5" style={{ borderColor: '#f0ebe6' }}>
                    <div className="px-2 py-1.5 text-sm" style={{ color: '#1e3a2f' }}>{item.quantity.toLocaleString()}</div>
                  </div>
                  <div className="border-r p-1.5" style={{ borderColor: '#f0ebe6' }}>
                    <div className="px-2 py-1.5 text-sm" style={{ color: '#1e3a2f' }}>{item.unit}</div>
                  </div>
                </div>
              ))}
            </div>

            <div
              className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              style={{ minWidth: 0 }}
            >
              <div style={{ width: `${requestDetailsWidth}px`, minWidth: '100%' }}>
                <div
                  className="grid items-center gap-0 border-b text-[11px] font-semibold uppercase tracking-wide"
                  style={{ gridTemplateColumns: requestDetailsGridTemplateColumns, background: '#f5f0eb', borderColor: '#e2d9cf', color: '#4a6358' }}
                >
                  {detailColumns.map((heading, index) => (
                    <div
                      key={`request-detail-${heading}-${index}`}
                      className="truncate whitespace-nowrap border-r px-3 py-3"
                      style={{ borderColor: '#e2d9cf', background: '#ede8e2' }}
                    >
                      {heading}
                    </div>
                  ))}
                </div>

                {rfq.line_items.map((item) => {
                  const attributeByKey = new Map((item.attributes ?? []).map((attribute) => [attribute.key, attribute]))
                  return (
                    <div
                      key={`${item.id}-request-details`}
                      className="grid min-h-16 items-stretch gap-0 border-b last:border-b-0"
                      style={{ gridTemplateColumns: requestDetailsGridTemplateColumns, borderColor: '#f0ebe6' }}
                    >
                      {requestAttributeColumns.map((attribute) => (
                        <div key={`${item.id}-request-${attribute.key}`} className="border-r p-1.5" style={{ borderColor: '#f0ebe6' }}>
                          <div className="truncate px-2 py-1.5 text-sm" style={{ color: '#1e3a2f' }}>
                            {attributeByKey.get(attribute.key)?.value || '-'}
                          </div>
                        </div>
                      ))}
                      <div className="border-r p-1.5" style={{ borderColor: '#f0ebe6' }}>
                        <div className="truncate px-2 py-1.5 text-sm" style={{ color: '#1e3a2f' }}>
                          {[item.specs, item.notes, item.certifications?.join(', ')].filter(Boolean).join(' · ') || '-'}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          <div
            className="overflow-x-auto"
            style={{ background: '#fffaf5' }}
          >
            <div style={{ width: `${vendorGridWidth}px`, minWidth: '100%' }}>
              <div
                className="grid items-center gap-0 border-b text-[11px] font-semibold uppercase tracking-wide"
                style={{ gridTemplateColumns: vendorGridTemplateColumns, borderColor: '#f2c99d', background: '#fff5eb', color: '#8a4615' }}
              >
                {responseColumns.map((heading) => (
                  <div key={`response-${heading}`} className="truncate whitespace-nowrap border-r px-3 py-3" style={{ borderColor: '#f2c99d' }}>
                    {heading}
                  </div>
                ))}
              </div>

              {rfq.line_items.map((item, index) => {
                const bid = bids.find((entry) => entry.line_item_id === item.id) ?? bids[index]!
                const unitPrice = parseFloat(bid.unit_price) || 0
                const quotedQuantity = parseFloat(bid.quoted_quantity) || item.quantity || 0
                const totalPrice = unitPrice * quotedQuantity
                return (
                  <div
                    key={`${item.id}-response`}
                    className="grid min-h-16 items-stretch gap-0 border-b last:border-b-0"
                    style={{ gridTemplateColumns: vendorGridTemplateColumns, borderColor: '#f0ebe6' }}
                  >
                    <div className="border-r p-1.5" style={{ borderColor: '#f0ebe6' }}>
                      <label className="sr-only">Unit Price</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={formatCurrencyInput(bid.unit_price)}
                        onChange={(event) => updateBid(item.id, { unit_price: parseCurrencyInput(event.target.value) })}
                        className="w-full rounded-md px-2 py-1.5 text-sm focus:outline-none"
                        style={{ background: '#fbf8f5', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
                      />
                    </div>
                    <div className="min-w-0 border-r p-1.5" style={{ borderColor: '#f0ebe6' }}>
                      <div
                        className="min-w-0 overflow-hidden rounded-md px-2 py-1.5 text-right text-sm font-semibold"
                        style={{ background: '#fff', border: '1px solid #f2c99d', color: '#8a4615' }}
                      >
                        <span className="block truncate">
                          {bid.unit_price ? `$${totalPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                        </span>
                      </div>
                    </div>
                    <div className="border-r p-1.5" style={{ borderColor: '#f0ebe6' }}>
                      <label className="sr-only">Lead Time</label>
                      <input
                        type="number"
                        min={1}
                        value={bid.lead_time_days}
                        onChange={(event) => updateBid(item.id, { lead_time_days: event.target.value })}
                        className="w-full rounded-md px-2 py-1.5 text-sm focus:outline-none"
                        style={{ background: '#fbf8f5', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
                      />
                    </div>
                    {vendorResponseFields.map((field) => (
                      <div key={`${item.id}-${field.key}`} className="border-r p-1.5" style={{ borderColor: '#f0ebe6' }}>
                        <VendorResponseFieldInput
                          field={field}
                          value={bid.response_attributes[field.key] ?? ''}
                          onChange={(value) => updateResponseAttribute(bid, field.key, value)}
                        />
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

type MagicRFQFormClientProps =
  | {
      mode?: 'live'
      token: string
      rfq: ContractorRFQ
      projectName: string
      vendorEmail: string
      initialVendorName: string
      existingBid: ContractorBid | null
      initialMessages?: NegotiationMessage[]
      submittedAt?: string
    }
  | {
      mode: 'preview'
      preview: MagicRFQPreviewInput
    }

export function MagicRFQFormClient(props: MagicRFQFormClientProps) {
  const isPreview = props.mode === 'preview'
  const rfq = isPreview ? props.preview.rfq : props.rfq
  const projectName = isPreview ? props.preview.projectName : props.projectName
  const vendorEmail = isPreview ? props.preview.vendorEmail : props.vendorEmail
  const initialVendorName = isPreview ? props.preview.vendorName ?? '' : props.initialVendorName
  const existingBid = isPreview ? null : props.existingBid
  const initialMessages = isPreview ? [] : props.initialMessages ?? []
  const submittedAt = isPreview ? undefined : props.submittedAt
  const [vendorName, setVendorName] = useState(initialVendorName)
  const [designerName, setDesignerName] = useState(existingBid?.designer_name ?? '')
  const [overallNotes, setOverallNotes] = useState(existingBid?.notes ?? '')
  const [terms, setTerms] = useState<BidTerms>(existingBid?.terms ?? {})
  const [complianceCodes, setComplianceCodes] = useState<string[]>(
    (existingBid?.compliance_declarations ?? [])
      .filter((entry) => entry.status === 'verified' || entry.status === 'self_reported')
      .map((entry) => entry.code),
  )
  const [bids, setBids] = useState<LineItemBid[]>(() => defaultBids(rfq, existingBid))
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(Boolean(submittedAt))
  const [error, setError] = useState('')
  const [messages, setMessages] = useState<NegotiationMessage[]>(initialMessages)
  const [messageDraft, setMessageDraft] = useState('')
  const [sendingMessage, setSendingMessage] = useState(false)
  const [messageError, setMessageError] = useState('')
  const [messageComposerOpen, setMessageComposerOpen] = useState(false)

  function updateBid(id: string, partial: Partial<LineItemBid>) {
    setBids((prev) => prev.map((entry) => (entry.line_item_id === id ? { ...entry, ...partial } : entry)))
  }

  async function handleSubmit() {
    if (isPreview) return
    const vendorResponseFields = visibleVendorResponseFields(rfq)
    const missing = bids.some((bid) => bid.availability !== 'unavailable' && (!bid.unit_price || !bid.lead_time_days))
    const missingAlternate = bids.some((bid) => {
      if (!bid.is_alternate || bid.availability === 'unavailable') return false
      return !bid.vendor_sku.trim() && !bid.alternate_description.trim() && !bid.quoted_product_details.trim()
    })
    if (!vendorName.trim()) {
      setError('Company name is required.')
      return
    }
    if (!designerName.trim()) {
      setError('Responder name is required.')
      return
    }
    if (missing) {
      setError('Please fill in unit price and lead time for all available items.')
      return
    }
    if (missingAlternate) {
      setError('For alternate items, add an alternate SKU, product description, or product details.')
      return
    }

    setSubmitting(true)
    setError('')
    const responses = bids.map((bid) => {
      const item = rfq.line_items.find((entry) => entry.id === bid.line_item_id)!
      const unitPrice = parseFloat(bid.unit_price) || 0
      const quotedQuantity = parseFloat(bid.quoted_quantity) || 0
      const unitsAvailable = bid.units_available ? parseFloat(bid.units_available) : undefined
      const pricedQuantity = unitsAvailable && unitsAvailable > 0 ? unitsAvailable : quotedQuantity
      const isAlternate = bid.is_alternate && isProductSpecific(item) && bid.availability !== 'unavailable'
      return {
        line_item_id: bid.line_item_id,
        sku: isAlternate ? bid.vendor_sku.trim() : item.sku,
        description: isAlternate && bid.alternate_description.trim() ? bid.alternate_description.trim() : item.description,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: unitPrice,
        total_price: unitPrice * pricedQuantity,
        quoted_quantity: quotedQuantity,
        lead_time_days: parseInt(bid.lead_time_days, 10) || 0,
        availability: bid.availability,
        units_available: unitsAvailable,
        delivery_terms: bid.delivery_terms || undefined,
        substitution_notes: isAlternate ? bid.substitution_notes || undefined : undefined,
        quoted_product_details: isAlternate ? bid.quoted_product_details || undefined : undefined,
        response_attributes: makeResponseAttributes(vendorResponseFields, bid.response_attributes),
        is_alternate: isAlternate,
      }
    })

    const complianceDeclarations: ComplianceDeclaration[] = (rfq.procurement_requirements ?? []).map((requirement) => ({
      code: requirement.code,
      label: requirement.label,
      status: complianceCodes.includes(requirement.code)
        ? requirement.verification === 'verified'
          ? 'verified'
          : 'self_reported'
        : 'does_not_match',
    }))

    const result = await submitMagicRFQBidAction(props.token, vendorName, responses, overallNotes, {
      terms,
      complianceDeclarations,
      designerName,
    })
    if (!result.success) {
      setError(result.error ?? 'Failed to submit quote.')
      setSubmitting(false)
      return
    }
    setSubmitted(true)
    setSubmitting(false)
  }

  async function handleSendMessage() {
    if (isPreview) return
    const trimmed = messageDraft.trim()
    if (!trimmed) return
    setSendingMessage(true)
    setMessageError('')
    const result = await submitMagicRFQMessageAction(props.token, vendorName || initialVendorName || vendorEmail, trimmed)
    if (!result.success) {
      setMessageError(result.error ?? 'Failed to send message.')
      setSendingMessage(false)
      return
    }
    const optimisticMessage: NegotiationMessage = {
      id: Date.now(),
      rfq_id: rfq.id,
      vendor_email: vendorEmail,
      author_role: 'vendor',
      author_name: vendorName || initialVendorName || vendorEmail,
      message: trimmed,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, optimisticMessage])
    setMessageDraft('')
    setMessageComposerOpen(false)
    setSendingMessage(false)
  }

  return (
      <div className="mx-auto max-w-[96rem] px-4 py-10 lg:px-8">
      <div className="mb-6 rounded-2xl border bg-white p-6 shadow-sm" style={{ borderColor: '#e2d9cf' }}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: '#fa6b04' }}>Secure Quote Form</p>
            <h1 className="mt-2 text-2xl font-semibold" style={{ color: '#1e3a2f' }}>{rfq.title}</h1>
            <p className="mt-1 text-sm" style={{ color: '#4a6358' }}>{projectName}</p>
          </div>
          <div className="flex flex-col items-stretch gap-2">
            <div className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: '#e2d9cf', background: '#ede8e2', color: '#4a6358' }}>
              <p>Invited email: <span className="font-medium" style={{ color: '#1e3a2f' }}>{vendorEmail}</span></p>
              {rfq.bid_deadline ? <p className="mt-1">Deadline: <span className="font-medium" style={{ color: '#1e3a2f' }}>{rfq.bid_deadline}</span></p> : null}
            </div>
            {!isPreview && (
              <button
                type="button"
                onClick={() => setMessageComposerOpen((open) => !open)}
                className="rounded-md px-3 py-2 text-xs font-semibold text-white shadow-sm"
                style={{ background: '#fa6b04' }}
              >
                Message Subcontractor
              </button>
            )}
          </div>
        </div>
        {!isPreview && messageComposerOpen && messages.length === 0 && (
          <div className="mt-5 rounded-xl border p-4" style={{ borderColor: '#fdc89a', background: '#fff3eb' }}>
            {messageError && (
              <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {messageError}
              </div>
            )}
            <textarea
              rows={3}
              value={messageDraft}
              onChange={(event) => setMessageDraft(event.target.value)}
              className={fieldClass}
              style={{ ...fieldStyle, ...fieldFocusStyle }}
              placeholder="Write a message..."
            />
            <div className="mt-2 text-right">
              <button
                type="button"
                onClick={handleSendMessage}
                disabled={!messageDraft.trim() || sendingMessage}
                className="rounded-md px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                style={{ background: '#fa6b04' }}
              >
                {sendingMessage ? 'Sending...' : 'Send message'}
              </button>
            </div>
          </div>
        )}
      </div>

      {messages.length > 0 && (
        <div className="mb-6 rounded-2xl border p-5 shadow-sm" style={{ borderColor: '#fdc89a', background: '#fff3eb' }}>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: '#fa6b04' }}>Messages</p>
              <h2 className="mt-1 text-xl font-bold" style={{ color: '#1e3a2f' }}>Conversation with the subcontractor</h2>
            </div>
            <p className="text-xs" style={{ color: '#a85c2a' }}>Replies stay attached to this quote request.</p>
          </div>
          <div className="mt-4 space-y-3">
            {messages.map((message) => {
              const isVendor = message.author_role === 'vendor'
              return (
                <div key={message.id} className={isVendor ? 'flex justify-end' : 'flex justify-start'}>
                  <div className="max-w-[82%] rounded-xl border bg-white px-4 py-3 text-sm shadow-sm" style={{ borderColor: isVendor ? '#fdc89a' : '#e2d9cf' }}>
                    <div className="mb-1 flex flex-wrap items-center gap-2 text-xs font-semibold">
                      <span style={{ color: isVendor ? '#a85c2a' : '#2d6a4f' }}>{message.author_name}</span>
                      <span style={{ color: '#8a9e96' }}>{new Date(message.created_at).toLocaleString()}</span>
                    </div>
                    <p className="whitespace-pre-wrap leading-6" style={{ color: '#4a6358' }}>{message.message}</p>
                  </div>
                </div>
              )
            })}
          </div>
          {!isPreview && (
            <div className="mt-4">
              {messageError && (
                <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {messageError}
                </div>
              )}
              <textarea
                rows={3}
                value={messageDraft}
                onChange={(event) => setMessageDraft(event.target.value)}
                className={fieldClass}
                style={{ ...fieldStyle, ...fieldFocusStyle }}
                placeholder="Reply..."
              />
              <div className="mt-2 text-right">
                <button
                  type="button"
                  onClick={handleSendMessage}
                  disabled={!messageDraft.trim() || sendingMessage}
                  className="rounded-md px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ background: '#fa6b04' }}
                >
                  {sendingMessage ? 'Sending...' : 'Send message'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mb-6 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: '#fdc89a', background: '#fff3eb', color: '#a85c2a' }}>
        {isPreview ? (
          <>
            Preview mode. Contractors see this as a simulation of the vendor experience for <span className="font-semibold">{vendorEmail}</span>.
          </>
        ) : (
          <>
            This secured link is attached to <span className="font-semibold">{vendorEmail}</span>. You can reopen it and update your quote until the RFQ deadline.
          </>
        )}
      </div>

      {submitted ? (
        <div className="mb-6 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Quote submitted. You can continue editing and resubmit from this same link until the RFQ deadline.
        </div>
      ) : null}

      <div className="mb-5 rounded-2xl border bg-white p-5 shadow-sm" style={{ borderColor: '#e2d9cf' }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium" style={{ color: '#4a6358' }}>Company Name</span>
            <input
              type="text"
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
              className={fieldClass}
              style={{ ...fieldStyle, ...fieldFocusStyle }}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium" style={{ color: '#4a6358' }}>Responder Name</span>
            <input
              type="text"
              value={designerName}
              onChange={(e) => setDesignerName(e.target.value)}
              placeholder="Person preparing this quote"
              className={fieldClass}
              style={{ ...fieldStyle, ...fieldFocusStyle }}
            />
          </label>
        </div>
      </div>

      {(rfq.attachment_urls ?? []).length > 0 && (
        <div className="mb-5 rounded-2xl border bg-white p-5 shadow-sm" style={{ borderColor: '#e2d9cf' }}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-bold" style={{ color: '#1e3a2f' }}>Attached Files</h2>
              <p className="mt-1 text-sm" style={{ color: '#8a9e96' }}>Files attached to this request appear here.</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {(rfq.attachment_urls ?? []).map((url) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border px-3 py-1 text-xs font-medium transition-colors"
                style={{ borderColor: '#e2d9cf', background: '#ede8e2', color: '#4a6358' }}
              >
                {decodeURIComponent((url.split('/').pop() ?? url).replace(/^\d+-/, ''))}
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-4">
        <LineItemsWorkbook rfq={rfq} bids={bids} updateBid={updateBid} />
      </div>

      <div className="mt-5 rounded-2xl border bg-white p-6 shadow-sm" style={{ borderColor: '#e2d9cf' }}>
        <h2 className="mb-3 text-lg font-bold" style={{ color: '#1e3a2f' }}>Commercial Terms</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            type="text"
            value={terms.payment_terms ?? ''}
            onChange={(e) => setTerms((prev) => ({ ...prev, payment_terms: e.target.value }))}
            placeholder="Payment terms (Net 30, COD, etc.)"
            className={fieldClass}
            style={{ ...fieldStyle, ...fieldFocusStyle }}
          />
          <input
            type="text"
            value={terms.deposit_terms ?? ''}
            onChange={(e) => setTerms((prev) => ({ ...prev, deposit_terms: e.target.value }))}
            placeholder="Deposit requirement"
            className={fieldClass}
            style={{ ...fieldStyle, ...fieldFocusStyle }}
          />
          <input
            type="text"
            value={terms.credit_terms ?? ''}
            onChange={(e) => setTerms((prev) => ({ ...prev, credit_terms: e.target.value }))}
            placeholder="Credit / first-time vendor terms"
            className={fieldClass}
            style={{ ...fieldStyle, ...fieldFocusStyle }}
          />
          <input
            type="text"
            value={terms.shipping_terms ?? ''}
            onChange={(e) => setTerms((prev) => ({ ...prev, shipping_terms: e.target.value }))}
            placeholder="Shipping / incoterm terms"
            className={fieldClass}
            style={{ ...fieldStyle, ...fieldFocusStyle }}
          />
        </div>
        {(rfq.procurement_requirements ?? []).length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: '#8a9e96' }}>Compliance Declarations</p>
            <div className="flex flex-wrap gap-2">
              {(rfq.procurement_requirements ?? []).map((requirement) => {
                const selected = complianceCodes.includes(requirement.code)
                return (
                  <button
                    key={requirement.code}
                    type="button"
                    onClick={() => setComplianceCodes((prev) => (
                      selected ? prev.filter((code) => code !== requirement.code) : [...prev, requirement.code]
                    ))}
                    className="rounded-full border px-3 py-1 text-xs font-semibold transition-colors"
                    style={selected ? { borderColor: '#1e3a2f', background: '#1e3a2f', color: '#ffffff' } : { borderColor: '#e2d9cf', background: '#ffffff', color: '#4a6358' }}
                  >
                    {requirement.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <div className="mt-5 rounded-2xl border bg-white p-5 shadow-sm" style={{ borderColor: '#e2d9cf' }}>
        <label className="mb-1 block text-xs font-medium" style={{ color: '#4a6358' }}>General Notes</label>
        <textarea
          rows={4}
          value={overallNotes}
          onChange={(e) => setOverallNotes(e.target.value)}
          className={fieldClass}
          style={{ ...fieldStyle, ...fieldFocusStyle }}
        />
      </div>

      {error ? (
        <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || isPreview}
          className="rounded-md px-5 py-2 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          style={{ background: '#1e3a2f' }}
        >
          {isPreview ? 'Preview Only' : submitting ? 'Submitting…' : submitted ? 'Update Quote' : 'Submit Quote'}
        </button>
      </div>
    </div>
  )
}
