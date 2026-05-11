import type { ContractorBid, ContractorBidLineItemResponse, ContractorRFQ, ContractorRFQLineItem } from '@/lib/types/contractor'
import type {
  BidSpecComplianceEvidence,
  BidSpecComplianceItemStatus,
  SpecProductLookupResult,
  SpecRetrievalDiagnostics,
} from '@/lib/types/procurement'

export interface ExtractedPdfPage {
  pageNumber: number
  text: string
}

export interface SpecChunkInput {
  chunk_index: number
  parent_chunk_id?: number
  chunk_type?: 'parent' | 'child'
  page_start: number
  page_end: number
  section_number?: string
  canonical_section_number?: string
  section_title?: string
  token_count?: number
  content: string
  embedding?: number[]
}

export interface RetrievedSpecChunk {
  id: number
  document_id: number
  document_name: string
  page_start: number
  page_end: number
  section_number?: string
  canonical_section_number?: string
  section_title?: string
  content: string
  rank?: number
  method?: string
}

export interface RetrievalCandidateDiagnostic {
  chunk_id: number
  document_name: string
  page_start: number
  page_end: number
  section_number?: string
  section_title?: string
  score?: number
  method: string
}

export interface RetrievalResult {
  chunks: RetrievedSpecChunk[]
  diagnostics: SpecRetrievalDiagnostics
}

export interface VendorProductProfile {
  requested_sku?: string
  requested_description?: string
  requested_specs?: string
  vendor_sku?: string
  vendor_description?: string
  quoted_product_details?: string
  substitution_notes?: string
  vendor_notes?: string
  manufacturer?: string
  model?: string
  has_meaningful_vendor_detail: boolean
  lookup?: SpecProductLookupResult
}

export interface ComplianceEvaluationInput {
  rfq: ContractorRFQ
  bid: ContractorBid
  lineItem: ContractorRFQLineItem
  response: ContractorBidLineItemResponse
  chunks: RetrievedSpecChunk[]
  productProfile?: VendorProductProfile
  retrievalDiagnostics?: SpecRetrievalDiagnostics
}

export interface ComplianceEvaluationResult {
  status: BidSpecComplianceItemStatus
  severity: 'low' | 'medium' | 'high'
  requirement_summary: string
  vendor_summary: string
  explanation: string
  suggested_follow_up?: string
  evidence: BidSpecComplianceEvidence[]
  retrieval_diagnostics?: SpecRetrievalDiagnostics
  product_lookup?: SpecProductLookupResult
}
