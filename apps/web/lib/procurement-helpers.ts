import type { ContractorBid, ContractorRFQ } from '@/lib/types/contractor'
import type { BidFulfillmentSummary, ComplianceDeclaration, ProcurementRequirement, RequestRiskFlag } from '@/lib/types/procurement'

export function computeFulfillmentSummary(
  rfq: ContractorRFQ,
  bid: Pick<ContractorBid, 'line_item_responses'>,
): BidFulfillmentSummary {
  const requested = rfq.line_items.reduce((sum, item) => sum + item.quantity, 0)
  const quoted = bid.line_item_responses.reduce((sum, item) => {
    if (item.availability === 'unavailable') return sum
    return sum + (item.units_available ?? item.quoted_quantity ?? item.quantity)
  }, 0)

  return {
    requested_quantity: requested,
    quoted_quantity: quoted,
    coverage_ratio: requested > 0 ? Math.min(quoted / requested, 1) : 0,
    partial: quoted < requested,
  }
}

export function buildComplianceDeclarations(
  requirements: ProcurementRequirement[],
  selectedCodes: string[],
): ComplianceDeclaration[] {
  const selected = new Set(selectedCodes)
  return requirements.map((requirement) => ({
    code: requirement.code,
    label: requirement.label,
    status: selected.has(requirement.code)
      ? requirement.verification === 'verified'
        ? 'verified'
        : 'self_reported'
      : 'does_not_match',
  }))
}

export function deriveBidRiskFlags(rfq: ContractorRFQ, bid: ContractorBid): RequestRiskFlag[] {
  const flags: RequestRiskFlag[] = []
  if (bid.fulfillment_summary?.partial) {
    flags.push({ code: 'partial_fulfillment', label: 'Partial fulfillment', severity: 'high' })
  }
  if (bid.lead_time_days > 30) {
    flags.push({ code: 'lead_time_risk', label: 'Extended lead time', severity: 'medium' })
  }
  if (bid.terms?.deposit_terms && /half|50%|deposit/i.test(bid.terms.deposit_terms)) {
    flags.push({ code: 'deposit_terms', label: 'Front-loaded payment terms', severity: 'medium' })
  }
  if ((rfq.procurement_requirements ?? []).length > 0) {
    const missing = (bid.compliance_declarations ?? []).filter((entry) => entry.status === 'does_not_match')
    if (missing.length > 0) {
      flags.push({ code: 'missing_requirements', label: 'Missing procurement requirements', severity: 'high' })
    }
  }
  return flags
}
