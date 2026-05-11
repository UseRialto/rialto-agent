import type { ContractorOrderStage, ContractorRFQ } from '@/lib/types/contractor'

export const CONTRACTOR_RFQ_STATUS_STYLES: Record<ContractorRFQ['status'], string> = {
  draft: 'bg-amber-50 text-amber-700 border-amber-200',
  active: 'bg-blue-50 text-blue-700 border-blue-200',
  po_offered: 'bg-green-50 text-green-700 border-green-200',
  closed: 'bg-gray-100 text-gray-500 border-gray-200',
  awarded: 'bg-green-50 text-green-700 border-green-200',
}

export const CONTRACTOR_RFQ_STATUS_LABELS: Record<ContractorRFQ['status'], string> = {
  draft: 'Draft',
  active: 'Active',
  po_offered: 'Awarded PO',
  closed: 'Closed',
  awarded: 'Awarded PO',
}

export type ContractorDisplayOrderStage = 'received' | 'fulfilling' | 'shipped' | 'delivered'

export function toContractorDisplayOrderStage(
  stage: ContractorOrderStage,
): ContractorDisplayOrderStage {
  switch (stage) {
    case 'confirmed':
      return 'received'
    case 'packaged':
      return 'fulfilling'
    case 'shipped':
    case 'out_for_delivery':
      return 'shipped'
    case 'delivered':
      return 'delivered'
  }
}

export const CONTRACTOR_ORDER_DISPLAY_STAGES: Array<{
  key: ContractorDisplayOrderStage
  label: string
  shortLabel: string
}> = [
  { key: 'received', label: 'Received', shortLabel: 'Received' },
  { key: 'fulfilling', label: 'Fulfilling', shortLabel: 'Fulfilling' },
  { key: 'shipped', label: 'Shipped', shortLabel: 'Shipped' },
  { key: 'delivered', label: 'Delivered', shortLabel: 'Delivered' },
]

export const CONTRACTOR_ORDER_STAGE_STYLES: Record<ContractorDisplayOrderStage, string> = {
  received: 'bg-blue-50 text-blue-700 border-blue-200',
  fulfilling: 'bg-amber-50 text-amber-700 border-amber-200',
  shipped: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  delivered: 'bg-green-50 text-green-700 border-green-200',
}

export const CONTRACTOR_ORDER_STAGE_LABELS: Record<ContractorDisplayOrderStage, string> = {
  received: 'Received',
  fulfilling: 'Fulfilling',
  shipped: 'Shipped',
  delivered: 'Delivered',
}
