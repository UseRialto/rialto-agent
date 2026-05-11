import type { VendorCapabilityTag, VendorReliabilityFlag } from '@/lib/types/procurement'
import type { ContractorCustomizationSettings } from '@/lib/contractor-customization'

export interface User {
  id: string
  email: string
  password_hash: string
  name: string
  role: 'vendor' | 'contractor'
  created_at: string
  onboarding_completed: boolean
  company_info?: {
    company_name?: string
    phone?: string
    address?: string
    materials?: string[]
    certifications?: string[]
    service_regions?: string[]
    years_in_business?: number
    contractor_trade?: string
    contractor_request_style?: string
    capability_tags?: VendorCapabilityTag[]
    trusted_status?: VendorReliabilityFlag
    terms_history_summary?: string
    qualification_notes?: string
    contractor_customization?: ContractorCustomizationSettings
  }
}

export interface SessionPayload {
  userId: string
  role: 'vendor' | 'contractor'
  name: string
  email: string
  onboarding_completed: boolean
}
