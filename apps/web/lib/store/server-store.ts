/**
 * Vendor session store - backed by Neon Postgres via Drizzle.
 * Drafts and submitted bids both live in the bids table (is_draft flag).
 * SERVER-SIDE ONLY - never import from client components.
 */

import { eq, and, ne } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  bids as bidsTable,
  bidLineItems as bidLineItemsTable,
  rfqs as rfqsTable,
  projects as projectsTable,
} from '@/lib/db/schema'
import type { BidDraft, BidLineItemResponse, SubmittedBid } from '@/lib/types/vendor'

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

// ---------------------------------------------------------------------------
// Assemblers
// ---------------------------------------------------------------------------

function rowToBidLineItemResponse(row: typeof bidLineItemsTable.$inferSelect): BidLineItemResponse {
  return {
    line_item_id: row.line_item_id,
    unit_price: row.unit_price,
    total_price: row.total_price,
    currency: 'USD',
    quoted_quantity: row.quoted_quantity ?? undefined,
    units_available: row.units_available ?? undefined,
    lead_time_days: row.lead_time_days,
    availability: row.availability as BidLineItemResponse['availability'],
    delivery_terms: row.delivery_terms ?? undefined,
    notes: row.notes ?? undefined,
    substitution_notes: row.substitution_notes ?? undefined,
    quoted_product_details: row.quoted_product_details ?? undefined,
    response_attributes: parseJson(row.response_attributes_json, []),
    is_alternate: row.is_alternate,
  }
}

// ---------------------------------------------------------------------------
// Drafts
// ---------------------------------------------------------------------------

export async function getDraft(rfqId: string, vendorId?: string): Promise<BidDraft | null> {
  const base = and(eq(bidsTable.rfq_id, rfqId), eq(bidsTable.is_draft, true))
  const row = (await db
    .select()
    .from(bidsTable)
    .where(vendorId ? and(base, eq(bidsTable.vendor_id, vendorId)) : base))[0]
  if (!row) return null

  const lineItems = await db.select().from(bidLineItemsTable).where(eq(bidLineItemsTable.bid_id, row.id))

  return {
    id: row.id,
    rfq_id: row.rfq_id,
    vendor_id: row.vendor_id ?? 'current-vendor',
    designer_name: row.designer_name ?? undefined,
    status: 'draft',
    line_item_responses: lineItems.map(rowToBidLineItemResponse),
    notes: row.notes ?? undefined,
    terms: {
      payment_terms: row.payment_terms ?? undefined,
      deposit_terms: row.deposit_terms ?? undefined,
      credit_terms: row.credit_terms ?? undefined,
      escalation_clause: row.escalation_clause ?? undefined,
      price_valid_until: row.price_valid_until ?? undefined,
      shipping_terms: row.shipping_terms ?? undefined,
    },
    compliance_declarations: parseJson(row.compliance_declarations_json, []),
    document_urls: [],
    created_at: row.submitted_at,
    updated_at: row.submitted_at,
  }
}

export async function saveDraft(rfqId: string, draft: BidDraft): Promise<void> {
  await db.insert(bidsTable)
    .values({
      id: draft.id,
      rfq_id: rfqId,
      vendor_id: draft.vendor_id !== 'current-vendor' ? draft.vendor_id : null,
      vendor_email: null,
      vendor_name: 'Draft',
      designer_name: draft.designer_name ?? null,
      is_invited: false,
      is_on_platform: true,
      submitted_at: draft.updated_at,
      total_price: draft.line_item_responses.reduce((s, r) => s + r.total_price, 0),
      currency: 'USD',
      lead_time_days: 0,
      notes: draft.notes ?? null,
      payment_terms: draft.terms?.payment_terms ?? null,
      deposit_terms: draft.terms?.deposit_terms ?? null,
      credit_terms: draft.terms?.credit_terms ?? null,
      escalation_clause: draft.terms?.escalation_clause ?? null,
      price_valid_until: draft.terms?.price_valid_until ?? null,
      shipping_terms: draft.terms?.shipping_terms ?? null,
      compliance_declarations_json: JSON.stringify(draft.compliance_declarations ?? []),
      status: 'pending',
      is_draft: true,
    })
    .onConflictDoUpdate({
      target: bidsTable.id,
      set: {
        submitted_at: draft.updated_at,
        total_price: draft.line_item_responses.reduce((s, r) => s + r.total_price, 0),
        notes: draft.notes ?? null,
        designer_name: draft.designer_name ?? null,
        payment_terms: draft.terms?.payment_terms ?? null,
        deposit_terms: draft.terms?.deposit_terms ?? null,
        credit_terms: draft.terms?.credit_terms ?? null,
        escalation_clause: draft.terms?.escalation_clause ?? null,
        price_valid_until: draft.terms?.price_valid_until ?? null,
        shipping_terms: draft.terms?.shipping_terms ?? null,
        compliance_declarations_json: JSON.stringify(draft.compliance_declarations ?? []),
      },
    })

  await db.delete(bidLineItemsTable).where(eq(bidLineItemsTable.bid_id, draft.id))
  if (draft.line_item_responses.length > 0) {
    await db.insert(bidLineItemsTable)
      .values(
        draft.line_item_responses.map((r) => ({
          bid_id: draft.id,
          line_item_id: r.line_item_id,
          quoted_quantity: r.quoted_quantity ?? null,
          unit_price: r.unit_price,
          total_price: r.total_price,
          lead_time_days: r.lead_time_days,
          availability: r.availability,
          units_available: r.units_available ?? null,
          delivery_terms: r.delivery_terms ?? null,
          notes: r.notes ?? null,
          substitution_notes: r.substitution_notes ?? null,
          quoted_product_details: r.quoted_product_details ?? null,
          response_attributes_json: JSON.stringify(r.response_attributes ?? []),
          is_alternate: r.is_alternate ?? false,
        })),
      )
  }
}

export async function clearDraft(rfqId: string): Promise<void> {
  const row = (await db
    .select({ id: bidsTable.id })
    .from(bidsTable)
    .where(and(eq(bidsTable.rfq_id, rfqId), eq(bidsTable.is_draft, true))))[0]
  if (row) {
    await db.delete(bidsTable).where(eq(bidsTable.id, row.id))
  }
}

export async function getDraftResponses(rfqId: string, vendorId?: string): Promise<BidLineItemResponse[]> {
  return (await getDraft(rfqId, vendorId))?.line_item_responses ?? []
}

// ---------------------------------------------------------------------------
// Submitted Bids
// ---------------------------------------------------------------------------

export async function getSubmittedRfqIds(vendorId?: string): Promise<string[]> {
  const base = eq(bidsTable.is_draft, false)
  const rows = await db
    .select({ rfq_id: bidsTable.rfq_id })
    .from(bidsTable)
    .where(vendorId ? and(base, eq(bidsTable.vendor_id, vendorId)) : base)
  return rows.map((r) => r.rfq_id)
}

export async function getSubmittedBids(): Promise<SubmittedBid[]> {
  const bidRows = await db
    .select()
    .from(bidsTable)
    .where(eq(bidsTable.is_draft, false))

  return Promise.all(bidRows.map(async (row) => {
    const lineItems = await db.select().from(bidLineItemsTable).where(eq(bidLineItemsTable.bid_id, row.id))
    // Look up denormalized fields
    const rfq = (await db.select({ title: rfqsTable.title, project_id: rfqsTable.project_id }).from(rfqsTable).where(eq(rfqsTable.id, row.rfq_id)))[0]
    const project = (await db.select({ name: projectsTable.name, owner_id: projectsTable.owner_id }).from(projectsTable).where(eq(projectsTable.id, rfq?.project_id ?? '')))[0]

    return {
      id: row.id,
      rfq_id: row.rfq_id,
      rfq_title: rfq?.title ?? '',
      project_id: rfq?.project_id ?? '',
      project_name: project?.name ?? '',
      contractor_name: project?.name ?? '',
      designer_name: row.designer_name ?? undefined,
      submitted_at: row.submitted_at,
      total_price: row.total_price,
      line_item_count: lineItems.length,
      status: row.status as SubmittedBid['status'],
      line_item_responses: lineItems.map(rowToBidLineItemResponse),
      vendor_id: row.vendor_id ?? undefined,
      terms: {
        payment_terms: row.payment_terms ?? undefined,
        deposit_terms: row.deposit_terms ?? undefined,
        credit_terms: row.credit_terms ?? undefined,
        escalation_clause: row.escalation_clause ?? undefined,
        price_valid_until: row.price_valid_until ?? undefined,
        shipping_terms: row.shipping_terms ?? undefined,
      },
      compliance_declarations: parseJson(row.compliance_declarations_json, []),
    } satisfies SubmittedBid
  }))
}

export async function recordSubmission(rfqIds: string[], newBids: SubmittedBid[]): Promise<void> {
  for (const bid of newBids) {
    await recordSingleBid(bid)
  }
}

export async function recordSingleBid(bid: SubmittedBid): Promise<void> {
  // Remove any draft for this RFQ first
  await clearDraft(bid.rfq_id)

  await db.insert(bidsTable)
    .values({
      id: bid.id,
      rfq_id: bid.rfq_id,
      vendor_id: bid.vendor_id ?? null,
      vendor_email: null,
      vendor_name: bid.contractor_name, // contractor_name stores the project name; vendor_name from submitAction
      designer_name: bid.designer_name ?? null,
      is_invited: false,
      is_on_platform: true,
      submitted_at: bid.submitted_at,
      total_price: bid.total_price,
      currency: 'USD',
      lead_time_days: 0,
      status: bid.status,
      is_draft: false,
    })
    .onConflictDoUpdate({
      target: bidsTable.id,
      set: {
        status: bid.status,
        total_price: bid.total_price,
        designer_name: bid.designer_name ?? null,
      },
    })
}

export async function updateSubmittedBid(bidId: string, updates: Partial<SubmittedBid>): Promise<void> {
  const patch: Partial<typeof bidsTable.$inferInsert> = {}
  if (updates.status !== undefined) patch.status = updates.status
  if (updates.designer_name !== undefined) patch.designer_name = updates.designer_name ?? null
  if (Object.keys(patch).length > 0) {
    await db.update(bidsTable).set(patch).where(eq(bidsTable.id, bidId))
  }
}
