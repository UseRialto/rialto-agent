/**
 * PDF export for a contractor request.
 */

import { buildRFQPdfBytes } from '@/lib/rfq-pdf'
import { getRFQById } from '@/lib/store/contractor-store'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ rfqId: string }> },
) {
  const { rfqId } = await params
  try {
    const rfq = await getRFQById(rfqId)
    if (!rfq) {
      return new Response('RFQ not found', { status: 404 })
    }
    const pdfBytes = await buildRFQPdfBytes(rfqId)
    const filenamePrefix = rfq.request_type === 'rfp' ? 'rfp' : 'rfq'

    return new Response(new Uint8Array(pdfBytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filenamePrefix}-${rfqId}.pdf"`,
        'Content-Length': String(pdfBytes.length),
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'RFQ not found') {
      return new Response('RFQ not found', { status: 404 })
    }
    throw error
  }
}
