import type { ContractorRFQ } from '@/lib/types/contractor'

const UNKNOWN_RFQ_STATUS_STYLE = 'bg-gray-100 text-gray-600 border-gray-200'

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

export function contractorRFQStatusStyle(status: string) {
  return CONTRACTOR_RFQ_STATUS_STYLES[status as ContractorRFQ['status']] ?? UNKNOWN_RFQ_STATUS_STYLE
}

export function contractorRFQStatusLabel(status: string) {
  const knownLabel = CONTRACTOR_RFQ_STATUS_LABELS[status as ContractorRFQ['status']]
  if (knownLabel) return knownLabel
  return status
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase()) || 'Unknown'
}
