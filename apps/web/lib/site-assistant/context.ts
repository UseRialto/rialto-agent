import type { SessionPayload } from '@/lib/auth/types'
import { findUserById } from '@/lib/auth/users'
import {
  getContractorActivity,
  getContractorProjectRFQs,
  getContractorProjects,
  getContractorRFQBids,
} from '@/lib/api/contractor'
import {
  getRFQsForProject,
  getSubmittedBids,
  getVendorProjectsSummary,
} from '@/lib/api/vendor'
import type { RFQLineItem } from '@/lib/types/vendor'

const MAX_PROJECTS = 6
const MAX_RFQS_PER_PROJECT = 4
const MAX_BIDS_PER_RFQ = 4
const MAX_RECENT_ITEMS = 8

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue | undefined }

export interface SiteAssistantContext {
  generatedAt: string
  user: {
    id: string
    role: SessionPayload['role']
    name: string
    email: string
    company?: string
    profile?: JsonValue
  }
  snapshot: JsonValue
}

function compactText(value: string | undefined, max = 220): string | undefined {
  if (!value) return undefined
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, max - 1)}...`
}

function companyName(companyInfo: unknown): string | undefined {
  if (!companyInfo || typeof companyInfo !== 'object') return undefined
  const maybe = companyInfo as { company_name?: unknown }
  return typeof maybe.company_name === 'string' ? maybe.company_name : undefined
}

function money(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : undefined
}

async function buildContractorSnapshot(session: SessionPayload) {
  const [projects, activity] = await Promise.all([
    getContractorProjects(session.userId),
    getContractorActivity(session.userId),
  ])

  const activeProjects = projects
    .filter((project) => project.status === 'active')
    .slice(0, MAX_PROJECTS)

  const projectSnapshots = await Promise.all(activeProjects.map(async (project) => {
    const rfqs = await getContractorProjectRFQs(project.id, 'all')

    const rfqSnapshots = await Promise.all(
      rfqs
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, MAX_RFQS_PER_PROJECT)
        .map(async (rfq) => {
          const bids = await getContractorRFQBids(rfq)
          return {
            id: rfq.id,
            title: rfq.title,
            type: rfq.request_type ?? 'rfq',
            status: rfq.status,
            category: rfq.category,
            visibility: rfq.visibility,
            bidDeadline: rfq.bid_deadline,
            lineItemCount: rfq.line_items.length,
            topLineItems: rfq.line_items.slice(0, 5).map((item) => ({
              description: compactText(item.description, 120),
              quantity: item.quantity,
              unit: item.unit,
            })),
            bidCount: bids.length,
            bids: bids
              .sort((a, b) => a.total_price - b.total_price)
              .slice(0, MAX_BIDS_PER_RFQ)
              .map((bid) => ({
                vendor: bid.vendor_name,
                designer: bid.designer_name,
                totalPrice: money(bid.total_price),
                leadTimeDays: bid.lead_time_days,
                status: bid.status,
                source: bid.source,
                coverageRatio: bid.fulfillment_summary?.coverage_ratio,
                isPartial: bid.fulfillment_summary?.partial,
              })),
          }
        }),
    )

    return {
      id: project.id,
      name: project.name,
      location: project.location,
      status: project.status,
      budget: money(project.budget),
      description: compactText(project.description),
      rfqCount: rfqs.length,
      rfqs: rfqSnapshots,
    }
  }))

  return {
    roleContext: 'contractor procurement workspace',
    projectCount: projects.length,
    activeProjectCount: activeProjects.length,
    projects: projectSnapshots,
    recentActivity: activity.slice(0, MAX_RECENT_ITEMS).map((item) => ({
      type: item.type,
      title: item.title,
      body: compactText(item.body, 180),
      createdAt: item.created_at,
      projectId: item.project_id,
      rfqId: item.rfq_id,
    })),
  }
}

async function buildVendorSnapshot(session: SessionPayload) {
  const [summary, submittedBids] = await Promise.all([
    getVendorProjectsSummary(session.email, session.userId),
    getSubmittedBids(session.userId),
  ])

  const projectSnapshots = await Promise.all(
    summary.projects.slice(0, MAX_PROJECTS).map(async (project) => {
      const rfqs = await getRFQsForProject(project.id, session.email, session.userId)
      return {
        id: project.id,
        name: project.name,
        contractor: project.contractor_name,
        location: project.location,
        openRfqCount: project.total_rfq_count,
        relevantRfqCount: project.relevant_rfq_count,
        nearestBidDeadline: project.bid_deadline,
        rfqs: rfqs.slice(0, MAX_RFQS_PER_PROJECT).map((rfq) => ({
          id: rfq.id,
          title: rfq.title,
          type: rfq.request_type ?? 'rfq',
          category: rfq.category,
          responseStatus: rfq.vendor_response_status,
          isInvited: rfq.is_invited,
          deliveryDate: rfq.delivery_date,
          lineItemCount: rfq.line_items.length,
          topLineItems: (rfq.line_items as RFQLineItem[]).slice(0, 5).map((item) => ({
            description: compactText(item.description, 120),
            quantity: item.quantity,
            unit: item.unit,
          })),
        })),
      }
    }),
  )

  return {
    roleContext: 'vendor quote response workspace',
    visibleProjectCount: summary.projects.length,
    totalOpenRFQs: summary.totalOpenRFQs,
    invitedProjectCount: summary.invitedProjectCount,
    projects: projectSnapshots,
    recentBids: submittedBids.slice(0, MAX_RECENT_ITEMS).map((bid) => ({
      id: bid.id,
      rfqId: bid.rfq_id,
      rfqTitle: bid.rfq_title,
      projectName: bid.project_name,
      submittedAt: bid.submitted_at,
      totalPrice: money(bid.total_price),
      status: bid.status,
      lineItemCount: bid.line_item_count,
    })),
  }
}

export async function buildSiteAssistantContext(session: SessionPayload): Promise<SiteAssistantContext> {
  const user = await findUserById(session.userId)
  const profile = user?.company_info as JsonValue | undefined

  return {
    generatedAt: new Date().toISOString(),
    user: {
      id: session.userId,
      role: session.role,
      name: user?.name ?? session.name,
      email: user?.email ?? session.email,
      company: companyName(user?.company_info),
      profile,
    },
    snapshot: session.role === 'contractor'
      ? await buildContractorSnapshot(session)
      : await buildVendorSnapshot(session),
  }
}
