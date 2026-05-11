import type {
  AISpecAssistantResult,
  BidFulfillmentSummary,
  BidSpecComplianceReport,
  BidTerms,
  BuyerDecisionStatus,
  CommodityWatch,
  ComplianceDeclaration,
  NegotiationMessage,
  ProcurementLineItemAttribute,
  ProcurementRequirement,
  ProjectSpecDocumentSummary,
  RequestRiskFlag,
  RequestType,
  RFPDetails,
  VendorReliabilityFlag,
} from '@/lib/types/procurement'
import type { CustomLineItemFieldDefinition } from '@/lib/contractor-customization'

export interface ContractorVendorInvite {
  id?: number
  vendor_id?: string
  vendor_email: string
  vendor_name: string
  vendor_first_name?: string
  vendor_last_name?: string
  on_platform: boolean
}

export interface ContractorProject {
  id: string
  name: string
  owner_id: string
  location: string
  general_contractor?: string
  description?: string
  budget?: number
  collaborator_ids?: string[]
  rfq_categories?: string[]
  created_at: string
  status: 'active' | 'completed' | 'archived'
  spec_documents?: ProjectSpecDocumentSummary[]
}

export interface ContractorRFQLineItem {
  id: string
  sku: string
  description: string
  quantity: number
  unit: string
  specs?: string
  constraints?: string
  attributes?: ProcurementLineItemAttribute[]
  certifications?: string[]
  notes?: string
  contractor_budget?: number          // per-unit budget hint in USD, shown to vendors
  suggested_lead_time_days?: number   // suggested lead time in days, shown to vendors
}

export interface ContractorRFQ {
  id: string
  project_id: string
  title: string
  request_type?: RequestType
  email_subject?: string
  email_body?: string
  status: 'draft' | 'active' | 'closed'
  category?: string
  anonymous_public_listing?: boolean
  rfp_details?: RFPDetails
  procurement_requirements?: ProcurementRequirement[]
  ai_spec_assistant?: AISpecAssistantResult
  commodity_watch?: CommodityWatch[]
  risk_flags?: RequestRiskFlag[]
  vendor_response_fields?: CustomLineItemFieldDefinition[]
  source_rfq_id?: string
  attachment_urls?: string[]
  line_items: ContractorRFQLineItem[]
  invites?: ContractorVendorInvite[]
  invited_vendor_ids: string[]
  invited_vendor_emails: string[]
  visibility: 'public' | 'invited_only'  // default 'public'
  bid_deadline?: string
  created_at: string
  published_at?: string
}

export interface OpenContractorRFQ extends ContractorRFQ {
  project_name: string
  project_location: string
  owner_name: string
  owner_company_name?: string
}

// --- Bid types (contractor-side view of bids received on their RFQs) ---

export interface ContractorBidLineItemResponse {
  line_item_id: string
  sku: string
  description: string
  quantity: number
  quoted_quantity?: number
  unit: string
  unit_price: number
  total_price: number
  lead_time_days: number
  availability: 'in_stock' | 'can_source' | 'unavailable'
  units_available?: number
  delivery_terms?: string
  notes?: string
  substitution_notes?: string
  quoted_product_details?: string
  response_attributes?: ProcurementLineItemAttribute[]
  is_alternate?: boolean
}

export interface ContractorBid {
  id: string
  rfq_id: string
  vendor_name: string
  designer_name?: string
  vendor_id?: string
  vendor_email?: string
  is_invited: boolean
  is_on_platform: boolean
  submitted_at: string
  total_price: number
  currency: string
  lead_time_days: number
  terms?: BidTerms
  compliance_declarations?: ComplianceDeclaration[]
  risk_flags?: RequestRiskFlag[]
  fulfillment_summary?: BidFulfillmentSummary
  buyer_decision_status?: BuyerDecisionStatus
  decision_rationale?: string
  vendor_reliability_flag?: VendorReliabilityFlag
  line_item_responses: ContractorBidLineItemResponse[]
  notes?: string
  status: 'pending' | 'under_review' | 'shortlisted' | 'rejected'
  source: 'platform' | 'email' | 'magic_form' | 'external_workbook'
  source_message_count?: number
  last_email_at?: string
  review_task_count?: number
  negotiation_messages?: NegotiationMessage[]
  spec_compliance_report?: BidSpecComplianceReport
}

export interface ContractorMailboxSummary {
  connected: boolean
  provider?: 'google' | 'microsoft_365'
  emailAddress: string
  senderName: string
  connectedAt?: string
  lastSyncAt?: string
  oauthAvailable: boolean
  availableProviders: Array<'google' | 'microsoft_365'>
}

export interface ContractorActivityNotification {
  id: string
  type:
    | 'rfq_published'
    | 'bid_received'
    | 'email_received'
    | 'message_received'
    | 'review_task'
  title: string
  body: string
  rfq_id?: string
  project_id?: string
  read: boolean
  created_at: string
}

export interface RFQVendorRequestSummary {
  id: number
  vendorName: string
  vendorEmail: string
  status: string
  magicFormUrl?: string
  magicFormExpiresAt?: string
  magicFormFirstOpenedAt?: string
  magicFormLastSubmittedAt?: string
  providerThreadId?: string
  outboundMessageId?: string
  lastMessageAt?: string
  lastMessageDirection?: string
  matchBasis?: string
}

export interface RFQEmailAttachmentSummary {
  id: number
  filename: string
  mimeType: string
  url: string
  sourceKind: string
}

export interface RFQEmailMessageSummary {
  id: number
  direction: 'inbound' | 'outbound'
  matchStatus: string
  matchConfidence: number
  matchReason?: string
  subject: string
  fromEmail: string
  fromName?: string
  snippet: string
  textBody?: string
  sentAt: string
  isUnread: boolean
  attachments: RFQEmailAttachmentSummary[]
}

export interface RFQReviewTaskSummary {
  id: number
  taskType: string
  status: string
  title: string
  createdAt: string
  updatedAt: string
  emailMessageId?: number
  quoteResponseId?: number
  details: Record<string, unknown>
  sourceMessage?: RFQEmailMessageSummary
}

export interface RFQEmailWorkflowSummary {
  mailbox: ContractorMailboxSummary
  sendableOffPlatformInviteCount: number
  sentVendorCount: number
  openedVendorCount: number
  submittedVendorCount: number
  repliedVendorCount: number
  reviewTaskCount: number
  vendorRequests: RFQVendorRequestSummary[]
  recentMessages: RFQEmailMessageSummary[]
  reviewTasks: RFQReviewTaskSummary[]
}

export interface OffPlatformSendResult {
  vendorEmail: string
  vendorRequestId?: number
  threadId?: string
  messageId?: string
  success: boolean
  error?: string
}

export interface OffPlatformSendSummary {
  provider: 'google' | 'microsoft_365'
  attemptedCount: number
  sentCount: number
  failedCount: number
  results: OffPlatformSendResult[]
}
