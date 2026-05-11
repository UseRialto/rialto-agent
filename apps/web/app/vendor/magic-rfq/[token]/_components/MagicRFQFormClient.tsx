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
    .sort((a, b) => a.order - b.order)
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
  if (field.inputType === 'boolean') {
    return (
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-full bg-transparent px-2 text-xs outline-none"
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
        className="h-8 w-full bg-transparent px-2 text-xs outline-none"
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
      className="h-8 w-full bg-transparent px-2 text-xs outline-none"
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
  const columns = 10 + vendorResponseFields.length

  function updateResponseAttribute(bid: LineItemBid, key: string, value: string) {
    updateBid(bid.line_item_id, {
      response_attributes: {
        ...bid.response_attributes,
        [key]: value,
      },
    })
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-white shadow-sm" style={{ borderColor: '#d9e0dc' }}>
      <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: '#d9e0dc', background: '#f8faf9' }}>
        <div>
          <p className="text-sm font-bold" style={{ color: '#1e3a2f' }}>Line Items</p>
          <p className="text-xs" style={{ color: '#587067' }}>{rfq.line_items.length} rows · {columns} columns</p>
        </div>
      </div>
      <div className="max-h-[70vh] overflow-auto">
        <table className="min-w-full border-separate border-spacing-0 text-xs" style={{ color: '#1e3a2f' }}>
          <thead>
            <tr>
              {['#', 'Requested Product / SKU', 'Alternate', 'Quoted Product / SKU', 'Qty', 'Available', 'Unit Price', 'Total', 'Lead', 'Terms', ...vendorResponseFields.map((field) => field.label)].map((label, index) => (
                <th
                  key={`${label}-${index}`}
                  className="sticky top-0 z-10 whitespace-nowrap border-b border-r px-2 py-2 text-left font-bold"
                  style={{ borderColor: '#d9e0dc', background: '#edf3f0', color: '#1e3a2f' }}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rfq.line_items.map((item, index) => {
              const bid = bids.find((entry) => entry.line_item_id === item.id) ?? bids[index]!
              const unitPrice = parseFloat(bid.unit_price) || 0
              const quotedQuantity = parseFloat(bid.quoted_quantity) || 0
              const unitsAvailable = parseFloat(bid.units_available) || 0
              const pricedQuantity = unitsAvailable > 0 ? unitsAvailable : quotedQuantity
              const totalPrice = unitPrice * pricedQuantity
              const isUnavailable = bid.availability === 'unavailable'
              const canOfferAlternate = isProductSpecific(item)
              const productCellStyle = {
                borderColor: '#d9e0dc',
                background: '#f4f7f5',
                color: '#587067',
              }
              const editableCellStyle = {
                borderColor: '#d9e0dc',
                background: isUnavailable ? '#f8f6f3' : '#ffffff',
              }

              return (
                <tr key={item.id} style={{ background: index % 2 === 0 ? '#ffffff' : '#fbfbfb' }}>
                  <td className="border-b border-r px-2 py-1 font-mono" style={{ borderColor: '#d9e0dc', color: '#587067' }}>{index + 1}</td>
                  <td className="min-w-[280px] border-b border-r px-2 py-1" style={productCellStyle}>
                    <p className="font-semibold" style={{ color: '#1e3a2f' }}>{item.description}</p>
                    <p className="font-mono text-[11px]">{item.sku || 'No requested SKU'}</p>
                    {(item.attributes ?? []).filter((attribute) => attribute.value).length > 0 && (
                      <p className="mt-1 truncate text-[11px]">
                        {(item.attributes ?? []).filter((attribute) => attribute.value).map((attribute) => `${attribute.label}: ${attribute.value}`).join(' · ')}
                      </p>
                    )}
                  </td>
                  <td className="min-w-[142px] border-b border-r px-2 py-1" style={{ borderColor: '#d9e0dc' }}>
                    {canOfferAlternate ? (
                      <button
                        type="button"
                        onClick={() => updateBid(item.id, { is_alternate: !bid.is_alternate })}
                        className="rounded-md border px-2 py-1 text-[11px] font-bold transition"
                        style={bid.is_alternate
                          ? { borderColor: '#b48a2c', background: '#fff7cc', color: '#74531a' }
                          : { borderColor: '#d9e0dc', background: '#ffffff', color: '#587067' }}
                      >
                        {bid.is_alternate ? 'Alternate' : 'Requested item'}
                      </button>
                    ) : (
                      <span className="rounded-md border px-2 py-1 text-[11px] font-semibold" style={{ borderColor: '#d9e0dc', background: '#f4f7f5', color: '#8a9e96' }}>
                        Not applicable
                      </span>
                    )}
                  </td>
                  <td className="min-w-[240px] border-b border-r" style={bid.is_alternate && canOfferAlternate ? editableCellStyle : productCellStyle}>
                    {bid.is_alternate && canOfferAlternate ? (
                      <div className="grid gap-px">
                        <input
                          type="text"
                          value={bid.alternate_description}
                          onChange={(event) => updateBid(item.id, { alternate_description: event.target.value })}
                          placeholder="Alternate product description"
                          className="h-8 w-full bg-transparent px-2 text-xs outline-none"
                        />
                        <input
                          type="text"
                          value={bid.vendor_sku}
                          onChange={(event) => updateBid(item.id, { vendor_sku: event.target.value })}
                          placeholder="Alternate SKU"
                          className="h-8 w-full border-t bg-transparent px-2 font-mono text-xs outline-none"
                          style={{ borderColor: '#d9e0dc' }}
                        />
                      </div>
                    ) : (
                      <div className="px-2 py-1">
                        <p className="font-semibold">{item.description}</p>
                        <p className="font-mono text-[11px]">{item.sku || '-'}</p>
                      </div>
                    )}
                  </td>
                  <td className="min-w-[86px] border-b border-r" style={editableCellStyle}>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={bid.quoted_quantity}
                      disabled={isUnavailable}
                      onChange={(event) => updateBid(item.id, { quoted_quantity: event.target.value })}
                      className="h-8 w-full bg-transparent px-2 text-right text-xs outline-none disabled:text-[#8a9e96]"
                    />
                  </td>
                  <td className="min-w-[96px] border-b border-r" style={editableCellStyle}>
                    <input
                      type="number"
                      min={0}
                      value={bid.units_available}
                      disabled={isUnavailable}
                      onChange={(event) => updateBid(item.id, { units_available: event.target.value })}
                      className="h-8 w-full bg-transparent px-2 text-right text-xs outline-none disabled:text-[#8a9e96]"
                    />
                  </td>
                  <td className="min-w-[98px] border-b border-r" style={editableCellStyle}>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={bid.unit_price}
                      disabled={isUnavailable}
                      onChange={(event) => updateBid(item.id, { unit_price: event.target.value })}
                      className="h-8 w-full bg-transparent px-2 text-right text-xs outline-none disabled:text-[#8a9e96]"
                    />
                  </td>
                  <td className="min-w-[104px] border-b border-r px-2 text-right font-bold" style={{ borderColor: '#d9e0dc', background: '#f8faf9' }}>
                    {isUnavailable ? '-' : `$${totalPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  </td>
                  <td className="min-w-[78px] border-b border-r" style={editableCellStyle}>
                    <input
                      type="number"
                      min={1}
                      value={bid.lead_time_days}
                      disabled={isUnavailable}
                      onChange={(event) => updateBid(item.id, { lead_time_days: event.target.value })}
                      className="h-8 w-full bg-transparent px-2 text-right text-xs outline-none disabled:text-[#8a9e96]"
                    />
                  </td>
                  <td className="min-w-[210px] border-b border-r" style={editableCellStyle}>
                    <div className="grid gap-px">
                      <select
                        value={bid.availability}
                        onChange={(event) => updateBid(item.id, { availability: event.target.value as LineItemBid['availability'] })}
                        className="h-8 w-full bg-transparent px-2 text-xs font-semibold outline-none"
                      >
                        {AVAILABILITY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                      <input
                        type="text"
                        value={bid.delivery_terms}
                        disabled={isUnavailable}
                        onChange={(event) => updateBid(item.id, { delivery_terms: event.target.value })}
                        placeholder="Delivery terms"
                        className="h-8 w-full border-t bg-transparent px-2 text-xs outline-none disabled:text-[#8a9e96]"
                        style={{ borderColor: '#d9e0dc' }}
                      />
                      {bid.is_alternate ? (
                        <>
                          <input
                            type="text"
                            value={bid.substitution_notes}
                            onChange={(event) => updateBid(item.id, { substitution_notes: event.target.value })}
                            placeholder="Alternate notes"
                            className="h-8 w-full border-t bg-transparent px-2 text-xs outline-none"
                            style={{ borderColor: '#d9e0dc' }}
                          />
                          <input
                            type="text"
                            value={bid.quoted_product_details}
                            onChange={(event) => updateBid(item.id, { quoted_product_details: event.target.value })}
                            placeholder="Manufacturer, model, finish..."
                            className="h-8 w-full border-t bg-transparent px-2 text-xs outline-none"
                            style={{ borderColor: '#d9e0dc' }}
                          />
                        </>
                      ) : null}
                    </div>
                  </td>
                  {vendorResponseFields.map((field) => (
                    <td key={`${item.id}-${field.key}`} className="min-w-[150px] border-b border-r" style={editableCellStyle}>
                      <VendorResponseFieldInput
                        field={field}
                        value={bid.response_attributes[field.key] ?? ''}
                        onChange={(value) => updateResponseAttribute(bid, field.key, value)}
                      />
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
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
      setError('Designer name is required.')
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
    setSendingMessage(false)
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-6 rounded-2xl border bg-white p-6 shadow-sm" style={{ borderColor: '#e2d9cf' }}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: '#fa6b04' }}>Secure Quote Form</p>
            <h1 className="mt-2 text-2xl font-semibold" style={{ color: '#1e3a2f' }}>{rfq.title}</h1>
            <p className="mt-1 text-sm" style={{ color: '#4a6358' }}>{projectName}</p>
          </div>
          <div className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: '#e2d9cf', background: '#ede8e2', color: '#4a6358' }}>
            <p>Invited email: <span className="font-medium" style={{ color: '#1e3a2f' }}>{vendorEmail}</span></p>
            {rfq.bid_deadline ? <p className="mt-1">Deadline: <span className="font-medium" style={{ color: '#1e3a2f' }}>{rfq.bid_deadline}</span></p> : null}
          </div>
        </div>
      </div>

      <div className="mb-6 rounded-2xl border p-5 shadow-sm" style={{ borderColor: '#fdc89a', background: '#fff3eb' }}>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: '#fa6b04' }}>Messages</p>
            <h2 className="mt-1 text-lg font-semibold" style={{ color: '#1e3a2f' }}>Conversation with the contractor</h2>
          </div>
          <p className="text-xs" style={{ color: '#a85c2a' }}>Replies stay attached to this quote request.</p>
        </div>
        <div className="mt-4 space-y-3">
          {messages.length === 0 ? (
            <div className="rounded-lg border border-dashed bg-white px-4 py-6 text-center" style={{ borderColor: '#fdc89a' }}>
              <p className="text-sm font-medium" style={{ color: '#4a6358' }}>No messages yet.</p>
            </div>
          ) : (
            messages.map((message) => {
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
            })
          )}
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
              placeholder="Reply to the contractor..."
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

      {(rfq.request_type === 'rfp' || rfq.attachment_urls?.length || rfq.ai_spec_assistant?.summary) && (
        <div className="mb-6 grid gap-4">
          {rfq.request_type === 'rfp' && rfq.rfp_details && (
            <div className="rounded-2xl border bg-white p-6 shadow-sm" style={{ borderColor: '#e2d9cf' }}>
              <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: '#8a9e96' }}>RFP Brief</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {rfq.rfp_details.procurement_objective ? <p className="text-sm" style={{ color: '#4a6358' }}><span className="font-semibold" style={{ color: '#1e3a2f' }}>Objective:</span> {rfq.rfp_details.procurement_objective}</p> : null}
                {rfq.rfp_details.scope_summary ? <p className="text-sm" style={{ color: '#4a6358' }}><span className="font-semibold" style={{ color: '#1e3a2f' }}>Scope:</span> {rfq.rfp_details.scope_summary}</p> : null}
                {rfq.rfp_details.performance_requirements ? <p className="text-sm" style={{ color: '#4a6358' }}><span className="font-semibold" style={{ color: '#1e3a2f' }}>Performance:</span> {rfq.rfp_details.performance_requirements}</p> : null}
                {rfq.rfp_details.approved_alternates ? <p className="text-sm" style={{ color: '#4a6358' }}><span className="font-semibold" style={{ color: '#1e3a2f' }}>Alternates:</span> {rfq.rfp_details.approved_alternates}</p> : null}
                {rfq.rfp_details.delivery_logistics ? <p className="text-sm" style={{ color: '#4a6358' }}><span className="font-semibold" style={{ color: '#1e3a2f' }}>Logistics:</span> {rfq.rfp_details.delivery_logistics}</p> : null}
                {rfq.rfp_details.delivery_window ? <p className="text-sm" style={{ color: '#4a6358' }}><span className="font-semibold" style={{ color: '#1e3a2f' }}>Delivery Window:</span> {rfq.rfp_details.delivery_window}</p> : null}
                {rfq.rfp_details.submittals_required ? <p className="text-sm" style={{ color: '#4a6358' }}><span className="font-semibold" style={{ color: '#1e3a2f' }}>Submittals:</span> {rfq.rfp_details.submittals_required}</p> : null}
                {rfq.rfp_details.vendor_questions_requested ? <p className="text-sm" style={{ color: '#4a6358' }}><span className="font-semibold" style={{ color: '#1e3a2f' }}>Vendor Questions:</span> {rfq.rfp_details.vendor_questions_requested}</p> : null}
                {rfq.rfp_details.vendor_guidance_requested ? <p className="text-sm" style={{ color: '#4a6358' }}><span className="font-semibold" style={{ color: '#1e3a2f' }}>Guidance Requested:</span> {rfq.rfp_details.vendor_guidance_requested}</p> : null}
                {rfq.rfp_details.attachments_summary ? <p className="text-sm" style={{ color: '#4a6358' }}><span className="font-semibold" style={{ color: '#1e3a2f' }}>Attachments Summary:</span> {rfq.rfp_details.attachments_summary}</p> : null}
              </div>
            </div>
          )}

          {rfq.ai_spec_assistant?.summary ? (
            <div className="rounded-2xl border p-5 text-sm shadow-sm" style={{ borderColor: '#a8d5ba', background: '#e8f4ee', color: '#1e3a2f' }}>
              <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: '#2d6a4f' }}>AI Spec Answer</p>
              <p className="mt-2">{rfq.ai_spec_assistant.summary}</p>
            </div>
          ) : null}

          {rfq.attachment_urls?.length ? (
            <div className="rounded-2xl border bg-white p-5 shadow-sm" style={{ borderColor: '#e2d9cf' }}>
              <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: '#8a9e96' }}>Reference Files</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {rfq.attachment_urls.map((url) => {
                  const filename = decodeURIComponent((url.split('/').pop() ?? url).replace(/^\d+-/, ''))
                  return (
                    <a
                      key={url}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full border px-3 py-1 text-xs font-medium transition-colors"
                      style={{ borderColor: '#e2d9cf', background: '#ede8e2', color: '#4a6358' }}
                    >
                      {filename}
                    </a>
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>
      )}

      <div className="mb-6 rounded-2xl border bg-white p-6 shadow-sm" style={{ borderColor: '#e2d9cf' }}>
        <h2 className="mb-3 text-base font-semibold" style={{ color: '#1e3a2f' }}>Commercial Terms</h2>
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

      <div className="mb-6 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: '#fdc89a', background: '#fff3eb', color: '#a85c2a' }}>
        {isPreview ? (
          <>
            Preview mode. Contractors see this as a simulation of the vendor experience for <span className="font-semibold">{vendorEmail}</span>.
          </>
        ) : (
          <>
            This secure link is tied to <span className="font-semibold">{vendorEmail}</span>. You can reopen it and update your quote until the RFQ deadline.
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
            <span className="mb-1 block text-xs font-medium" style={{ color: '#4a6358' }}>Designer Name</span>
            <input
              type="text"
              value={designerName}
              onChange={(e) => setDesignerName(e.target.value)}
              placeholder="Estimator or designer preparing this quote"
              className={fieldClass}
              style={{ ...fieldStyle, ...fieldFocusStyle }}
            />
          </label>
        </div>
      </div>

      <div className="space-y-4">
        <LineItemsWorkbook rfq={rfq} bids={bids} updateBid={updateBid} />
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
