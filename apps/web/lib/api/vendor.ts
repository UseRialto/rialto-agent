/**
 * Vendor API - reads projects/RFQs from contractor store.
 * SERVER-SIDE ONLY.
 */

import type { Project, BidDraft, SubmittedBid, BidLineItemResponse } from '@/lib/types/vendor'
import type { BidTerms, ComplianceDeclaration } from '@/lib/types/procurement'
import type { RFQTableRow } from '@/app/vendor/projects/[projectId]/_components/RFQListTable'
import { and, eq, inArray, ne, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  projects as projectsTable,
  rfqs as rfqsTable,
  rfqInvites as rfqInvitesTable,
  users as usersTable,
} from '@/lib/db/schema'
import {
  getAllProjects,
  getProject,
  getProjectRFQs,
  getBidsForRFQ,
} from '@/lib/store/contractor-store'
import {
  getDraft,
  saveDraft,
  getSubmittedBids as storeGetSubmittedBids,
  recordSubmission,
  getSubmittedRfqIds,
} from '@/lib/store/server-store'
import { findUserById } from '@/lib/auth/users'

interface VendorProjectsSummary {
  projects: Project[]
  totalOpenRFQs: number
  invitedProjectCount: number
}

function parseCompanyName(companyInfo: string | null, fallback: string): string {
  if (!companyInfo) return fallback
  try {
    const parsed = JSON.parse(companyInfo) as { company_name?: string }
    return parsed.company_name ?? fallback
  } catch {
    return fallback
  }
}

export async function getVendorProjectsSummary(vendorEmail?: string, vendorId?: string): Promise<VendorProjectsSummary> {
  const publicRFQs = await db
    .select({
      id: rfqsTable.id,
      project_id: rfqsTable.project_id,
      bid_deadline: rfqsTable.bid_deadline,
      visibility: rfqsTable.visibility,
      anonymous_public_listing: rfqsTable.anonymous_public_listing,
    })
    .from(rfqsTable)
    .where(
      and(
        eq(rfqsTable.status, 'active'),
        ne(rfqsTable.visibility, 'invited_only'),
      ),
    )

  const invitedRFQs = vendorEmail
    ? await db
      .select({
        id: rfqsTable.id,
        project_id: rfqsTable.project_id,
        bid_deadline: rfqsTable.bid_deadline,
        visibility: rfqsTable.visibility,
        anonymous_public_listing: rfqsTable.anonymous_public_listing,
      })
      .from(rfqInvitesTable)
      .innerJoin(rfqsTable, eq(rfqInvitesTable.rfq_id, rfqsTable.id))
      .where(
        and(
          eq(rfqsTable.status, 'active'),
          vendorId
            ? or(eq(rfqInvitesTable.vendor_email, vendorEmail), eq(rfqInvitesTable.vendor_id, vendorId))
            : eq(rfqInvitesTable.vendor_email, vendorEmail),
        ),
      )
    : []

  const rfqById = new Map<string, (typeof publicRFQs)[number]>()
  for (const rfq of publicRFQs) rfqById.set(rfq.id, rfq)
  for (const rfq of invitedRFQs) rfqById.set(rfq.id, rfq)

  const visibleRFQs = [...rfqById.values()]
  const projectIds = [...new Set(visibleRFQs.map((rfq) => rfq.project_id))]
  if (projectIds.length === 0) {
    return { projects: [], totalOpenRFQs: 0, invitedProjectCount: 0 }
  }

  const projectRows = await db
    .select()
    .from(projectsTable)
    .where(and(inArray(projectsTable.id, projectIds), eq(projectsTable.status, 'active')))
  const projectById = new Map(projectRows.map((project) => [project.id, project]))
  const ownerIds = [...new Set(projectRows.map((project) => project.owner_id))]
  const ownerRows = ownerIds.length > 0
    ? await db.select().from(usersTable).where(inArray(usersTable.id, ownerIds))
    : []
  const ownerById = new Map(ownerRows.map((owner) => [owner.id, owner]))

  const invitedRfqCountByProject = new Map<string, number>()
  for (const rfq of invitedRFQs) {
    if (!projectById.has(rfq.project_id)) continue
    invitedRfqCountByProject.set(rfq.project_id, (invitedRfqCountByProject.get(rfq.project_id) ?? 0) + 1)
  }

  const rfqsByProject = new Map<string, typeof visibleRFQs>()
  for (const rfq of visibleRFQs) {
    if (!projectById.has(rfq.project_id)) continue
    const list = rfqsByProject.get(rfq.project_id) ?? []
    list.push(rfq)
    rfqsByProject.set(rfq.project_id, list)
  }

  const projects = [...rfqsByProject.entries()].map(([projectId, rfqs]) => {
    const project = projectById.get(projectId)!
    const owner = ownerById.get(project.owner_id)
    const isAnonymous = rfqs.some((rfq) => rfq.visibility !== 'invited_only' && rfq.anonymous_public_listing)
    const nearestDeadline = rfqs.reduce<string | undefined>((current, rfq) => {
      if (!rfq.bid_deadline) return current
      return !current || rfq.bid_deadline < current ? rfq.bid_deadline : current
    }, undefined)
    const invitedCount = invitedRfqCountByProject.get(projectId) ?? 0

    return {
      id: project.id,
      name: project.name,
      contractor_name: isAnonymous
        ? 'Confidential Buyer'
        : owner ? parseCompanyName(owner.company_info, owner.name) : 'General Contractor',
      location: project.location,
      total_rfq_count: rfqs.length,
      relevant_rfq_count: invitedCount > 0 ? invitedCount : rfqs.length,
      relevance_score: 1.0,
      bid_deadline: nearestDeadline,
      status: 'active' as const,
      is_anonymous: isAnonymous,
      public_summary: isAnonymous ? `Public procurement opportunity in ${project.location}` : undefined,
      hasInvitation: invitedCount > 0,
    }
  })

  projects.sort((a, b) => {
    if (a.hasInvitation && !b.hasInvitation) return -1
    if (!a.hasInvitation && b.hasInvitation) return 1
    if (a.bid_deadline && b.bid_deadline) return new Date(a.bid_deadline).getTime() - new Date(b.bid_deadline).getTime()
    return 0
  })

  return {
    projects: projects.map(({ hasInvitation: _hasInvitation, ...project }) => project),
    totalOpenRFQs: visibleRFQs.filter((rfq) => projectById.has(rfq.project_id)).length,
    invitedProjectCount: projects.filter((project) => project.hasInvitation).length,
  }
}

// Maps a ContractorProject to the Project shape used by ProjectCard
export async function getVendorProjects(): Promise<Project[]> {
  const allProjects = await getAllProjects()
  const projects = allProjects.filter((p) => p.status === 'active')
  return Promise.all(projects.map(async (p) => {
    const owner = await findUserById(p.owner_id)
    const activeRFQs = await getProjectRFQs(p.id, 'active')
    const isAnonymous = activeRFQs.some((rfq) => rfq.visibility !== 'invited_only' && rfq.anonymous_public_listing)
    return {
      id: p.id,
      name: p.name,
      contractor_name: isAnonymous ? 'Confidential Buyer' : owner?.company_info?.company_name ?? owner?.name ?? 'General Contractor',
      location: p.location,
      total_rfq_count: activeRFQs.length,
      relevant_rfq_count: activeRFQs.length,
      relevance_score: 1.0,
      status: 'active' as const,
      is_anonymous: isAnonymous,
      public_summary: isAnonymous ? `Public procurement opportunity in ${p.location}` : undefined,
    }
  }))
}

// Returns a single project in Project shape (for breadcrumbs / project header)
export async function getProject_vendor(projectId: string): Promise<Project | null> {
  const p = await getProject(projectId)
  if (!p) return null
  const owner = await findUserById(p.owner_id)
  const activeRFQs = await getProjectRFQs(p.id, 'active')
  const isAnonymous = activeRFQs.some((rfq) => rfq.visibility !== 'invited_only' && rfq.anonymous_public_listing)
  return {
    id: p.id,
    name: p.name,
    contractor_name: isAnonymous ? 'Confidential Buyer' : owner?.company_info?.company_name ?? owner?.name ?? 'General Contractor',
    location: p.location,
    total_rfq_count: activeRFQs.length,
    relevant_rfq_count: activeRFQs.length,
    relevance_score: 1.0,
    status: 'active' as const,
    is_anonymous: isAnonymous,
    public_summary: isAnonymous ? `Public procurement opportunity in ${p.location}` : undefined,
  }
}

// Returns RFQTableRow[] for a project, annotating status from vendor session store
export async function getRFQsForProject(
  projectId: string,
  vendorEmail?: string,
  vendorId?: string,
): Promise<RFQTableRow[]> {
  // Only return RFQs the vendor is allowed to see:
  // - public RFQs (visibility !== 'invited_only'), OR
  // - invited_only RFQs where this vendor is explicitly invited
  const allRFQs = await getProjectRFQs(projectId, 'active')
  const rfqs = allRFQs.filter((rfq) => {
    if (rfq.visibility !== 'invited_only') return true
    return (vendorEmail ? rfq.invited_vendor_emails.includes(vendorEmail) : false) ||
           (vendorId ? rfq.invited_vendor_ids.includes(vendorId) : false)
  })
  const submittedIdList = await getSubmittedRfqIds(vendorId)
  const submittedIds = new Set(submittedIdList)

  return Promise.all(rfqs.map(async (rfq) => {
    let vendor_response_status: 'not_started' | 'draft' | 'submitted' = 'not_started'
    if (submittedIds.has(rfq.id)) {
      vendor_response_status = 'submitted'
    } else {
      // Check contractor store bids for a real submission from this vendor
      const contractorBids = await getBidsForRFQ(rfq.id)
      const hasRealBid = contractorBids.some(
        (b) =>
          (vendorId && b.vendor_id === vendorId) ||
          (vendorEmail && b.vendor_email === vendorEmail),
      )
      if (hasRealBid) {
        vendor_response_status = 'submitted'
      } else {
        const draft = await getDraft(rfq.id, vendorId)
        if (draft) vendor_response_status = 'draft'
      }
    }

    const isInvited =
      (vendorEmail ? rfq.invited_vendor_emails.includes(vendorEmail) : false) ||
      (vendorId ? rfq.invited_vendor_ids.includes(vendorId) : false)

    return {
      id: rfq.id,
      title: rfq.title,
      request_type: rfq.request_type,
      category: rfq.category ?? '',
      line_items: rfq.line_items,
      delivery_date: rfq.bid_deadline ?? '',
      vendor_response_status,
      is_invited: isInvited,
      anonymous_public_listing: rfq.visibility !== 'invited_only' && rfq.anonymous_public_listing,
      public_summary: rfq.visibility !== 'invited_only' && rfq.anonymous_public_listing ? `Confidential buyer · ${rfq.category ?? 'Procurement request'}` : undefined,
      procurement_requirements: rfq.procurement_requirements,
      risk_flags: rfq.risk_flags,
    }
  }))
}

// GET /api/vendor/rfqs/:rfqId/draft
export async function getBidDraft(rfqId: string, vendorId?: string): Promise<BidDraft | null> {
  return getDraft(rfqId, vendorId)
}

// PATCH /api/vendor/rfqs/:rfqId/draft
export async function saveBidDraft(
  rfqId: string,
  responses: BidLineItemResponse[],
  notes?: string,
  meta?: {
    terms?: BidTerms
    complianceDeclarations?: ComplianceDeclaration[]
    designerName?: string
  },
  vendorId?: string,
): Promise<BidDraft> {
  const existing = await getBidDraft(rfqId, vendorId)
  const draft: BidDraft = {
    id: existing?.id ?? `draft-${rfqId}-${vendorId ?? 'anon'}`,
    rfq_id: rfqId,
    vendor_id: vendorId ?? 'current-vendor',
    status: 'draft',
    line_item_responses: responses,
    notes,
    designer_name: meta?.designerName?.trim() || existing?.designer_name,
    terms: meta?.terms,
    compliance_declarations: meta?.complianceDeclarations,
    document_urls: existing?.document_urls ?? [],
    created_at: existing?.created_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  await saveDraft(rfqId, draft)
  return draft
}

// GET /api/vendor/bids
// Pass vendorId to scope results to the current vendor.
// Bids without vendor_id (legacy seed data) are always included.
export async function getSubmittedBids(vendorId?: string): Promise<SubmittedBid[]> {
  const all = await storeGetSubmittedBids()
  if (!vendorId) return all
  return all.filter((b) => !b.vendor_id || b.vendor_id === vendorId)
}

// GET /api/vendor/bids/:bidId
export async function getSubmittedBid(bidId: string, vendorId?: string): Promise<SubmittedBid | null> {
  const all = await getSubmittedBids(vendorId)
  return all.find((b) => b.id === bidId) ?? null
}
