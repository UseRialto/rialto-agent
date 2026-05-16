import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { buildVendorMagicLinkQuotePrefill } from '@/lib/modules/vendor-magiclink/quote-prefill'
import type { ContractorRFQ } from '@/lib/types/contractor'

export const runtime = 'nodejs'

const MAX_MAGIC_QUOTE_FILE_BYTES = 8 * 1024 * 1024

export async function POST(request: Request) {
  const session = await getSession()
  if (!session || session.role !== 'contractor') {
    return NextResponse.json({ success: false, error: 'Not authenticated.' }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const rfqJson = String(formData.get('rfq') ?? '')
    const vendorName = String(formData.get('vendorName') ?? '').trim()
    if (!rfqJson) return NextResponse.json({ success: false, error: 'RFQ preview data is required.' }, { status: 400 })
    const rfq = JSON.parse(rfqJson) as ContractorRFQ
    const file = formData.get('file')
    const bodyText = String(formData.get('bodyText') ?? '').trim()

    let source: Parameters<typeof buildVendorMagicLinkQuotePrefill>[0]['source']
    if (file instanceof File) {
      if (file.size <= 0) return NextResponse.json({ success: false, error: `${file.name} is empty.` }, { status: 400 })
      if (file.size > MAX_MAGIC_QUOTE_FILE_BYTES) {
        return NextResponse.json({ success: false, error: `${file.name} is too large. Use files under 8 MB.` }, { status: 400 })
      }
      source = {
        kind: 'file',
        file: {
          name: file.name,
          type: file.type,
          buffer: Buffer.from(await file.arrayBuffer()),
        },
      }
    } else if (bodyText) {
      source = {
        kind: 'inline_text',
        filename: String(formData.get('filename') ?? 'preview-email-reply.txt'),
        text: bodyText,
      }
    } else {
      return NextResponse.json({ success: false, error: 'Upload a quote file or paste email reply text.' }, { status: 400 })
    }

    const draft = await buildVendorMagicLinkQuotePrefill({ rfq, vendorName, source })
    return NextResponse.json({
      success: true,
      lineItemResponses: draft.lineItemResponses,
      warnings: draft.warnings,
      unmatchedRows: draft.unmatchedRows,
    })
  } catch (error) {
    console.error('Magic RFQ preview quote draft failed:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to read quote file.' },
      { status: 400 },
    )
  }
}
