'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { getSession } from '@/lib/auth/session'
import {
  saveProject,
  getProject,
  saveRFQ,
  getRFQ,
  deleteProject,
  deleteRFQ,
  getProjectRFQs,
  getBidsForRFQ,
  updateBid,
  addNegotiationMessage,
  getRFQById,
  getVendorRelationship,
  upsertVendorRelationship,
} from '@/lib/store/contractor-store'
import { disconnectMailboxOAuth, getMailboxSummary, humanizeMailError, sendNegotiationThreadReply, sendRFQEmails, sendRFQInvites, syncRFQReplies } from '@/lib/mail/service'
import type { ContractorProject, ContractorRFQ, OffPlatformSendSummary } from '@/lib/types/contractor'
import type { FormState } from '@/lib/actions/auth'
import type {
  AISpecAssistantResult,
  BuyerDecisionStatus,
  CommodityWatch,
  ProcurementRequirement,
  RequestType,
  VendorReliabilityFlag,
} from '@/lib/types/procurement'
import { computeFulfillmentSummary, deriveBidRiskFlags } from '@/lib/procurement-helpers'
import { deriveCommodityWatch, deriveRequestRiskFlags } from '@/lib/procurement-config'
import { findUserById, updateUser } from '@/lib/auth/users'
import { createProjectSpecDocument } from '@/lib/spec-compliance/store'
import { runBidSpecCompliance } from '@/lib/spec-compliance'
import { contractorCustomizationFromUser, sanitizeContractorCustomization, type ContractorCustomizationSettings } from '@/lib/contractor-customization'

function isForeignKeyDeleteError(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const cause = 'cause' in error ? (error as { cause?: unknown }).cause : undefined
  if (cause && typeof cause === 'object' && 'code' in cause && (cause as { code?: unknown }).code === '23503') {
    return true
  }
  return error instanceof Error && error.message.includes('violates foreign key constraint')
}

function blockedDeleteMessage(label = 'RFQ') {
  return `${label} cannot be deleted because it is linked to order or handoff history. Archive it instead, or remove that history first.`
}

export async function saveContractorCustomizationAction(
  customization: Partial<ContractorCustomizationSettings>,
): Promise<{ success: boolean; error?: string; customization?: ContractorCustomizationSettings }> {
  const session = await getSession()
  if (!session || session.role !== 'contractor') return { success: false, error: 'Not authenticated.' }
  const user = await findUserById(session.userId)
  if (!user) return { success: false, error: 'User not found.' }

  const existingCustomization = contractorCustomizationFromUser(user)
  const sanitized = sanitizeContractorCustomization({
    ...existingCustomization,
    ...customization,
    updatedAt: new Date().toISOString(),
    inferenceSource: customization.inferenceSource ?? 'user',
  })
  await updateUser(session.userId, {
    company_info: {
      ...user.company_info,
      contractor_trade: sanitized.trade ?? user.company_info?.contractor_trade,
      contractor_customization: sanitized,
    },
  })
  revalidatePath('/contractor/settings')
  revalidatePath('/contractor/projects')
  revalidatePath('/contractor/projects/[projectId]/rfqs/new', 'page')
  revalidatePath('/contractor/projects/[projectId]/rfqs', 'page')
  return { success: true, customization: sanitized }
}

// --- Create Project ---

const projectSchema = z.object({
  name: z.string().min(2, 'Project name must be at least 2 characters'),
  location: z.string().min(2, 'Location is required'),
  general_contractor: z.string().optional(),
  description: z.string().optional(),
  budget: z.string().optional(),
})

type ProjectSpecUpload = {
  filename: string
  fileUrl: string
  mimeType?: string
  sizeBytes?: number
}

function projectSpecUploads(formData: FormData): ProjectSpecUpload[] {
  const raw = formData.get('project_spec_uploads')
  if (typeof raw !== 'string' || !raw.trim()) return []
  try {
    const parsed = JSON.parse(raw) as ProjectSpecUpload[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter((upload) => {
      if (!upload?.filename || !upload.fileUrl) return false
      return upload.mimeType === 'application/pdf' || upload.filename.toLowerCase().endsWith('.pdf')
    })
  } catch {
    return []
  }
}

async function registerUploadedProjectSpec(projectId: string, uploaded: ProjectSpecUpload) {
  await createProjectSpecDocument({
    projectId,
    filename: uploaded.filename,
    fileUrl: uploaded.fileUrl,
    mimeType: uploaded.mimeType,
    sizeBytes: uploaded.sizeBytes,
  })
}

export async function createProjectAction(_state: FormState, formData: FormData): Promise<FormState> {
  const session = await getSession()
  if (!session) return { message: 'Not authenticated.' }

  const parsed = projectSchema.safeParse({
    name: formData.get('name'),
    location: formData.get('location'),
    general_contractor: formData.get('general_contractor') || undefined,
    description: formData.get('description') || undefined,
    budget: formData.get('budget') || undefined,
  })

  if (!parsed.success) {
    return { errors: parsed.error.flatten().fieldErrors }
  }

  const { name, location, general_contractor, description, budget } = parsed.data
  const budgetNum = budget ? parseFloat(budget.replace(/[^0-9.]/g, '')) : undefined

  const project: ContractorProject = {
    id: `cp-${crypto.randomUUID().slice(0, 8)}`,
    name,
    location,
    general_contractor: general_contractor?.trim() || 'General Contractor',
    description,
    budget: budgetNum && !isNaN(budgetNum) ? budgetNum : undefined,
    owner_id: session.userId,
    collaborator_ids: [],
    created_at: new Date().toISOString(),
    status: 'active',
  }

  await saveProject(project)

  for (const uploaded of projectSpecUploads(formData)) {
    try {
      await registerUploadedProjectSpec(project.id, uploaded)
    } catch (error) {
      console.error(`Project spec registration failed for ${uploaded.filename}:`, error)
    }
  }

  revalidatePath('/contractor/projects')
  redirect(`/contractor/projects/${project.id}`)
}

// --- Update Project ---

export async function updateProjectAction(
  projectId: string,
  data: { name: string; location: string; description?: string; budget?: string },
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession()
  if (!session) return { success: false, error: 'Not authenticated' }

  const project = await getProject(projectId)
  if (!project) return { success: false, error: 'Project not found' }

  const budgetNum = data.budget ? parseFloat(data.budget.replace(/[^0-9.]/g, '')) : undefined

  await saveProject({
    ...project,
    name: data.name,
    location: data.location,
    description: data.description || undefined,
    budget: budgetNum && !isNaN(budgetNum) ? budgetNum : project.budget,
  })

  revalidatePath(`/contractor/projects/${projectId}`)
  revalidatePath('/contractor/projects')

  return { success: true }
}

export async function registerProjectSpecDocumentAction(
  projectId: string,
  input: { filename: string; fileUrl: string; mimeType?: string; sizeBytes?: number },
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession()
  if (!session) return { success: false, error: 'Not authenticated' }
  const project = await getProject(projectId)
  if (!project) return { success: false, error: 'Project not found' }
  if (project.owner_id !== session.userId && !(project.collaborator_ids ?? []).includes(session.userId)) {
    return { success: false, error: 'Not authorized' }
  }
  if (!input.fileUrl || !input.filename.toLowerCase().endsWith('.pdf')) {
    return { success: false, error: 'Upload a PDF spec manual.' }
  }

  await createProjectSpecDocument({
    projectId,
    filename: input.filename,
    fileUrl: input.fileUrl,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
  })

  revalidatePath(`/contractor/projects/${projectId}`)
  revalidatePath(`/contractor/projects/${projectId}/settings`)
  return { success: true }
}

export async function rerunBidSpecComplianceAction(
  projectId: string,
  rfqId: string,
  bidId: string,
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession()
  if (!session) return { success: false, error: 'Not authenticated' }
  const project = await getProject(projectId)
  if (!project) return { success: false, error: 'Project not found' }
  if (project.owner_id !== session.userId && !(project.collaborator_ids ?? []).includes(session.userId)) {
    return { success: false, error: 'Not authorized' }
  }

  try {
    await runBidSpecCompliance(bidId)
    revalidatePath(`/contractor/projects/${projectId}/rfqs/${rfqId}`)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Compliance review failed.' }
  }
}

// --- Delete Project ---

export async function deleteProjectAction(
  projectId: string,
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession()
  if (!session) return { success: false, error: 'Not authenticated' }

  // Cascade delete RFQs before removing the project.
  const rfqs = await getProjectRFQs(projectId)
  for (const rfq of rfqs) {
    await deleteRFQ(rfq.id)
  }

  await deleteProject(projectId)
  revalidatePath('/contractor/projects')
  redirect('/contractor/projects')
}

// --- Save RFQ Draft ---

type RFQPayload = {
  rfqId?: string
  title: string
  requestType?: RequestType
  emailSubject?: string
  emailBody?: string
  category?: string
  anonymousPublicListing?: boolean
  rfpDetails?: ContractorRFQ['rfp_details']
  procurementRequirements?: ProcurementRequirement[]
  aiSpecAssistant?: AISpecAssistantResult
  commodityWatch?: CommodityWatch[]
  attachmentUrls?: string[]
  vendorResponseFields?: ContractorRFQ['vendor_response_fields']
  line_items: ContractorRFQ['line_items']
  invites?: ContractorRFQ['invites']
  invited_vendor_ids: string[]
  invited_vendor_emails: string[]
  visibility: 'public' | 'invited_only'
  bid_deadline?: string
  sourceRfqId?: string
}

function normalizeInviteEmails(invitedVendorEmails: string[]) {
  const seen = new Set<string>()
  return invitedVendorEmails
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
    .filter((email) => {
      if (seen.has(email)) return false
      seen.add(email)
      return true
    })
}

function normalizeInvites(payload: RFQPayload): NonNullable<ContractorRFQ['invites']> {
  const seen = new Set<string>()
  const rawInvites = payload.invites && payload.invites.length > 0
    ? payload.invites
    : [
        ...payload.invited_vendor_ids.map((vendorId) => ({
          vendor_id: vendorId,
          vendor_email: '',
          vendor_name: vendorId,
          vendor_first_name: undefined,
          vendor_last_name: undefined,
          on_platform: true,
        })),
        ...normalizeInviteEmails(payload.invited_vendor_emails).map((vendorEmail) => ({
          vendor_id: undefined,
          vendor_email: vendorEmail,
          vendor_name: vendorEmail,
          vendor_first_name: undefined,
          vendor_last_name: undefined,
          on_platform: false,
        })),
      ]

  return rawInvites
    .map((invite) => ({
      ...invite,
      vendor_email: invite.vendor_email?.trim().toLowerCase() ?? '',
      vendor_name: invite.vendor_name?.trim() || invite.vendor_email?.trim() || invite.vendor_id || '',
      vendor_first_name: invite.vendor_first_name?.trim() || undefined,
      vendor_last_name: invite.vendor_last_name?.trim() || undefined,
      on_platform: Boolean(invite.on_platform || invite.vendor_id),
    }))
    .filter((invite) => invite.vendor_id || invite.vendor_email)
    .filter((invite) => {
      const key = invite.vendor_id ? `id:${invite.vendor_id}` : `email:${invite.vendor_email}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function buildRFQFromPayload(projectId: string, rfqId: string, rfqData: RFQPayload, status: ContractorRFQ['status'], createdAt: string, publishedAt?: string): ContractorRFQ {
  const invites = normalizeInvites(rfqData)
  return {
    id: rfqId,
    project_id: projectId,
    title: rfqData.title,
    request_type: rfqData.requestType ?? 'rfq',
    email_subject: rfqData.emailSubject,
    email_body: rfqData.emailBody,
    status,
    category: rfqData.category,
    anonymous_public_listing: rfqData.anonymousPublicListing ?? false,
    rfp_details: rfqData.rfpDetails,
    procurement_requirements: rfqData.procurementRequirements ?? [],
    ai_spec_assistant: rfqData.aiSpecAssistant,
    commodity_watch: rfqData.commodityWatch ?? deriveCommodityWatch(rfqData.category),
    risk_flags: deriveRequestRiskFlags(rfqData.category, rfqData.procurementRequirements ?? []),
    vendor_response_fields: rfqData.vendorResponseFields ?? [],
    attachment_urls: rfqData.attachmentUrls ?? [],
    source_rfq_id: rfqData.sourceRfqId,
    line_items: rfqData.line_items,
    invites,
    invited_vendor_ids: invites.filter((invite) => invite.vendor_id).map((invite) => invite.vendor_id!),
    invited_vendor_emails: invites.filter((invite) => invite.vendor_email && !invite.on_platform).map((invite) => invite.vendor_email),
    visibility: rfqData.visibility,
    bid_deadline: rfqData.bid_deadline,
    created_at: createdAt,
    published_at: publishedAt,
  }
}

function validateOffPlatformInviteNames(invites: NonNullable<ContractorRFQ['invites']>) {
  const missingNameInvite = invites.find((invite) => !invite.on_platform && (!invite.vendor_first_name || !invite.vendor_last_name))
  if (!missingNameInvite) return undefined
  return `Add first and last name for ${missingNameInvite.vendor_email} before publishing.`
}

export async function saveRFQDraftAction(
  projectId: string,
  rfqData: RFQPayload,
): Promise<{ rfqId: string }> {
  const session = await getSession()
  if (!session) throw new Error('Not authenticated')

  const rfqId = rfqData.rfqId ?? `rfq-c-${crypto.randomUUID().slice(0, 8)}`
  const rfq = buildRFQFromPayload(projectId, rfqId, rfqData, 'draft', new Date().toISOString())

  await saveRFQ(rfq)
  revalidatePath(`/contractor/projects/${projectId}`)
  return { rfqId }
}

// --- Publish RFQ ---

export async function publishRFQAction(
  projectId: string,
  rfqData: RFQPayload,
): Promise<{ success: boolean; redirectTo?: string; offPlatformSendSummary?: OffPlatformSendSummary; error?: string }> {
  const session = await getSession()
  if (!session) throw new Error('Not authenticated')

  const rfqId = rfqData.rfqId ?? `rfq-c-${crypto.randomUUID().slice(0, 8)}`
  const existing = await getRFQ(rfqId)
  const createdAt = existing?.created_at ?? new Date().toISOString()
  const publishAt = new Date().toISOString()
  const normalizedInvites = normalizeInvites(rfqData)
  const missingInviteNamesError = validateOffPlatformInviteNames(normalizedInvites)
  if (missingInviteNamesError) {
    return { success: false, error: missingInviteNamesError }
  }
  const hasOffPlatformInvites = normalizedInvites.some((invite) => !invite.on_platform && invite.vendor_email)
  const activeRFQ = buildRFQFromPayload(projectId, rfqId, { ...rfqData, invites: normalizedInvites }, 'active', createdAt, publishAt)

  if (hasOffPlatformInvites) {
    const mailbox = await getMailboxSummary(session.userId)
    if (!mailbox.connected) {
      const draftRFQ = buildRFQFromPayload(projectId, rfqId, { ...rfqData, invites: normalizedInvites }, 'draft', createdAt)
      await saveRFQ(draftRFQ)
      revalidatePath(`/contractor/projects/${projectId}`)
      return {
        success: false,
        error: 'Connect a Google Workspace or Microsoft 365 mailbox before publishing RFQs with off-platform invites. The RFQ was kept as a draft.',
      }
    }
  }

  await saveRFQ(activeRFQ)

  let offPlatformSendSummary: OffPlatformSendSummary | undefined
  if (hasOffPlatformInvites) {
    const headerList = await headers()
    const host = headerList.get('x-forwarded-host') ?? headerList.get('host')
    const proto = headerList.get('x-forwarded-proto') ?? 'http'
    const baseUrl = host ? `${proto}://${host}` : undefined
    try {
      offPlatformSendSummary = await sendRFQInvites(session.userId, rfqId, baseUrl)
    } catch (error) {
      console.error('[publishRFQAction] Failed to send off-platform RFQ invites', error)
      const rollbackRFQ = buildRFQFromPayload(
        projectId,
        rfqId,
        { ...rfqData, invites: normalizedInvites },
        existing?.status ?? 'draft',
        createdAt,
        existing?.published_at,
      )
      await saveRFQ(rollbackRFQ)
      revalidatePath(`/contractor/projects/${projectId}`)
      revalidatePath(`/contractor/projects/${projectId}/rfqs/${rfqId}`)
      return {
        success: false,
        error: `${humanizeMailError(error)} The RFQ was kept in draft state.`,
      }
    }
    if (offPlatformSendSummary.failedCount > 0) {
      const rollbackRFQ = buildRFQFromPayload(
        projectId,
        rfqId,
        { ...rfqData, invites: normalizedInvites },
        existing?.status ?? 'draft',
        createdAt,
        existing?.published_at,
      )
      await saveRFQ(rollbackRFQ)
      revalidatePath(`/contractor/projects/${projectId}`)
      revalidatePath(`/contractor/projects/${projectId}/rfqs/${rfqId}`)
      return {
        success: false,
        offPlatformSendSummary,
        error: `Failed to send ${offPlatformSendSummary.failedCount} off-platform invite${offPlatformSendSummary.failedCount === 1 ? '' : 's'}. The RFQ was kept in draft state.`,
      }
    }
  }

  revalidatePath(`/contractor/projects/${projectId}`)
  revalidatePath('/vendor/projects')
  revalidatePath(`/contractor/projects/${projectId}/rfqs/${rfqId}`)
  return { success: true, redirectTo: `/contractor/projects/${projectId}`, offPlatformSendSummary }
}

// --- Delete Draft RFQ ---

export async function deleteRFQAction(
  projectId: string,
  rfqId: string,
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession()
  if (!session) return { success: false, error: 'Not authenticated' }

  const rfq = await getRFQ(rfqId)
  if (!rfq) return { success: false, error: 'RFQ not found' }
  if (rfq.status !== 'draft') return { success: false, error: 'Only draft RFQs can be deleted' }

  try {
    await deleteRFQ(rfqId)
  } catch (error) {
    if (isForeignKeyDeleteError(error)) return { success: false, error: blockedDeleteMessage('This draft') }
    throw error
  }
  revalidatePath(`/contractor/projects/${projectId}`)

  return { success: true }
}

export async function bulkDeleteRFQsAction(
  projectId: string,
  rfqIds: string[],
): Promise<{ success: boolean; deletedCount?: number; error?: string }> {
  const session = await getSession()
  if (!session) return { success: false, error: 'Not authenticated' }

  const uniqueIds = Array.from(new Set(rfqIds)).filter(Boolean)
  if (uniqueIds.length === 0) return { success: false, error: 'Select at least one RFQ to delete.' }

  let deletedCount = 0
  const blockedTitles: string[] = []
  for (const rfqId of uniqueIds) {
    const rfq = await getRFQ(rfqId)
    if (!rfq) continue
    if (rfq.project_id !== projectId) return { success: false, error: 'One selected RFQ does not belong to this project.' }
    try {
      await deleteRFQ(rfqId)
      deletedCount += 1
    } catch (error) {
      if (!isForeignKeyDeleteError(error)) throw error
      blockedTitles.push(rfq.title)
    }
  }

  revalidatePath(`/contractor/projects/${projectId}`)
  revalidatePath(`/contractor/projects/${projectId}/rfqs`)
  if (blockedTitles.length > 0) {
    const label = blockedTitles.length === 1 ? `"${blockedTitles[0]}"` : `${blockedTitles.length} RFQs`
    const prefix = deletedCount > 0
      ? `Deleted ${deletedCount} RFQ${deletedCount === 1 ? '' : 's'}, but ${label} could not be deleted.`
      : `${label} could not be deleted.`
    return {
      success: deletedCount > 0,
      deletedCount,
      error: `${prefix} ${blockedDeleteMessage()}`,
    }
  }
  return { success: true, deletedCount }
}

// --- Retract Active RFQ ---

export async function retractRFQAction(
  projectId: string,
  rfqId: string,
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession()
  if (!session) return { success: false, error: 'Not authenticated' }

  const rfq = await getRFQ(rfqId)
  if (!rfq) return { success: false, error: 'RFQ not found' }
  if (rfq.status !== 'active') {
    return { success: false, error: 'Only active RFQs can be retracted' }
  }

  try {
    await deleteRFQ(rfqId)
  } catch (error) {
    if (isForeignKeyDeleteError(error)) return { success: false, error: blockedDeleteMessage('This RFQ') }
    throw error
  }
  revalidatePath(`/contractor/projects/${projectId}`)

  return { success: true }
}

// --- Mailbox / RFQ Mail Flow ---

export async function disconnectGoogleMailboxAction(): Promise<void> {
  const session = await getSession()
  if (!session || session.role !== 'contractor') return

  await disconnectMailboxOAuth(session.userId)
  revalidatePath('/contractor/settings')
  revalidatePath('/contractor/projects')
}

export async function sendRFQEmailsAction(
  rfqId: string,
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession()
  if (!session) return { success: false, error: 'Not authenticated' }
  if (session.role !== 'contractor') return { success: false, error: 'Only contractors can send RFQ emails.' }

  try {
    const headerList = await headers()
    const host = headerList.get('x-forwarded-host') ?? headerList.get('host')
    const proto = headerList.get('x-forwarded-proto') ?? 'http'
    const baseUrl = host ? `${proto}://${host}` : undefined
    const summary = await sendRFQEmails(session.userId, rfqId, baseUrl)
    revalidatePath('/contractor/settings')
    revalidatePath('/contractor/projects')
    const rfq = await getRFQ(rfqId)
    revalidatePath(`/contractor/projects/${rfq?.project_id ?? ''}/rfqs/${rfqId}`)
    return { success: true, error: summary.reviewTaskCount > 0 ? undefined : undefined }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to send RFQ emails.' }
  }
}

export async function syncRFQMailboxAction(
  rfqId: string,
  forceFull = false,
): Promise<{ success: boolean; error?: string; syncedThreads?: number; mode?: string }> {
  const session = await getSession()
  if (!session) return { success: false, error: 'Not authenticated' }
  if (session.role !== 'contractor') return { success: false, error: 'Only contractors can sync mailbox.' }

  try {
    const result = await syncRFQReplies(session.userId, rfqId, forceFull)
    revalidatePath('/contractor/settings')
    revalidatePath('/contractor/projects')
    const rfq = await getRFQ(rfqId)
    revalidatePath(`/contractor/projects/${rfq?.project_id ?? ''}/rfqs/${rfqId}`)
    return { success: true, syncedThreads: result.syncedThreads, mode: result.mode }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to sync mailbox.' }
  }
}

export async function updateBidDecisionAction(
  rfqId: string,
  bidId: string,
  updates: {
    buyerDecisionStatus?: BuyerDecisionStatus | null
    decisionRationale?: string
    vendorReliabilityFlag?: VendorReliabilityFlag
  },
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession()
  if (!session) return { success: false, error: 'Not authenticated' }

  const rfq = await getRFQById(rfqId)
  if (!rfq) return { success: false, error: 'RFQ not found' }
  const bids = await getBidsForRFQ(rfqId)
  const bid = bids.find((entry) => entry.id === bidId)
  if (!bid) return { success: false, error: 'Quote not found' }

  const fulfillmentSummary = computeFulfillmentSummary(rfq, bid)
  const nextBid = {
    ...bid,
    buyer_decision_status: updates.buyerDecisionStatus ?? bid.buyer_decision_status,
    decision_rationale: updates.decisionRationale ?? bid.decision_rationale,
    vendor_reliability_flag: updates.vendorReliabilityFlag ?? bid.vendor_reliability_flag,
    fulfillment_summary: fulfillmentSummary,
  }
  nextBid.risk_flags = deriveBidRiskFlags(rfq, nextBid)

  if (updates.buyerDecisionStatus === 'preferred') {
    const previouslyPreferred = bids.filter((entry) => entry.id !== bidId && entry.buyer_decision_status === 'preferred')
    for (const entry of previouslyPreferred) {
      await updateBid(rfqId, entry.id, { buyer_decision_status: null })
    }
  }

  await updateBid(rfqId, bidId, nextBid)

  if (bid.vendor_email) {
    const existingRelationship = await getVendorRelationship(session.userId, bid.vendor_email)
    await upsertVendorRelationship({
      contractorUserId: session.userId,
      vendorId: bid.vendor_id,
      vendorEmail: bid.vendor_email,
      vendorName: bid.vendor_name,
      trustedStatus: updates.vendorReliabilityFlag ?? existingRelationship?.trusted_status ?? 'neutral',
      rating: existingRelationship?.rating ?? 3,
      termsHistorySummary: bid.terms?.payment_terms ?? existingRelationship?.terms_history_summary ?? '',
      qualificationNotes: updates.decisionRationale ?? existingRelationship?.qualification_notes ?? '',
    })
  }

  revalidatePath(`/contractor/projects/${rfq.project_id}/rfqs/${rfqId}`)
  return { success: true }
}

export async function addNegotiationMessageAction(
  rfqId: string,
  bidId: string,
  message: string,
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession()
  if (!session) return { success: false, error: 'Not authenticated' }
  const trimmed = message.trim()
  if (!trimmed) return { success: false, error: 'Message is required' }

  const rfq = await getRFQById(rfqId)
  if (!rfq) return { success: false, error: 'RFQ not found' }
  const bid = (await getBidsForRFQ(rfqId)).find((entry) => entry.id === bidId)
  if (!bid) return { success: false, error: 'Quote not found' }
  if (!bid.vendor_email) return { success: false, error: 'Vendor email is required for threaded negotiation.' }

  const headerList = await headers()
  const host = headerList.get('x-forwarded-host') ?? headerList.get('host')
  const proto = headerList.get('x-forwarded-proto') ?? 'http'
  const baseUrl = host ? `${proto}://${host}` : undefined

  try {
    await sendNegotiationThreadReply({
      userId: session.userId,
      rfqId,
      vendorEmail: bid.vendor_email,
      vendorName: bid.vendor_name,
      vendorId: bid.vendor_id,
      message: trimmed,
      baseUrl,
    })
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to send negotiation email.' }
  }

  await addNegotiationMessage({
    rfqId,
    bidId,
    vendorId: bid.vendor_id,
    vendorEmail: bid.vendor_email,
    authorRole: 'contractor',
    authorName: session.name,
    message: trimmed,
  })

  revalidatePath(`/contractor/projects/${rfq.project_id}/rfqs/${rfqId}`)
  revalidatePath(`/vendor/rfqs/${rfqId}`)
  return { success: true }
}

export async function sendRFQVendorMessageAction(
  rfqId: string,
  vendorEmail: string,
  vendorName: string,
  message: string,
  vendorId?: string,
): Promise<{ success: boolean; error?: string }> {
  const session = await getSession()
  if (!session) return { success: false, error: 'Not authenticated' }
  if (session.role !== 'contractor') return { success: false, error: 'Only contractors can send vendor messages.' }
  const trimmed = message.trim()
  const normalizedEmail = vendorEmail.trim().toLowerCase()
  if (!trimmed) return { success: false, error: 'Message is required' }
  if (!normalizedEmail) return { success: false, error: 'Vendor email is required' }

  const rfq = await getRFQById(rfqId)
  if (!rfq) return { success: false, error: 'RFQ not found' }
  const invited = (rfq.invites ?? []).some((invite) =>
    invite.vendor_email.toLowerCase() === normalizedEmail ||
    (vendorId && invite.vendor_id === vendorId),
  )
  if (!invited) return { success: false, error: 'Vendor is not invited to this RFQ.' }

  const bid = (await getBidsForRFQ(rfqId)).find((entry) =>
    entry.vendor_email?.toLowerCase() === normalizedEmail ||
    (vendorId && entry.vendor_id === vendorId),
  )
  const headerList = await headers()
  const host = headerList.get('x-forwarded-host') ?? headerList.get('host')
  const proto = headerList.get('x-forwarded-proto') ?? 'http'
  const baseUrl = host ? `${proto}://${host}` : undefined

  try {
    await sendNegotiationThreadReply({
      userId: session.userId,
      rfqId,
      vendorEmail: normalizedEmail,
      vendorName,
      vendorId,
      message: trimmed,
      baseUrl,
    })
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to send vendor message.' }
  }

  await addNegotiationMessage({
    rfqId,
    bidId: bid?.id,
    vendorId,
    vendorEmail: normalizedEmail,
    authorRole: 'contractor',
    authorName: session.name,
    message: trimmed,
  })

  revalidatePath(`/contractor/projects/${rfq.project_id}/rfqs/${rfqId}`)
  revalidatePath(`/vendor/magic-rfq/[token]`, 'page')
  return { success: true }
}

export async function createRemainderRFQAction(
  projectId: string,
  rfqId: string,
  bidId: string,
): Promise<{ success: boolean; error?: string; redirectTo?: string }> {
  const session = await getSession()
  if (!session) return { success: false, error: 'Not authenticated' }

  const rfq = await getRFQById(rfqId)
  if (!rfq) return { success: false, error: 'RFQ not found' }
  const bid = (await getBidsForRFQ(rfqId)).find((entry) => entry.id === bidId)
  if (!bid) return { success: false, error: 'Quote not found' }

  const remainderItems = rfq.line_items.flatMap((item) => {
    const response = bid.line_item_responses.find((entry) => entry.line_item_id === item.id)
    const quotedQuantity = response?.quoted_quantity ?? response?.units_available ?? (response?.availability === 'unavailable' ? 0 : item.quantity)
    const remainingQuantity = Math.max(item.quantity - quotedQuantity, 0)
    if (remainingQuantity <= 0) return []
    return [{
      ...item,
      id: `li-${crypto.randomUUID().slice(0, 8)}`,
      quantity: remainingQuantity,
      notes: [item.notes, `Remainder generated from ${bid.vendor_name} bid ${bid.id}.`].filter(Boolean).join(' '),
    }]
  })

  if (remainderItems.length === 0) {
    return { success: false, error: 'This quote covers all requested quantities.' }
  }

  const remainderId = `rfq-c-${crypto.randomUUID().slice(0, 8)}`
  await saveRFQ({
    ...rfq,
      id: remainderId,
      title: `${rfq.title} - Remainder`,
      status: 'draft',
      published_at: undefined,
      source_rfq_id: rfq.id,
      line_items: remainderItems,
    vendor_response_fields: rfq.vendor_response_fields,
    created_at: new Date().toISOString(),
  })

  revalidatePath(`/contractor/projects/${projectId}`)
  return {
    success: true,
    redirectTo: `/contractor/projects/${projectId}/rfqs/new?rfqId=${remainderId}`,
  }
}
