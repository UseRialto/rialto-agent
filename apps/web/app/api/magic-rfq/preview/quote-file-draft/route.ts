import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'
import { buildVendorMagicLinkQuotePrefill } from '@/lib/modules/vendor-magiclink/quote-prefill'
import type { ContractorRFQ } from '@/lib/types/contractor'
import { loadUploadedExternalQuoteFile, type UploadedExternalQuoteFileReference } from '@/lib/procurement/external-quote-upload-source'

export const runtime = 'nodejs'

const MAX_MAGIC_QUOTE_FILE_BYTES = 100 * 1024 * 1024

function parseUploadedFileReference(raw: FormDataEntryValue | null): UploadedExternalQuoteFileReference | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined
  const parsed = JSON.parse(raw) as Partial<UploadedExternalQuoteFileReference>
  if (!parsed || typeof parsed.url !== 'string') return undefined
  return {
    url: parsed.url,
    filename: typeof parsed.filename === 'string' ? parsed.filename : undefined,
    mimeType: typeof parsed.mimeType === 'string' ? parsed.mimeType : undefined,
    sizeBytes: typeof parsed.sizeBytes === 'number' ? parsed.sizeBytes : undefined,
  }
}

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
    const uploadedFile = parseUploadedFileReference(formData.get('uploadedFile'))
    const bodyText = String(formData.get('bodyText') ?? '').trim()

    let source: Parameters<typeof buildVendorMagicLinkQuotePrefill>[0]['source']
    if (uploadedFile) {
      source = {
        kind: 'file',
        file: await loadUploadedExternalQuoteFile(uploadedFile, MAX_MAGIC_QUOTE_FILE_BYTES),
      }
    } else if (file instanceof File) {
      if (file.size <= 0) return NextResponse.json({ success: false, error: `${file.name} is empty.` }, { status: 400 })
      if (file.size > MAX_MAGIC_QUOTE_FILE_BYTES) {
        return NextResponse.json({ success: false, error: `${file.name} is too large. Use files under 100 MB.` }, { status: 400 })
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
