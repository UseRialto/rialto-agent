import type { ContractorBid, ContractorRFQ } from '@/lib/types/contractor'
import type { NegotiationMessage } from '@/lib/types/procurement'

export type MagicRFQAccessStatus = 'ok' | 'invalid' | 'expired' | 'closed' | 'revoked'

export interface MagicRFQAccess {
  status: MagicRFQAccessStatus
  rfq?: ContractorRFQ
  projectName?: string
  projectLocation?: string
  token?: string
  vendorEmail?: string
  vendorName?: string
  existingBid?: ContractorBid | null
  messages?: NegotiationMessage[]
  expiresAt?: string
  submittedAt?: string
}

export interface MagicRFQPreviewInput {
  rfq: ContractorRFQ
  projectName: string
  vendorEmail: string
  vendorName?: string
}
