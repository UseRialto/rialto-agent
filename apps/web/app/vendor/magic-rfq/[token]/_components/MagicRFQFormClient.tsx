'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { submitMagicRFQMessageAction } from '@/lib/actions/vendor'
import { uploadRequestAttachmentFile, type ClientUploadedFileResult } from '@/lib/files/blob-client-upload'
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
  quoted_unit: string
  units_available: string
  unit_price: string
  total_price: string
  lead_time_days: string
  delivery_terms: string
  substitution_notes: string
  substitution_difference: string
  substitution_attachments: ClientUploadedFileResult[]
  quoted_product_details: string
  response_attributes: Record<string, string>
}

interface MagicRFQAutosaveDraft {
  version: 1
  rfqId: string
  vendorEmail: string
  savedAt: string
  vendorName: string
  designerName: string
  overallNotes: string
  terms: BidTerms
  complianceCodes: string[]
  bids: LineItemBid[]
}

interface MagicRFQSubmitResult {
  success: boolean
  error?: string
  submittedAt?: string
}

interface MagicRFQSubmissionStatus {
  version: 1
  firstSubmittedAt?: string
  lastSubmittedAt?: string
  hasSubmittedUpdate: boolean
  lastSubmittedSignature?: string
}

const AVAILABILITY_OPTIONS = [
  { value: 'in_stock' as const, label: 'In Stock' },
  { value: 'unavailable' as const, label: 'Unavailable' },
]

const fieldClass = 'w-full rounded-md border bg-white px-3 py-2 text-sm outline-none transition focus:ring-2'
const compactFieldClass = 'w-full rounded-md border bg-white px-2.5 py-1.5 text-sm outline-none transition focus:ring-2'
const fieldStyle = { borderColor: '#c8bdb2', color: '#1e3a2f' }
const fieldFocusStyle = { '--tw-ring-color': '#fdc89a' } as React.CSSProperties
const SUBSTITUTION_ATTACHMENTS_KEY = 'substitution_attachments'
const MAGIC_RFQ_AUTOSAVE_VERSION = 1

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

function parseSubstitutionAttachments(values: Record<string, string>): ClientUploadedFileResult[] {
  const raw = values[SUBSTITUTION_ATTACHMENTS_KEY]
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as ClientUploadedFileResult[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter((entry) => entry && typeof entry.url === 'string' && typeof entry.filename === 'string')
  } catch {
    return []
  }
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
      label: titleCaseLabel(field.label),
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

function makeSubmissionResponseAttributes(fields: CustomLineItemFieldDefinition[], bid: LineItemBid): ProcurementLineItemAttribute[] {
  const attrs = makeResponseAttributes(fields, bid.response_attributes)
  if (bid.is_alternate && bid.substitution_attachments.length > 0) {
    attrs.push({
      key: SUBSTITUTION_ATTACHMENTS_KEY,
      label: 'Substitution Attachments',
      value: JSON.stringify(bid.substitution_attachments),
      inputType: 'text',
      source: 'user',
      order: 10_000,
    })
  }
  return attrs
}

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

function moneyDisplay(value: string) {
  const n = parseFloat(value)
  if (!Number.isFinite(n)) return '-'
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function calculateQuotedTotalPrice(quantity: string, unitPrice: string) {
  const parsedQuantity = parseFloat(quantity)
  const parsedUnitPrice = parseFloat(unitPrice)
  if (!Number.isFinite(parsedQuantity) || !Number.isFinite(parsedUnitPrice)) return ''
  return (parsedQuantity * parsedUnitPrice).toFixed(2)
}

function hasPositiveUnitPrice(bid: LineItemBid) {
  const unitPrice = parseFloat(bid.unit_price)
  return Number.isFinite(unitPrice) && unitPrice > 0
}

function hasPositiveLeadTime(bid: LineItemBid) {
  const leadTime = parseFloat(bid.lead_time_days)
  return Number.isFinite(leadTime) && leadTime > 0
}

function formatSubmittedDateTime(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function sortedRecord(value: Record<string, string>) {
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
}

function makeMagicRFQDraftSignature(params: {
  vendorName: string
  designerName: string
  overallNotes: string
  terms: BidTerms
  complianceCodes: string[]
  bids: LineItemBid[]
}) {
  return JSON.stringify({
    vendorName: params.vendorName,
    designerName: params.designerName,
    overallNotes: params.overallNotes,
    terms: params.terms,
    complianceCodes: params.complianceCodes.slice().sort(),
    bids: params.bids.map((bid) => ({
      ...bid,
      response_attributes: sortedRecord(bid.response_attributes),
    })),
  })
}

function magicRFQAutosaveKey(token: string, rfqId: string, vendorEmail: string) {
  return `rialto:magic-rfq-autosave:${rfqId}:${vendorEmail}:${token}`
}

function magicRFQSubmissionStatusKey(token: string, rfqId: string, vendorEmail: string) {
  return `rialto:magic-rfq-submission:${rfqId}:${vendorEmail}:${token}`
}

function readMagicRFQAutosave(key: string): MagicRFQAutosaveDraft | null {
  if (!key || typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<MagicRFQAutosaveDraft>
    if (parsed.version !== MAGIC_RFQ_AUTOSAVE_VERSION || !Array.isArray(parsed.bids)) return null
    return parsed as MagicRFQAutosaveDraft
  } catch {
    return null
  }
}

function writeMagicRFQAutosave(key: string, draft: MagicRFQAutosaveDraft) {
  if (!key || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(draft))
  } catch {
    // Autosave is a convenience only; storage limits or private mode should not block quoting.
  }
}

function clearMagicRFQAutosave(key: string) {
  if (!key || typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(key)
  } catch {
    // Ignore local storage cleanup failures.
  }
}

function readMagicRFQSubmissionStatus(key: string): MagicRFQSubmissionStatus | null {
  if (!key || typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<MagicRFQSubmissionStatus>
    if (parsed.version !== MAGIC_RFQ_AUTOSAVE_VERSION) return null
    return {
      version: MAGIC_RFQ_AUTOSAVE_VERSION,
      firstSubmittedAt: parsed.firstSubmittedAt,
      lastSubmittedAt: parsed.lastSubmittedAt,
      hasSubmittedUpdate: Boolean(parsed.hasSubmittedUpdate),
      lastSubmittedSignature: parsed.lastSubmittedSignature,
    }
  } catch {
    return null
  }
}

function writeMagicRFQSubmissionStatus(key: string, status: MagicRFQSubmissionStatus) {
  if (!key || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(status))
  } catch {
    // Submission history improves the local confirmation message but is not required for quoting.
  }
}

function mergeAutosavedBids(baseBids: LineItemBid[], autosavedBids?: LineItemBid[]) {
  if (!autosavedBids?.length) return baseBids
  const autosavedByLineItem = new Map(autosavedBids.map((bid) => [bid.line_item_id, bid]))
  return baseBids.map((baseBid) => {
    const autosavedBid = autosavedByLineItem.get(baseBid.line_item_id)
    if (!autosavedBid) return baseBid
    return {
      ...baseBid,
      ...autosavedBid,
      line_item_id: baseBid.line_item_id,
      response_attributes: autosavedBid.response_attributes && typeof autosavedBid.response_attributes === 'object'
        ? autosavedBid.response_attributes
        : baseBid.response_attributes,
      substitution_attachments: Array.isArray(autosavedBid.substitution_attachments)
        ? autosavedBid.substitution_attachments
        : baseBid.substitution_attachments,
    }
  })
}

function titleCaseLabel(value: string) {
  const acronyms = new Set(['SKU', 'USD', 'RFQ', 'RFP', 'ID', 'URL', 'PDF', 'GC', 'HVAC', 'EMT'])
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\b[A-Za-z]+\b/g, (word) => {
      const upperWord = word.toUpperCase()
      return acronyms.has(upperWord) ? upperWord : word
    })
}

function isBuiltInMaterialAttribute(attribute: ProcurementLineItemAttribute) {
  const normalized = `${attribute.key} ${attribute.label}`.toLowerCase().replace(/[_/-]+/g, ' ')
  return [
    'spec',
    'certification',
    'note',
    'target budget',
    'suggested lead',
  ].some((token) => normalized.includes(token))
}

function emptySubstitutionFields(): Partial<LineItemBid> {
  return {
    is_alternate: false,
    alternate_description: '',
    vendor_sku: '',
    substitution_difference: '',
    substitution_notes: '',
    substitution_attachments: [],
    total_price: '',
    quoted_product_details: '',
    quoted_unit: '',
  }
}

function defaultBids(rfq: ContractorRFQ, existingBid: ContractorBid | null): LineItemBid[] {
  return rfq.line_items.map((item) => {
    const response = existingBid?.line_item_responses.find((entry) => entry.line_item_id === item.id)
    const responseIsAlternate = Boolean(response?.is_alternate && isProductSpecific(item))
    const responseAttributes = responseAttributeMap(response)
    return {
      line_item_id: item.id,
      vendor_sku: responseIsAlternate ? response?.sku ?? '' : response?.sku && response.sku !== item.sku ? response.sku : '',
      alternate_description: responseIsAlternate ? response?.description ?? '' : '',
      is_alternate: responseIsAlternate,
      availability: response?.availability === 'unavailable' ? 'unavailable' : 'in_stock',
      quoted_quantity: response?.quoted_quantity?.toString() ?? item.quantity.toString(),
      quoted_unit: response?.unit ?? item.unit,
      units_available: response?.units_available?.toString() ?? '',
      unit_price: response?.unit_price?.toString() ?? '',
      total_price: response?.total_price?.toString() ?? '',
      lead_time_days: response?.lead_time_days?.toString() ?? '',
      delivery_terms: response?.delivery_terms ?? '',
      substitution_notes: response?.substitution_notes ?? '',
      substitution_difference: responseIsAlternate ? response?.quoted_product_details ?? '' : '',
      substitution_attachments: responseIsAlternate ? parseSubstitutionAttachments(responseAttributes) : [],
      quoted_product_details: responseIsAlternate ? '' : response?.quoted_product_details ?? '',
      response_attributes: responseAttributes,
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
                {titleCaseLabel(attribute.label)}: {attribute.value}
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
  cellProps,
}: {
  field: CustomLineItemFieldDefinition
  value: string
  onChange: (value: string) => void
  cellProps?: {
    'data-magic-rfq-cell-row': number
    'data-magic-rfq-cell-col': number
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => void
  }
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
        {...cellProps}
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
        {...cellProps}
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
      {...cellProps}
    />
  )
}

function HorizontalScrollShadow({
  children,
  className = '',
  style,
}: {
  children: ReactNode
  className?: string
  style?: React.CSSProperties
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ left: false, right: false })

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return

    function updateEdges() {
      const node = scrollRef.current
      if (!node) return
      const maxScrollLeft = node.scrollWidth - node.clientWidth
      setEdges({
        left: node.scrollLeft > 1,
        right: node.scrollLeft < maxScrollLeft - 1,
      })
    }

    updateEdges()
    element.addEventListener('scroll', updateEdges, { passive: true })
    window.addEventListener('resize', updateEdges)
    return () => {
      element.removeEventListener('scroll', updateEdges)
      window.removeEventListener('resize', updateEdges)
    }
  }, [])

  return (
    <div className="relative min-w-0" style={style}>
      <div ref={scrollRef} className={className}>
        {children}
      </div>
      {edges.left && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 z-10 w-6"
          style={{ boxShadow: 'inset 16px 0 16px -18px rgba(30, 58, 47, 0.55)' }}
        />
      )}
      {edges.right && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 z-10 w-6"
          style={{ boxShadow: 'inset -16px 0 16px -18px rgba(30, 58, 47, 0.55)' }}
        />
      )}
    </div>
  )
}

function SheetHeaderCell({
  label,
  resizeKey,
  onResizeStart,
  leftResizeKey,
  onLeftResizeStart,
  borderColor = '#e2d9cf',
  background = '#ede8e2',
}: {
  label: string
  resizeKey: string
  onResizeStart: (key: string, event: React.MouseEvent<HTMLDivElement>) => void
  leftResizeKey?: string
  onLeftResizeStart?: (key: string, event: React.MouseEvent<HTMLDivElement>) => void
  borderColor?: string
  background?: string
}) {
  return (
    <div
      className="relative flex h-11 items-center truncate whitespace-nowrap border-r px-3"
      style={{ borderColor, background }}
    >
      {titleCaseLabel(label)}
      {leftResizeKey && onLeftResizeStart && (
        <div
          aria-hidden="true"
          onMouseDown={(event) => onLeftResizeStart(leftResizeKey, event)}
          className="absolute left-0 top-0 h-full w-2 cursor-col-resize"
          style={{ transform: 'translateX(-50%)' }}
        />
      )}
      <div
        aria-hidden="true"
        onMouseDown={(event) => onResizeStart(resizeKey, event)}
        className="absolute right-0 top-0 h-full w-2 cursor-col-resize"
        style={{ transform: 'translateX(50%)' }}
      />
    </div>
  )
}

function SubstitutionModal({
  item,
  bid,
  uploadFolder,
  onClose,
  onConfirm,
  onRemove,
}: {
  item: ContractorRFQLineItem
  bid: LineItemBid
  uploadFolder: string
  onClose: () => void
  onConfirm: (partial: Partial<LineItemBid>) => void
  onRemove: () => void
}) {
  const [draft, setDraft] = useState<LineItemBid>(() => ({
    ...bid,
    quoted_quantity: bid.quoted_quantity || item.quantity.toString(),
    quoted_unit: bid.quoted_unit || item.unit,
  }))
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const calculatedTotalPrice = calculateQuotedTotalPrice(draft.quoted_quantity, draft.unit_price)
  const canConfirm = Boolean(
    draft.alternate_description.trim() &&
    draft.quoted_quantity.trim() &&
    draft.quoted_unit.trim() &&
    draft.unit_price.trim() &&
    calculatedTotalPrice &&
    draft.lead_time_days.trim(),
  )

  function setDraftValue(partial: Partial<LineItemBid>) {
    setDraft((prev) => ({ ...prev, ...partial }))
  }

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return
    setUploading(true)
    setError('')
    try {
      const uploaded = await Promise.all(Array.from(files).map((file) => uploadRequestAttachmentFile(file, uploadFolder)))
      setDraft((prev) => ({ ...prev, substitution_attachments: [...prev.substitution_attachments, ...uploaded] }))
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Failed to upload attachment.')
    } finally {
      setUploading(false)
    }
  }

  function confirm() {
    if (!canConfirm) {
      setError('Alternate item, quantity, unit, unit price, and lead time are required.')
      return
    }
    onConfirm({
      is_alternate: true,
      availability: 'in_stock',
      alternate_description: draft.alternate_description,
      vendor_sku: '',
      substitution_difference: draft.substitution_difference,
      substitution_notes: draft.substitution_difference,
      substitution_attachments: draft.substitution_attachments,
      unit_price: draft.unit_price,
      total_price: calculatedTotalPrice,
      lead_time_days: draft.lead_time_days,
      quoted_quantity: draft.quoted_quantity || item.quantity.toString(),
      quoted_unit: draft.quoted_unit || item.unit,
      quoted_product_details: '',
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border bg-white shadow-2xl" style={{ borderColor: '#e2d9cf' }}>
        <div className="flex items-start justify-between gap-4 border-b px-6 py-5" style={{ borderColor: '#e2d9cf', background: '#f8faf9' }}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: '#fa6b04' }}>Substitution</p>
            <h3 className="mt-1 text-xl font-semibold" style={{ color: '#1e3a2f', fontFamily: 'var(--font-lora, Georgia, serif)' }}>
              Provide alternate item
            </h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-md border bg-white px-3 py-1.5 text-xs font-semibold" style={{ borderColor: '#e2d9cf', color: '#4a6358' }}>
            Close
          </button>
        </div>

        <div className="grid min-h-0 flex-1 overflow-auto lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <section className="border-b p-6 lg:border-b-0 lg:border-r" style={{ borderColor: '#e2d9cf', background: '#fbf8f5' }}>
            <h4 className="text-sm font-bold" style={{ color: '#1e3a2f' }}>Original requested material</h4>
            <div className="mt-4 rounded-xl border bg-white p-4" style={{ borderColor: '#e2d9cf' }}>
              <p className="text-sm font-semibold" style={{ color: '#1e3a2f' }}>{item.sku || item.description || '-'}</p>
              {item.sku && item.description ? <p className="mt-1 text-sm" style={{ color: '#4a6358' }}>{item.description}</p> : null}
              <div className="mt-4 space-y-2 text-sm" style={{ color: '#4a6358' }}>
                <p>
                  <span className="font-bold" style={{ color: '#1e3a2f' }}>Quantity:</span>{' '}
                  {item.quantity.toLocaleString()} {item.unit}
                </p>
                {item.specs && (
                  <p><span className="font-bold" style={{ color: '#1e3a2f' }}>Specs:</span> {item.specs}</p>
                )}
                {item.certifications?.length ? (
                  <p><span className="font-bold" style={{ color: '#1e3a2f' }}>Certifications:</span> {item.certifications.join(', ')}</p>
                ) : null}
                {item.notes && (
                  <p><span className="font-bold" style={{ color: '#1e3a2f' }}>Notes:</span> {item.notes}</p>
                )}
                {item.contractor_budget != null && (
                  <p><span className="font-bold" style={{ color: '#1e3a2f' }}>Target Budget:</span> ${item.contractor_budget.toLocaleString()}</p>
                )}
                {item.suggested_lead_time_days != null && (
                  <p><span className="font-bold" style={{ color: '#1e3a2f' }}>Suggested Lead Time Days:</span> {item.suggested_lead_time_days}</p>
                )}
                {(item.attributes ?? []).filter((attribute) => attribute.value && !isBuiltInMaterialAttribute(attribute)).map((attribute) => (
                  <p key={attribute.key}>
                    <span className="font-bold" style={{ color: '#1e3a2f' }}>{titleCaseLabel(attribute.label)}:</span> {attribute.value}
                  </p>
                ))}
              </div>
            </div>
          </section>

          <section className="space-y-4 p-6">
            {error && (
              <div className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: '#f5c6c6', background: '#fdeaea', color: '#c0392b' }}>
                {error}
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="sm:col-span-2">
                <span className="mb-1 block text-xs font-semibold" style={{ color: '#4a6358' }}>Alternate Item</span>
                <input
                  value={draft.alternate_description}
                  onChange={(event) => setDraftValue({ alternate_description: event.target.value })}
                  placeholder="Item Description/Manufacturer/SKU"
                  className={fieldClass}
                  style={{ ...fieldStyle, ...fieldFocusStyle }}
                />
              </label>
              <label>
                <span className="mb-1 block text-xs font-semibold" style={{ color: '#4a6358' }}>Quantity</span>
                <input type="number" min={0} step="0.01" value={draft.quoted_quantity} onChange={(event) => setDraftValue({ quoted_quantity: event.target.value })} className={fieldClass} style={{ ...fieldStyle, ...fieldFocusStyle }} />
              </label>
              <label>
                <span className="mb-1 block text-xs font-semibold" style={{ color: '#4a6358' }}>Units</span>
                <input value={draft.quoted_unit} onChange={(event) => setDraftValue({ quoted_unit: event.target.value })} className={fieldClass} style={{ ...fieldStyle, ...fieldFocusStyle }} />
              </label>
              <label>
                <span className="mb-1 block text-xs font-semibold" style={{ color: '#4a6358' }}>Unit Price</span>
                <input inputMode="decimal" value={formatCurrencyInput(draft.unit_price)} onChange={(event) => setDraftValue({ unit_price: parseCurrencyInput(event.target.value) })} className={fieldClass} style={{ ...fieldStyle, ...fieldFocusStyle }} />
              </label>
              <div>
                <span className="mb-1 block text-xs font-semibold" style={{ color: '#4a6358' }}>Total Price</span>
                <div className="rounded-md border bg-white px-3 py-2 text-sm font-semibold" style={{ borderColor: '#c8bdb2', color: '#1e3a2f' }}>
                  {calculatedTotalPrice ? formatCurrencyInput(calculatedTotalPrice) : '-'}
                </div>
                <p className="mt-1 text-[11px]" style={{ color: '#8a9e96' }}>Quantity x unit price</p>
              </div>
              <label>
                <span className="mb-1 block text-xs font-semibold" style={{ color: '#4a6358' }}>Lead Time</span>
                <input type="number" min={1} value={draft.lead_time_days} onChange={(event) => setDraftValue({ lead_time_days: event.target.value })} className={fieldClass} style={{ ...fieldStyle, ...fieldFocusStyle }} />
              </label>
              <label className="sm:col-span-2">
                <span className="mb-1 block text-xs font-semibold" style={{ color: '#4a6358' }}>Difference/Reason</span>
                <textarea rows={4} value={draft.substitution_difference} onChange={(event) => setDraftValue({ substitution_difference: event.target.value, substitution_notes: event.target.value })} className={fieldClass} style={{ ...fieldStyle, ...fieldFocusStyle }} />
              </label>
            </div>

            <div className="rounded-xl border p-4" style={{ borderColor: '#e2d9cf', background: '#fbf8f5' }}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold" style={{ color: '#1e3a2f' }}>Attachments</p>
                  <p className="text-xs" style={{ color: '#8a9e96' }}>Upload spec sheets, product data, or other support.</p>
                </div>
                <label className="cursor-pointer rounded-md border bg-white px-3 py-2 text-xs font-semibold" style={{ borderColor: '#fdc89a', color: '#a85c2a' }}>
                  {uploading ? 'Uploading...' : 'Add files'}
                  <input type="file" multiple disabled={uploading} className="sr-only" onChange={(event) => { void uploadFiles(event.target.files); event.target.value = '' }} />
                </label>
              </div>
              {draft.substitution_attachments.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {draft.substitution_attachments.map((attachment) => (
                    <span key={attachment.url} className="inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1 text-xs font-medium" style={{ borderColor: '#e2d9cf', color: '#4a6358' }}>
                      <a href={attachment.url} target="_blank" rel="noreferrer" className="max-w-[14rem] truncate">{attachment.filename}</a>
                      <button type="button" onClick={() => setDraftValue({ substitution_attachments: draft.substitution_attachments.filter((entry) => entry.url !== attachment.url) })} className="font-bold" style={{ color: '#a85c2a' }}>
                        x
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-6 py-4" style={{ borderColor: '#e2d9cf', background: '#f8faf9' }}>
          <button type="button" onClick={onRemove} className="rounded-md border bg-white px-4 py-2 text-sm font-semibold" style={{ borderColor: '#f5c6c6', color: '#c0392b' }}>
            Remove substitution
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-md border bg-white px-4 py-2 text-sm font-medium" style={{ borderColor: '#e2d9cf', color: '#4a6358' }}>
              Cancel
            </button>
            <button type="button" onClick={confirm} disabled={!canConfirm || uploading} className="rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" style={{ background: '#fa6b04' }}>
              Confirm substitution
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function LineItemsWorkbook({
  rfq,
  bids,
  updateBid,
  uploadFolder,
  pricingIssueLineItemIds,
}: {
  rfq: ContractorRFQ
  bids: LineItemBid[]
  updateBid: (id: string, partial: Partial<LineItemBid>) => void
  uploadFolder: string
  pricingIssueLineItemIds: Set<string>
}) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const vendorResponseFields = visibleVendorResponseFields(rfq)
  const requestAttributeColumns = rfq.line_items
    .flatMap((item) => item.attributes ?? [])
    .filter((attribute, index, attributes) => (
      attribute.visible !== false && attributes.findIndex((entry) => entry.key === attribute.key) === index
    ))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const requestPinnedColumns = [
    { key: 'request:item', label: 'Item Description or SKU', width: 236, minWidth: 24 },
    { key: 'request:qty', label: 'Qty', width: 72, minWidth: 24 },
    { key: 'request:unit', label: 'Units', width: 62, minWidth: 24 },
  ]
  const detailColumns = [
    ...requestAttributeColumns.map((attribute) => ({
      key: `detail:${attribute.key}`,
      label: titleCaseLabel(attribute.label),
      width: 170,
      minWidth: 24,
      attribute,
    })),
    { key: 'detail:notes', label: 'Notes / Specs', width: 280, minWidth: 24 },
  ]
  const responseColumns = [
    { key: 'response:unit-price', label: 'Unit Price', width: 104, minWidth: 24 },
    { key: 'response:total-price', label: 'Total Price', width: 124, minWidth: 24 },
    { key: 'response:lead-time', label: 'Lead Time', width: 96, minWidth: 24 },
    ...vendorResponseFields.map((field) => ({
      key: `response:${field.key}`,
      label: titleCaseLabel(field.label),
      width: 112,
      minWidth: 24,
      field,
    })),
    { key: 'response:substitution', label: 'Provide Substitution', width: 156, minWidth: 24 },
  ]
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({})
  const [vendorPaneWidthOverride, setVendorPaneWidthOverride] = useState<number | null>(null)
  const [substitutionLineItemId, setSubstitutionLineItemId] = useState<string | null>(null)
  const columnWidth = (key: string, fallback: number) => columnWidths[key] ?? fallback
  const requestPinnedGridTemplateColumns = requestPinnedColumns.map((col) => `${columnWidth(col.key, col.width)}px`).join(' ')
  const requestDetailsGridTemplateColumns = detailColumns.map((col) => `${columnWidth(col.key, col.width)}px`).join(' ')
  const requestPinnedWidth = requestPinnedColumns.reduce((sum, col) => sum + columnWidth(col.key, col.width), 0)
  const requestDetailsWidth = detailColumns.reduce((sum, col) => sum + columnWidth(col.key, col.width), 0)
  const vendorGridTemplateColumns = responseColumns.map((col) => `${columnWidth(col.key, col.width)}px`).join(' ')
  const vendorGridWidth = responseColumns.reduce((sum, col) => sum + columnWidth(col.key, col.width), 0)
  const defaultVendorPaneWidth = 104 + 124 + 96
  const vendorPaneWidth = Math.max(140, Math.min(vendorPaneWidthOverride ?? defaultVendorPaneWidth, Math.max(defaultVendorPaneWidth, vendorGridWidth)))
  const editableVendorColumnCount = 2 + vendorResponseFields.length

  function editableCellProps(rowIndex: number, colIndex: number) {
    return {
      'data-magic-rfq-cell-row': rowIndex,
      'data-magic-rfq-cell-col': colIndex,
      onKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => handleCellKeyDown(event, rowIndex, colIndex),
    }
  }

  function focusEditableCell(rowIndex: number, colIndex: number, options?: { preventScroll?: boolean }) {
    const nextRow = Math.max(0, Math.min(rfq.line_items.length - 1, rowIndex))
    const nextCol = Math.max(0, Math.min(editableVendorColumnCount - 1, colIndex))
    const selector = `[data-magic-rfq-cell-row="${nextRow}"][data-magic-rfq-cell-col="${nextCol}"]`
    const element = sheetRef.current?.querySelector<HTMLInputElement | HTMLSelectElement>(selector)
    if (!element || element.disabled) return
    element.focus({ preventScroll: options?.preventScroll })
    if (element instanceof HTMLInputElement) element.select()
  }

  useEffect(() => {
    const firstIssueRowIndex = rfq.line_items.findIndex((item) => pricingIssueLineItemIds.has(item.id))
    if (firstIssueRowIndex === -1) return

    const scrollFrame = window.requestAnimationFrame(() => {
      const row = sheetRef.current?.querySelector<HTMLElement>(`[data-magic-rfq-pricing-row-index="${firstIssueRowIndex}"]`)
      if (!row) return
      const rowTop = row.getBoundingClientRect().top + window.scrollY
      const targetTop = Math.max(0, rowTop - window.innerHeight * 0.42)
      window.scrollTo({ top: targetTop, behavior: 'smooth' })
    })

    const focusTimer = window.setTimeout(() => {
      const selector = `[data-magic-rfq-cell-row="${firstIssueRowIndex}"][data-magic-rfq-cell-col="0"]`
      const element = sheetRef.current?.querySelector<HTMLInputElement | HTMLSelectElement>(selector)
      if (!element || element.disabled) return
      element.focus({ preventScroll: true })
      if (element instanceof HTMLInputElement) element.select()
    }, 450)

    return () => {
      window.cancelAnimationFrame(scrollFrame)
      window.clearTimeout(focusTimer)
    }
  }, [pricingIssueLineItemIds, rfq.line_items])

  function handleCellKeyDown(event: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>, rowIndex: number, colIndex: number) {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return
    event.preventDefault()
    if (event.key === 'ArrowUp') focusEditableCell(rowIndex - 1, colIndex)
    if (event.key === 'ArrowDown') focusEditableCell(rowIndex + 1, colIndex)
    if (event.key === 'ArrowLeft') focusEditableCell(rowIndex, colIndex - 1)
    if (event.key === 'ArrowRight') focusEditableCell(rowIndex, colIndex + 1)
  }

  function startColumnResize(key: string, event: React.MouseEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()
    const allColumns = [...requestPinnedColumns, ...detailColumns, ...responseColumns]
    const column = allColumns.find((entry) => entry.key === key)
    if (!column) return
    const startX = event.clientX
    const startWidth = columnWidth(key, column.width)
    const minWidth = column.minWidth
    function onMove(moveEvent: MouseEvent) {
      const nextWidth = Math.max(minWidth, startWidth + moveEvent.clientX - startX)
      setColumnWidths((prev) => ({ ...prev, [key]: nextWidth }))
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function startColumnResizeFromLeft(key: string, event: React.MouseEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()
    const column = responseColumns.find((entry) => entry.key === key)
    if (!column) return
    const startX = event.clientX
    const startWidth = columnWidth(key, column.width)
    const minWidth = column.minWidth
    function onMove(moveEvent: MouseEvent) {
      const nextWidth = Math.max(minWidth, startWidth - (moveEvent.clientX - startX))
      setColumnWidths((prev) => ({ ...prev, [key]: nextWidth }))
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function startVendorPaneResize(event: React.MouseEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startWidth = vendorPaneWidth
    const maxWidth = Math.max(defaultVendorPaneWidth, vendorGridWidth)
    function onMove(moveEvent: MouseEvent) {
      const nextWidth = Math.max(140, Math.min(maxWidth, startWidth - (moveEvent.clientX - startX)))
      setVendorPaneWidthOverride(nextWidth)
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function updateResponseAttribute(bid: LineItemBid, key: string, value: string) {
    updateBid(bid.line_item_id, {
      response_attributes: {
        ...bid.response_attributes,
        [key]: value,
      },
    })
  }

  function removeSubstitution(id: string) {
    updateBid(id, emptySubstitutionFields())
    setSubstitutionLineItemId(null)
  }

  const substitutionItem = substitutionLineItemId ? rfq.line_items.find((item) => item.id === substitutionLineItemId) : undefined
  const substitutionBid = substitutionLineItemId ? bids.find((bid) => bid.line_item_id === substitutionLineItemId) : undefined

  return (
    <>
    <div ref={sheetRef} className="overflow-hidden rounded-2xl border bg-white shadow-sm" style={{ borderColor: '#e2d9cf' }}>
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
                {requestPinnedColumns.map((column) => (
                  <SheetHeaderCell
                    key={column.key}
                    label={column.label}
                    resizeKey={column.key}
                    onResizeStart={startColumnResize}
                  />
                ))}
              </div>

              {rfq.line_items.map((item, index) => {
                const bid = bids.find((entry) => entry.line_item_id === item.id) ?? bids[index]!
                const originalTextStyle = bid.is_alternate ? { color: '#8a9e96', textDecoration: 'line-through' } : { color: '#1e3a2f' }
                return (
                  <div key={`${item.id}-request-pinned-rows`}>
                    <div
                      className="grid h-16 items-stretch gap-0 border-b"
                      style={{ gridTemplateColumns: requestPinnedGridTemplateColumns, borderColor: '#f0ebe6', background: bid.is_alternate ? '#f8faf9' : '#ffffff' }}
                    >
                      <div className="overflow-hidden border-r p-1.5" style={{ borderColor: '#f0ebe6' }}>
                        <div className="px-2 py-1.5 text-sm" style={originalTextStyle}>
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
                      <div className="overflow-hidden border-r p-1.5" style={{ borderColor: '#f0ebe6' }}>
                        <div className="px-2 py-1.5 text-sm" style={originalTextStyle}>{item.quantity.toLocaleString()}</div>
                      </div>
                      <div className="overflow-hidden border-r p-1.5" style={{ borderColor: '#f0ebe6' }}>
                        <div className="px-2 py-1.5 text-sm" style={originalTextStyle}>{item.unit}</div>
                      </div>
                    </div>

                    {bid.is_alternate && (
                      <div
                        className="grid h-16 items-stretch gap-0 border-b border-t border-dashed"
                        style={{ gridTemplateColumns: requestPinnedGridTemplateColumns, borderColor: '#fa6b04', background: '#fffaf5' }}
                      >
                        <div className="overflow-hidden border-r p-1.5" style={{ borderColor: '#f2c99d' }}>
                          <button
                            type="button"
                            onClick={() => setSubstitutionLineItemId(item.id)}
                            className="h-full w-full rounded-md border border-dashed px-2 text-left text-sm font-semibold"
                            style={{ background: '#ffffff', borderColor: '#fa6b04', color: '#1e3a2f' }}
                          >
                            <span className="block truncate">{bid.alternate_description || 'Substitution'}</span>
                            {bid.vendor_sku ? <span className="block truncate text-[11px] font-medium" style={{ color: '#8a9e96' }}>{bid.vendor_sku}</span> : null}
                          </button>
                        </div>
                        <div className="overflow-hidden border-r p-1.5" style={{ borderColor: '#f2c99d' }}>
                          <div className="h-full rounded-md border border-dashed px-2 py-4 text-sm" style={{ background: '#ffffff', borderColor: '#fa6b04', color: '#1e3a2f' }}>
                            {(bid.quoted_quantity || item.quantity.toString()).toLocaleString()}
                          </div>
                        </div>
                        <div className="overflow-hidden border-r p-1.5" style={{ borderColor: '#f2c99d' }}>
                          <div className="h-full rounded-md border border-dashed px-2 py-4 text-sm" style={{ background: '#ffffff', borderColor: '#fa6b04', color: '#1e3a2f' }}>
                            {bid.quoted_unit || item.unit}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <HorizontalScrollShadow
              className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              style={{ minWidth: 0 }}
            >
              <div style={{ width: `${requestDetailsWidth}px`, minWidth: '100%' }}>
                <div
                  className="grid items-center gap-0 border-b text-[11px] font-semibold uppercase tracking-wide"
                  style={{ gridTemplateColumns: requestDetailsGridTemplateColumns, background: '#f5f0eb', borderColor: '#e2d9cf', color: '#4a6358' }}
                >
                  {detailColumns.map((column) => (
                    <SheetHeaderCell
                      key={column.key}
                      label={column.label}
                      resizeKey={column.key}
                      onResizeStart={startColumnResize}
                    />
                  ))}
                </div>

                {rfq.line_items.map((item, index) => {
                  const bid = bids.find((entry) => entry.line_item_id === item.id) ?? bids[index]!
                  const attributeByKey = new Map((item.attributes ?? []).map((attribute) => [attribute.key, attribute]))
                  const originalTextStyle = bid.is_alternate ? { color: '#8a9e96', textDecoration: 'line-through' } : { color: '#1e3a2f' }
                  return (
                    <div key={`${item.id}-request-detail-rows`}>
                      <div
                        className="grid h-16 items-stretch gap-0 border-b"
                        style={{ gridTemplateColumns: requestDetailsGridTemplateColumns, borderColor: '#f0ebe6', background: bid.is_alternate ? '#f8faf9' : '#ffffff' }}
                      >
                        {requestAttributeColumns.map((attribute) => (
                          <div key={`${item.id}-request-${attribute.key}`} className="overflow-hidden border-r p-1.5" style={{ borderColor: '#f0ebe6' }}>
                            <div className="truncate px-2 py-1.5 text-sm" style={originalTextStyle}>
                              {attributeByKey.get(attribute.key)?.value || '-'}
                            </div>
                          </div>
                        ))}
                        <div className="overflow-hidden border-r p-1.5" style={{ borderColor: '#f0ebe6' }}>
                          <div className="truncate px-2 py-1.5 text-sm" style={originalTextStyle}>
                            {[item.specs, item.notes, item.certifications?.join(', ')].filter(Boolean).join(' · ') || '-'}
                          </div>
                        </div>
                      </div>

                      {bid.is_alternate && (
                        <div
                          className="grid h-16 items-stretch gap-0 border-b border-t border-dashed"
                          style={{ gridTemplateColumns: requestDetailsGridTemplateColumns, borderColor: '#fa6b04', background: '#fffaf5' }}
                        >
                          <div className="min-w-0 border-r p-1.5" style={{ gridColumn: '1 / -1', borderColor: '#f2c99d' }}>
                            <button
                              type="button"
                              onClick={() => setSubstitutionLineItemId(item.id)}
                              className="h-full w-full rounded-md border border-dashed px-2 text-left text-sm font-semibold"
                              style={{ background: '#ffffff', borderColor: '#fa6b04', color: '#a85c2a' }}
                            >
                              <span className="sticky left-3 inline-flex items-center whitespace-nowrap">
                                See Substitution Details →
                              </span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </HorizontalScrollShadow>
          </div>

          <HorizontalScrollShadow
            className="overflow-x-auto"
            style={{ background: '#fffaf5' }}
          >
            <div
              aria-hidden="true"
              onMouseDown={startVendorPaneResize}
              className="absolute left-0 top-0 z-20 h-full w-2 cursor-col-resize"
              style={{ transform: 'translateX(-50%)' }}
            />
            <div style={{ width: `${vendorGridWidth}px`, minWidth: '100%' }}>
              <div
                className="grid items-center gap-0 border-b text-[11px] font-semibold uppercase tracking-wide"
                style={{ gridTemplateColumns: vendorGridTemplateColumns, borderColor: '#f2c99d', background: '#fff5eb', color: '#8a4615' }}
              >
                {responseColumns.map((column, index) => (
                  <SheetHeaderCell
                    key={column.key}
                    label={column.label}
                    resizeKey={column.key}
                    onResizeStart={startColumnResize}
                    leftResizeKey={index > 0 ? responseColumns[index - 1]?.key : column.key}
                    onLeftResizeStart={index > 0 ? startColumnResize : startColumnResizeFromLeft}
                    borderColor="#f2c99d"
                    background="#fff5eb"
                  />
                ))}
              </div>

              {rfq.line_items.map((item, index) => {
                const bid = bids.find((entry) => entry.line_item_id === item.id) ?? bids[index]!
                const unitPrice = parseFloat(bid.unit_price) || 0
                const quotedQuantity = parseFloat(bid.quoted_quantity) || item.quantity || 0
                const computedTotalPrice = unitPrice * quotedQuantity
                const totalPrice = computedTotalPrice
                const hasRowPricingIssue = pricingIssueLineItemIds.has(item.id)
                const issueRowStyle = hasRowPricingIssue
                  ? { borderColor: '#e49a9a', background: '#f4b4b4' }
                  : { borderColor: '#f0ebe6', background: bid.is_alternate ? '#f8faf9' : '#ffffff' }
                const renderResponseCells = (alternateRow: boolean) => {
                  if (bid.is_alternate && !alternateRow) {
                    return (
                      <>
                        <div className="overflow-hidden border-r p-1.5" style={{ borderColor: '#f0ebe6' }}>
                          <div className="h-full rounded-md px-2 py-4 text-xs font-semibold" style={{ background: '#f8faf9', color: '#8a9e96', textDecoration: 'line-through' }}>
                            Replaced
                          </div>
                        </div>
                        {Array.from({ length: 2 + vendorResponseFields.length }).map((_, cellIndex) => (
                          <div key={`${item.id}-replaced-${cellIndex}`} className="overflow-hidden border-r p-1.5" style={{ borderColor: '#f0ebe6' }}>
                            <div className="h-full rounded-md" style={{ background: '#f8faf9' }} />
                          </div>
                        ))}
                      </>
                    )
                  }
                  const hasPricingIssue = hasRowPricingIssue && !alternateRow
                  const cellBorderColor = hasPricingIssue ? '#d66f6f' : alternateRow ? '#f2c99d' : '#f0ebe6'
                  const unitPriceBorder = hasPricingIssue
                    ? '1.5px solid #c0392b'
                    : alternateRow ? '1px dashed #fa6b04' : '1px solid #e2d9cf'
                  return (
                    <>
                      <div
                        className="overflow-hidden border-r p-1.5"
                        style={{
                          background: hasPricingIssue ? '#f4b4b4' : undefined,
                          borderColor: cellBorderColor,
                        }}
                      >
                        <label className="sr-only">Unit Price</label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={formatCurrencyInput(bid.unit_price)}
                          onChange={(event) => {
                            const nextUnitPrice = parseCurrencyInput(event.target.value)
                            updateBid(item.id, {
                              unit_price: nextUnitPrice,
                              total_price: calculateQuotedTotalPrice(bid.quoted_quantity, nextUnitPrice),
                            })
                          }}
                          className="w-full rounded-md px-2 py-1.5 text-sm focus:outline-none"
                          style={{ background: hasPricingIssue ? '#fff8f8' : '#fbf8f5', border: unitPriceBorder, color: '#1e3a2f' }}
                          {...editableCellProps(index, 0)}
                        />
                      </div>
                      <div className="min-w-0 overflow-hidden border-r p-1.5" style={{ background: hasPricingIssue ? '#f4b4b4' : undefined, borderColor: cellBorderColor }}>
                        <div
                          className="min-w-0 overflow-hidden rounded-md px-2 py-1.5 text-right text-sm font-semibold"
                          style={{ background: hasPricingIssue ? '#fff8f8' : '#fff', border: hasPricingIssue ? '1px solid #c0392b' : alternateRow ? '1px dashed #fa6b04' : '1px solid #f2c99d', color: hasPricingIssue ? '#7f1d1d' : '#8a4615' }}
                        >
                          <span className="block truncate">
                            {bid.unit_price ? `$${totalPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                          </span>
                        </div>
                      </div>
                      <div className="overflow-hidden border-r p-1.5" style={{ background: hasPricingIssue ? '#f4b4b4' : undefined, borderColor: cellBorderColor }}>
                        <label className="sr-only">Lead Time</label>
                        <input
                          type="number"
                          min={1}
                          value={bid.lead_time_days}
                          onChange={(event) => updateBid(item.id, { lead_time_days: event.target.value })}
                          className="w-full rounded-md px-2 py-1.5 text-sm focus:outline-none"
                          style={{ background: hasPricingIssue ? '#fff8f8' : '#fbf8f5', border: hasPricingIssue ? '1px solid #c0392b' : alternateRow ? '1px dashed #fa6b04' : '1px solid #e2d9cf', color: '#1e3a2f' }}
                          {...editableCellProps(index, 1)}
                        />
                      </div>
                      {vendorResponseFields.map((field, fieldIndex) => (
                        <div key={`${item.id}-${alternateRow ? 'alternate' : 'response'}-${field.key}`} className="overflow-hidden border-r p-1.5" style={{ background: hasPricingIssue ? '#f4b4b4' : undefined, borderColor: cellBorderColor }}>
                          <VendorResponseFieldInput
                            field={field}
                            value={bid.response_attributes[field.key] ?? ''}
                            onChange={(value) => updateResponseAttribute(bid, field.key, value)}
                            cellProps={editableCellProps(index, 2 + fieldIndex)}
                          />
                        </div>
                      ))}
                    </>
                  )
                }
                return (
                  <div key={`${item.id}-response-rows`} data-magic-rfq-pricing-row-index={index}>
                    <div
                      className="grid h-16 items-stretch gap-0 border-b"
                      style={{ gridTemplateColumns: vendorGridTemplateColumns, ...issueRowStyle }}
                    >
                      {renderResponseCells(false)}
                      <div className="flex items-center overflow-hidden border-r p-1.5" style={{ background: hasRowPricingIssue ? '#f4b4b4' : undefined, borderColor: hasRowPricingIssue ? '#d66f6f' : '#f0ebe6' }}>
                        <button
                          type="button"
                          onClick={() => setSubstitutionLineItemId(item.id)}
                          className="w-full rounded-md border px-2 py-1.5 text-xs font-semibold leading-tight transition-colors disabled:opacity-60"
                          style={hasRowPricingIssue
                            ? { borderColor: '#c0392b', background: '#fff8f8', color: '#7f1d1d' }
                            : bid.is_alternate
                            ? { borderColor: '#e2d9cf', background: '#ffffff', color: '#4a6358' }
                            : { borderColor: '#fdc89a', background: '#fff3eb', color: '#a85c2a' }}
                        >
                          {bid.is_alternate ? 'Edit substitution' : 'Substitution'}
                        </button>
                      </div>
                    </div>

                    {bid.is_alternate && (
                      <div
                        className="grid h-16 items-stretch gap-0 border-b border-t border-dashed"
                        style={{ gridTemplateColumns: vendorGridTemplateColumns, borderColor: '#fa6b04', background: '#fffaf5' }}
                      >
                        {renderResponseCells(true)}
                        <div className="flex items-center overflow-hidden border-r p-1.5" style={{ borderColor: '#f2c99d' }}>
                          <button
                            type="button"
                            onClick={() => setSubstitutionLineItemId(item.id)}
                            className="w-full rounded-md border px-2 py-1.5 text-xs font-semibold leading-tight"
                            style={{ borderColor: '#fdc89a', background: '#ffffff', color: '#a85c2a' }}
                          >
                            Substitution details
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </HorizontalScrollShadow>
        </div>
      </div>
    </div>
    {substitutionItem && substitutionBid && (
      <SubstitutionModal
        item={substitutionItem}
        bid={substitutionBid}
        uploadFolder={`${uploadFolder}/${substitutionItem.id}`}
        onClose={() => setSubstitutionLineItemId(null)}
        onConfirm={(partial) => {
          updateBid(substitutionItem.id, partial)
          setSubstitutionLineItemId(null)
        }}
        onRemove={() => removeSubstitution(substitutionItem.id)}
      />
    )}
    </>
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
  const initialSubmittedAt = existingBid?.submitted_at ?? submittedAt
  const autosaveKey = isPreview ? '' : magicRFQAutosaveKey(props.token, rfq.id, vendorEmail)
  const submissionStatusKey = isPreview ? '' : magicRFQSubmissionStatusKey(props.token, rfq.id, vendorEmail)
  const initialVendorNameValue = existingBid?.vendor_name ?? ''
  const initialDesignerNameValue = existingBid?.designer_name ?? initialVendorName
  const initialOverallNotesValue = existingBid?.notes ?? ''
  const initialTermsValue = existingBid?.terms ?? {}
  const initialComplianceCodesValue = (
    (existingBid?.compliance_declarations ?? [])
      .filter((entry) => entry.status === 'verified' || entry.status === 'self_reported')
      .map((entry) => entry.code)
  )
  const initialBidsValue = defaultBids(rfq, existingBid)
  const initialDraftSignature = makeMagicRFQDraftSignature({
    vendorName: initialVendorNameValue,
    designerName: initialDesignerNameValue,
    overallNotes: initialOverallNotesValue,
    terms: initialTermsValue,
    complianceCodes: initialComplianceCodesValue,
    bids: initialBidsValue,
  })
  const [vendorName, setVendorName] = useState(initialVendorNameValue)
  const [designerName, setDesignerName] = useState(initialDesignerNameValue)
  const [overallNotes, setOverallNotes] = useState(initialOverallNotesValue)
  const [terms, setTerms] = useState<BidTerms>(initialTermsValue)
  const [complianceCodes, setComplianceCodes] = useState<string[]>(initialComplianceCodesValue)
  const [bids, setBids] = useState<LineItemBid[]>(initialBidsValue)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(Boolean(submittedAt))
  const [firstSubmittedAt, setFirstSubmittedAt] = useState(initialSubmittedAt)
  const [lastSubmittedAt, setLastSubmittedAt] = useState(submittedAt ?? existingBid?.submitted_at)
  const [hasSubmittedUpdate, setHasSubmittedUpdate] = useState(false)
  const [lastSubmittedSignature, setLastSubmittedSignature] = useState(initialSubmittedAt ? initialDraftSignature : '')
  const [submitSuccessVisible, setSubmitSuccessVisible] = useState(false)
  const [error, setError] = useState('')
  const [pricingIssueLineItemIds, setPricingIssueLineItemIds] = useState<Set<string>>(() => new Set())
  const [messages, setMessages] = useState<NegotiationMessage[]>(initialMessages)
  const [messageDraft, setMessageDraft] = useState('')
  const [sendingMessage, setSendingMessage] = useState(false)
  const [messageError, setMessageError] = useState('')
  const [messageComposerOpen, setMessageComposerOpen] = useState(false)
  const [loadedLocalState, setLoadedLocalState] = useState(false)
  const successRef = useRef<HTMLDivElement>(null)
  const currentDraftSignature = makeMagicRFQDraftSignature({
    vendorName,
    designerName,
    overallNotes,
    terms,
    complianceCodes,
    bids,
  })

  useEffect(() => {
    if (!submitted) return
    setSubmitting(false)
    successRef.current?.focus()
    successRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [submitted])

  useEffect(() => {
    if (!submittedAt) return
    setSubmitted(true)
    setFirstSubmittedAt((prev) => prev ?? submittedAt)
    setLastSubmittedAt(submittedAt)
    setSubmitting(false)
  }, [submittedAt])

  useEffect(() => {
    if (isPreview || loadedLocalState) return
    const savedDraft = readMagicRFQAutosave(autosaveKey)
    if (savedDraft) {
      setVendorName(savedDraft.vendorName)
      setDesignerName(savedDraft.designerName)
      setOverallNotes(savedDraft.overallNotes)
      setTerms(savedDraft.terms)
      setComplianceCodes(savedDraft.complianceCodes)
      setBids(mergeAutosavedBids(defaultBids(rfq, existingBid), savedDraft.bids))
    }

    const savedStatus = readMagicRFQSubmissionStatus(submissionStatusKey)
    if (savedStatus) {
      setFirstSubmittedAt(savedStatus.firstSubmittedAt ?? initialSubmittedAt)
      setLastSubmittedAt(savedStatus.lastSubmittedAt ?? submittedAt ?? existingBid?.submitted_at)
      setHasSubmittedUpdate(savedStatus.hasSubmittedUpdate)
      setLastSubmittedSignature(savedStatus.lastSubmittedSignature ?? (initialSubmittedAt ? initialDraftSignature : ''))
    }
    setLoadedLocalState(true)
  }, [autosaveKey, existingBid, initialDraftSignature, initialSubmittedAt, isPreview, loadedLocalState, rfq, submittedAt, submissionStatusKey])

  useEffect(() => {
    if (!submitSuccessVisible) return
    const timeout = window.setTimeout(() => setSubmitSuccessVisible(false), 1200)
    return () => window.clearTimeout(timeout)
  }, [submitSuccessVisible])

  useEffect(() => {
    if (isPreview || !loadedLocalState) return
    const timeout = window.setTimeout(() => {
      writeMagicRFQAutosave(autosaveKey, {
        version: MAGIC_RFQ_AUTOSAVE_VERSION,
        rfqId: rfq.id,
        vendorEmail,
        savedAt: new Date().toISOString(),
        vendorName,
        designerName,
        overallNotes,
        terms,
        complianceCodes,
        bids,
      })
    }, 500)
    return () => window.clearTimeout(timeout)
  }, [autosaveKey, currentDraftSignature, isPreview, loadedLocalState, rfq.id, vendorEmail])

  function updateBid(id: string, partial: Partial<LineItemBid>) {
    setPricingIssueLineItemIds((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    setBids((prev) => prev.map((entry) => (entry.line_item_id === id ? { ...entry, ...partial } : entry)))
  }

  async function handleSubmit() {
    if (isPreview) return
    const vendorResponseFields = visibleVendorResponseFields(rfq)
    const pricingIssues = bids.filter((bid) => (
      !hasPositiveUnitPrice(bid) &&
      hasPositiveLeadTime(bid)
    ))
    const missingAlternate = bids.some((bid) => {
      if (!bid.is_alternate || bid.availability === 'unavailable') return false
      return !bid.alternate_description.trim() || !bid.quoted_quantity.trim() || !bid.quoted_unit.trim() || !hasPositiveUnitPrice(bid) || !hasPositiveLeadTime(bid)
    })
    if (!vendorName.trim()) {
      setError('Company name is required.')
      return
    }
    if (!designerName.trim()) {
      setError('Responder name is required.')
      return
    }
    if (pricingIssues.length > 0) {
      setPricingIssueLineItemIds(new Set(pricingIssues.map((bid) => bid.line_item_id)))
      setError('Some line items have lead time but no unit price. Add a unit price greater than 0, or clear the lead time to skip quoting that material.')
      return
    }
    setPricingIssueLineItemIds(new Set())
    if (missingAlternate) {
      setError('For substitutions, add an alternate item, quantity, unit, unit price, and lead time.')
      return
    }

    setSubmitting(true)
    setError('')
    const responses = bids.map((bid) => {
      const item = rfq.line_items.find((entry) => entry.id === bid.line_item_id)!
      const hasUnitPrice = hasPositiveUnitPrice(bid)
      const isNoQuote = bid.availability === 'unavailable' || (!bid.is_alternate && !hasUnitPrice && !hasPositiveLeadTime(bid))
      const unitPrice = parseFloat(bid.unit_price) || 0
      const quotedQuantity = parseFloat(bid.quoted_quantity) || item.quantity || 0
      const unitsAvailable = bid.units_available ? parseFloat(bid.units_available) : undefined
      const pricedQuantity = unitsAvailable && unitsAvailable > 0 ? unitsAvailable : quotedQuantity
      const isAlternate = bid.is_alternate && !isNoQuote
      const calculatedAlternateTotalPrice = calculateQuotedTotalPrice(bid.quoted_quantity, bid.unit_price)
      return {
        line_item_id: bid.line_item_id,
        sku: isAlternate ? bid.vendor_sku.trim() : item.sku,
        description: isAlternate && bid.alternate_description.trim() ? bid.alternate_description.trim() : item.description,
        quantity: item.quantity,
        unit: isAlternate && bid.quoted_unit.trim() ? bid.quoted_unit.trim() : item.unit,
        unit_price: unitPrice,
        total_price: isAlternate ? parseFloat(calculatedAlternateTotalPrice) || 0 : unitPrice * pricedQuantity,
        quoted_quantity: quotedQuantity,
        lead_time_days: isNoQuote ? 0 : parseInt(bid.lead_time_days, 10) || 0,
        availability: isNoQuote ? 'unavailable' as const : bid.availability,
        units_available: unitsAvailable,
        delivery_terms: bid.delivery_terms || undefined,
        substitution_notes: isAlternate ? bid.substitution_notes || undefined : undefined,
        quoted_product_details: isAlternate ? bid.substitution_difference || undefined : bid.quoted_product_details || undefined,
        response_attributes: makeSubmissionResponseAttributes(vendorResponseFields, bid),
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

    try {
      const response = await fetch(`/api/magic-rfq/${encodeURIComponent(props.token)}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorName,
          lineItemResponses: responses,
          notes: overallNotes,
          meta: {
            terms,
            complianceDeclarations,
            designerName,
          },
        }),
      })
      const result = await response.json() as MagicRFQSubmitResult
      if (!result.success) {
        setError(result.error ?? 'Failed to submit quote.')
        return
      }
      clearMagicRFQAutosave(autosaveKey)
      const nextSubmittedAt = result.submittedAt ?? new Date().toISOString()
      const wasAlreadySubmitted = submitted
      const nextFirstSubmittedAt = firstSubmittedAt ?? nextSubmittedAt
      const nextHasSubmittedUpdate = wasAlreadySubmitted || hasSubmittedUpdate
      const nextSubmittedSignature = makeMagicRFQDraftSignature({
        vendorName,
        designerName,
        overallNotes,
        terms,
        complianceCodes,
        bids,
      })
      setFirstSubmittedAt(nextFirstSubmittedAt)
      setLastSubmittedAt(nextSubmittedAt)
      setHasSubmittedUpdate(nextHasSubmittedUpdate)
      setLastSubmittedSignature(nextSubmittedSignature)
      writeMagicRFQSubmissionStatus(submissionStatusKey, {
        version: MAGIC_RFQ_AUTOSAVE_VERSION,
        firstSubmittedAt: nextFirstSubmittedAt,
        lastSubmittedAt: nextSubmittedAt,
        hasSubmittedUpdate: nextHasSubmittedUpdate,
        lastSubmittedSignature: nextSubmittedSignature,
      })
      setSubmitted(true)
      setSubmitSuccessVisible(true)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSendMessage() {
    if (isPreview) return
    const trimmed = messageDraft.trim()
    if (!trimmed) return
    setSendingMessage(true)
    setMessageError('')
    const authorName = designerName || vendorName || initialVendorName || vendorEmail
    const result = await submitMagicRFQMessageAction(props.token, authorName, trimmed)
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
      author_name: authorName,
      message: trimmed,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, optimisticMessage])
    setMessageDraft('')
    setMessageComposerOpen(false)
    setSendingMessage(false)
  }

  const firstSubmittedLabel = formatSubmittedDateTime(firstSubmittedAt)
  const lastSubmittedLabel = formatSubmittedDateTime(lastSubmittedAt)
  const hasChangesSinceSubmit = !submitted || currentDraftSignature !== lastSubmittedSignature
  const updateDisabledUntilChanged = submitted && !hasChangesSinceSubmit && !submitSuccessVisible

  return (
      <div className="mx-auto max-w-[96rem] px-4 py-10 lg:px-8">
      <style>{`
        @keyframes magic-rfq-check-fade {
          0% { opacity: 0; transform: scale(0.82); }
          18% { opacity: 1; transform: scale(1); }
          72% { opacity: 1; transform: scale(1); }
          100% { opacity: 0; transform: scale(0.96); }
        }
      `}</style>
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
        <div
          ref={successRef}
          tabIndex={-1}
          className="mb-6 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 outline-none"
        >
          <p className="font-semibold">Quote submitted successfully.</p>
          <div className="mt-1 space-y-0.5">
            {firstSubmittedLabel ? <p>Submitted {firstSubmittedLabel}.</p> : null}
            {hasSubmittedUpdate && lastSubmittedLabel ? <p>Updated {lastSubmittedLabel}.</p> : null}
            <p>You can continue editing and resubmit from this same link until the RFQ deadline.</p>
          </div>
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
        <LineItemsWorkbook
          rfq={rfq}
          bids={bids}
          updateBid={updateBid}
          uploadFolder={`magic-rfq/${rfq.id}/${vendorEmail || 'vendor'}`}
          pricingIssueLineItemIds={pricingIssueLineItemIds}
        />
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
          disabled={submitting || submitSuccessVisible || updateDisabledUntilChanged || isPreview}
          title={updateDisabledUntilChanged ? 'Make a change before updating this quote.' : undefined}
          className="inline-flex items-center gap-2 rounded-md px-5 py-2 text-sm font-semibold text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          style={{ background: submitSuccessVisible ? '#2d6a4f' : updateDisabledUntilChanged ? '#8a9e96' : '#1e3a2f' }}
        >
          {submitting ? (
            <span
              aria-hidden="true"
              className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white"
            />
          ) : null}
          {submitSuccessVisible ? (
            <span
              aria-hidden="true"
              className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-white text-[11px] font-bold"
              style={{ animation: 'magic-rfq-check-fade 1200ms ease-out forwards', color: '#2d6a4f' }}
            >
              ✓
            </span>
          ) : null}
          {isPreview ? 'Preview Only' : submitting ? 'Submitting…' : submitSuccessVisible ? 'Submitted' : submitted ? 'Update Quote' : 'Submit Quote'}
        </button>
      </div>
    </div>
  )
}
