import type {
  AISpecAssistantResult,
  BidTerms,
  CommodityWatch,
  ComplianceDeclaration,
  NegotiationMessage,
  ProcurementLineItemAttribute,
  ProcurementRequirement,
  RequestRiskFlag,
  RequestType,
  RFPDetails,
} from '@/lib/types/procurement'

// Vendor-side types for quote request and vendor response workflows.
// These are the API contract shapes for all vendor-facing endpoints.

export type ProjectStatus = 'active' | 'closed'
export type VendorResponseStatus = 'not_started' | 'draft' | 'submitted'
export type BidDraftStatus = 'draft' | 'submitted'
export type SubmittedBidStatus = 'pending' | 'under_review' | 'shortlisted' | 'rejected'
export type LineItemAvailability = 'in_stock' | 'can_source' | 'unavailable'

// --- Projects ---
// GET /api/vendor/projects
// Ranked by relevance_score descending (server-computed based on vendor's material profile)
export interface Project {
  id: string
  name: string                    // e.g. "UCSD Triton Center"
  contractor_name: string         // e.g. "McCarthy Building Companies"
  location: string                // city/state of project site
  total_rfq_count: number         // total open RFQs in project
  relevant_rfq_count: number      // RFQs matching this vendor's registered materials
  relevance_score: number         // 0.0–1.0, server-computed
  bid_deadline?: string           // ISO date - when contractor expects bids
  status: ProjectStatus
  is_anonymous?: boolean
  public_summary?: string
}

// --- RFQ Line Items (the specific SKUs inside an RFQ) ---
export interface RFQLineItem {
  id: string
  sku?: string                    // exact SKU if contractor knows it
  description: string             // e.g. "W14x82 Wide Flange Beam, A992 Grade 50"
  quantity: number
  unit: string                    // e.g. "tons", "each", "lf"
  standard?: string               // e.g. "ASTM A992", "ASTM A36"
  constraints?: string
  attributes?: ProcurementLineItemAttribute[]
  notes?: string
}

// --- RFQ Summary (used in the project RFQ list) ---
// GET /api/vendor/projects/:projectId/rfqs
export interface RFQSummary {
  id: string
  project_id: string
  title: string                   // e.g. "Structural Steel - Wide Flange Beams"
  request_type?: RequestType
  category: string                // material category
  line_items: RFQLineItem[]
  delivery_date: string           // ISO date
  delivery_location: string       // project site address
  certifications_required: string[]
  accepts_international: boolean
  budget_min?: number
  budget_max?: number
  specs?: string
  relevance_score: number         // 0.0–1.0, server-computed for ranking
  vendor_response_status: VendorResponseStatus
  created_at: string
  bid_deadline?: string
  anonymous_public_listing?: boolean
  public_summary?: string
  procurement_requirements?: ProcurementRequirement[]
  risk_flags?: RequestRiskFlag[]
}

// --- RFQ Detail (full view when vendor opens an RFQ to respond) ---
// GET /api/vendor/projects/:projectId/rfqs/:rfqId
export interface RFQDetail extends RFQSummary {
  contractor_notes?: string       // additional context from contractor
  attachments: string[]           // URLs to spec sheets, drawings, etc.
  rfp_details?: RFPDetails
  ai_spec_assistant?: AISpecAssistantResult
  commodity_watch?: CommodityWatch[]
}

// --- Vendor's response to a single line item ---
export interface BidLineItemResponse {
  line_item_id: string
  unit_price: number
  total_price: number             // auto-computed: unit_price × quantity
  currency: string                // defaults to 'USD'
  quoted_quantity?: number
  units_available?: number        // how many units the vendor has on hand
  lead_time_days: number
  availability: LineItemAvailability
  delivery_terms?: string         // e.g. "FOB Destination"
  notes?: string
  substitution_notes?: string
  quoted_product_details?: string
  response_attributes?: ProcurementLineItemAttribute[]
  is_alternate?: boolean
}

// --- Bid Draft (vendor's in-progress response to an RFQ) ---
// PATCH /api/vendor/rfqs/:rfqId/draft  → saves/updates draft
// Scoped per RFQ (one draft covers all line items in that RFQ)
export interface BidDraft {
  id: string
  rfq_id: string
  vendor_id: string
  designer_name?: string
  status: BidDraftStatus
  line_item_responses: BidLineItemResponse[]
  notes?: string
  terms?: BidTerms
  compliance_declarations?: ComplianceDeclaration[]
  negotiation_messages?: NegotiationMessage[]
  document_urls: string[]
  created_at: string
  updated_at: string
}

// --- Submitted Bid (vendor's quote history view) ---
// GET /api/vendor/bids  - all submitted bids across all projects
export interface SubmittedBid {
  id: string
  rfq_id: string
  rfq_title: string
  project_id: string
  project_name: string
  contractor_name: string
  designer_name?: string
  submitted_at: string
  total_price: number             // sum across all line items
  line_item_count: number
  status: SubmittedBidStatus
  line_item_responses: BidLineItemResponse[]
  vendor_id?: string              // scopes bid to the submitting vendor
  terms?: BidTerms
  compliance_declarations?: ComplianceDeclaration[]
}
