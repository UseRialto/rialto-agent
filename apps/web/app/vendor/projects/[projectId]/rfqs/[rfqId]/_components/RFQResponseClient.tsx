'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LineItemResponseForm } from './LineItemResponseForm'
import { saveBidDraftAction } from '@/lib/actions/vendor'
import type { RFQDetail, BidDraft, BidLineItemResponse } from '@/lib/types/vendor'

interface Props {
  rfq: RFQDetail
  existingDraft: BidDraft | null
  projectId: string
  returnTo?: string
}

function initResponses(rfq: RFQDetail, draft: BidDraft | null): Record<string, Partial<BidLineItemResponse>> {
  const map: Record<string, Partial<BidLineItemResponse>> = {}
  for (const li of rfq.line_items) {
    const existing = draft?.line_item_responses.find((r) => r.line_item_id === li.id)
    map[li.id] = existing ?? { line_item_id: li.id }
  }
  return map
}

export function RFQResponseClient({ rfq, existingDraft, projectId, returnTo }: Props) {
  const router = useRouter()
  const [responses, setResponses] = useState<Record<string, Partial<BidLineItemResponse>>>(
    () => initResponses(rfq, existingDraft),
  )
  const [notes, setNotes] = useState(existingDraft?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [discardModal, setDiscardModal] = useState(false)

  function updateLineItem(lineItemId: string, updated: Partial<BidLineItemResponse>) {
    setResponses((prev) => ({ ...prev, [lineItemId]: { ...updated, line_item_id: lineItemId } }))
  }

  async function handleSave() {
    setSaving(true)
    // Build full responses with total_price computed
    const fullResponses: BidLineItemResponse[] = rfq.line_items
      .map((li) => {
        const r = responses[li.id] ?? {}
        const unitPrice = r.unit_price ?? 0
        return {
          line_item_id: li.id,
          unit_price: unitPrice,
          total_price: unitPrice * li.quantity,
          currency: 'USD',
          units_available: r.units_available,
          lead_time_days: r.lead_time_days ?? 0,
          availability: r.availability ?? 'can_source',
          delivery_terms: r.delivery_terms,
          notes: r.notes,
          quoted_product_details: r.quoted_product_details,
        } satisfies BidLineItemResponse
      })

    await saveBidDraftAction(rfq.id, fullResponses, notes || undefined)
    setSaving(false)
    router.push(returnTo ?? `/vendor/projects/${projectId}`)
    router.refresh()
  }

  function handleDiscard() {
    setDiscardModal(false)
    router.push(returnTo ?? `/vendor/projects/${projectId}`)
  }

  return (
    <div>
      {/* RFQ Detail header */}
      <div
        className="mb-5 rounded-xl p-5 shadow-sm"
        style={{ background: '#ffffff', border: '1px solid #e2d9cf' }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold" style={{ color: '#1e3a2f' }}>{rfq.title}</h2>
            <p className="mt-0.5 text-sm capitalize" style={{ color: '#4a6358' }}>{rfq.category}</p>
          </div>
          <div className="text-right text-xs" style={{ color: '#8a9e96' }}>
            <p>Delivery: <span className="font-medium" style={{ color: '#4a6358' }}>{rfq.delivery_date}</span></p>
            <p className="mt-0.5">{rfq.delivery_location}</p>
          </div>
        </div>

        {rfq.specs && (
          <p
            className="mt-3 text-xs leading-relaxed pt-3"
            style={{ color: '#4a6358', borderTop: '1px solid #ede8e2' }}
          >
            {rfq.specs}
          </p>
        )}

        {rfq.certifications_required.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {rfq.certifications_required.map((cert) => (
              <span
                key={cert}
                className="rounded px-2 py-0.5 text-xs font-medium"
                style={{ background: '#fff3eb', color: '#fa6b04' }}
              >
                {cert}
              </span>
            ))}
          </div>
        )}

        {rfq.contractor_notes && (
          <div
            className="mt-3 rounded-md px-3 py-2"
            style={{ background: '#fdf0e8', border: '1px solid #e8c4a0' }}
          >
            <p className="text-xs font-medium" style={{ color: '#a85c2a' }}>Contractor Notes</p>
            <p className="mt-0.5 text-xs" style={{ color: '#a85c2a' }}>{rfq.contractor_notes}</p>
          </div>
        )}
      </div>

      {/* Line item responses */}
      <div className="mb-4 space-y-3">
        <h3 className="text-sm font-semibold" style={{ color: '#4a6358' }}>
          Your Quote - {rfq.line_items.length} SKU{rfq.line_items.length !== 1 ? 's' : ''}
        </h3>
        {rfq.line_items.map((li) => (
          <LineItemResponseForm
            key={li.id}
            lineItem={li}
            value={responses[li.id] ?? {}}
            onChange={(updated) => updateLineItem(li.id, updated)}
          />
        ))}
      </div>

      {/* Overall notes */}
      <div className="mb-5">
        <label className="mb-1 block text-xs font-medium" style={{ color: '#4a6358' }}>
          General Notes <span className="font-normal" style={{ color: '#8a9e96' }}>(optional - visible to contractor)</span>
        </label>
        <textarea
          rows={3}
          placeholder="Overall terms, delivery scheduling notes, or conditions that apply to all items…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full rounded-md px-3 py-2 text-sm focus:border-[#fa6b04] focus:outline-none resize-none"
          style={{ background: '#ffffff', border: '1px solid #e2d9cf', color: '#1e3a2f' }}
        />
      </div>

      {/* Action bar */}
      <div
        className="flex items-center justify-end gap-3 pt-4"
        style={{ borderTop: '1px solid #e2d9cf' }}
      >
        <button
          onClick={() => setDiscardModal(true)}
          className="rounded-md px-4 py-2 text-sm font-medium"
          style={{ background: '#ffffff', border: '1px solid #e2d9cf', color: '#4a6358' }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = '#ede8e2')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = '#ffffff')}
        >
          Discard Changes
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 rounded-md px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
          style={{ background: '#1e3a2f' }}
          onMouseEnter={(e) => {
            if (!saving) (e.currentTarget as HTMLButtonElement).style.background = '#4a6358'
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = '#1e3a2f'
          }}
        >
          {saving ? (
            <>
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Saving…
            </>
          ) : returnTo ? (
            'Save & Return to Review'
          ) : (
            'Save Draft'
          )}
        </button>
      </div>

      {/* Discard confirmation modal */}
      {discardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDiscardModal(false)} />
          <div
            className="relative mx-4 w-full max-w-sm rounded-xl p-6 shadow-xl"
            style={{ background: '#ffffff' }}
          >
            <h3 className="text-base font-semibold" style={{ color: '#1e3a2f' }}>Discard Changes?</h3>
            <p className="mt-2 text-sm" style={{ color: '#4a6358' }}>
              Your unsaved responses to this RFQ will be lost. This cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                onClick={() => setDiscardModal(false)}
                className="rounded-md px-4 py-2 text-sm font-medium"
                style={{ background: '#ffffff', border: '1px solid #e2d9cf', color: '#4a6358' }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = '#ede8e2')}
                onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = '#ffffff')}
              >
                Keep Editing
              </button>
              <button
                onClick={handleDiscard}
                className="rounded-md px-4 py-2 text-sm font-semibold text-white"
                style={{ background: '#c0392b' }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = '#a93226')}
                onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = '#c0392b')}
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
