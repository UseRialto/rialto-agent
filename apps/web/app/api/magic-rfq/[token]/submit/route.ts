import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'
import { getContractorRFQById } from '@/lib/api/contractor'
import { submitMagicRFQBid } from '@/lib/magic-rfq/service'
import { runBidSpecCompliance } from '@/lib/spec-compliance'
import type { ContractorBidLineItemResponse } from '@/lib/types/contractor'
import type { BidTerms, ComplianceDeclaration } from '@/lib/types/procurement'

interface MagicRFQSubmitPayload {
  vendorName?: string
  lineItemResponses?: ContractorBidLineItemResponse[]
  notes?: string
  meta?: {
    terms?: BidTerms
    complianceDeclarations?: ComplianceDeclaration[]
    designerName?: string
  }
}

function hasPositiveUnitPrice(response: ContractorBidLineItemResponse) {
  return Number.isFinite(response.unit_price) && response.unit_price > 0
}

function hasPositiveLeadTime(response: ContractorBidLineItemResponse) {
  return Number.isFinite(response.lead_time_days) && response.lead_time_days > 0
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params
  const payload = await request.json() as MagicRFQSubmitPayload
  const lineItemResponses = payload.lineItemResponses ?? []
  const hasLeadTimeWithoutPrice = lineItemResponses.some((response) => (
    !hasPositiveUnitPrice(response) &&
    hasPositiveLeadTime(response)
  ))

  if (hasLeadTimeWithoutPrice) {
    return NextResponse.json(
      { success: false, error: 'Some line items have lead time but no unit price. Add a unit price greater than 0, or clear the lead time to skip quoting that material.' },
      { status: 400 },
    )
  }

  try {
    const bid = await submitMagicRFQBid({
      token,
      vendorName: payload.vendorName ?? '',
      lineItemResponses,
      notes: payload.notes ?? '',
      terms: payload.meta?.terms,
      complianceDeclarations: payload.meta?.complianceDeclarations,
      designerName: payload.meta?.designerName,
    })

    runBidSpecCompliance(bid.id).catch((error) => {
      console.error('Spec compliance review failed:', error)
    })

    getContractorRFQById(bid.rfq_id)
      .then((rfq) => {
        if (!rfq) return
        revalidatePath(`/contractor/projects/${rfq.project_id}`)
        revalidatePath(`/contractor/projects/${rfq.project_id}/rfqs/${rfq.id}`)
      })
      .catch((error) => {
        console.error('Magic RFQ revalidation failed:', error)
      })

    return NextResponse.json({ success: true, submittedAt: bid.submitted_at })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to submit quote.' },
      { status: 400 },
    )
  }
}
