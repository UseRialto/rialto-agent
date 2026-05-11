'use server'

import { revalidatePath } from 'next/cache'
import { saveBidDraft } from '@/lib/api/vendor'
import { clearDraft, recordSingleBid } from '@/lib/store/server-store'
import { getSession } from '@/lib/auth/session'
import { findUserById } from '@/lib/auth/users'
import { getContractorRFQById, appendRealBid } from '@/lib/api/contractor'
import { getProject as getContractorProjectStore } from '@/lib/store/contractor-store'
import { submitMagicRFQBid, submitMagicRFQMessage } from '@/lib/magic-rfq/service'
import {
  addNegotiationMessage,
  getBidsForRFQ,
} from '@/lib/store/contractor-store'
import type { BidLineItemResponse, SubmittedBid } from '@/lib/types/vendor'
import type { ContractorBid, ContractorBidLineItemResponse } from '@/lib/types/contractor'
import type { BidTerms, ComplianceDeclaration } from '@/lib/types/procurement'
import { computeFulfillmentSummary, deriveBidRiskFlags } from '@/lib/procurement-helpers'
import { runBidSpecCompliance } from '@/lib/spec-compliance'

export async function saveBidDraftAction(
  rfqId: string,
  responses: BidLineItemResponse[],
  notes?: string,
  meta?: {
    terms?: BidTerms
    complianceDeclarations?: ComplianceDeclaration[]
    designerName?: string
  },
) {
  const session = await getSession()
  await saveBidDraft(rfqId, responses, notes, meta, session?.userId)
}

export async function clearBidDraftAction(rfqId: string): Promise<void> {
  await clearDraft(rfqId)
}

export async function submitContractorRFQBidAction(
  rfqId: string,
  lineItemResponses: ContractorBidLineItemResponse[],
  notes: string,
  meta?: {
    terms?: BidTerms
    complianceDeclarations?: ComplianceDeclaration[]
    designerName?: string
  },
): Promise<void> {
  const session = await getSession()
  if (!session) throw new Error('Not authenticated')

  const rfq = await getContractorRFQById(rfqId)
  if (!rfq) throw new Error('RFQ not found')

  const user = await findUserById(session.userId)
  const vendorName = user?.company_info?.company_name ?? user?.name ?? session.name
  const vendorEmail = user?.email ?? session.email

  const totalPrice = lineItemResponses.reduce((s, r) => s + r.total_price, 0)
  const maxLeadTime = Math.max(...lineItemResponses.map((r) => r.lead_time_days), 0)
  const bidId = `bid-real-${rfqId}-${Date.now()}`

  const bid: ContractorBid = {
    id: bidId,
    rfq_id: rfqId,
    vendor_name: vendorName,
    designer_name: meta?.designerName?.trim() || undefined,
    vendor_id: session.userId,
    vendor_email: vendorEmail,
    is_invited:
      rfq.invited_vendor_emails.includes(vendorEmail) ||
      rfq.invited_vendor_ids.includes(session.userId),
    is_on_platform: true,
    submitted_at: new Date().toISOString(),
    total_price: totalPrice,
    currency: 'USD',
    lead_time_days: maxLeadTime,
    terms: meta?.terms,
    compliance_declarations: meta?.complianceDeclarations,
    line_item_responses: lineItemResponses,
    notes: notes || undefined,
    status: 'pending',
    source: 'platform',
  }
  bid.fulfillment_summary = computeFulfillmentSummary(rfq, bid)
  bid.risk_flags = deriveBidRiskFlags(rfq, bid)

  await appendRealBid(rfqId, bid)
  await runBidSpecCompliance(bidId).catch((error) => {
    console.error('Spec compliance review failed:', error)
  })

  // Write to vendor session store so it shows up in "My Quotes"
  const project = await getContractorProjectStore(rfq.project_id)
  const contractorUser = project ? await findUserById(project.owner_id) : null
  const contractorName = contractorUser?.company_info?.company_name ?? contractorUser?.name ?? 'General Contractor'

  // Map ContractorBidLineItemResponse to BidLineItemResponse for vendor session
  const vendorResponses: BidLineItemResponse[] = lineItemResponses.map((r) => ({
    line_item_id: r.line_item_id,
    unit_price: r.unit_price,
    total_price: r.total_price,
    currency: 'USD',
    quoted_quantity: r.quoted_quantity,
    units_available: r.units_available,
    lead_time_days: r.lead_time_days,
    availability: r.availability,
    delivery_terms: r.delivery_terms,
    notes: r.notes,
    substitution_notes: r.substitution_notes,
    quoted_product_details: r.quoted_product_details,
    response_attributes: r.response_attributes,
    is_alternate: r.is_alternate,
  }))

  const submittedBid: SubmittedBid = {
    id: bidId,
    rfq_id: rfqId,
    rfq_title: rfq.title,
    project_id: rfq.project_id,
    project_name: project?.name ?? 'Unknown Project',
    contractor_name: contractorName,
    designer_name: meta?.designerName?.trim() || undefined,
    submitted_at: new Date().toISOString(),
    total_price: totalPrice,
    line_item_count: lineItemResponses.length,
    status: 'pending',
    line_item_responses: vendorResponses,
    vendor_id: session.userId,
    terms: meta?.terms,
    compliance_declarations: meta?.complianceDeclarations,
  }

  await recordSingleBid(submittedBid)
  revalidatePath(`/contractor/projects`)
  revalidatePath('/vendor/bids')
}

export async function submitMagicRFQBidAction(
  token: string,
  vendorName: string,
  lineItemResponses: ContractorBidLineItemResponse[],
  notes: string,
  meta?: {
    terms?: BidTerms
    complianceDeclarations?: ComplianceDeclaration[]
    designerName?: string
  },
): Promise<{ success: boolean; error?: string }> {
  try {
    const bid = await submitMagicRFQBid({
      token,
      vendorName,
      lineItemResponses,
      notes,
      terms: meta?.terms,
      complianceDeclarations: meta?.complianceDeclarations,
      designerName: meta?.designerName,
    })
    await runBidSpecCompliance(bid.id).catch((error) => {
      console.error('Spec compliance review failed:', error)
    })
    const rfq = await getContractorRFQById(bid.rfq_id)
    if (rfq) {
      revalidatePath(`/contractor/projects/${rfq.project_id}`)
      revalidatePath(`/contractor/projects/${rfq.project_id}/rfqs/${rfq.id}`)
    }
    revalidatePath(`/vendor/magic-rfq/${token}`)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to submit quote.' }
  }
}

export async function submitMagicRFQMessageAction(
  token: string,
  vendorName: string,
  message: string,
): Promise<{ success: boolean; error?: string }> {
  const trimmed = message.trim()
  if (!trimmed) return { success: false, error: 'Message is required.' }
  try {
    await submitMagicRFQMessage({ token, vendorName, message: trimmed })
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to send message.' }
  }
}

export async function addVendorNegotiationMessageAction(
  rfqId: string,
  bidId: string,
  message: string,
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession()
  if (!session) return { success: false, error: 'Not authenticated' }
  const trimmed = message.trim()
  if (!trimmed) return { success: false, error: 'Message is required' }

  const rfq = await getContractorRFQById(rfqId)
  if (!rfq) return { success: false, error: 'RFQ not found' }
  const bid = (await getBidsForRFQ(rfqId)).find((entry) => entry.id === bidId)
  if (!bid) return { success: false, error: 'Quote not found' }

  await addNegotiationMessage({
    rfqId,
    bidId,
    vendorId: session.userId,
    vendorEmail: session.email,
    authorRole: 'vendor',
    authorName: session.name,
    message: trimmed,
  })

  revalidatePath(`/vendor/rfqs/${rfqId}`)
  revalidatePath(`/contractor/projects/${rfq.project_id}/rfqs/${rfqId}`)
  return { success: true }
}
