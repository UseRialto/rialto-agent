/**
 * Contractor store - backed by Neon Postgres via Drizzle.
 * SERVER-SIDE ONLY - never import from client components.
 */

import { eq, and, or, ne, inArray, sql, desc } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  projects as projectsTable,
  rfqs as rfqsTable,
  rfqLineItems as rfqLineItemsTable,
  rfqInvites as rfqInvitesTable,
  bids as bidsTable,
  bidLineItems as bidLineItemsTable,
  rfqVendorRequests as rfqVendorRequestsTable,
  rfqEmailMessages as rfqEmailMessagesTable,
  rfqReviewTasks as rfqReviewTasksTable,
  negotiationMessages as negotiationMessagesTable,
  vendorRelationships as vendorRelationshipsTable,
} from '@/lib/db/schema'
import type {
  ContractorProject,
  ContractorActivityNotification,
  ContractorRFQ,
  ContractorRFQLineItem,
  ContractorBid,
  ContractorBidLineItemResponse,
  ContractorVendorInvite,
} from '@/lib/types/contractor'
import type { NegotiationMessage, VendorReliabilityFlag } from '@/lib/types/procurement'
import { getBidSpecComplianceReport, listProjectSpecDocuments } from '@/lib/spec-compliance/store'

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

// ---------------------------------------------------------------------------
// Assemblers - convert flat DB rows to nested domain types
// ---------------------------------------------------------------------------

function rowToProject(row: typeof projectsTable.$inferSelect): ContractorProject {
  return {
    id: row.id,
    name: row.name,
    owner_id: row.owner_id,
    location: row.location,
    general_contractor: row.general_contractor ?? undefined,
    description: row.description ?? undefined,
    budget: row.budget ?? undefined,
    collaborator_ids: row.collaborator_ids ? JSON.parse(row.collaborator_ids) : [],
    rfq_categories: row.rfq_categories ? JSON.parse(row.rfq_categories) : [],
    created_at: row.created_at,
    status: row.status as ContractorProject['status'],
  }
}

function rowToLineItem(row: typeof rfqLineItemsTable.$inferSelect): ContractorRFQLineItem {
  return {
    id: row.id,
    sku: row.sku ?? '',
    description: row.description,
    quantity: row.quantity,
    unit: row.unit,
    specs: row.specs ?? undefined,
    constraints: row.constraints ?? undefined,
    attributes: parseJson(row.attributes_json, undefined),
    certifications: parseJson(row.certifications, undefined),
    notes: row.notes ?? undefined,
    contractor_budget: row.contractor_budget ?? undefined,
    suggested_lead_time_days: row.suggested_lead_time_days ?? undefined,
  }
}

function assembleRFQ(
  row: typeof rfqsTable.$inferSelect,
  lineItems: typeof rfqLineItemsTable.$inferSelect[],
  invites: typeof rfqInvitesTable.$inferSelect[],
): ContractorRFQ {
  const vendorInvites: ContractorVendorInvite[] = invites.map((invite) => ({
    id: invite.id,
    vendor_id: invite.vendor_id ?? undefined,
    vendor_email: invite.vendor_email ?? '',
    vendor_name: invite.vendor_name ?? invite.vendor_email ?? invite.vendor_id ?? '',
    vendor_first_name: invite.vendor_first_name ?? undefined,
    vendor_last_name: invite.vendor_last_name ?? undefined,
    on_platform: invite.on_platform,
  }))

  return {
    id: row.id,
    project_id: row.project_id,
    title: row.title,
    request_type: (row.request_type as ContractorRFQ['request_type']) ?? 'rfq',
    email_subject: row.email_subject ?? undefined,
    email_body: row.email_body ?? undefined,
    status: row.status as ContractorRFQ['status'],
    category: row.category ?? undefined,
    anonymous_public_listing: row.anonymous_public_listing,
    rfp_details: {
      procurement_objective: row.procurement_objective ?? undefined,
      scope_summary: row.scope_summary ?? undefined,
      desired_outcome: row.desired_outcome ?? undefined,
      performance_requirements: row.performance_requirements ?? undefined,
      approved_alternates: row.approved_alternates ?? undefined,
      quantity_context: row.quantity_context ?? undefined,
      site_conditions: row.site_conditions ?? undefined,
      delivery_zip: row.delivery_zip ?? undefined,
      delivery_logistics: row.delivery_logistics ?? undefined,
      delivery_window: row.delivery_window ?? undefined,
      phased_delivery: row.phased_delivery ?? undefined,
      submittals_required: row.submittals_required ?? undefined,
      lead_time_sensitivity: row.lead_time_sensitivity ?? undefined,
      exclusions: row.exclusions ?? undefined,
      unknowns_or_questions: row.unknowns_or_questions ?? undefined,
      vendor_questions_requested: row.vendor_questions_requested ?? undefined,
      vendor_guidance_requested: row.vendor_guidance_requested ?? undefined,
      attachments_summary: row.attachments_summary ?? undefined,
    },
    procurement_requirements: parseJson(row.procurement_requirements_json, []),
    ai_spec_assistant: parseJson(row.ai_spec_assistant_json, undefined),
    commodity_watch: parseJson(row.commodity_watch_json, []),
    risk_flags: parseJson(row.risk_flags_json, []),
    vendor_response_fields: parseJson(row.vendor_response_fields_json, []),
    attachment_urls: parseJson(row.attachment_urls_json, []),
    source_rfq_id: row.source_rfq_id ?? undefined,
    line_items: lineItems
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(rowToLineItem),
    invites: vendorInvites,
    invited_vendor_ids: vendorInvites.filter((invite) => invite.vendor_id).map((invite) => invite.vendor_id!),
    invited_vendor_emails: vendorInvites.filter((invite) => invite.vendor_email && !invite.on_platform).map((invite) => invite.vendor_email),
    visibility: row.visibility as ContractorRFQ['visibility'],
    bid_deadline: row.bid_deadline ?? undefined,
    created_at: row.created_at,
    published_at: row.published_at ?? undefined
  }
}

async function assembleBid(
  row: typeof bidsTable.$inferSelect,
  lineItems: typeof bidLineItemsTable.$inferSelect[],
): Promise<ContractorBid> {
  const bid: ContractorBid = {
    id: row.id,
    rfq_id: row.rfq_id,
    vendor_name: row.vendor_name,
    designer_name: row.designer_name ?? undefined,
    vendor_id: row.vendor_id ?? undefined,
    vendor_email: row.vendor_email ?? undefined,
    is_invited: row.is_invited,
    is_on_platform: row.is_on_platform,
    submitted_at: row.submitted_at,
    total_price: row.total_price,
    currency: row.currency,
    lead_time_days: row.lead_time_days,
    terms: {
      payment_terms: row.payment_terms ?? undefined,
      deposit_terms: row.deposit_terms ?? undefined,
      credit_terms: row.credit_terms ?? undefined,
      escalation_clause: row.escalation_clause ?? undefined,
      price_valid_until: row.price_valid_until ?? undefined,
      shipping_terms: row.shipping_terms ?? undefined,
    },
    compliance_declarations: parseJson(row.compliance_declarations_json, []),
    risk_flags: parseJson(row.risk_flags_json, []),
    fulfillment_summary: parseJson(row.fulfillment_summary_json, undefined),
    buyer_decision_status: row.buyer_decision_status as ContractorBid['buyer_decision_status'],
    decision_rationale: row.decision_rationale ?? undefined,
    vendor_reliability_flag: row.vendor_reliability_flag as VendorReliabilityFlag | undefined,
    notes: row.notes ?? undefined,
    status: row.status as ContractorBid['status'],
    source: (row.source ?? 'platform') as ContractorBid['source'],
    line_item_responses: lineItems.map((li) => ({
      line_item_id: li.line_item_id,
      sku: li.sku ?? '',
      description: li.description ?? '',
      quantity: li.quantity ?? 0,
      quoted_quantity: li.quoted_quantity ?? undefined,
      unit: li.unit ?? '',
      unit_price: li.unit_price,
      total_price: li.total_price,
      lead_time_days: li.lead_time_days,
      availability: li.availability as ContractorBidLineItemResponse['availability'],
      units_available: li.units_available ?? undefined,
      delivery_terms: li.delivery_terms ?? undefined,
      notes: li.notes ?? undefined,
      substitution_notes: li.substitution_notes ?? undefined,
      quoted_product_details: li.quoted_product_details ?? undefined,
      response_attributes: parseJson(li.response_attributes_json, []),
      is_alternate: li.is_alternate,
    })),
  }
  bid.spec_compliance_report = await getBidSpecComplianceReport(row.id)
  bid.negotiation_messages = await db
    .select()
    .from(negotiationMessagesTable)
    .where(eq(negotiationMessagesTable.bid_id, row.id))
    .then((messages) => messages.map((message) => ({
      id: message.id,
      rfq_id: message.rfq_id,
      bid_id: message.bid_id ?? undefined,
      vendor_id: message.vendor_id ?? undefined,
      vendor_email: message.vendor_email ?? undefined,
      author_role: message.author_role as NegotiationMessage['author_role'],
      author_name: message.author_name,
      message: message.message,
      created_at: message.created_at,
    })))
  if (bid.source === 'email' && bid.vendor_email) {
    const vendorRequest = (await db
      .select({ id: rfqVendorRequestsTable.id })
      .from(rfqVendorRequestsTable)
      .where(
        and(
          eq(rfqVendorRequestsTable.rfq_id, bid.rfq_id),
          eq(rfqVendorRequestsTable.vendor_email, bid.vendor_email),
        ),
      ))[0]
    if (vendorRequest) {
      bid.source_message_count = (await db
        .select({ count: sql<number>`count(*)` })
        .from(rfqEmailMessagesTable)
        .where(eq(rfqEmailMessagesTable.vendor_request_id, vendorRequest.id)))[0]?.count ?? 0
      bid.last_email_at = (await db
        .select({ sent_at: rfqEmailMessagesTable.sent_at })
        .from(rfqEmailMessagesTable)
        .where(eq(rfqEmailMessagesTable.vendor_request_id, vendorRequest.id))
        .orderBy(desc(rfqEmailMessagesTable.sent_at), desc(rfqEmailMessagesTable.id)))[0]?.sent_at ?? undefined
      bid.review_task_count = (await db
        .select({ count: sql<number>`count(*)` })
        .from(rfqReviewTasksTable)
        .where(
          and(
            eq(rfqReviewTasksTable.vendor_request_id, vendorRequest.id),
            eq(rfqReviewTasksTable.status, 'open'),
          ),
        ))[0]?.count ?? 0
    }
  }
  return bid
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export async function getProjects(userId: string): Promise<ContractorProject[]> {
  const rows = await db.select().from(projectsTable)
  return rows
    .filter(
      (p) =>
        p.owner_id === userId ||
        (p.collaborator_ids ? JSON.parse(p.collaborator_ids) : []).includes(userId),
    )
    .map(rowToProject)
}

export async function getAllProjects(): Promise<ContractorProject[]> {
  const rows = await db.select().from(projectsTable)
  return rows.map(rowToProject)
}

export async function getProject(id: string): Promise<ContractorProject | null> {
  const row = (await db.select().from(projectsTable).where(eq(projectsTable.id, id)))[0]
  if (!row) return null
  return { ...rowToProject(row), spec_documents: await listProjectSpecDocuments(id) }
}

export async function saveProject(project: ContractorProject): Promise<void> {
  await db.insert(projectsTable)
    .values({
      id: project.id,
      owner_id: project.owner_id,
      name: project.name,
      location: project.location,
      general_contractor: project.general_contractor ?? null,
      description: project.description ?? null,
      budget: project.budget ?? null,
      status: project.status,
      collaborator_ids: JSON.stringify(project.collaborator_ids ?? []),
      rfq_categories: JSON.stringify(project.rfq_categories ?? []),
      created_at: project.created_at,
    })
    .onConflictDoUpdate({
      target: projectsTable.id,
      set: {
        name: project.name,
        location: project.location,
        general_contractor: project.general_contractor ?? null,
        description: project.description ?? null,
        budget: project.budget ?? null,
        status: project.status,
        collaborator_ids: JSON.stringify(project.collaborator_ids ?? []),
        rfq_categories: JSON.stringify(project.rfq_categories ?? []),
      },
    })
}

export async function deleteProject(projectId: string): Promise<void> {
  await db.delete(projectsTable).where(eq(projectsTable.id, projectId))
  // Cascades: rfqs → rfq_line_items, rfq_invites, bids → bid_line_items
}

// ---------------------------------------------------------------------------
// RFQs
// ---------------------------------------------------------------------------

async function fetchRFQ(rfqId: string): Promise<ContractorRFQ | null> {
  const row = (await db.select().from(rfqsTable).where(eq(rfqsTable.id, rfqId)))[0]
  if (!row) return null
  const lineItems = await db.select().from(rfqLineItemsTable).where(eq(rfqLineItemsTable.rfq_id, rfqId))
  const invites = await db.select().from(rfqInvitesTable).where(eq(rfqInvitesTable.rfq_id, rfqId))
  return assembleRFQ(row, lineItems, invites)
}

export async function getRFQ(rfqId: string): Promise<ContractorRFQ | null> {
  return fetchRFQ(rfqId)
}

export async function getRFQById(rfqId: string): Promise<ContractorRFQ | undefined> {
  return (await fetchRFQ(rfqId)) ?? undefined
}

export async function updateRFQTitle(rfqId: string, title: string): Promise<void> {
  await db.update(rfqsTable).set({ title }).where(eq(rfqsTable.id, rfqId))
}

export async function saveRFQ(rfq: ContractorRFQ): Promise<void> {
  await db.insert(rfqsTable)
    .values({
      id: rfq.id,
      project_id: rfq.project_id,
      title: rfq.title,
      request_type: rfq.request_type ?? 'rfq',
      email_subject: rfq.email_subject ?? null,
      email_body: rfq.email_body ?? null,
      category: rfq.category ?? null,
      status: rfq.status,
      visibility: rfq.visibility,
      anonymous_public_listing: rfq.anonymous_public_listing ?? false,
      procurement_objective: rfq.rfp_details?.procurement_objective ?? null,
      scope_summary: rfq.rfp_details?.scope_summary ?? null,
      desired_outcome: rfq.rfp_details?.desired_outcome ?? null,
      performance_requirements: rfq.rfp_details?.performance_requirements ?? null,
      approved_alternates: rfq.rfp_details?.approved_alternates ?? null,
      quantity_context: rfq.rfp_details?.quantity_context ?? null,
      site_conditions: rfq.rfp_details?.site_conditions ?? null,
      delivery_zip: rfq.rfp_details?.delivery_zip ?? null,
      delivery_logistics: rfq.rfp_details?.delivery_logistics ?? null,
      delivery_window: rfq.rfp_details?.delivery_window ?? null,
      phased_delivery: rfq.rfp_details?.phased_delivery ?? null,
      submittals_required: rfq.rfp_details?.submittals_required ?? null,
      lead_time_sensitivity: rfq.rfp_details?.lead_time_sensitivity ?? null,
      exclusions: rfq.rfp_details?.exclusions ?? null,
      unknowns_or_questions: rfq.rfp_details?.unknowns_or_questions ?? null,
      vendor_questions_requested: rfq.rfp_details?.vendor_questions_requested ?? null,
      vendor_guidance_requested: rfq.rfp_details?.vendor_guidance_requested ?? null,
      attachments_summary: rfq.rfp_details?.attachments_summary ?? null,
      procurement_requirements_json: JSON.stringify(rfq.procurement_requirements ?? []),
      ai_spec_assistant_json: rfq.ai_spec_assistant ? JSON.stringify(rfq.ai_spec_assistant) : null,
      commodity_watch_json: JSON.stringify(rfq.commodity_watch ?? []),
      risk_flags_json: JSON.stringify(rfq.risk_flags ?? []),
      vendor_response_fields_json: JSON.stringify(rfq.vendor_response_fields ?? []),
      attachment_urls_json: JSON.stringify(rfq.attachment_urls ?? []),
      source_rfq_id: rfq.source_rfq_id ?? null,
      bid_deadline: rfq.bid_deadline ?? null,
      created_at: rfq.created_at,
      published_at: rfq.published_at ?? null,
    })
    .onConflictDoUpdate({
      target: rfqsTable.id,
      set: {
        title: rfq.title,
        request_type: rfq.request_type ?? 'rfq',
        email_subject: rfq.email_subject ?? null,
        email_body: rfq.email_body ?? null,
        category: rfq.category ?? null,
        status: rfq.status,
        visibility: rfq.visibility,
        anonymous_public_listing: rfq.anonymous_public_listing ?? false,
        procurement_objective: rfq.rfp_details?.procurement_objective ?? null,
        scope_summary: rfq.rfp_details?.scope_summary ?? null,
        desired_outcome: rfq.rfp_details?.desired_outcome ?? null,
        performance_requirements: rfq.rfp_details?.performance_requirements ?? null,
        approved_alternates: rfq.rfp_details?.approved_alternates ?? null,
        quantity_context: rfq.rfp_details?.quantity_context ?? null,
        site_conditions: rfq.rfp_details?.site_conditions ?? null,
        delivery_zip: rfq.rfp_details?.delivery_zip ?? null,
        delivery_logistics: rfq.rfp_details?.delivery_logistics ?? null,
        delivery_window: rfq.rfp_details?.delivery_window ?? null,
        phased_delivery: rfq.rfp_details?.phased_delivery ?? null,
        submittals_required: rfq.rfp_details?.submittals_required ?? null,
        lead_time_sensitivity: rfq.rfp_details?.lead_time_sensitivity ?? null,
        exclusions: rfq.rfp_details?.exclusions ?? null,
        unknowns_or_questions: rfq.rfp_details?.unknowns_or_questions ?? null,
        vendor_questions_requested: rfq.rfp_details?.vendor_questions_requested ?? null,
        vendor_guidance_requested: rfq.rfp_details?.vendor_guidance_requested ?? null,
        attachments_summary: rfq.rfp_details?.attachments_summary ?? null,
        procurement_requirements_json: JSON.stringify(rfq.procurement_requirements ?? []),
        ai_spec_assistant_json: rfq.ai_spec_assistant ? JSON.stringify(rfq.ai_spec_assistant) : null,
        commodity_watch_json: JSON.stringify(rfq.commodity_watch ?? []),
        risk_flags_json: JSON.stringify(rfq.risk_flags ?? []),
        vendor_response_fields_json: JSON.stringify(rfq.vendor_response_fields ?? []),
        attachment_urls_json: JSON.stringify(rfq.attachment_urls ?? []),
        source_rfq_id: rfq.source_rfq_id ?? null,
        bid_deadline: rfq.bid_deadline ?? null,
        published_at: rfq.published_at ?? null,
      },
    })

  // Replace line items
  await db.delete(rfqLineItemsTable).where(eq(rfqLineItemsTable.rfq_id, rfq.id))
  if (rfq.line_items.length > 0) {
    await db.insert(rfqLineItemsTable)
      .values(
        rfq.line_items.map((li, idx) => ({
          id: li.id,
          rfq_id: rfq.id,
          sku: li.sku || null,
          description: li.description,
          quantity: li.quantity,
          unit: li.unit,
          specs: li.specs ?? null,
          constraints: li.constraints ?? null,
          attributes_json: li.attributes ? JSON.stringify(li.attributes) : null,
          certifications: li.certifications ? JSON.stringify(li.certifications) : null,
          notes: li.notes ?? null,
          contractor_budget: li.contractor_budget ?? null,
          suggested_lead_time_days: li.suggested_lead_time_days ?? null,
          sort_order: idx,
        })),
      )
  }

  // Replace invites
  await db.delete(rfqInvitesTable).where(eq(rfqInvitesTable.rfq_id, rfq.id))
  const inviteRows = (rfq.invites && rfq.invites.length > 0
    ? rfq.invites
    : [
        ...rfq.invited_vendor_ids.map((vendorId) => ({
          vendor_id: vendorId,
          vendor_email: '',
          vendor_name: vendorId,
          vendor_first_name: undefined,
          vendor_last_name: undefined,
          on_platform: true,
        })),
        ...rfq.invited_vendor_emails.map((vendorEmail) => ({
          vendor_id: undefined,
          vendor_email: vendorEmail,
          vendor_name: vendorEmail,
          vendor_first_name: undefined,
          vendor_last_name: undefined,
          on_platform: false,
        })),
      ])
    .filter((invite) => invite.vendor_id || invite.vendor_email)
    .map((invite) => ({
      rfq_id: rfq.id,
      vendor_id: invite.vendor_id ?? null,
      vendor_email: invite.vendor_email || null,
      vendor_name: invite.vendor_name || null,
      vendor_first_name: invite.vendor_first_name ?? null,
      vendor_last_name: invite.vendor_last_name ?? null,
      on_platform: invite.on_platform,
    }))
  if (inviteRows.length > 0) {
    await db.insert(rfqInvitesTable).values(inviteRows)
  }
}

export async function updateRFQInviteList(
  rfqId: string,
  invites: NonNullable<ContractorRFQ['invites']>,
  emailBody?: string,
): Promise<void> {
  // Keep invite-only edits away from saveRFQ; replacing RFQ line items can cascade into bid line responses.
  const patch: Partial<typeof rfqsTable.$inferInsert> = {}
  if (emailBody !== undefined) patch.email_body = emailBody
  if (Object.keys(patch).length > 0) {
    await db.update(rfqsTable).set(patch).where(eq(rfqsTable.id, rfqId))
  }

  await db.delete(rfqInvitesTable).where(eq(rfqInvitesTable.rfq_id, rfqId))
  const inviteRows = invites
    .filter((invite) => invite.vendor_id || invite.vendor_email)
    .map((invite) => ({
      rfq_id: rfqId,
      vendor_id: invite.vendor_id ?? null,
      vendor_email: invite.vendor_email || null,
      vendor_name: invite.vendor_name || null,
      vendor_first_name: invite.vendor_first_name ?? null,
      vendor_last_name: invite.vendor_last_name ?? null,
      on_platform: invite.on_platform,
    }))
  if (inviteRows.length > 0) {
    await db.insert(rfqInvitesTable).values(inviteRows)
  }
}

export async function deleteRFQ(rfqId: string): Promise<void> {
  await db.delete(rfqsTable).where(eq(rfqsTable.id, rfqId))
  // Cascades: rfq_line_items, rfq_invites, bids → bid_line_items
}

export async function getProjectRFQs(projectId: string, status?: string): Promise<ContractorRFQ[]> {
  let rows = await db
    .select()
    .from(rfqsTable)
    .where(eq(rfqsTable.project_id, projectId))

  if (status && status !== 'all') {
    if (status === 'pending') rows = rows.filter((r) => r.status === 'draft')
    else if (status === 'active') rows = rows.filter((r) => r.status === 'active')
    else if (status === 'closed') rows = rows.filter((r) => r.status === 'closed')
    else rows = rows.filter((r) => r.status === status)
  }

  return Promise.all(rows.map(async (row) => {
    const lineItems = await db.select().from(rfqLineItemsTable).where(eq(rfqLineItemsTable.rfq_id, row.id))
    const invites = await db.select().from(rfqInvitesTable).where(eq(rfqInvitesTable.rfq_id, row.id))
    return assembleRFQ(row, lineItems, invites)
  }))
}

export async function getProjectRFQCounts(projectId: string): Promise<ProjectRFQCounts> {
  const rows = await db.select({ status: rfqsTable.status }).from(rfqsTable).where(eq(rfqsTable.project_id, projectId))
  return {
    total: rows.length,
    pending: rows.filter((r) => r.status === 'draft').length,
    active: rows.filter((r) => r.status === 'active').length,
    closed: rows.filter((r) => r.status === 'closed').length,
  }
}

export type ProjectRFQCounts = { total: number; pending: number; active: number; closed: number }

export async function getProjectRFQCountsByProjectIds(projectIds: string[]): Promise<Map<string, ProjectRFQCounts>> {
  const counts = new Map<string, ProjectRFQCounts>()
  for (const projectId of projectIds) {
    counts.set(projectId, { total: 0, pending: 0, active: 0, closed: 0 })
  }
  if (projectIds.length === 0) return counts

  const rows = await db
    .select({
      projectId: rfqsTable.project_id,
      total: sql<number>`count(*)::int`,
      pending: sql<number>`sum(case when ${rfqsTable.status} = 'draft' then 1 else 0 end)::int`,
      active: sql<number>`sum(case when ${rfqsTable.status} = 'active' then 1 else 0 end)::int`,
      closed: sql<number>`sum(case when ${rfqsTable.status} = 'closed' then 1 else 0 end)::int`,
    })
    .from(rfqsTable)
    .where(inArray(rfqsTable.project_id, projectIds))
    .groupBy(rfqsTable.project_id)

  for (const row of rows) {
    counts.set(row.projectId, {
      total: Number(row.total),
      pending: Number(row.pending),
      active: Number(row.active),
      closed: Number(row.closed),
    })
  }

  return counts
}

export async function getAllActiveRFQs(): Promise<ContractorRFQ[]> {
  const rows = await db
    .select()
    .from(rfqsTable)
    .where(
      and(
        eq(rfqsTable.status, 'active'),
        ne(rfqsTable.visibility, 'invited_only'),
      ),
    )
  return Promise.all(rows.map(async (row) => {
    const lineItems = await db.select().from(rfqLineItemsTable).where(eq(rfqLineItemsTable.rfq_id, row.id))
    const invites = await db.select().from(rfqInvitesTable).where(eq(rfqInvitesTable.rfq_id, row.id))
    return assembleRFQ(row, lineItems, invites)
  }))
}

export async function getInvitedRFQsForVendor(vendorEmail: string, vendorId?: string): Promise<ContractorRFQ[]> {
  const inviteMatchRows = await db
    .select({ rfq_id: rfqInvitesTable.rfq_id })
    .from(rfqInvitesTable)
    .where(
      vendorId
        ? or(eq(rfqInvitesTable.vendor_email, vendorEmail), eq(rfqInvitesTable.vendor_id, vendorId))
        : eq(rfqInvitesTable.vendor_email, vendorEmail),
    )
  const inviteMatches = inviteMatchRows.map((r) => r.rfq_id)

  if (inviteMatches.length === 0) return []

  const rows = await db
    .select()
    .from(rfqsTable)
    .where(
      and(
        eq(rfqsTable.status, 'active'),
        inArray(rfqsTable.id, inviteMatches),
      ),
    )

  return Promise.all(rows.map(async (row) => {
    const lineItems = await db.select().from(rfqLineItemsTable).where(eq(rfqLineItemsTable.rfq_id, row.id))
    const invites = await db.select().from(rfqInvitesTable).where(eq(rfqInvitesTable.rfq_id, row.id))
    return assembleRFQ(row, lineItems, invites)
  }))
}

// ---------------------------------------------------------------------------
// Bids
// ---------------------------------------------------------------------------

export async function getBidsForRFQ(rfqId: string): Promise<ContractorBid[]> {
  const bidRows = await db
    .select()
    .from(bidsTable)
    .where(and(eq(bidsTable.rfq_id, rfqId), eq(bidsTable.is_draft, false)))
  return Promise.all(bidRows.map(async (row) => {
    const lineItems = await db.select().from(bidLineItemsTable).where(eq(bidLineItemsTable.bid_id, row.id))
    return assembleBid(row, lineItems)
  }))
}

export async function appendBidToRFQ(rfqId: string, bid: ContractorBid): Promise<void> {
  await db.insert(bidsTable)
    .values({
      id: bid.id,
      rfq_id: rfqId,
      vendor_id: bid.vendor_id ?? null,
      vendor_email: bid.vendor_email ?? null,
      vendor_name: bid.vendor_name,
      designer_name: bid.designer_name ?? null,
      is_invited: bid.is_invited,
      is_on_platform: bid.is_on_platform,
      submitted_at: bid.submitted_at,
      total_price: bid.total_price,
      currency: bid.currency,
      lead_time_days: bid.lead_time_days,
      notes: bid.notes ?? null,
      payment_terms: bid.terms?.payment_terms ?? null,
      deposit_terms: bid.terms?.deposit_terms ?? null,
      credit_terms: bid.terms?.credit_terms ?? null,
      escalation_clause: bid.terms?.escalation_clause ?? null,
      price_valid_until: bid.terms?.price_valid_until ?? null,
      shipping_terms: bid.terms?.shipping_terms ?? null,
      compliance_declarations_json: JSON.stringify(bid.compliance_declarations ?? []),
      risk_flags_json: JSON.stringify(bid.risk_flags ?? []),
      fulfillment_summary_json: bid.fulfillment_summary ? JSON.stringify(bid.fulfillment_summary) : null,
      buyer_decision_status: bid.buyer_decision_status ?? null,
      decision_rationale: bid.decision_rationale ?? null,
      vendor_reliability_flag: bid.vendor_reliability_flag ?? null,
      status: bid.status,
      is_draft: false,
      source: bid.source ?? 'platform',
    })
    .onConflictDoUpdate({
      target: bidsTable.id,
      set: {
        vendor_id: bid.vendor_id ?? null,
        vendor_email: bid.vendor_email ?? null,
        vendor_name: bid.vendor_name,
        designer_name: bid.designer_name ?? null,
        is_invited: bid.is_invited,
        is_on_platform: bid.is_on_platform,
        submitted_at: bid.submitted_at,
        total_price: bid.total_price,
        lead_time_days: bid.lead_time_days,
        notes: bid.notes ?? null,
        payment_terms: bid.terms?.payment_terms ?? null,
        deposit_terms: bid.terms?.deposit_terms ?? null,
        credit_terms: bid.terms?.credit_terms ?? null,
        escalation_clause: bid.terms?.escalation_clause ?? null,
        price_valid_until: bid.terms?.price_valid_until ?? null,
        shipping_terms: bid.terms?.shipping_terms ?? null,
        compliance_declarations_json: JSON.stringify(bid.compliance_declarations ?? []),
        risk_flags_json: JSON.stringify(bid.risk_flags ?? []),
        fulfillment_summary_json: bid.fulfillment_summary ? JSON.stringify(bid.fulfillment_summary) : null,
        buyer_decision_status: bid.buyer_decision_status ?? null,
        decision_rationale: bid.decision_rationale ?? null,
        vendor_reliability_flag: bid.vendor_reliability_flag ?? null,
        status: bid.status,
        is_draft: false,
        source: bid.source ?? 'platform',
      },
    })

  // Replace line item responses
  await db.delete(bidLineItemsTable).where(eq(bidLineItemsTable.bid_id, bid.id))
  if (bid.line_item_responses.length > 0) {
    await db.insert(bidLineItemsTable)
      .values(
        bid.line_item_responses.map((li) => ({
          bid_id: bid.id,
          line_item_id: li.line_item_id,
          sku: li.sku || null,
          description: li.description || null,
          quantity: li.quantity ?? null,
          quoted_quantity: li.quoted_quantity ?? null,
          unit: li.unit || null,
          unit_price: li.unit_price,
          total_price: li.total_price,
          lead_time_days: li.lead_time_days,
          availability: li.availability,
          units_available: li.units_available ?? null,
          delivery_terms: li.delivery_terms ?? null,
          notes: li.notes ?? null,
          substitution_notes: li.substitution_notes ?? null,
          quoted_product_details: li.quoted_product_details ?? null,
          response_attributes_json: JSON.stringify(li.response_attributes ?? []),
          is_alternate: li.is_alternate ?? false,
        })),
      )
  }
}

export async function saveBidsForRFQ(rfqId: string, bidList: ContractorBid[]): Promise<void> {
  // Delete all non-draft bids for this RFQ, then re-insert
  await db.delete(bidsTable).where(and(eq(bidsTable.rfq_id, rfqId), eq(bidsTable.is_draft, false)))
  for (const bid of bidList) {
    await appendBidToRFQ(rfqId, bid)
  }
}

export async function updateBid(
  rfqId: string,
  bidId: string,
  updates: Omit<Partial<ContractorBid>, 'buyer_decision_status'> & { buyer_decision_status?: ContractorBid['buyer_decision_status'] | null },
): Promise<void> {
  const patch: Partial<typeof bidsTable.$inferInsert> = {}
  if (updates.status !== undefined) patch.status = updates.status
  if (updates.vendor_name !== undefined) patch.vendor_name = updates.vendor_name
  if (updates.designer_name !== undefined) patch.designer_name = updates.designer_name ?? null
  if (updates.total_price !== undefined) patch.total_price = updates.total_price
  if (updates.lead_time_days !== undefined) patch.lead_time_days = updates.lead_time_days
  if (updates.notes !== undefined) patch.notes = updates.notes ?? null
  if (updates.terms?.payment_terms !== undefined) patch.payment_terms = updates.terms.payment_terms ?? null
  if (updates.terms?.deposit_terms !== undefined) patch.deposit_terms = updates.terms.deposit_terms ?? null
  if (updates.terms?.credit_terms !== undefined) patch.credit_terms = updates.terms.credit_terms ?? null
  if (updates.terms?.escalation_clause !== undefined) patch.escalation_clause = updates.terms.escalation_clause ?? null
  if (updates.terms?.price_valid_until !== undefined) patch.price_valid_until = updates.terms.price_valid_until ?? null
  if (updates.terms?.shipping_terms !== undefined) patch.shipping_terms = updates.terms.shipping_terms ?? null
  if (updates.compliance_declarations !== undefined) patch.compliance_declarations_json = JSON.stringify(updates.compliance_declarations ?? [])
  if (updates.risk_flags !== undefined) patch.risk_flags_json = JSON.stringify(updates.risk_flags ?? [])
  if (updates.fulfillment_summary !== undefined) patch.fulfillment_summary_json = updates.fulfillment_summary ? JSON.stringify(updates.fulfillment_summary) : null
  if (updates.buyer_decision_status !== undefined) patch.buyer_decision_status = updates.buyer_decision_status ?? null
  if (updates.decision_rationale !== undefined) patch.decision_rationale = updates.decision_rationale ?? null
  if (updates.vendor_reliability_flag !== undefined) patch.vendor_reliability_flag = updates.vendor_reliability_flag ?? null
  if (updates.source !== undefined) patch.source = updates.source
  if (Object.keys(patch).length > 0) {
    await db.update(bidsTable).set(patch).where(eq(bidsTable.id, bidId))
  }
}

export async function getContractorActivity(
  userId: string,
  limit = 8,
): Promise<ContractorActivityNotification[]> {
  if (!userId) return []

  const projectRows = await db
    .select({
      id: projectsTable.id,
      name: projectsTable.name,
    })
    .from(projectsTable)
    .where(eq(projectsTable.owner_id, userId))

  const projectIds = projectRows.map((project) => project.id)
  if (projectIds.length === 0) return []

  const projectNameById = new Map(projectRows.map((project) => [project.id, project.name]))

  const rfqRows = await db
    .select({
      id: rfqsTable.id,
      project_id: rfqsTable.project_id,
      title: rfqsTable.title,
      status: rfqsTable.status,
      published_at: rfqsTable.published_at,
    })
    .from(rfqsTable)
    .where(inArray(rfqsTable.project_id, projectIds))

  const rfqIds = rfqRows.map((rfq) => rfq.id)
  const rfqById = new Map(rfqRows.map((rfq) => [rfq.id, rfq]))
  const activity: ContractorActivityNotification[] = []

  for (const rfq of rfqRows) {
    if (!rfq.published_at) continue
    activity.push({
      id: `rfq-published-${rfq.id}`,
      type: 'rfq_published',
      title: `RFQ published: ${rfq.title}`,
      body: `${projectNameById.get(rfq.project_id) ?? 'Project'} is now collecting vendor quotes.`,
      rfq_id: rfq.id,
      project_id: rfq.project_id,
      read: true,
      created_at: rfq.published_at,
    })
  }

  if (rfqIds.length > 0) {
    const bidRows = await db
      .select({
        id: bidsTable.id,
        rfq_id: bidsTable.rfq_id,
        vendor_name: bidsTable.vendor_name,
        total_price: bidsTable.total_price,
        submitted_at: bidsTable.submitted_at,
      })
      .from(bidsTable)
      .where(and(inArray(bidsTable.rfq_id, rfqIds), eq(bidsTable.is_draft, false)))

    for (const bid of bidRows) {
      const rfq = rfqById.get(bid.rfq_id)
      if (!rfq) continue
      activity.push({
        id: `bid-${bid.id}`,
        type: 'bid_received',
        title: `New quote received: ${rfq.title}`,
        body: `${bid.vendor_name} submitted a quote of ${fmtActivityCurrency(bid.total_price)}.`,
        rfq_id: bid.rfq_id,
        project_id: rfq.project_id,
        read: true,
        created_at: bid.submitted_at,
      })
    }

    const emailRows = await db
      .select({
        id: rfqEmailMessagesTable.id,
        rfq_id: rfqEmailMessagesTable.rfq_id,
        from_name: rfqEmailMessagesTable.from_name,
        from_email: rfqEmailMessagesTable.from_email,
        subject: rfqEmailMessagesTable.subject,
        snippet: rfqEmailMessagesTable.snippet,
        sent_at: rfqEmailMessagesTable.sent_at,
        is_unread: rfqEmailMessagesTable.is_unread,
      })
      .from(rfqEmailMessagesTable)
      .where(
        and(
          eq(rfqEmailMessagesTable.contractor_user_id, userId),
          eq(rfqEmailMessagesTable.direction, 'inbound'),
        ),
      )

    for (const email of emailRows) {
      const rfq = email.rfq_id ? rfqById.get(email.rfq_id) : undefined
      activity.push({
        id: `email-${email.id}`,
        type: 'email_received',
        title: `Vendor reply received${rfq ? `: ${rfq.title}` : ''}`,
        body: `${email.from_name || email.from_email || 'Vendor'}: ${email.subject || email.snippet || 'New email message'}`,
        rfq_id: email.rfq_id ?? undefined,
        project_id: rfq?.project_id,
        read: !email.is_unread,
        created_at: email.sent_at || new Date(0).toISOString(),
      })
    }

    const messageRows = await db
      .select({
        id: negotiationMessagesTable.id,
        rfq_id: negotiationMessagesTable.rfq_id,
        vendor_email: negotiationMessagesTable.vendor_email,
        author_name: negotiationMessagesTable.author_name,
        message: negotiationMessagesTable.message,
        created_at: negotiationMessagesTable.created_at,
      })
      .from(negotiationMessagesTable)
      .where(
        and(
          inArray(negotiationMessagesTable.rfq_id, rfqIds),
          eq(negotiationMessagesTable.author_role, 'vendor'),
        ),
      )

    for (const message of messageRows) {
      const rfq = rfqById.get(message.rfq_id)
      if (!rfq) continue
      const projectName = projectNameById.get(rfq.project_id) ?? 'Project'
      const vendorName = message.author_name || message.vendor_email || 'Vendor'
      activity.push({
        id: `message-${message.id}`,
        type: 'message_received',
        title: `New message received: ${vendorName} ${projectName}`,
        body: message.message,
        rfq_id: message.rfq_id,
        project_id: rfq.project_id,
        read: false,
        created_at: message.created_at,
      })
    }

    const reviewRows = await db
      .select({
        id: rfqReviewTasksTable.id,
        rfq_id: rfqReviewTasksTable.rfq_id,
        title: rfqReviewTasksTable.title,
        task_type: rfqReviewTasksTable.task_type,
        status: rfqReviewTasksTable.status,
        created_at: rfqReviewTasksTable.created_at,
      })
      .from(rfqReviewTasksTable)
      .where(eq(rfqReviewTasksTable.contractor_user_id, userId))

    for (const task of reviewRows) {
      const rfq = task.rfq_id ? rfqById.get(task.rfq_id) : undefined
      activity.push({
        id: `review-task-${task.id}`,
        type: 'review_task',
        title: task.title || `Review needed${rfq ? `: ${rfq.title}` : ''}`,
        body: `${task.task_type.replace(/_/g, ' ') || 'Quote review'} is ${task.status}.`,
        rfq_id: task.rfq_id ?? undefined,
        project_id: rfq?.project_id,
        read: task.status !== 'open',
        created_at: task.created_at,
      })
    }
  }

  return activity
    .filter((item) => Number.isFinite(new Date(item.created_at).getTime()))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit)
}

function fmtActivityCurrency(amount: number): string {
  return `$${Math.round(amount).toLocaleString()}`
}

export async function upsertVendorRelationship(params: {
  contractorUserId: string
  vendorId?: string
  vendorEmail: string
  vendorName: string
  trustedStatus: VendorReliabilityFlag
  rating?: number
  termsHistorySummary?: string
  qualificationNotes?: string
}): Promise<void> {
  const now = new Date().toISOString()
  await db.insert(vendorRelationshipsTable)
    .values({
      contractor_user_id: params.contractorUserId,
      vendor_id: params.vendorId ?? null,
      vendor_email: params.vendorEmail,
      vendor_name: params.vendorName,
      trusted_status: params.trustedStatus,
      rating: params.rating ?? 3,
      terms_history_summary: params.termsHistorySummary ?? '',
      qualification_notes: params.qualificationNotes ?? '',
      created_at: now,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: [vendorRelationshipsTable.contractor_user_id, vendorRelationshipsTable.vendor_email],
      set: {
        vendor_id: params.vendorId ?? null,
        vendor_name: params.vendorName,
        trusted_status: params.trustedStatus,
        rating: params.rating ?? 3,
        terms_history_summary: params.termsHistorySummary ?? '',
        qualification_notes: params.qualificationNotes ?? '',
        updated_at: now,
      },
    })
}

export async function getVendorRelationship(contractorUserId: string, vendorEmail: string) {
  return (await db.select().from(vendorRelationshipsTable).where(
    and(
      eq(vendorRelationshipsTable.contractor_user_id, contractorUserId),
      eq(vendorRelationshipsTable.vendor_email, vendorEmail),
    ),
  ))[0] ?? null
}

export async function addNegotiationMessage(params: {
  rfqId: string
  bidId?: string
  vendorId?: string
  vendorEmail?: string
  authorRole: 'contractor' | 'vendor'
  authorName: string
  message: string
}): Promise<void> {
  await db.insert(negotiationMessagesTable).values({
    rfq_id: params.rfqId,
    bid_id: params.bidId ?? null,
    vendor_id: params.vendorId ?? null,
    vendor_email: params.vendorEmail ?? null,
    author_role: params.authorRole,
    author_name: params.authorName,
    message: params.message,
    created_at: new Date().toISOString(),
  })
}

export async function getNegotiationMessagesForBid(rfqId: string, bidId: string): Promise<NegotiationMessage[]> {
  const rows = await db
    .select()
    .from(negotiationMessagesTable)
    .where(and(eq(negotiationMessagesTable.rfq_id, rfqId), eq(negotiationMessagesTable.bid_id, bidId)))
  return rows.map((row) => ({
    id: row.id,
    rfq_id: row.rfq_id,
    bid_id: row.bid_id ?? undefined,
    vendor_id: row.vendor_id ?? undefined,
    vendor_email: row.vendor_email ?? undefined,
    author_role: row.author_role as NegotiationMessage['author_role'],
    author_name: row.author_name,
    message: row.message,
    created_at: row.created_at,
  }))
}

function rowToNegotiationMessage(row: typeof negotiationMessagesTable.$inferSelect): NegotiationMessage {
  return {
    id: row.id,
    rfq_id: row.rfq_id,
    bid_id: row.bid_id ?? undefined,
    vendor_id: row.vendor_id ?? undefined,
    vendor_email: row.vendor_email ?? undefined,
    author_role: row.author_role as NegotiationMessage['author_role'],
    author_name: row.author_name,
    message: row.message,
    created_at: row.created_at,
  }
}

export async function getNegotiationMessagesForVendor(
  rfqId: string,
  vendorEmail: string,
  vendorId?: string,
): Promise<NegotiationMessage[]> {
  const normalizedEmail = vendorEmail.trim().toLowerCase()
  const rows = await db
    .select()
    .from(negotiationMessagesTable)
    .where(
      and(
        eq(negotiationMessagesTable.rfq_id, rfqId),
        vendorId
          ? or(eq(negotiationMessagesTable.vendor_email, normalizedEmail), eq(negotiationMessagesTable.vendor_id, vendorId))
          : eq(negotiationMessagesTable.vendor_email, normalizedEmail),
      ),
    )
    .orderBy(desc(negotiationMessagesTable.created_at), desc(negotiationMessagesTable.id))
  return rows.map(rowToNegotiationMessage)
}
