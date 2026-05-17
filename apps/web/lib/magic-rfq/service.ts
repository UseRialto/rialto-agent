import { createHash, randomBytes } from 'crypto'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { rfqMagicLinks, rfqVendorRequests } from '@/lib/db/schema'
import {
  addNegotiationMessage,
  appendBidToRFQ,
  getBidsForRFQ,
  getNegotiationMessagesForVendor,
  getProject,
  getRFQById,
  rememberVendorContactName,
} from '@/lib/store/contractor-store'
import type { ContractorBid, ContractorBidLineItemResponse } from '@/lib/types/contractor'
import type { MagicRFQAccess } from '@/lib/types/magic-rfq'
import type { BidTerms, ComplianceDeclaration } from '@/lib/types/procurement'
import { computeFulfillmentSummary, deriveBidRiskFlags } from '@/lib/procurement-helpers'

function nowIso() {
  return new Date().toISOString()
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function normalizeBaseUrl(baseUrl?: string) {
  const explicit = baseUrl?.trim()
  if (explicit) return explicit.replace(/\/+$/, '')
  const envUrl = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (envUrl) return envUrl.replace(/\/+$/, '')
  const vercelUrl = process.env.VERCEL_URL?.trim()
  if (vercelUrl) return `https://${vercelUrl.replace(/\/+$/, '')}`
  return 'http://localhost:3000'
}

function resolveExpiry(bidDeadline?: string) {
  if (!bidDeadline) return new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString()
  return new Date(`${bidDeadline}T23:59:59.999Z`).toISOString()
}

function bidIdForVendorRequest(vendorRequestId: number) {
  return `bid-magic-vr-${vendorRequestId}`
}

async function findMagicBid(rfqId: string, vendorEmail: string) {
  const bids = await getBidsForRFQ(rfqId)
  return bids.find((bid) => bid.source === 'magic_form' && bid.vendor_email === vendorEmail) ?? null
}

export async function createMagicFormLink(params: {
  rfqId: string
  vendorRequestId: number
  vendorEmail: string
  bidDeadline?: string
  baseUrl?: string
}) {
  const token = randomBytes(24).toString('base64url')
  const tokenHash = hashToken(token)
  const now = nowIso()
  const expiresAt = resolveExpiry(params.bidDeadline)

  const existing = (await db
    .select()
    .from(rfqMagicLinks)
    .where(eq(rfqMagicLinks.vendor_request_id, params.vendorRequestId)))[0]

  if (existing) {
    await db.update(rfqMagicLinks)
      .set({
        token_hash: tokenHash,
        expires_at: expiresAt,
        revoked_at: null,
        updated_at: now,
      })
      .where(eq(rfqMagicLinks.id, existing.id))
  } else {
    await db.insert(rfqMagicLinks)
      .values({
        rfq_id: params.rfqId,
        vendor_request_id: params.vendorRequestId,
        vendor_email: params.vendorEmail,
        token_hash: tokenHash,
        expires_at: expiresAt,
        created_at: now,
        updated_at: now,
      })
  }

  return {
    token,
    url: `${normalizeBaseUrl(params.baseUrl)}/vendor/magic-rfq/${token}`,
    expiresAt,
  }
}

export async function getMagicRFQAccess(token: string): Promise<MagicRFQAccess> {
  if (!token) return { status: 'invalid' }

  const link = (await db
    .select()
    .from(rfqMagicLinks)
    .where(eq(rfqMagicLinks.token_hash, hashToken(token))))[0]

  if (!link) return { status: 'invalid' }
  if (link.revoked_at) return { status: 'revoked' }
  if (new Date(link.expires_at).getTime() < Date.now()) return { status: 'expired' }

  const rfq = await getRFQById(link.rfq_id)
  if (!rfq || rfq.status !== 'active') {
    return { status: 'closed' }
  }
  if (rfq.bid_deadline && new Date(`${rfq.bid_deadline}T23:59:59.999Z`).getTime() < Date.now()) {
    return { status: 'expired' }
  }

  const project = await getProject(rfq.project_id)
  const vendorRequest = (await db
    .select()
    .from(rfqVendorRequests)
    .where(eq(rfqVendorRequests.id, link.vendor_request_id)))[0]

  if (!vendorRequest) return { status: 'invalid' }

  if (!link.first_opened_at) {
    const openedAt = nowIso()
    await db.update(rfqMagicLinks)
      .set({ first_opened_at: openedAt, updated_at: openedAt })
      .where(eq(rfqMagicLinks.id, link.id))

    if (vendorRequest.status === 'draft' || vendorRequest.status === 'sent') {
      await db.update(rfqVendorRequests)
        .set({
          status: 'opened',
          last_message_at: openedAt,
          last_message_direction: 'magic_form_open',
          match_basis: 'magic_form',
          updated_at: openedAt,
        })
        .where(eq(rfqVendorRequests.id, vendorRequest.id))
    }
  }

  const existingBid = await findMagicBid(rfq.id, link.vendor_email)
  const messages = await getNegotiationMessagesForVendor(rfq.id, link.vendor_email)

  return {
    status: 'ok',
    rfq,
    projectName: project?.name ?? 'Project',
    projectLocation: project?.location ?? '',
    token,
    vendorEmail: link.vendor_email,
    vendorName: vendorRequest.vendor_name || existingBid?.vendor_name || '',
    existingBid,
    messages,
    expiresAt: link.expires_at,
    submittedAt: link.last_submitted_at ?? undefined,
  }
}

export async function submitMagicRFQMessage(params: {
  token: string
  vendorName: string
  message: string
}) {
  const access = await getMagicRFQAccess(params.token)
  if (access.status !== 'ok' || !access.rfq || !access.vendorEmail) {
    throw new Error('This magic form link is no longer valid.')
  }

  const trimmed = params.message.trim()
  if (!trimmed) throw new Error('Message is required.')
  const authorName = params.vendorName.trim() || access.vendorName || access.vendorEmail
  const bid = access.existingBid ?? await findMagicBid(access.rfq.id, access.vendorEmail)

  await addNegotiationMessage({
    rfqId: access.rfq.id,
    bidId: bid?.id,
    vendorEmail: access.vendorEmail,
    authorRole: 'vendor',
    authorName,
    message: trimmed,
  })

  const link = (await db
    .select()
    .from(rfqMagicLinks)
    .where(eq(rfqMagicLinks.token_hash, hashToken(params.token))))[0]
  if (link) {
    const stamp = nowIso()
    const vendorRequest = (await db
      .select()
      .from(rfqVendorRequests)
      .where(eq(rfqVendorRequests.id, link.vendor_request_id)))[0]

    await db.update(rfqVendorRequests)
      .set({
        vendor_name: authorName,
        last_message_at: stamp,
        last_message_direction: 'magic_form_message',
        match_basis: 'magic_form',
        updated_at: stamp,
      })
      .where(eq(rfqVendorRequests.id, link.vendor_request_id))

    if (vendorRequest) {
      await rememberVendorContactName({
        contractorUserId: vendorRequest.contractor_user_id,
        vendorEmail: access.vendorEmail,
        vendorName: authorName,
      })
    }
  }
}

export async function submitMagicRFQBid(params: {
  token: string
  vendorName: string
  designerName?: string
  notes?: string
  lineItemResponses: ContractorBidLineItemResponse[]
  terms?: BidTerms
  complianceDeclarations?: ComplianceDeclaration[]
}): Promise<ContractorBid> {
  const access = await getMagicRFQAccess(params.token)
  if (access.status !== 'ok' || !access.rfq || !access.vendorEmail) {
    throw new Error('This magic form link is no longer valid.')
  }

  const vendorName = params.vendorName.trim()
  if (!vendorName) {
    throw new Error('Company name is required.')
  }

  const link = (await db
    .select()
    .from(rfqMagicLinks)
    .where(eq(rfqMagicLinks.token_hash, hashToken(params.token))))[0]
  if (!link) {
    throw new Error('This magic form link is no longer valid.')
  }

  const vendorRequest = (await db
    .select()
    .from(rfqVendorRequests)
    .where(eq(rfqVendorRequests.id, link.vendor_request_id)))[0]
  if (!vendorRequest) {
    throw new Error('Vendor invite record not found.')
  }

  const submittedAt = nowIso()
  const normalizedLineItemResponses = params.lineItemResponses.map((item) => {
    if (item.availability === 'unavailable') return { ...item, total_price: 0 }
    const pricedQuantity = item.units_available && item.units_available > 0
      ? item.units_available
      : item.quoted_quantity ?? item.quantity
    return { ...item, total_price: item.unit_price * pricedQuantity }
  })
  const totalPrice = normalizedLineItemResponses.reduce((sum, item) => sum + item.total_price, 0)
  const maxLeadTime = Math.max(...normalizedLineItemResponses.map((item) => item.lead_time_days), 0)
  const bid: ContractorBid = {
    id: bidIdForVendorRequest(vendorRequest.id),
    rfq_id: access.rfq.id,
    vendor_name: vendorName,
    designer_name: params.designerName?.trim() || undefined,
    vendor_email: access.vendorEmail,
    is_invited: true,
    is_on_platform: false,
    submitted_at: submittedAt,
    total_price: totalPrice,
    currency: 'USD',
    lead_time_days: maxLeadTime,
    terms: params.terms,
    compliance_declarations: params.complianceDeclarations,
    line_item_responses: normalizedLineItemResponses,
    notes: params.notes?.trim() || undefined,
    status: 'pending',
    source: 'magic_form',
  }
  bid.fulfillment_summary = computeFulfillmentSummary(access.rfq, bid)
  bid.risk_flags = deriveBidRiskFlags(access.rfq, bid)

  await appendBidToRFQ(access.rfq.id, bid)

  await db.update(rfqVendorRequests)
    .set({
      vendor_name: vendorName,
      status: 'submitted',
      last_message_at: submittedAt,
      last_message_direction: 'magic_form_submit',
      match_basis: 'magic_form',
      updated_at: submittedAt,
    })
    .where(eq(rfqVendorRequests.id, vendorRequest.id))

  await rememberVendorContactName({
    contractorUserId: vendorRequest.contractor_user_id,
    vendorEmail: access.vendorEmail,
    vendorName,
  })

  await db.update(rfqMagicLinks)
    .set({
      last_submitted_at: submittedAt,
      completed_at: submittedAt,
      updated_at: submittedAt,
    })
    .where(and(eq(rfqMagicLinks.id, link.id), eq(rfqMagicLinks.vendor_request_id, vendorRequest.id)))

  return bid
}
