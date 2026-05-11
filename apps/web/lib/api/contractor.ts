/**
 * Contractor API - reads from contractor store.
 * SERVER-SIDE ONLY.
 */

import type {
  ContractorProject,
  ContractorActivityNotification,
  ContractorRFQ,
  ContractorBid,
  ContractorOrder,
  OpenContractorRFQ,
} from '@/lib/types/contractor'
import {
  getProjects,
  getProject,
  getProjectRFQs,
  getRFQ,
  getProjectRFQCounts,
  getProjectRFQCountsByProjectIds,
  getAllActiveRFQs,
  getInvitedRFQsForVendor,
  getRFQById,
  getBidsForRFQ,
  appendBidToRFQ,
  getOrderByRFQId,
  getContractorOrders,
  getContractorOrder as storeGetContractorOrder,
  getProjectOrders,
  getContractorActivity as storeGetContractorActivity,
} from '@/lib/store/contractor-store'
import { findUserById } from '@/lib/auth/users'
import { computeFulfillmentSummary, deriveBidRiskFlags } from '@/lib/procurement-helpers'

export async function getContractorProjects(userId: string): Promise<ContractorProject[]> {
  return getProjects(userId)
}

export async function getContractorActivity(userId: string): Promise<ContractorActivityNotification[]> {
  return storeGetContractorActivity(userId)
}

export async function getContractorProject(projectId: string): Promise<ContractorProject | null> {
  return getProject(projectId)
}

export async function getContractorProjectRFQs(
  projectId: string,
  status?: string,
): Promise<ContractorRFQ[]> {
  return getProjectRFQs(projectId, status)
}

export async function getContractorRFQ(
  projectId: string,
  rfqId: string,
): Promise<ContractorRFQ | null> {
  const rfq = await getRFQ(rfqId)
  if (!rfq || rfq.project_id !== projectId) return null
  return rfq
}

export async function getContractorProjectRFQCounts(
  projectId: string,
): Promise<{ total: number; pending: number; active: number; awarded: number }> {
  return getProjectRFQCounts(projectId)
}

export async function getContractorProjectRFQCountsByProjectIds(
  projectIds: string[],
): Promise<Map<string, { total: number; pending: number; active: number; awarded: number }>> {
  return getProjectRFQCountsByProjectIds(projectIds)
}

export async function getContractorProjectOrders(projectId: string): Promise<ContractorOrder[]> {
  return getProjectOrders(projectId)
}

export async function getContractorOrderByRFQId(rfqId: string): Promise<ContractorOrder | null> {
  return (await getOrderByRFQId(rfqId)) ?? null
}

async function enrichRFQ(rfq: ContractorRFQ): Promise<OpenContractorRFQ> {
  const project = await getProject(rfq.project_id)
  const owner = project && project.owner_id !== 'fixture' ? await findUserById(project.owner_id) : null
  return {
    ...rfq,
    project_name: project?.name ?? 'Unknown Project',
    project_location: project?.location ?? '',
    owner_name: owner?.name ?? 'General Contractor',
    owner_company_name: owner?.company_info?.company_name ?? owner?.name ?? 'General Contractor',
  }
}

export async function getAllOpenRFQs(): Promise<OpenContractorRFQ[]> {
  return Promise.all((await getAllActiveRFQs()).map(enrichRFQ))
}

export async function getInvitedOpenRFQsForVendor(vendorEmail: string, vendorId?: string): Promise<OpenContractorRFQ[]> {
  return Promise.all((await getInvitedRFQsForVendor(vendorEmail, vendorId)).map(enrichRFQ))
}

export async function getContractorRFQById(rfqId: string): Promise<ContractorRFQ | null> {
  return (await getRFQById(rfqId)) ?? null
}

export async function appendRealBid(rfqId: string, bid: ContractorBid): Promise<void> {
  await appendBidToRFQ(rfqId, bid)
}

export async function getContractorRFQBids(rfq: ContractorRFQ): Promise<ContractorBid[]> {
  const bids = await getBidsForRFQ(rfq.id)
  return bids.map((bid) => {
    const fulfillmentSummary = computeFulfillmentSummary(rfq, bid)
    return {
      ...bid,
      fulfillment_summary: fulfillmentSummary,
      risk_flags: deriveBidRiskFlags(rfq, { ...bid, fulfillment_summary: fulfillmentSummary }),
    }
  })
}

// --- Contractor Orders ---

export async function getContractorOrdersGrouped(
  userId: string,
): Promise<Record<string, { project: ContractorProject; orders: ContractorOrder[] }>> {
  const orders = await getContractorOrders(userId)
  const result: Record<string, { project: ContractorProject; orders: ContractorOrder[] }> = {}

  for (const order of orders) {
    if (!result[order.project_id]) {
      const project = await getProject(order.project_id)
      if (!project) continue
      result[order.project_id] = { project, orders: [] }
    }
    result[order.project_id].orders.push(order)
  }

  return result
}

export async function getContractorOrderDetail(orderId: string): Promise<ContractorOrder | null> {
  return storeGetContractorOrder(orderId)
}
