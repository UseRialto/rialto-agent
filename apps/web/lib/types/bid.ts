import type { SupplierSummary } from './supplier'

export type BidStatus = 'pending' | 'awarded' | 'rejected'

export interface Bid {
  id: string
  rfq_id: string
  supplier: SupplierSummary
  unit_price: number
  total_price: number
  currency: string
  lead_time_days: number
  delivery_terms: string
  certifications: string[]
  notes?: string
  document_urls: string[]
  submitted_at: string
  status: BidStatus
  is_ai_recommended: boolean
}
