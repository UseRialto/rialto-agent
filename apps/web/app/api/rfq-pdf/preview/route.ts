import { buildRFQPreviewPdfBytes } from '@/lib/rfq-pdf'
import type { CommodityWatch, ProcurementLineItemAttribute, ProcurementRequirement, RequestType, RFPDetails } from '@/lib/types/procurement'

type PreviewPayload = {
  rfqId?: string
  projectId?: string
  projectName?: string
  projectLocation?: string
  contractorName?: string
  requestType?: RequestType
  rfpDetails?: RFPDetails
  attachmentUrls?: string[]
  procurementRequirements?: ProcurementRequirement[]
  commodityWatch?: CommodityWatch[]
  title?: string
  bidDeadline?: string
  lineItems?: Array<{
    sku?: string
    description?: string
    quantity?: number
    unit?: string
    specs?: string
    constraints?: string
    attributes?: ProcurementLineItemAttribute[]
    certifications?: string[]
    notes?: string
    contractor_budget?: number
    suggested_lead_time_days?: number
  }>
}

export async function POST(request: Request) {
  const payload = await request.json() as PreviewPayload
  const projectId = payload.projectId?.trim()
  const projectName = payload.projectName?.trim()
  const title = payload.title?.trim()

  if (!projectId || !projectName || !title) {
    return new Response('Missing required preview fields.', { status: 400 })
  }

  const lineItems = (payload.lineItems ?? []).filter((item) => item.sku || item.description)
  if (lineItems.length === 0) {
    return new Response('At least one line item is required for preview.', { status: 400 })
  }

  const pdfBytes = await buildRFQPreviewPdfBytes({
    rfqId: payload.rfqId,
    projectId,
    projectName,
    projectLocation: payload.projectLocation?.trim() || '-',
    contractorName: payload.contractorName?.trim() || undefined,
    requestType: payload.requestType,
    rfpDetails: payload.rfpDetails,
    attachmentUrls: payload.attachmentUrls,
    procurementRequirements: payload.procurementRequirements,
    commodityWatch: payload.commodityWatch,
    title,
    bidDeadline: payload.bidDeadline?.trim() || undefined,
    lineItems: lineItems.map((item) => ({
      id: `preview-li-${crypto.randomUUID().slice(0, 8)}`,
      sku: item.sku?.trim() || '',
      description: item.description?.trim() || '',
      quantity: Number(item.quantity ?? 0),
      unit: item.unit?.trim() || 'ea',
      specs: item.specs?.trim() || '',
      constraints: item.constraints?.trim() || '',
      attributes: item.attributes ?? [],
      certifications: item.certifications ?? [],
      notes: item.notes?.trim() || '',
      contractor_budget: item.contractor_budget,
      suggested_lead_time_days: item.suggested_lead_time_days,
    })),
  })

  return new Response(new Uint8Array(pdfBytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${payload.requestType === 'rfp' ? 'rfp' : 'rfq'}-preview.pdf"`,
      'Content-Length': String(pdfBytes.length),
      'Cache-Control': 'no-store',
    },
  })
}
