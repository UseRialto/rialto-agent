export type RequestType = 'rfq' | 'rfp'

export type ProcurementRequirementType =
  | 'diversity'
  | 'domestic'
  | 'labor'
  | 'project'
  | 'confidentiality'

export type ProcurementVerificationStatus =
  | 'verified'
  | 'self_reported'
  | 'project_rule'

export type BuyerDecisionStatus = 'preferred' | 'alternate' | 'hold' | 'do_not_use'

export type VendorReliabilityFlag = 'trusted' | 'neutral' | 'unreliable'

export type FollowUpStatus = 'on_track' | 'needs_follow_up' | 'escalated' | 'complete'

export interface ProcurementRequirement {
  code: string
  label: string
  type: ProcurementRequirementType
  verification: ProcurementVerificationStatus
  required?: boolean
  targetQuoteCount?: number
  note?: string
}

export interface ProcurementLineItemAttribute {
  key: string
  label: string
  value: string
  group?: string
  helperText?: string
  inputType?: 'text' | 'number' | 'select' | 'date' | 'boolean'
  required?: boolean
  visible?: boolean
  options?: string[]
  source?: 'system' | 'trade' | 'spreadsheet' | 'ai' | 'user'
  order?: number
}

export interface AISpecAssistantResult {
  summary?: string
  missing_information?: string[]
  vendor_questions?: string[]
  recommended_material_specs?: string[]
  draft_intro?: string
  selected_spec?: string
  pm_question?: string
}

export interface CommodityWatch {
  category: string
  risk_level: 'low' | 'medium' | 'high'
  summary: string
}

export interface RequestRiskFlag {
  code: string
  label: string
  severity: 'low' | 'medium' | 'high'
  note?: string
}

export interface RFPDetails {
  procurement_objective?: string
  scope_summary?: string
  desired_outcome?: string
  performance_requirements?: string
  approved_alternates?: string
  quantity_context?: string
  site_conditions?: string
  delivery_zip?: string
  delivery_logistics?: string
  delivery_window?: string
  phased_delivery?: string
  submittals_required?: string
  lead_time_sensitivity?: string
  exclusions?: string
  unknowns_or_questions?: string
  vendor_questions_requested?: string
  vendor_guidance_requested?: string
  attachments_summary?: string
}

export interface ComplianceDeclaration {
  code: string
  label: string
  status: 'matches' | 'does_not_match' | 'self_reported' | 'verified'
  note?: string
}

export interface BidTerms {
  payment_terms?: string
  deposit_terms?: string
  credit_terms?: string
  escalation_clause?: string
  price_valid_until?: string
  shipping_terms?: string
}

export interface BidFulfillmentSummary {
  requested_quantity: number
  quoted_quantity: number
  coverage_ratio: number
  partial: boolean
}

export type ProjectSpecDocumentStatus = 'uploaded' | 'processing' | 'indexed' | 'failed'
export type ProjectSpecPackageStatus = 'pending' | 'complete' | 'failed'

export interface ProjectSpecDocumentSummary {
  id: number
  project_id: string
  filename: string
  file_url: string
  mime_type: string
  size_bytes?: number
  page_count?: number
  status: ProjectSpecDocumentStatus
  extraction_error?: string
  created_at: string
  updated_at: string
}

export interface ProjectSpecPackageSummary {
  id: number
  project_id: string
  trade: string
  title: string
  status: ProjectSpecPackageStatus
  source_document_ids: number[]
  selected_chunk_ids: number[]
  content?: string
  diagnostics?: Record<string, unknown>
  error?: string
  created_at: string
  updated_at: string
}

export type BidSpecComplianceItemStatus = 'compliant' | 'violation' | 'needs_review' | 'no_spec_found' | 'not_quoted'
export type BidSpecComplianceSummaryStatus =
  | BidSpecComplianceItemStatus
  | 'no_specs_available'
  | 'failed'
export type BidSpecComplianceReviewKind = 'line_item' | 'substitution'
export type BidSpecComplianceSubstitutionVerdict = 'up_to_spec' | 'not_up_to_spec' | 'needs_review'

export interface BidSpecComplianceEvidence {
  document_id?: number
  document_name: string
  page_start: number
  page_end: number
  section_number?: string
  section_title?: string
  quote: string
}

export interface BidSpecComplianceItem {
  id: number
  report_id: number
  bid_id: string
  rfq_line_item_id?: string
  status: BidSpecComplianceItemStatus
  review_kind: BidSpecComplianceReviewKind
  substitution_verdict?: BidSpecComplianceSubstitutionVerdict
  severity: 'low' | 'medium' | 'high'
  requirement_summary: string
  vendor_summary: string
  explanation: string
  suggested_follow_up?: string
  evidence: BidSpecComplianceEvidence[]
  retrieval_diagnostics?: SpecRetrievalDiagnostics
  product_lookup?: SpecProductLookupResult
  created_at: string
}

export interface SpecRetrievalDiagnostics {
  query?: string
  expanded_query?: string
  section_numbers?: string[]
  methods?: string[]
  skipped_reason?: string
  candidates?: Array<{
    chunk_id: number
    document_name: string
    page_start: number
    page_end: number
    section_number?: string
    section_title?: string
    score?: number
    method: string
  }>
  errors?: string[]
}

export interface SpecProductLookupResult {
  status: 'found' | 'not_found' | 'failed' | 'skipped'
  provider?: string
  query?: string
  summary?: string
  cached?: boolean
  error?: string
  results?: Array<{
    title: string
    url?: string
    snippet?: string
  }>
}

export interface BidSpecComplianceReport {
  id: number
  bid_id: string
  rfq_id: string
  project_id: string
  status: 'pending' | 'complete' | 'failed' | 'no_specs_available'
  summary_status: BidSpecComplianceSummaryStatus
  high_severity_count: number
  checked_at: string
  model?: string
  error?: string
  items: BidSpecComplianceItem[]
}

export interface VendorCapabilityTag {
  code: string
  label: string
  verification: ProcurementVerificationStatus
}

export interface VendorQualificationProfile {
  capability_tags?: VendorCapabilityTag[]
  trusted_status?: VendorReliabilityFlag
  terms_history_summary?: string
  qualification_notes?: string
  internal_notes?: string
  rating?: number
}

export interface NegotiationMessage {
  id: number
  rfq_id: string
  bid_id?: string
  vendor_email?: string
  vendor_id?: string
  author_role: 'contractor' | 'vendor'
  author_name: string
  message: string
  created_at: string
}
