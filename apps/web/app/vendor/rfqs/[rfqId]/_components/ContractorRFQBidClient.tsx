'use client'

import { useState } from 'react'
import { addVendorNegotiationMessageAction, submitContractorRFQBidAction, saveBidDraftAction, clearBidDraftAction } from '@/lib/actions/vendor'
import type { ContractorBid, ContractorRFQ, ContractorRFQLineItem } from '@/lib/types/contractor'
import type { BidDraft } from '@/lib/types/vendor'
import type { BidTerms, ComplianceDeclaration } from '@/lib/types/procurement'

interface LineItemBid {
  line_item_id: string
  availability: 'in_stock' | 'can_source' | 'unavailable'
  quoted_quantity: string
  units_available: string
  unit_price: string
  lead_time_days: string
  delivery_terms: string
  notes: string
  substitution_notes: string
  quoted_product_details: string
}

interface Props {
  rfq: ContractorRFQ
  isInvited: boolean
  vendorEmail: string
  backHref: string
  existingDraft: BidDraft | null
  existingBid: ContractorBid | null
}

const AVAILABILITY_OPTIONS = [
  { value: 'in_stock' as const, label: 'In Stock' },
  { value: 'can_source' as const, label: 'Can Source' },
  { value: 'unavailable' as const, label: 'Unavailable' },
]

function makeDefaultBids(rfq: ContractorRFQ, draft: BidDraft | null): LineItemBid[] {
  return rfq.line_items.map((item) => {
    const draftResponse = draft?.line_item_responses.find((r) => r.line_item_id === item.id)
    const suggestedLeadTime = item.suggested_lead_time_days?.toString() ?? ''
    if (draftResponse) {
      return {
        line_item_id: item.id,
        availability: draftResponse.availability,
        quoted_quantity: draftResponse.quoted_quantity?.toString() ?? item.quantity.toString(),
        units_available: draftResponse.units_available?.toString() ?? '',
        unit_price: draftResponse.unit_price?.toString() ?? '',
        lead_time_days: draftResponse.lead_time_days?.toString() ?? suggestedLeadTime,
        delivery_terms: draftResponse.delivery_terms ?? '',
        notes: draftResponse.notes ?? '',
        substitution_notes: draftResponse.substitution_notes ?? '',
        quoted_product_details: draftResponse.quoted_product_details ?? '',
      }
    }
    return {
      line_item_id: item.id,
      availability: 'in_stock',
      quoted_quantity: item.quantity.toString(),
      units_available: '',
      unit_price: '',
      lead_time_days: suggestedLeadTime,
      delivery_terms: '',
      notes: '',
      substitution_notes: '',
      quoted_product_details: '',
    }
  })
}

function LineItemBidCard({
  item,
  bid,
  onChange,
}: {
  item: ContractorRFQLineItem
  bid: LineItemBid
  onChange: (updated: Partial<LineItemBid>) => void
}) {
  const unitPrice = parseFloat(bid.unit_price) || 0
  const quotedQuantity = parseFloat(bid.quoted_quantity) || 0
  const totalPrice = unitPrice * quotedQuantity
  const isUnavailable = bid.availability === 'unavailable'

  function availStyle(opt: typeof AVAILABILITY_OPTIONS[number]): React.CSSProperties {
    if (bid.availability === opt.value) {
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
      {/* Header */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold" style={{ color: '#1e3a2f' }}>{item.description}</p>
          <div className="mt-0.5 flex items-center gap-2 flex-wrap">
            {item.sku && (
              <span
                className="text-xs"
                style={{ fontFamily: 'var(--font-dm-mono, monospace)', color: '#4a6358' }}
              >
                SKU: {item.sku}
              </span>
            )}
            <span className="text-xs" style={{ color: '#4a6358' }}>
              Qty: <span className="font-medium">{item.quantity.toLocaleString()} {item.unit}</span>
            </span>
            {item.specs && (
              <span
                className="rounded px-1.5 py-0.5 text-xs font-medium"
                style={{ background: '#fff3eb', color: '#fa6b04' }}
              >
                {item.specs}
              </span>
            )}
            {item.certifications?.map((c) => (
              <span
                key={c}
                className="rounded px-1.5 py-0.5 text-xs font-medium"
                style={{ background: '#fff3eb', color: '#fa6b04' }}
              >
                {c}
              </span>
            ))}
            {(item.attributes ?? []).filter((attribute) => attribute.value).map((attribute) => (
              <span
                key={attribute.key}
                className="rounded px-1.5 py-0.5 text-xs font-medium"
                style={{ background: '#ffffff', border: '1px solid #e2d9cf', color: '#4a6358' }}
              >
                {attribute.label}: {attribute.value}
              </span>
            ))}
          </div>
          {item.suggested_lead_time_days != null && (
            <span
              className="mt-1 inline-block rounded px-2 py-0.5 text-xs font-medium"
              style={{ background: '#fdf0e8', color: '#a85c2a' }}
            >
              Expected lead time: {item.suggested_lead_time_days}d
            </span>
          )}
          {item.notes && (
            <p className="mt-1 text-xs italic" style={{ color: '#8a9e96' }}>{item.notes}</p>
          )}
        </div>
        {item.contractor_budget != null && (
          <span
            className="shrink-0 rounded px-2 py-0.5 text-xs font-medium"
            style={{ background: '#fdf0e8', color: '#a85c2a' }}
          >
            Budget: ${item.contractor_budget.toLocaleString()}/{item.unit}
          </span>
        )}
      </div>

      {/* Availability toggle */}
      <div className="mb-4">
        <label className="mb-1 block text-xs font-medium" style={{ color: '#4a6358' }}>Availability</label>
        <div className="flex gap-2">
          {AVAILABILITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange({ availability: opt.value })}
              className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
              style={availStyle(opt)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {!isUnavailable && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: '#4a6358' }}>Quoted Qty</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={bid.quoted_quantity}
                onChange={(e) => onChange({ quoted_quantity: e.target.value })}
                className="w-full rounded-md px-2.5 py-1.5 text-sm focus:border-[#fa6b04] focus:outline-none"
                style={{ background: '#ffffff', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
              />
            </div>
            {/* Units Available */}
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: '#4a6358' }}>Units Available</label>
              <input
                type="number"
                min={0}
                placeholder="-"
                value={bid.units_available}
                onChange={(e) => onChange({ units_available: e.target.value })}
                className="w-full rounded-md px-2.5 py-1.5 text-sm focus:border-[#fa6b04] focus:outline-none"
                style={{ background: '#ffffff', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
              />
            </div>

            {/* Unit Price */}
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: '#4a6358' }}>Unit Price (USD)</label>
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
                  value={bid.unit_price}
                  onChange={(e) => onChange({ unit_price: e.target.value })}
                  className="w-full rounded-md pl-5 pr-2 py-1.5 text-sm focus:border-[#fa6b04] focus:outline-none"
                  style={{ background: '#ffffff', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
                />
              </div>
            </div>

            {/* Total Price - read only */}
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: '#4a6358' }}>Total Price</label>
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
                {item.suggested_lead_time_days != null && (
                  <span className="ml-1 font-normal" style={{ color: '#a85c2a' }}>· Expected: {item.suggested_lead_time_days}d</span>
                )}
              </label>
              <input
                type="number"
                min={1}
                placeholder="-"
                value={bid.lead_time_days}
                onChange={(e) => onChange({ lead_time_days: e.target.value })}
                className="w-full rounded-md px-2.5 py-1.5 text-sm focus:border-[#fa6b04] focus:outline-none"
                style={{ background: '#ffffff', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
              />
            </div>

            {/* Delivery Terms */}
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: '#4a6358' }}>Delivery Terms</label>
              <input
                type="text"
                placeholder="e.g. FOB Destination"
                value={bid.delivery_terms}
                onChange={(e) => onChange({ delivery_terms: e.target.value })}
                className="w-full rounded-md px-2.5 py-1.5 text-sm focus:border-[#fa6b04] focus:outline-none"
                style={{ background: '#ffffff', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
              />
            </div>
          </div>

          {/* Per-item notes */}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: '#4a6358' }}>
                Substitution / Recommendation
              </label>
              <textarea
                rows={2}
                placeholder="Recommend an alternate material, finish, or profile if needed…"
                value={bid.substitution_notes}
                onChange={(e) => onChange({ substitution_notes: e.target.value })}
                className="w-full rounded-md px-2.5 py-1.5 text-sm focus:border-[#fa6b04] focus:outline-none resize-none"
                style={{ background: '#ffffff', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: '#4a6358' }}>
                Quoted Product Details
              </label>
              <textarea
                rows={2}
                placeholder="Manufacturer, model, dimensions, finish, grade, standards, or other identifying details..."
                value={bid.quoted_product_details}
                onChange={(e) => onChange({ quoted_product_details: e.target.value })}
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
                placeholder="Any conditions, substitutions, or additional details…"
                value={bid.notes}
                onChange={(e) => onChange({ notes: e.target.value })}
                className="w-full rounded-md px-2.5 py-1.5 text-sm focus:border-[#fa6b04] focus:outline-none resize-none"
                style={{ background: '#ffffff', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
              />
            </div>
          </div>
        </>
      )}

      {isUnavailable && (
        <p className="text-xs italic" style={{ color: '#8a9e96' }}>
          Marked as unavailable - no pricing required. You can optionally add a note.
        </p>
      )}
    </div>
  )
}

export function ContractorRFQBidClient({ rfq, isInvited, backHref, existingDraft, existingBid }: Props) {
  const draftLike = existingDraft ?? (existingBid ? {
    id: `existing-${existingBid.id}`,
    rfq_id: existingBid.rfq_id,
    vendor_id: existingBid.vendor_id ?? 'current-vendor',
    status: 'draft',
    line_item_responses: existingBid.line_item_responses.map((response) => ({
      line_item_id: response.line_item_id,
      unit_price: response.unit_price,
      total_price: response.total_price,
      currency: 'USD',
      quoted_quantity: response.quoted_quantity,
      units_available: response.units_available,
      lead_time_days: response.lead_time_days,
      availability: response.availability,
      delivery_terms: response.delivery_terms,
      notes: response.notes,
      substitution_notes: response.substitution_notes,
      quoted_product_details: response.quoted_product_details,
    })),
    notes: existingBid.notes,
    designer_name: existingBid.designer_name,
    terms: existingBid.terms,
    compliance_declarations: existingBid.compliance_declarations,
    document_urls: [],
    created_at: existingBid.submitted_at,
    updated_at: existingBid.submitted_at,
  } as BidDraft : null)
  const [bids, setBids] = useState<LineItemBid[]>(() => makeDefaultBids(rfq, draftLike))
  const [overallNotes, setOverallNotes] = useState(draftLike?.notes ?? '')
  const [designerName, setDesignerName] = useState(draftLike?.designer_name ?? '')
  const [terms, setTerms] = useState<BidTerms>(draftLike?.terms ?? {})
  const [complianceCodes, setComplianceCodes] = useState<string[]>(
    (draftLike?.compliance_declarations ?? [])
      .filter((entry) => entry.status === 'verified' || entry.status === 'self_reported')
      .map((entry) => entry.code),
  )
  const [negotiationDraft, setNegotiationDraft] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [draftSaved, setDraftSaved] = useState(false)
  const [error, setError] = useState('')

  function updateBid(id: string, partial: Partial<LineItemBid>) {
    setBids((prev) => prev.map((b) => (b.line_item_id === id ? { ...b, ...partial } : b)))
    setDraftSaved(false)
  }

  function buildResponses() {
    return bids.map((b) => {
      const item = rfq.line_items.find((i) => i.id === b.line_item_id)!
      const unitPrice = parseFloat(b.unit_price) || 0
      const quotedQuantity = parseFloat(b.quoted_quantity) || 0
      return {
        line_item_id: b.line_item_id,
        sku: item.sku,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: unitPrice,
        total_price: unitPrice * quotedQuantity,
        currency: 'USD',
        quoted_quantity: quotedQuantity,
        units_available: b.units_available ? parseInt(b.units_available, 10) : undefined,
        lead_time_days: parseInt(b.lead_time_days, 10) || 0,
        availability: b.availability,
        delivery_terms: b.delivery_terms || undefined,
        notes: b.notes || undefined,
        substitution_notes: b.substitution_notes || undefined,
        quoted_product_details: b.quoted_product_details || undefined,
      }
    })
  }

  function buildComplianceDeclarations(): ComplianceDeclaration[] {
    const selected = new Set(complianceCodes)
    return (rfq.procurement_requirements ?? []).map((requirement) => ({
      code: requirement.code,
      label: requirement.label,
      status: selected.has(requirement.code)
        ? requirement.verification === 'verified'
          ? 'verified'
          : 'self_reported'
        : 'does_not_match',
    }))
  }

  async function handleSaveDraft() {
    setSavingDraft(true)
    setError('')
    try {
      await saveBidDraftAction(rfq.id, buildResponses(), overallNotes || undefined, {
        terms,
        complianceDeclarations: buildComplianceDeclarations(),
        designerName,
      })
      setDraftSaved(true)
    } catch {
      setError('Failed to save draft. Please try again.')
    } finally {
      setSavingDraft(false)
    }
  }

  async function handleSubmit() {
    const missing = bids.some(
      (b) => b.availability !== 'unavailable' && (!b.unit_price || !b.lead_time_days),
    )
    if (missing) {
      setError('Please fill in unit price and lead time for all available items.')
      return
    }
    setError('')
    setSubmitting(true)
    try {
      const responses = bids.map((b) => {
        const item = rfq.line_items.find((i) => i.id === b.line_item_id)!
        const unitPrice = parseFloat(b.unit_price) || 0
        const quotedQuantity = parseFloat(b.quoted_quantity) || 0
        return {
          line_item_id: b.line_item_id,
          sku: item.sku,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unit_price: unitPrice,
          total_price: unitPrice * quotedQuantity,
          quoted_quantity: quotedQuantity,
          lead_time_days: parseInt(b.lead_time_days, 10) || 0,
          availability: b.availability,
          units_available: b.units_available ? parseInt(b.units_available, 10) : undefined,
          delivery_terms: b.delivery_terms || undefined,
          notes: b.notes || undefined,
          substitution_notes: b.substitution_notes || undefined,
          quoted_product_details: b.quoted_product_details || undefined,
        }
      })
      await submitContractorRFQBidAction(rfq.id, responses, overallNotes, {
        terms,
        complianceDeclarations: buildComplianceDeclarations(),
        designerName,
      })
      await clearBidDraftAction(rfq.id)
      setSubmitted(true)
    } catch {
      setError('Failed to submit quote. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div
        className="rounded-xl p-8 text-center"
        style={{ background: '#e8f4ee', border: '1px solid #a8d5ba' }}
      >
        <p className="text-base font-semibold" style={{ color: '#2d6a4f' }}>Quote submitted successfully!</p>
        <p className="mt-1 text-sm" style={{ color: '#2d6a4f' }}>
          The contractor will be notified and can view your quote in their dashboard.
        </p>
        <a
          href="/vendor/projects"
          className="mt-4 inline-block text-sm font-medium"
          style={{ color: '#2d6a4f' }}
        >
          Back to Projects
        </a>
      </div>
    )
  }

  return (
    <div>
      {/* RFQ header card */}
      <div
        className="mb-5 rounded-xl p-5 shadow-sm"
        style={{ background: '#ffffff', border: '1px solid #e2d9cf' }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold" style={{ color: '#1e3a2f' }}>{rfq.title}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {rfq.category && (
                <span className="text-sm capitalize" style={{ color: '#4a6358' }}>{rfq.category}</span>
              )}
              {isInvited && (
                <span
                  className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                  style={{ background: '#fdf0e8', color: '#a85c2a' }}
                >
                  Invited
                </span>
              )}
              {draftLike && !draftSaved && (
                <span
                  className="rounded-full px-2.5 py-0.5 text-xs font-medium"
                  style={{ background: '#fff3eb', color: '#fa6b04' }}
                >
                  Existing response loaded
                </span>
              )}
              {rfq.anonymous_public_listing && (
                <span
                  className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
                  style={{ background: '#fdf0e8', color: '#a85c2a' }}
                >
                  Confidential buyer
                </span>
              )}
            </div>
          </div>
          {rfq.bid_deadline && (
            <div className="text-right text-xs" style={{ color: '#8a9e96' }}>
              <p>Deadline: <span className="font-medium" style={{ color: '#4a6358' }}>{rfq.bid_deadline}</span></p>
            </div>
          )}
        </div>
        {rfq.anonymous_public_listing && (
          <div
            className="mt-3 rounded-md px-3 py-2 text-xs"
            style={{ background: '#fdf0e8', border: '1px solid #e8c4a0', color: '#a85c2a' }}
          >
            This is an anonymous public marketplace request. Buyer identity is intentionally hidden during quoting.
          </div>
        )}
        {rfq.ai_spec_assistant?.summary && (
          <div
            className="mt-3 rounded-md px-3 py-2 text-xs"
            style={{ background: '#fff3eb', border: '1px solid #fdc89a', color: '#fa6b04' }}
          >
            <span className="font-semibold">AI request summary:</span> {rfq.ai_spec_assistant.summary}
          </div>
        )}
      </div>

      {/* Line item cards */}
      <div className="mb-4 space-y-3">
        <h3 className="text-sm font-semibold" style={{ color: '#4a6358' }}>
          Your Quote - {rfq.line_items.length} SKU{rfq.line_items.length !== 1 ? 's' : ''}
        </h3>
        {rfq.line_items.map((item, idx) => (
          <LineItemBidCard
            key={item.id}
            item={item}
            bid={bids[idx]}
            onChange={(partial) => updateBid(item.id, partial)}
          />
        ))}
      </div>

      {/* Overall notes */}
      <div
        className="mb-5 rounded-xl p-4"
        style={{ background: '#ffffff', border: '1px solid #e2d9cf' }}
      >
        <h3 className="mb-3 text-sm font-semibold" style={{ color: '#1e3a2f' }}>Commercial Terms</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <input
            type="text"
            value={terms.payment_terms ?? ''}
            onChange={(e) => setTerms((prev) => ({ ...prev, payment_terms: e.target.value }))}
            placeholder="Payment terms, e.g. Net 30"
            className="rounded-md px-3 py-2 text-sm focus:border-[#fa6b04] focus:outline-none"
            style={{ background: '#ffffff', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
          />
          <input
            type="text"
            value={terms.deposit_terms ?? ''}
            onChange={(e) => setTerms((prev) => ({ ...prev, deposit_terms: e.target.value }))}
            placeholder="Deposit terms, e.g. 50% down"
            className="rounded-md px-3 py-2 text-sm focus:border-[#fa6b04] focus:outline-none"
            style={{ background: '#ffffff', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
          />
          <input
            type="text"
            value={terms.credit_terms ?? ''}
            onChange={(e) => setTerms((prev) => ({ ...prev, credit_terms: e.target.value }))}
            placeholder="Credit / first-time vendor terms"
            className="rounded-md px-3 py-2 text-sm focus:border-[#fa6b04] focus:outline-none"
            style={{ background: '#ffffff', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
          />
          <input
            type="text"
            value={terms.shipping_terms ?? ''}
            onChange={(e) => setTerms((prev) => ({ ...prev, shipping_terms: e.target.value }))}
            placeholder="Shipping terms, incoterms, FOB, etc."
            className="rounded-md px-3 py-2 text-sm focus:border-[#fa6b04] focus:outline-none"
            style={{ background: '#ffffff', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
          />
        </div>
      </div>

      <div
        className="mb-5 rounded-xl p-4"
        style={{ background: '#ffffff', border: '1px solid #e2d9cf' }}
      >
        <label className="mb-1 block text-xs font-medium" style={{ color: '#4a6358' }}>
          Designer Name <span className="font-normal" style={{ color: '#8a9e96' }}>(shown to contractor)</span>
        </label>
        <input
          type="text"
          value={designerName}
          onChange={(e) => { setDesignerName(e.target.value); setDraftSaved(false) }}
          placeholder="Name of the estimator or designer preparing this quote"
          className="w-full rounded-md px-3 py-2 text-sm focus:border-[#fa6b04] focus:outline-none"
          style={{ background: '#ffffff', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
        />
      </div>

      {(rfq.procurement_requirements ?? []).length > 0 && (
        <div
          className="mb-5 rounded-xl p-4"
          style={{ background: '#ffffff', border: '1px solid #e2d9cf' }}
        >
          <h3 className="mb-3 text-sm font-semibold" style={{ color: '#1e3a2f' }}>Compliance Declarations</h3>
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
                  className="rounded-full px-3 py-1 text-xs font-semibold transition-colors"
                  style={
                    selected
                      ? { background: '#1e3a2f', border: '1px solid #1e3a2f', color: '#ffffff' }
                      : { background: '#ffffff', border: '1px solid #e2d9cf', color: '#4a6358' }
                  }
                >
                  {requirement.label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="mb-5">
        <label className="mb-1 block text-xs font-medium" style={{ color: '#4a6358' }}>
          General Notes <span className="font-normal" style={{ color: '#8a9e96' }}>(optional - visible to contractor)</span>
        </label>
        <textarea
          rows={3}
          placeholder="Overall terms, delivery scheduling notes, or conditions that apply to all items…"
          value={overallNotes}
          onChange={(e) => { setOverallNotes(e.target.value); setDraftSaved(false) }}
          className="w-full rounded-md px-3 py-2 text-sm focus:border-[#fa6b04] focus:outline-none resize-none"
          style={{ background: '#ffffff', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
        />
      </div>

      {existingBid && (
        <div
          className="mb-5 rounded-xl p-4"
          style={{ background: '#ffffff', border: '1px solid #e2d9cf' }}
        >
          <h3 className="mb-3 text-sm font-semibold" style={{ color: '#1e3a2f' }}>Negotiation Thread</h3>
          <div className="space-y-2">
            {(existingBid.negotiation_messages ?? []).length === 0 ? (
              <p className="text-xs" style={{ color: '#8a9e96' }}>No negotiation messages yet.</p>
            ) : (
              existingBid.negotiation_messages?.map((message) => (
                <div
                  key={message.id}
                  className="rounded-md px-3 py-2"
                  style={{ background: '#ede8e2', border: '1px solid #e2d9cf' }}
                >
                  <p className="text-xs font-semibold" style={{ color: '#1e3a2f' }}>{message.author_name}</p>
                  <p className="mt-1 text-sm" style={{ color: '#4a6358' }}>{message.message}</p>
                </div>
              ))
            )}
          </div>
          <textarea
            rows={2}
            value={negotiationDraft}
            onChange={(e) => setNegotiationDraft(e.target.value)}
            className="mt-3 w-full rounded-md px-3 py-2 text-sm focus:border-[#fa6b04] focus:outline-none"
            style={{ background: '#ffffff', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
            placeholder="Clarify lead time, substitutions, payment terms, or scope…"
          />
          <button
            type="button"
            onClick={async () => {
              if (!existingBid || !negotiationDraft.trim()) return
              await addVendorNegotiationMessageAction(rfq.id, existingBid.id, negotiationDraft)
              setNegotiationDraft('')
              window.location.reload()
            }}
            className="mt-2 rounded-md px-3 py-1.5 text-xs font-semibold text-white"
            style={{ background: '#1e3a2f' }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = '#4a6358')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = '#1e3a2f')}
          >
            Send message
          </button>
        </div>
      )}

      {error && (
        <div
          className="mb-4 rounded-md px-4 py-3"
          style={{ background: '#fdeaea', border: '1px solid #f5c6c6' }}
        >
          <p className="text-sm" style={{ color: '#c0392b' }}>{error}</p>
        </div>
      )}

      {/* Action bar */}
      <div
        className="flex items-center justify-between pt-4"
        style={{ borderTop: '1px solid #e2d9cf' }}
      >
        <a
          href={backHref}
          className="text-sm"
          style={{ color: '#8a9e96' }}
          onMouseEnter={(e) => ((e.target as HTMLAnchorElement).style.color = '#4a6358')}
          onMouseLeave={(e) => ((e.target as HTMLAnchorElement).style.color = '#8a9e96')}
        >
          Back
        </a>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={savingDraft || submitting}
            className="flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50 transition-colors"
            style={{ background: '#ffffff', border: '1px solid #e2d9cf', color: '#4a6358' }}
            onMouseEnter={(e) => {
              if (!savingDraft && !submitting) (e.currentTarget as HTMLButtonElement).style.background = '#ede8e2'
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = '#ffffff'
            }}
          >
            {savingDraft ? (
              <>
                <span
                  className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-t-transparent"
                  style={{ borderColor: '#4a6358' }}
                />
                Saving…
              </>
            ) : draftSaved ? (
              'Draft saved ✓'
            ) : (
              'Save Draft'
            )}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || savingDraft}
            className="flex items-center gap-2 rounded-md px-6 py-2 text-sm font-semibold text-white disabled:opacity-50 transition-colors"
            style={{ background: '#1e3a2f' }}
            onMouseEnter={(e) => {
              if (!submitting && !savingDraft) (e.currentTarget as HTMLButtonElement).style.background = '#4a6358'
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = '#1e3a2f'
            }}
          >
            {submitting ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Submitting…
              </>
            ) : (
              'Submit Quote →'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
