import type { ContractorRFQ } from '@/lib/types/contractor'

export const CONTRACTOR_RFQ_STATUS_STYLES: Record<ContractorRFQ['status'], string> = {
  draft: 'bg-amber-50 text-amber-700 border-amber-200',
  active: 'bg-blue-50 text-blue-700 border-blue-200',
  closed: 'bg-gray-100 text-gray-500 border-gray-200',
}

export const CONTRACTOR_RFQ_STATUS_LABELS: Record<ContractorRFQ['status'], string> = {
  draft: 'Draft',
  active: 'Active',
  closed: 'Closed',
}
